# jobs-web

Web frontend for the job aggregator. Reads directly from the same
Supabase project that the `jobwatcher` backend writes to twice daily.

Renamed to a real product name later — `jobs-web` is an internal
engineering name that'll stay put even if the consumer brand changes.

## Architecture

```
jobwatcher (Mac mini)        Supabase                  jobs-web
─────────────────────        ──────────                ────────
scrape + SQLite ──push──► public.jobs (RLS) ──anon──► Next.js 16
                           public.scrape_runs_latest  (SSR + RSC)
```

- Backend code + scraper: [`../jobwatcher/`](../jobwatcher/)
- Schema: [`../jobwatcher/sql/supabase_schema.sql`](../jobwatcher/sql/supabase_schema.sql)
- RLS posture: anon role can `SELECT` only
  `us_or_remote_eligible = true AND relevant = true` rows from `jobs`
  (policy `jobs_public_read`). `scrape_runs_latest` is fully readable.
  Details in [`../jobwatcher/docs/SUPABASE.md`](../jobwatcher/docs/SUPABASE.md).

## Stack

| | |
|---|---|
| Runtime / package manager | **Bun** 1.3+ |
| Framework | **Next.js 16** (App Router, Server Components) |
| UI | React 19 + Tailwind CSS 4 |
| Data | `@supabase/supabase-js` |
| Language | TypeScript (strict) |
| Deploy target | Vercel |

No Node.js install required. `bun install` handles everything.

## Setup

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL + anon key from
# Dashboard → Settings → API → "Project API keys" → anon public

bun install
bun dev              # http://localhost:3000
```

## Project layout

```
src/
├── app/
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Feed (home) — async RSC reading Supabase
├── components/
│   ├── SearchBar.tsx        # Debounced text search, writes ?q=
│   ├── KeywordChips.tsx     # Pre-defined multi-select, writes ?k=
│   ├── DateFilter.tsx       # Posted-within dropdown, writes ?d=
│   ├── RemoteFilter.tsx     # All / Remote dropdown, writes ?r=
│   ├── TierFilter.tsx       # Company-tier dropdown (FAANG+, T1, T2, T3), writes ?t=
│   └── Pagination.tsx       # Numbered paginator (first/last/current±2/ellipses), writes ?p=
├── lib/
│   ├── supabase.ts          # Browser-safe client (anon/publishable key)
│   ├── database.types.ts    # Hand-written Database schema types
│   └── filters.ts           # Keyword catalog + URL ↔ state helpers
```

Source of truth for the Supabase schema types is
`../jobwatcher/sql/supabase_schema.sql`. Keep them in sync by hand until
we adopt the Supabase CLI for code generation.

## Scope: US / US-remote only

The Feed only surfaces postings where `us_or_remote_eligible = true` —
the policy is "keep any posting whose location fragments resolve to a
US address, or is remote-worldwide / work-from-anywhere." The full
classifier lives in the `jobwatcher` backend; this repo just applies
the filter at query time.

The Supabase mirror is US/remote-eligible and relevant-only by
construction — `supabase_sync.py` uploads only
`active=1 AND us_or_remote_eligible=1 AND relevant=1` rows.
Belt-and-braces: this app's query also includes
`.eq("us_or_remote_eligible", true)` in case a non-US row ever slipped
into the mirror.

## Filters + pagination

Four filters stacked at the top of the feed, plus numbered pagination
at the bottom — URL is the source of truth so any combination is
bookmarkable and shareable:

- **Search** (`?q=…`) — free text, matches title OR company (ILIKE
  substring on both), debounced 250 ms.
- **Keyword chips** (`?k=…`) — pre-defined catalog in
  [`src/lib/filters.ts`](src/lib/filters.ts) **plus** any ad-hoc keyword
  the user adds at runtime via the **"+ add keyword"** button. Both
  kinds are title-ILIKE substring matches, combined with OR.
  Mirrored in [`../jobs-ios/Sources/Filters.swift`](../jobs-ios/Sources/Filters.swift)
  — edit both when adding / removing a *built-in* chip (ad-hoc ones
  live in the URL, no code change needed).
- **Posted date** (`?d=24h|7d|30d|any`) — applies to
  `effective_posted_at`, populated by `jobwatcher` as board `posted_at`
  when available, else `first_seen`. Default `any`.
- **Remote** (`?r=all|remote`) — two-state. Default `all`; `remote`
  narrows to `is_remote=true`. The feed is already US-scoped so
  "Remote only" = US-workable remote.
- **Tier** (`?t=all|faang|t1|t2|t3`) — five-state. Default `all`.
  Filters on the `tier` column populated at Supabase-sync time from
  [`../jobwatcher/src/jobwatcher/tiers.py`](../jobwatcher/src/jobwatcher/tiers.py).
  FAANG+ / Tier 1 / Tier 2 / Tier 3 / Startups labels match that file's
  frozensets. Every configured company is classified (10/53/155/204/11
  as of 2026-04-23).
- **Pagination** (`?p=N`) — 100 rows per page. Numbered paginator at
  the bottom shows first page, last page, current ± 2, with ellipses
  for gaps. Total count uses Supabase's `count: 'estimated'` option so
  the feed avoids slow exact counts under RLS and concurrent sync load.
  Changing any filter resets to page 1.

Text search uses ILIKE substring matching backed by the
`idx_jobs_title_trgm` / `idx_jobs_company_trgm` trigram indexes
(`pg_trgm` extension) on the backend — needed to stay under the 8-second
anon statement timeout. The Date, Remote, and page dropdowns all
auto-apply on change (no "Apply" button).

### Why the feed is narrower than SQLite

The Supabase mirror already contains the public feed slice:
`active=1 AND us_or_remote_eligible=1 AND relevant=1`. Closed jobs,
non-US/non-remote jobs, and non-relevant roles stay out of the mirror.
The RLS policy `jobs_public_read` re-checks
`us_or_remote_eligible=true AND relevant=true` as defense in depth, but
normally does not narrow the mirror further. Details in
[`../jobwatcher/docs/FEED_FILTERS.md`](../jobwatcher/docs/FEED_FILTERS.md).

## Commands

```bash
bun dev              # local dev with hot reload (Turbopack)
bun run build        # production build
bun run start        # run the production build
bun run lint         # eslint
```

## What's intentionally NOT built yet (phase 2)

- Supabase Auth (magic link) — needed before the tracker
- Compatibility score against user resume
- Per-user "applied / saved / rejected" tracker (new `job_status` table)
- Company detail pages

v1 = public read-only feed of relevant open roles.
