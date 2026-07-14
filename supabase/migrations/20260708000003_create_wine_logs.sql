-- A user's personal entry for a wine they tried. score/rank_in_bucket are
-- placeholders in Phase 1 (seeded by bucket midpoint) until Phase 2 wires up
-- the real binary-insertion-sort ranking function.
create table public.wine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  wine_id uuid not null references public.wines (id),
  bucket text not null check (bucket in ('liked', 'fine', 'disliked')),
  score numeric(3, 1) not null check (score >= 0 and score <= 10),
  -- Fractional sort key (see Phase 2 ranking design). numeric is
  -- arbitrary-precision so repeated midpoint insertion never exhausts.
  rank_in_bucket numeric not null,
  notes text,
  photo_url text,
  visibility text not null default 'default' check (
    visibility in ('default', 'private', 'public')
  ),
  tasted_at date not null default current_date,
  -- Client-generated idempotency key so a retried write is a safe no-op.
  client_log_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wine_logs_user_bucket_rank_idx
  on public.wine_logs (user_id, bucket, rank_in_bucket);
create index wine_logs_user_wine_idx on public.wine_logs (user_id, wine_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger wine_logs_set_updated_at
  before update on public.wine_logs
  for each row execute function public.set_updated_at();
