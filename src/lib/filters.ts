/**
 * Filter catalog + URL/query helpers for the Jobs feed.
 *
 * A "keyword" here is a pre-defined label the user can toggle on/off
 * from a chip row. Free-text search is handled separately (see the
 * `search` URL parameter / `SearchBar` component).
 *
 * Keyword matching is title-only and case-insensitive — narrow by
 * design, so chip behavior is predictable ("Backend" means jobs whose
 * title actually contains "backend", not jobs loosely tagged backend
 * by some ATS filter).
 *
 * Multiple selected keywords combine with **OR** logic — "backend OR
 * robotics" gives you the union, which is what you want when you're
 * open to several role types.
 */

/**
 * Display label → regex-safe substring to match against job titles.
 * These drive the chip row above the feed. Each chip is an ILIKE
 * substring match on `title`; multiple selected chips combine with OR.
 * The backend's `matcher.py` TITLE_PHRASES/PATTERNS decide what makes
 * a row `relevant=true` in the first place — keep the two roughly in
 * sync so clicking a chip never returns zero results.
 */
export const KEYWORDS: { label: string; match: string }[] = [
  // Generic software
  { label: "Software", match: "software" },
  { label: "Software Engineer", match: "software engineer" },
  { label: "SWE", match: "swe" },
  { label: "SDE", match: "sde" },
  { label: "Developer", match: "developer" },
  { label: "Engineer", match: "engineer" },
  { label: "Staff Engineer", match: "staff engineer" },
  { label: "Principal Engineer", match: "principal engineer" },

  // Layered software roles
  { label: "Backend", match: "backend" },
  { label: "Backend Engineer", match: "backend engineer" },
  { label: "Fullstack", match: "fullstack" },
  { label: "Full-Stack", match: "full-stack" },
  { label: "Full Stack", match: "full stack" },
  { label: "Application", match: "application" },
  { label: "Framework", match: "framework" },
  { label: "Product", match: "product" },

  // AI / ML / Data
  { label: "AI", match: "ai" },
  { label: "AI Engineer", match: "ai engineer" },
  { label: "ML Engineer", match: "ml engineer" },
  { label: "Algorithm", match: "algorithm" },
  { label: "Research Engineer", match: "research engineer" },
  { label: "Research Scientist", match: "research scientist" },
  { label: "Data", match: "data" },
  { label: "Data Engineer", match: "data engineer" },
  { label: "Data Scientist", match: "data scientist" },
  { label: "Data Science", match: "data science" },

  // Systems / infra / network
  { label: "Systems", match: "systems" },
  { label: "Network", match: "network" },
  { label: "Network Engineer", match: "network engineer" },
  { label: "Compute", match: "compute" },
  { label: "Connectivity", match: "connectivity" },
  { label: "Validation", match: "validation" },

  // Hardware / silicon
  { label: "Embedded", match: "embedded" },
  { label: "Embedded Systems", match: "embedded systems" },
  { label: "Firmware", match: "firmware" },
  { label: "Kernel", match: "kernel" },
  { label: "Hardware", match: "hardware" },
  { label: "Silicon", match: "silicon" },
  { label: "GPU", match: "gpu" },
  { label: "CPU", match: "cpu" },
  { label: "RF", match: "rf" },

  // Robotics
  { label: "Robotics", match: "robotics" },
  { label: "Robot", match: "robot" },

  // Quant / trading
  { label: "Trader", match: "trader" },
  { label: "Trading", match: "trading" },
  { label: "Quant", match: "quant" },

  // Languages
  { label: "Python", match: "python" },
  { label: "C++", match: "c++" },
  { label: "Rust", match: "rust" },

  // Intern / grad seasons
  { label: "Fall", match: "fall" },
  { label: "Fall 2026", match: "fall 2026" },
];

export type DateRange = "any" | "24h" | "7d" | "30d";

export const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/**
 * Floors for the "Posted within" filter. The UI filters on two
 * columns simultaneously so no row is hidden for lack of a
 * `posted_at` — see the compound `.or(...)` in `app/page.tsx`:
 *
 *   (posted_at known AND posted_at >= postedText)
 *   OR (posted_at empty AND first_seen >= iso)
 *
 * `postedText` is the bytewise-compatible format of the backend's
 * `normalize_posted_at` output: `YYYY-MM-DDTHH:MM:SS+00:00`, no
 * fractional seconds, explicit +00:00 offset. Matching byte-for-byte
 * is required because `posted_at` is a TEXT column and PostgREST's
 * `gte` is a lexicographic compare.
 *
 * `iso` is a full ISO-8601 with millis + Z suffix, fine for the
 * `first_seen` TIMESTAMPTZ column (native comparison).
 *
 * Returns `null` when the range is "any" (no floor).
 */
export interface DateFloors {
  postedText: string;
  iso: string;
}

export function dateRangeFloors(range: DateRange): DateFloors | null {
  const days: Partial<Record<DateRange, number>> = {
    "24h": 1,
    "7d": 7,
    "30d": 30,
  };
  const d = days[range];
  if (d === undefined) return null;
  const floor = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  const iso = floor.toISOString(); // "2026-04-22T05:30:34.730Z"
  const postedText = iso.slice(0, 19) + "+00:00"; // "2026-04-22T05:30:34+00:00"
  return { iso, postedText };
}


/**
 * Two-state Remote filter on the `is_remote` column. "All" leaves the
 * filter off; "Remote only" narrows to `is_remote=true`. Onsite isn't
 * surfaced — the feed is already US-scoped, so "hide remote" is the
 * only non-default case users actually ask for.
 */
export type RemoteFilter = "all" | "remote";

export const REMOTE_FILTERS: { value: RemoteFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "remote", label: "Remote only" },
];

/**
 * Company-tier filter on the `tier` column. `all` leaves it off; the
 * four labeled tiers map 1:1 to the values populated by
 * `jobwatcher.tiers.tier_for()` at Supabase-sync time. Keep labels in
 * sync with `../jobwatcher/src/jobwatcher/tiers.py::TIER_ORDER`.
 */
export type TierFilter = "all" | "faang" | "t1" | "t2" | "t3" | "startups";

export const TIER_FILTERS: {
  value: TierFilter;
  label: string;
  /** Value written to the `tier` column; `null` means "don't filter". */
  dbValue: string | null;
}[] = [
  { value: "all", label: "All tiers", dbValue: null },
  { value: "faang", label: "FAANG+", dbValue: "FAANG+" },
  { value: "t1", label: "Tier 1", dbValue: "Tier 1" },
  { value: "t2", label: "Tier 2", dbValue: "Tier 2" },
  { value: "t3", label: "Tier 3", dbValue: "Tier 3" },
  { value: "startups", label: "Startups", dbValue: "Startups" },
];

/**
 * Parse URL search params into a normalized FilterState. Never throws —
 * unknown values fall back to sensible defaults.
 *
 * URL schema:
 *   ?q=<text>           free-text (title OR company substring)
 *   &k=<csv>            comma-separated keyword chips (title-only OR)
 *   &d=<any|24h|7d|30d> posted-at window, default "any"
 *   &r=<all|remote|onsite>  is_remote filter, default "all"
 *   &p=<N>              1-based page number, default 1
 */
export interface FilterState {
  search: string;
  keywords: string[];
  posted: DateRange;
  remote: RemoteFilter;
  tier: TierFilter;
  page: number;
}

export function parseFilters(params: URLSearchParams): FilterState {
  const rawKw = (params.get("k") ?? "").trim();
  const rawDate = (params.get("d") ?? "any").trim() as DateRange;
  const validDates = new Set<DateRange>(DATE_RANGES.map((r) => r.value));
  const rawRemote = (params.get("r") ?? "all").trim() as RemoteFilter;
  const validRemote = new Set<RemoteFilter>(REMOTE_FILTERS.map((r) => r.value));
  const rawTier = (params.get("t") ?? "all").trim() as TierFilter;
  const validTiers = new Set<TierFilter>(TIER_FILTERS.map((t) => t.value));
  const rawPage = Number.parseInt(params.get("p") ?? "1", 10);
  return {
    search: (params.get("q") ?? "").trim(),
    keywords: rawKw ? rawKw.split(",").filter(Boolean) : [],
    posted: validDates.has(rawDate) ? rawDate : "any",
    remote: validRemote.has(rawRemote) ? rawRemote : "all",
    tier: validTiers.has(rawTier) ? rawTier : "all",
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/**
 * Serialize a FilterState back to a URL search string suitable for
 * `router.push(`?${…}`)`. Empty fields are dropped so the URL stays
 * short — e.g. `/?q=rust&k=software,backend`.
 */
export function serializeFilters(state: FilterState): string {
  const sp = new URLSearchParams();
  if (state.search) sp.set("q", state.search);
  if (state.keywords.length > 0) sp.set("k", state.keywords.join(","));
  if (state.posted !== "any") sp.set("d", state.posted);
  if (state.remote !== "all") sp.set("r", state.remote);
  if (state.tier !== "all") sp.set("t", state.tier);
  if (state.page > 1) sp.set("p", String(state.page));
  return sp.toString();
}

/**
 * Build a PostgREST `or` clause for the currently-selected keywords.
 * Returns `null` when nothing is selected (caller skips the filter).
 *
 * Example: selected = ["software", "backend"] →
 *   "title.ilike.*software*,title.ilike.*backend*"
 * Wrapping each term in `*` gives substring (ILIKE `%software%`)
 * behaviour, matching the UI promise that a chip highlights titles
 * that *contain* the keyword.
 */
export function keywordOrClause(selected: string[]): string | null {
  if (selected.length === 0) return null;
  // PostgREST's `or` filter expects a comma-separated list of
  // `column.op.value` pairs. Commas and parens inside values must be
  // encoded — we only allow keywords from the whitelist so we know the
  // set is safe; still escape defensively.
  const escape = (s: string) => s.replace(/[(),]/g, " ");
  return selected.map((k) => `title.ilike.*${escape(k)}*`).join(",");
}
