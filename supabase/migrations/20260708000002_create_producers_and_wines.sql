create extension if not exists pg_trgm;

-- Producers (winery/maker), normalized for dedup and fuzzy search.
create table public.producers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  country text,
  region text,
  external_ref jsonb,
  created_by uuid references public.profiles (id),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (normalized_name, region)
);

create index producers_normalized_name_trgm_idx
  on public.producers using gin (normalized_name gin_trgm_ops);

-- Wines: canonical, deduplicated reference data shared across all users.
create table public.wines (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers (id),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  varietal text[] not null default '{}',
  region text,
  country text,
  vintage int, -- null = non-vintage (NV) wine
  wine_type text check (
    wine_type in ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'orange')
  ),
  external_ref jsonb,
  created_by uuid references public.profiles (id),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  -- NULLS NOT DISTINCT so two NV wines from the same producer/name collide
  -- instead of duplicating freely.
  unique nulls not distinct (producer_id, normalized_name, vintage)
);

create index wines_normalized_name_trgm_idx
  on public.wines using gin (normalized_name gin_trgm_ops);
create index wines_producer_id_idx on public.wines (producer_id);
