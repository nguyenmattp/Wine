-- Phase 2 review fixes.
--
-- (1) fn_insert_wine_log recomputed the rank key from client-supplied
--     neighbor ranks captured before the advisory lock, so two inserts from
--     stale snapshots (two tabs, a retry queue) could land the same
--     rank_in_bucket value, and head/tail branches could even invert scores.
--     Rewritten to re-derive the insertion gap from LIVE data under the lock,
--     anchored on the "better" neighbor (prev): the new row always lands
--     strictly between prev and prev's current live successor, which is unique
--     by construction. In the un-raced case this reproduces the client's
--     intended position exactly (prev's successor == the client's `next`).
-- (2) client_log_id lookups now filter by user_id: client_log_id is globally
--     unique and this function bypasses RLS, so an unscoped lookup could
--     return another user's row on a guessed/leaked id.
create or replace function public.fn_insert_wine_log(
  p_wine_id uuid,
  p_bucket text,
  p_prev_log_id uuid,
  p_next_log_id uuid, -- accepted for client compatibility; position anchors on prev
  p_notes text,
  p_photo_url text,
  p_visibility text,
  p_tasted_at date,
  p_client_log_id uuid
) returns public.wine_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_band record;
  v_lower_rank numeric;
  v_lower_score numeric;
  v_upper_rank numeric;
  v_upper_score numeric;
  v_new_rank numeric;
  v_new_score numeric(3, 1);
  v_log public.wine_logs;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_bucket not in ('liked', 'fine', 'disliked') then
    raise exception 'invalid bucket';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_bucket, 0));

  if p_client_log_id is not null then
    select * into v_log from public.wine_logs
    where client_log_id = p_client_log_id and user_id = v_uid;
    if v_log.id is not null then
      return v_log;
    end if;
  end if;

  select band_min, band_max into v_band from public.score_bands where bucket = p_bucket;

  -- Lower bound = the "better" neighbor the binary search stopped above.
  -- If it's gone (or this is a head insert), lower stays null.
  if p_prev_log_id is not null then
    select rank_in_bucket, score into v_lower_rank, v_lower_score
    from public.wine_logs
    where id = p_prev_log_id and user_id = v_uid and bucket = p_bucket;
  end if;

  -- Upper bound = prev's current live successor (or the current best if this
  -- is a head insert). Re-deriving from live data is what prevents duplicate
  -- keys under concurrent inserts.
  if v_lower_rank is null then
    select rank_in_bucket, score into v_upper_rank, v_upper_score
    from public.wine_logs
    where user_id = v_uid and bucket = p_bucket
    order by rank_in_bucket asc
    limit 1;
  else
    select rank_in_bucket, score into v_upper_rank, v_upper_score
    from public.wine_logs
    where user_id = v_uid and bucket = p_bucket and rank_in_bucket > v_lower_rank
    order by rank_in_bucket asc
    limit 1;
  end if;

  if v_lower_rank is null and v_upper_rank is null then
    -- Empty bucket: seed at the band midpoint.
    v_new_rank := 1000;
    v_new_score := round((v_band.band_min + v_band.band_max) / 2, 1);
  elsif v_lower_rank is null then
    -- New best in the bucket.
    v_new_rank := v_upper_rank - 1000;
    v_new_score := round((v_band.band_max + v_upper_score) / 2, 1);
  elsif v_upper_rank is null then
    -- New worst in the bucket.
    v_new_rank := v_lower_rank + 1000;
    v_new_score := round((v_lower_score + v_band.band_min) / 2, 1);
  else
    v_new_rank := (v_lower_rank + v_upper_rank) / 2;
    v_new_score := round((v_lower_score + v_upper_score) / 2, 1);
  end if;

  insert into public.wine_logs (
    user_id, wine_id, bucket, score, rank_in_bucket, notes, photo_url,
    visibility, tasted_at, client_log_id
  ) values (
    v_uid, p_wine_id, p_bucket, v_new_score, v_new_rank, p_notes, p_photo_url,
    coalesce(p_visibility, 'default'), coalesce(p_tasted_at, current_date), p_client_log_id
  )
  on conflict (client_log_id) do nothing
  returning * into v_log;

  if v_log.id is null then
    select * into v_log from public.wine_logs
    where client_log_id = p_client_log_id and user_id = v_uid;
  end if;

  return v_log;
end;
$$;

revoke execute on function public.fn_insert_wine_log(
  uuid, text, uuid, uuid, text, text, text, date, uuid
) from public;
grant execute on function public.fn_insert_wine_log(
  uuid, text, uuid, uuid, text, text, text, date, uuid
) to authenticated;

-- (3) fn_update_wine_log carried the source bucket's rank_in_bucket into the
--     destination on a bucket change, causing duplicate keys and score/rank
--     inversions there. On a bucket change a rebucketed wine now appends to
--     the bottom of the destination bucket (unique tail rank + tail score);
--     no comparisons are re-run in v1. Notes/date/visibility-only edits leave
--     score and rank untouched.
create or replace function public.fn_update_wine_log(
  p_log_id uuid,
  p_bucket text,
  p_notes text,
  p_tasted_at date,
  p_visibility text
) returns public.wine_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current public.wine_logs;
  v_band record;
  v_score numeric(3, 1);
  v_rank numeric;
  v_worst_rank numeric;
  v_worst_score numeric;
  v_log public.wine_logs;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_current
  from public.wine_logs
  where id = p_log_id and user_id = v_uid;

  if v_current.id is null then
    raise exception 'log not found';
  end if;

  v_score := v_current.score;
  v_rank := v_current.rank_in_bucket;

  if p_bucket is distinct from v_current.bucket then
    if p_bucket not in ('liked', 'fine', 'disliked') then
      raise exception 'invalid bucket';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_bucket, 0));
    select band_min, band_max into v_band from public.score_bands where bucket = p_bucket;

    select rank_in_bucket, score into v_worst_rank, v_worst_score
    from public.wine_logs
    where user_id = v_uid and bucket = p_bucket
    order by rank_in_bucket desc
    limit 1;

    if v_worst_rank is null then
      v_rank := 1000;
      v_score := round((v_band.band_min + v_band.band_max) / 2, 1);
    else
      v_rank := v_worst_rank + 1000;
      v_score := round((v_worst_score + v_band.band_min) / 2, 1);
    end if;
  end if;

  update public.wine_logs
  set bucket = p_bucket,
      score = v_score,
      rank_in_bucket = v_rank,
      notes = p_notes,
      tasted_at = coalesce(p_tasted_at, tasted_at),
      visibility = coalesce(p_visibility, visibility)
  where id = p_log_id and user_id = v_uid
  returning * into v_log;

  return v_log;
end;
$$;

-- (4) fn_create_wine_log_seeded was the Phase 1 stub, fully superseded by
--     fn_insert_wine_log and no longer called by the app. It carried the same
--     unscoped client_log_id lookup, so drop it rather than leave a second
--     write path around.
drop function if exists public.fn_create_wine_log_seeded(uuid, text, text, text, text, date, uuid);
