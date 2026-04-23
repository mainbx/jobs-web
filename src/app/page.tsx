/**
 * Job feed with search + keyword + date + remote filters + pagination.
 *
 * URL is the source of truth for filter state:
 *   /?q=<text>&k=<csv-of-matches>&d=<24h|7d|30d|any>&r=<all|remote>&t=<all|faang|t1|t2|t3|startups>&p=<N>
 *
 * The page is an async RSC: each navigation re-fetches Supabase with
 * the new filters. Filter UI (SearchBar / KeywordChips / DateFilter /
 * RemoteFilter / Pagination) are client components that just edit the URL.
 *
 * RLS policy `jobs_public_read` already scopes anon reads to
 * `relevant = true`, so we never pass that filter from the app.
 */

import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/database.types";
import {
  dateRangeFloors,
  keywordOrClause,
  parseFilters,
  type FilterState,
} from "@/lib/filters";
import { SearchBar } from "@/components/SearchBar";
import { KeywordChips } from "@/components/KeywordChips";
import { DateFilter } from "@/components/DateFilter";
import { RemoteFilter } from "@/components/RemoteFilter";
import { TierFilter } from "@/components/TierFilter";
import { Pagination } from "@/components/Pagination";
import { TIER_FILTERS } from "@/lib/filters";

const PAGE_SIZE = 100;

type FeedJob = Pick<
  Job,
  | "canonical_key"
  | "company"
  | "title"
  | "posting_url"
  | "location"
  | "us_or_remote_eligible"
  | "is_remote"
  | "last_seen"
  | "posted_at"
>;

interface FeedResult {
  jobs: FeedJob[];
  totalCount: number;
}

async function getFeed(state: FilterState): Promise<FeedResult> {
  // US-only by design — jobs-web surfaces nothing outside the US/remote
  // policy. This also matches the supabase_sync filter that drops non-US
  // rows from the mirror, so in practice every row in Supabase is
  // already US-eligible. The explicit filter here is belt-and-braces.
  //
  // Pagination: `count: 'estimated'` (not 'exact') so PostgREST reads
  // the planner's reltuples estimate instead of doing a fresh
  // COUNT(*) under RLS. Under Supabase's 8s anon statement timeout,
  // exact counts on 28k+ rows can breach when the indexes are mid
  // rebuild (e.g. a scrape+sync is running) — and a failing query
  // presents as a silent 0-row page for the user.
  //
  // Sort: `effective_posted_at DESC`, covered by the dedicated
  // `idx_jobs_effective_posted_at` index. This column is populated
  // by `supabase_sync._effective_posted_at` as `posted_at` parsed to
  // TIMESTAMPTZ when the board exposes one, else `first_seen`.
  // That's the user-visible "newest first" semantics: a just-
  // discovered job (no posted_at) with first_seen 5 min ago beats a
  // board-posted job from 1 day ago; among board-dated jobs, the
  // most recent posting wins. Single-column sort on a single index
  // stays well under the 3s anon timeout even when a scrape+sync
  // is running. Previously ordered by `last_seen DESC`, but that
  // collapsed to processing order once the daily cron stamped every
  // active job with today's timestamp within the same ~15 min window.
  const from = (state.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1; // inclusive → exactly PAGE_SIZE rows
  let q = supabase
    .from("jobs")
    .select(
      "canonical_key, company, title, posting_url, location, us_or_remote_eligible, is_remote, last_seen, posted_at",
      { count: "estimated" },
    )
    .eq("us_or_remote_eligible", true)
    .order("effective_posted_at", { ascending: false })
    .range(from, to);

  // Free-text search — match against title OR company (ILIKE substring
  // on both columns). PostgREST requires escaping commas/parens inside
  // the `or` values; we substitute spaces since the user-supplied text
  // is free-form.
  if (state.search) {
    const safe = state.search.replace(/[(),]/g, " ");
    q = q.or(`title.ilike.*${safe}*,company.ilike.*${safe}*`);
  }

  // Keyword chips — title-only substring match, OR across selections.
  const kwClause = keywordOrClause(state.keywords);
  if (kwClause) q = q.or(kwClause);

  // Date range: filter on the precomputed `effective_posted_at`
  // column, which `supabase_sync` populates as `posted_at` parsed
  // as TIMESTAMPTZ when known, else `first_seen`. Single indexed
  // range scan via `idx_jobs_effective_posted_at` — well under the
  // 3s anon statement timeout. The compound `OR` we used before
  // (posted_at TEXT compare + first_seen TIMESTAMPTZ compare) was
  // forcing a sequential scan that routinely breached timeout on
  // the 24h filter.
  const floors = dateRangeFloors(state.posted);
  if (floors) {
    q = q.gte("effective_posted_at", floors.iso);
  }

  // Remote filter — two-state. "all" leaves it off.
  if (state.remote === "remote") q = q.eq("is_remote", true);

  // Tier filter — five-state. Map the UI value → the DB string stored
  // on the `tier` column (populated by supabase_sync from
  // jobwatcher.tiers.tier_for). "all" leaves the filter off (which
  // lets unranked rows through too).
  const tierEntry = TIER_FILTERS.find((t) => t.value === state.tier);
  if (tierEntry && tierEntry.dbValue !== null) {
    q = q.eq("tier", tierEntry.dbValue);
  }

  const { data, count, error } = await q;
  if (error) {
    // The feed must NEVER render as "0 roles" just because the count
    // or select timed out — that's worse than showing whatever rows
    // we got. We retry once without the count option as a
    // belt-and-braces fallback (count doesn't gate render; it only
    // affects the paginator numbers). If the retry still fails,
    // return empty but surface the error to the console.
    console.error("[feed] supabase error:", error.message);
    const retry = await supabase
      .from("jobs")
      .select(
        "canonical_key, company, title, posting_url, location, us_or_remote_eligible, is_remote, last_seen, posted_at",
      )
      .eq("us_or_remote_eligible", true)
      .order("effective_posted_at", { ascending: false })
      .range(from, to);
    if (retry.error) return { jobs: [], totalCount: 0 };
    return {
      jobs: retry.data ?? [],
      // Without count, we can at least say "at least this many" — the
      // paginator will hide Next if we're under PAGE_SIZE.
      totalCount: (retry.data?.length ?? 0) + (retry.data?.length === PAGE_SIZE ? 1 : 0),
    };
  }
  return {
    jobs: data ?? [],
    totalCount: count ?? (data?.length ?? 0),
  };
}

function relTime(iso: string): string {
  // The backend's `normalize_posted_at` guarantees either an empty
  // string or a valid ISO-8601 UTC timestamp, so `new Date(iso)` will
  // never be Invalid. Callers are expected to short-circuit the empty
  // case; here we defensively return "" if anything slips through.
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const mins = Math.max(0, Math.round((now - then) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
  }
  const state = parseFilters(usp);
  const { jobs, totalCount } = await getFeed(state);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-4 px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Jobs
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {totalCount.toLocaleString()} {totalCount === 1 ? "role" : "roles"}
            {totalPages > 1 && ` · page ${state.page} of ${totalPages}`}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-6 pt-6">
        <SearchBar />
        <KeywordChips />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <DateFilter />
            <RemoteFilter />
            <TierFilter />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {jobs.length === 0 ? (
          <EmptyState active={state} />
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {jobs.map((job) => (
              <li key={job.canonical_key}>
                <a
                  href={job.posting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="truncate text-base font-medium text-zinc-900 dark:text-zinc-50">
                      {job.title}
                    </h2>
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      {(() => {
                        // Prefer a real posted_at when the scraper captured
                        // one; otherwise show "seen Nd ago" based on
                        // `last_seen` which is always populated. Both
                        // values pass through `relTime` which no longer
                        // surfaces "NaN" for anything the normalizer can't
                        // parse — it just returns empty.
                        const posted = job.posted_at ? relTime(job.posted_at) : "";
                        if (posted) return `posted ${posted}`;
                        const seen = relTime(job.last_seen);
                        return seen ? `seen ${seen}` : "";
                      })()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {job.company}
                    </span>
                    {job.location && (
                      <span className="truncate">{job.location}</span>
                    )}
                    {job.is_remote && (
                      // Green pill only for genuinely-remote roles. Onsite
                      // US jobs don't get a badge — the whole feed is
                      // already US-scoped.
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Remote
                      </span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={state.page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          pageCount={jobs.length}
        />
      </main>
    </div>
  );
}

function EmptyState({ active }: { active: FilterState }) {
  const hasFilters =
    active.search.length > 0 ||
    active.keywords.length > 0 ||
    active.posted !== "any" ||
    active.remote !== "all" ||
    active.tier !== "all";
  if (active.page > 1) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-zinc-600 dark:text-zinc-400">
          No more results on page {active.page}. Use the Prev button to go back.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-zinc-600 dark:text-zinc-400">
        {hasFilters
          ? "No roles match the current filters."
          : "No jobs yet. Check that Supabase env vars are set and the jobs_public_read RLS policy exists."}
      </p>
    </div>
  );
}
