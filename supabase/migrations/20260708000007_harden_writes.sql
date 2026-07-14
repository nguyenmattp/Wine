-- Hardening pass after Phase 1 review.
--
-- (1) RLS on wine_logs is row-level only: the default Supabase grants let
-- any authenticated user PATCH their own row's `score` or `rank_in_bucket`
-- directly through PostgREST, bypassing the app's scoring rules entirely.
-- Since ranking integrity is the core of the product (and scores become
-- visible to other users in Phase 4), all writes must go through the
-- SECURITY DEFINER functions. Reads and owner-deletes stay direct.
revoke insert, update on table public.wine_logs from authenticated, anon;

-- (2) Bucket edits re-seed the score at the new band midpoint (Phase 1 stub
-- semantics). This lived in the Next.js server action; moving it here keeps
-- score math in one place and works with the revoked grants above.
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
  v_current public.wine_logs;
  v_band record;
  v_score numeric(3, 1);
  v_log public.wine_logs;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_current
  from public.wine_logs
  where id = p_log_id and user_id = auth.uid();

  if v_current.id is null then
    raise exception 'log not found';
  end if;

  -- Only re-seed the score when the bucket actually changes; an edit to
  -- notes/date/visibility must not touch score or rank.
  v_score := v_current.score;
  if p_bucket is distinct from v_current.bucket then
    select band_min, band_max into v_band
    from public.score_bands
    where bucket = p_bucket;
    v_score := round((v_band.band_min + v_band.band_max) / 2, 1);
  end if;

  update public.wine_logs
  set bucket = p_bucket,
      score = v_score,
      notes = p_notes,
      tasted_at = coalesce(p_tasted_at, tasted_at),
      visibility = coalesce(p_visibility, visibility)
  where id = p_log_id and user_id = auth.uid()
  returning * into v_log;

  return v_log;
end;
$$;

revoke execute on function public.fn_update_wine_log from public;
grant execute on function public.fn_update_wine_log to authenticated;

-- (3) handle_new_user aborts the whole signup with an opaque "Database
-- error saving new user" if the requested username is already taken.
-- Retry once with a uuid suffix instead; the user can rename later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );

  begin
    insert into public.profiles (id, username) values (new.id, v_username);
  exception when unique_violation then
    insert into public.profiles (id, username)
    values (new.id, v_username || '_' || substr(new.id::text, 1, 8));
  end;

  return new;
end;
$$;
