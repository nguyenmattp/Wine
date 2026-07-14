alter table public.profiles enable row level security;
alter table public.producers enable row level security;
alter table public.wines enable row level security;
alter table public.wine_logs enable row level security;
alter table public.score_bands enable row level security;

-- Profiles: public read (directory/username lookup for later social
-- features), owner-only write.
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Producers/wines: public read (shared reference data), authenticated
-- insert (crowdsourced). No client update/delete — moderation is a
-- service-role-only concern (see created_by / is_deleted).
create policy "producers_select_all" on public.producers
  for select using (true);
create policy "producers_insert_authenticated" on public.producers
  for insert with check (auth.uid() is not null);

create policy "wines_select_all" on public.wines
  for select using (true);
create policy "wines_insert_authenticated" on public.wines
  for insert with check (auth.uid() is not null);

-- Score bands: public read-only reference config.
create policy "score_bands_select_all" on public.score_bands
  for select using (true);

-- wine_logs: strictly owner-only in Phase 1. Follower/public visibility
-- (the `visibility` column) is not enforced yet -- that's Phase 4, once
-- follows exist to check against.
create policy "wine_logs_select_own" on public.wine_logs
  for select using (auth.uid() = user_id);
create policy "wine_logs_insert_own" on public.wine_logs
  for insert with check (auth.uid() = user_id);
create policy "wine_logs_update_own" on public.wine_logs
  for update using (auth.uid() = user_id);
create policy "wine_logs_delete_own" on public.wine_logs
  for delete using (auth.uid() = user_id);
