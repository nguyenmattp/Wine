-- Phase 2: the real ranking insertion.
--
-- The client runs a binary-insertion-sort against the user's existing logs
-- in the chosen bucket ("was the new wine better than this one?") and lands
-- on a position, expressed as its two neighbors: p_prev_log_id (the wine
-- ranked immediately better, i.e. lower rank_in_bucket) and p_next_log_id
-- (immediately worse). Either may be null for a head/tail/empty insert.
--
-- Ordering convention: lower rank_in_bucket = better; the list is read
-- ORDER BY rank_in_bucket ASC (best first). Higher score = better, so the
-- best wine sits at the top of its band.
--
-- Only the new row is written; existing rows are never renumbered. Scores
-- are the midpoint of the neighbors' stored scores (not a position formula),
-- which keeps score order and rank order in agreement. rank_in_bucket is an
-- arbitrary-precision numeric, so repeated midpoint halving never exhausts.
create or replace function public.fn_insert_wine_log(
  p_wine_id uuid,
  p_bucket text,
  p_prev_log_id uuid,
  p_next_log_id uuid,
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
  v_prev_rank numeric;
  v_prev_score numeric;
  v_next_rank numeric;
  v_next_score numeric;
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

  -- Serialize concurrent inserts for this user+bucket so two in-flight
  -- inserts can't compute colliding rank keys against a stale snapshot.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_bucket, 0));

  -- Idempotency: a retried call with the same client_log_id is a no-op.
  if p_client_log_id is not null then
    select * into v_log from public.wine_logs where client_log_id = p_client_log_id;
    if v_log.id is not null then
      return v_log;
    end if;
  end if;

  select band_min, band_max into v_band from public.score_bands where bucket = p_bucket;

  -- Re-fetch the neighbors inside the lock rather than trusting client-passed
  -- rank/score values. A neighbor that vanished (concurrent delete/rebucket)
  -- degrades gracefully to the head/tail/empty branch below.
  if p_prev_log_id is not null then
    select rank_in_bucket, score into v_prev_rank, v_prev_score
    from public.wine_logs
    where id = p_prev_log_id and user_id = v_uid and bucket = p_bucket;
  end if;
  if p_next_log_id is not null then
    select rank_in_bucket, score into v_next_rank, v_next_score
    from public.wine_logs
    where id = p_next_log_id and user_id = v_uid and bucket = p_bucket;
  end if;

  if v_prev_rank is null and v_next_rank is null then
    -- First wine in this bucket: seed at the band midpoint, no comparison.
    v_new_rank := 1000;
    v_new_score := round((v_band.band_min + v_band.band_max) / 2, 1);
  elsif v_prev_rank is null then
    -- New wine is the new best in the bucket.
    v_new_rank := v_next_rank - 1000;
    v_new_score := round((v_band.band_max + v_next_score) / 2, 1);
  elsif v_next_rank is null then
    -- New wine is the new worst in the bucket.
    v_new_rank := v_prev_rank + 1000;
    v_new_score := round((v_prev_score + v_band.band_min) / 2, 1);
  else
    v_new_rank := (v_prev_rank + v_next_rank) / 2;
    v_new_score := round((v_prev_score + v_next_score) / 2, 1);
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
    select * into v_log from public.wine_logs where client_log_id = p_client_log_id;
  end if;

  return v_log;
end;
$$;

revoke execute on function public.fn_insert_wine_log from public;
grant execute on function public.fn_insert_wine_log to authenticated;
