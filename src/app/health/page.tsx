/**
 * /health — minimal scrape-health dashboard.
 *
 * Shows one row per configured company with a small status icon:
 *   * green  → healthy    (latest scrape produced jobs, no drift alerts)
 *   * yellow → warning    (P1 alert: bot wall, empty-with-200, etc.)
 *   * red    → failing    (P0 alert: drop_30pct, stuck_at_zero, spike_3x,
 *                          titles_fingerprint_drift)
 *   * grey   → unknown    (no recent scrape log in audit window)
 *
 * Source of truth: ``public.scrape_health``, populated by
 * ``tools/supabase_health_sync.py`` after each daily scrape on the
 * Mac mini. Schema in ``../../jobwatcher/sql/supabase_schema.sql``.
 *
 * Per spec: company name + small icon only. No filters, no detail
 * panels, no clicks-through. The whole point of this page is "give
 * me an at-a-glance scan of who's broken right now."
 *
 * Server Component: each request fetches the latest snapshot. RLS
 * (``scrape_health_public_read``) lets anon read all rows.
 */

import { supabase } from "@/lib/supabase";
import type { ScrapeHealth } from "@/lib/database.types";

export const metadata = {
  title: "Scrape health · Jobs",
  description: "Per-company scrape health and drift alerts.",
};

// Render on every request — without this, Next.js statically renders
// the page at build time, so the first deploy that ran before
// `scrape_health` was populated locked in an "empty state" snapshot
// and the CDN served it forever. The data freshness here is bounded
// by Supabase reads (~50 ms), so per-request rendering is fine.
//
// Next.js v16 with `cacheComponents` would require a different
// approach (the route-segment `dynamic` flag is removed under that
// flag) — see `node_modules/next/dist/docs/01-app/02-guides/
// caching-without-cache-components.md`. This project doesn't have
// `cacheComponents` enabled, so the legacy directive applies.
export const dynamic = "force-dynamic";

const STATUS_ORDER: Record<ScrapeHealth["status"], number> = {
  failing: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};

const STATUS_DOT_CLASS: Record<ScrapeHealth["status"], string> = {
  failing: "bg-red-500",
  warning: "bg-amber-400",
  healthy: "bg-emerald-500",
  unknown: "bg-zinc-400",
};

const STATUS_LABEL: Record<ScrapeHealth["status"], string> = {
  failing: "Failing",
  warning: "Warning",
  healthy: "Healthy",
  unknown: "Unknown",
};

interface HealthCounts {
  healthy: number;
  warning: number;
  failing: number;
  unknown: number;
}

interface JobTotals {
  // Number of canonical rows actually visible to users in the feed.
  // Comes from a HEAD count against ``public.jobs`` — that table is
  // already filtered by RLS to ``us_or_remote_eligible AND relevant``,
  // so its row count IS the user-facing feed size.
  feed: number;
  // Sum of ``relevant_jobs`` across the per-company logs. Useful as
  // "matches scraped today" — it slightly over-counts because a job
  // surfaced through both a VC network and a direct board appears in
  // both rows; the canonical-key dedup happens at SQLite-replay time
  // and is not reflected here. Treat as a scraping-throughput signal,
  // not a feed-size signal.
  relevantScrapedToday: number;
}

async function fetchHealth(): Promise<{
  rows: ScrapeHealth[];
  counts: HealthCounts;
  totals: JobTotals;
  updatedAt: string | null;
}> {
  // ``current_mirror_jobs`` was added 2026-04-27 — try the rich
  // SELECT first; on PGREST 42703 ("column does not exist") fall
  // back to the legacy field set so the page still renders during
  // the rolling-forward window before the migration lands.
  const RICH_SELECT =
    "company, status, alert_kind, last_scraped_at, scraped_jobs, relevant_jobs, mirror_jobs, current_mirror_jobs, detail, updated_at";
  const LEGACY_SELECT =
    "company, status, alert_kind, last_scraped_at, scraped_jobs, relevant_jobs, mirror_jobs, detail, updated_at";

  let healthResult = await supabase
    .from("scrape_health")
    .select(RICH_SELECT)
    .order("company", { ascending: true });
  if (healthResult.error?.code === "42703") {
    healthResult = await supabase
      .from("scrape_health")
      .select(LEGACY_SELECT)
      .order("company", { ascending: true });
  }
  // ``head: true`` returns just the count without bodies — cheap.
  // ``count: 'exact'`` is fine here because /health is operator-
  // facing, not in the user feed's hot path.
  const feedCount = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true });

  if (healthResult.error) {
    // Table might not exist yet during the brief window between
    // shipping this code and applying the schema migration. Render
    // a friendly empty-state instead of a 500.
    return {
      rows: [],
      counts: { healthy: 0, warning: 0, failing: 0, unknown: 0 },
      totals: { feed: 0, relevantScrapedToday: 0 },
      updatedAt: null,
    };
  }

  const rows = (healthResult.data ?? []) as ScrapeHealth[];
  const counts: HealthCounts = { healthy: 0, warning: 0, failing: 0, unknown: 0 };
  let relevantScrapedToday = 0;
  let mostRecent: string | null = null;
  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    relevantScrapedToday += r.relevant_jobs ?? 0;
    if (r.updated_at && (!mostRecent || r.updated_at > mostRecent)) {
      mostRecent = r.updated_at;
    }
  }

  // Sort: failing → warning → unknown → healthy (primary), then by
  // current_mirror_jobs descending (secondary), then company alpha
  // (tertiary for ties). Sorting on the *current* count rather than
  // today's contribution matters most for the failing band: a Tesla
  // outage with 3,856 still-live jobs ranks above a Micron outage
  // with 0 still-live, even though both have ``mirror_jobs=0`` today.
  // Within healthy, current ≈ today, so the sort is the same.
  rows.sort((a, b) => {
    const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDelta !== 0) return statusDelta;
    const aCount = a.current_mirror_jobs ?? a.mirror_jobs ?? 0;
    const bCount = b.current_mirror_jobs ?? b.mirror_jobs ?? 0;
    const countDelta = bCount - aCount;
    if (countDelta !== 0) return countDelta;
    return a.company.localeCompare(b.company);
  });

  return {
    rows,
    counts,
    totals: { feed: feedCount.count ?? 0, relevantScrapedToday },
    updatedAt: mostRecent,
  };
}

function StatusDot({ status }: { status: ScrapeHealth["status"] }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
    />
  );
}

export default async function HealthPage() {
  const { rows, counts, totals, updatedAt } = await fetchHealth();
  const total = rows.length;
  const numberFmt = new Intl.NumberFormat("en-US");
  const updatedLabel =
    updatedAt
      ? new Date(updatedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Scrape health
          </h1>
          {updatedLabel && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              updated {updatedLabel}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-6">
        {total === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No scrape-health data yet. Once <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tools/supabase_health_sync.py</code> runs on the Mac mini, this page will populate.
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="flex items-center gap-2">
                <StatusDot status="failing" />
                {counts.failing} failing
              </span>
              <span className="flex items-center gap-2">
                <StatusDot status="warning" />
                {counts.warning} warning
              </span>
              <span className="flex items-center gap-2">
                <StatusDot status="unknown" />
                {counts.unknown} unknown
              </span>
              <span className="flex items-center gap-2">
                <StatusDot status="healthy" />
                {counts.healthy} healthy
              </span>
              <span className="text-zinc-400 dark:text-zinc-500">
                · {total} configured companies
              </span>
            </div>

            {/*
             * Totals row — answers "how big is the feed right now?" at
             * a glance. ``feed`` is the canonical mirror size (what
             * users see); ``relevantScrapedToday`` is sum of per-
             * company relevant_jobs, useful as a throughput proxy
             * (slight over-count when one job is surfaced through both
             * a VC network and a direct board — the canonical-key
             * dedup happens after this is recorded).
             */}
            <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {numberFmt.format(totals.feed)}
                </span>{" "}
                jobs in feed
              </span>
              <span className="text-zinc-400 dark:text-zinc-500">
                · {numberFmt.format(totals.relevantScrapedToday)} relevant scraped today
              </span>
            </div>

            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {rows.map((row) => (
                <li
                  key={row.company}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <StatusDot status={row.status} />
                  <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-50">
                    {row.company}
                  </span>
                  {/*
                   * Two-number view: ``today | current``.
                   *   - today    = ``mirror_jobs``  (this run's
                   *     contribution; collapses to 0 on a failed
                   *     scrape because no rows were touched)
                   *   - current  = ``current_mirror_jobs`` (rows in
                   *     the live mirror right now; survives a failed
                   *     scrape because closure didn't run)
                   *
                   * On a successful scrape the two match and the
                   * format reads like ``5,025 | 5,025``. On a failed
                   * scrape (Tesla blocked by Akamai today) it reads
                   * ``0 | 3,856`` — telling the operator "the feed
                   * still has yesterday's data, the scraper just
                   * failed today."
                   *
                   * Backward compat: ``current_mirror_jobs`` may be
                   * null on rows that pre-date the 2026-04-27
                   * migration; in that case the second number falls
                   * back to ``mirror_jobs`` so the format stays valid.
                   *
                   * Tabular-nums keeps the digits aligned even at
                   * proportional font widths so the eye can skim
                   * down the list and spot outliers at a glance.
                   */}
                  <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                    {numberFmt.format(row.mirror_jobs ?? 0)}
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">|</span>
                    <span className="text-zinc-900 dark:text-zinc-50">
                      {numberFmt.format(row.current_mirror_jobs ?? row.mirror_jobs ?? 0)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
