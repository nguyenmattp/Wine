-- Phase 4: social graph + visibility.

-- Directed follow edge. status is 'accepted' for everyone in v1 (no approval
-- workflow); the column exists so a private-account request/accept flow can be
-- added later without a schema change.
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- Public follow graph (counts/lists visible to any authenticated user); log
-- *content* is still gated by the visibility policy below.
create policy "follows_select_all" on public.follows
  for select using (true);
create policy "follows_insert_own" on public.follows
  for insert with check (follower_id = auth.uid());
create policy "follows_delete_own" on public.follows
  for delete using (follower_id = auth.uid());

-- SECURITY DEFINER helpers used inside the wine_logs SELECT policy. They read
-- follows/profiles with the definer's rights, which (a) lets the policy see
-- rows the viewer's own RLS would hide and (b) avoids any policy recursion
-- between wine_logs, follows, and profiles.
create or replace function public.is_follower(p_viewer uuid, p_target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.follows
    where follower_id = p_viewer
      and followee_id = p_target
      and status = 'accepted'
  );
$$;

create or replace function public.profile_is_private(p_target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_private from public.profiles where id = p_target), false);
$$;

-- Widen wine_logs visibility from owner-only to the three-tier model:
--   'public'          -> anyone
--   'default'         -> anyone if the owner's account is public;
--                        accepted followers only if the account is private
--   'private'         -> owner only (falls through to the first clause)
-- Note: "my rankings" and the comparison-candidate list both filter by
-- user_id explicitly in app code, so this widening does not leak other users'
-- rows into a user's own ranking math.
drop policy if exists "wine_logs_select_own" on public.wine_logs;

create policy "wine_logs_select_visible" on public.wine_logs
  for select using (
    auth.uid() = user_id
    or visibility = 'public'
    or (
      visibility = 'default'
      and (
        not public.profile_is_private(user_id)
        or public.is_follower(auth.uid(), user_id)
      )
    )
  );
