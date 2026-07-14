# Wine App

Track wines you've tried and rank them against each other (vintage,
varietal, region, maker), Beli-style. Next.js + Supabase.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine to start).
2. **Run the migrations** against it. Install the Supabase CLI, then from this
   directory:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This applies everything in `supabase/migrations/` in order: profiles,
   producers/wines, wine_logs, the ranking/dedup functions, and RLS policies.
   (Alternatively, paste each file in `supabase/migrations/` into the
   Supabase Studio SQL editor in filename order.)
3. **Copy environment variables**: `cp .env.local.example .env.local` and
   fill in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
   your Supabase project's Settings > API page.
4. **Email confirmation**: by default Supabase requires email confirmation
   before a user can sign in. For local development, either disable "Confirm
   email" under Authentication > Providers > Email in the Supabase
   dashboard, or click the confirmation link Supabase emails you (it redirects
   to `/auth/callback`, handled by `app/auth/callback/route.ts`).
5. **Run the app**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000.

## What's implemented (Phase 0/1 of the project plan)

- Sign up / log in / log out (Supabase Auth, email+password).
- A `profiles` row is auto-created on signup via a Postgres trigger.
- Manual wine entry (vintage, varietal, region, maker) -- dedup against
  existing `wines`/`producers` rows happens server-side via
  `fn_find_or_create_wine`.
- Bucket classification (Liked/Fine/Disliked) with a **stubbed score**: the
  band midpoint, with no comparison against your other logged wines yet.
  The real binary-insertion-sort ranking algorithm is Phase 2.
- Edit and delete a log.
- Row Level Security is enabled on every table from the first migration;
  `wine_logs` is strictly owner-only until Phase 4 adds follows and
  visibility-aware policies.

Not yet built (later phases, per the project plan): the
comparison-based ranking flow, external wine-lookup/autofill, and all
social features (follows, activity feed, viewing a friend's list).

## Node version note

This was built against Node 18.17.1. `@supabase/supabase-js` and some
tooling prefer Node 20+/22+ (you'll see `EBADENGINE` warnings on install) --
it still runs, but consider upgrading Node if you hit issues.
