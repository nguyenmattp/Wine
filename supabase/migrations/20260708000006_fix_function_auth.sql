-- fn_find_or_create_wine and fn_create_wine_log_seeded are SECURITY DEFINER,
-- which means they run with the owning role's privileges and therefore
-- bypass the RLS policies on producers/wines/wine_logs entirely. Postgres
-- also grants EXECUTE on new functions to PUBLIC by default. Together, that
-- meant an anonymous request with just the public anon key could call these
-- functions directly and write rows -- confirmed via a live test against the
-- deployed project. Fix: revoke the PUBLIC grant and add an explicit
-- auth.uid() guard inside each function, since SECURITY DEFINER functions
-- must not rely on RLS or GRANT-to-role alone for authorization.

revoke execute on function public.fn_find_or_create_wine from public;
revoke execute on function public.fn_create_wine_log_seeded from public;

create or replace function public.fn_find_or_create_wine(
  p_producer_name text,
  p_producer_region text,
  p_producer_country text,
  p_wine_name text,
  p_vintage int,
  p_varietal text[],
  p_wine_type text,
  p_region text,
  p_country text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_producer_id uuid;
  v_wine_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.producers (name, region, country, created_by)
  values (p_producer_name, p_producer_region, p_producer_country, auth.uid())
  on conflict (normalized_name, region) do nothing;

  select id into v_producer_id
  from public.producers
  where normalized_name = lower(trim(p_producer_name))
    and region is not distinct from p_producer_region
  limit 1;

  insert into public.wines (
    producer_id, name, vintage, varietal, wine_type, region, country, created_by
  )
  values (
    v_producer_id, p_wine_name, p_vintage, coalesce(p_varietal, '{}'),
    p_wine_type, p_region, p_country, auth.uid()
  )
  on conflict (producer_id, normalized_name, vintage) do nothing;

  select id into v_wine_id
  from public.wines
  where producer_id = v_producer_id
    and normalized_name = lower(trim(p_wine_name))
    and vintage is not distinct from p_vintage
  limit 1;

  return v_wine_id;
end;
$$;

grant execute on function public.fn_find_or_create_wine to authenticated;

create or replace function public.fn_create_wine_log_seeded(
  p_wine_id uuid,
  p_bucket text,
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
  v_band record;
  v_score numeric(3, 1);
  v_log public.wine_logs;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select band_min, band_max into v_band
  from public.score_bands
  where bucket = p_bucket;

  v_score := round((v_band.band_min + v_band.band_max) / 2, 1);

  insert into public.wine_logs (
    user_id, wine_id, bucket, score, rank_in_bucket, notes, photo_url,
    visibility, tasted_at, client_log_id
  )
  values (
    auth.uid(), p_wine_id, p_bucket, v_score, 1000, p_notes, p_photo_url,
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

grant execute on function public.fn_create_wine_log_seeded to authenticated;
