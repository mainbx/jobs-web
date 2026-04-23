"use client";

/**
 * Dropdown for the Remote / Onsite / All filter. Writes to the `r` URL
 * param. When active, narrows the feed to jobs whose `is_remote` flag
 * matches (true for "remote", false for "onsite"). "All" leaves the
 * filter off entirely.
 *
 * Note: the feed is already US-scoped by the Supabase mirror, so
 * "Onsite only" means onsite US, and "Remote only" means
 * remote-workable from the US.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REMOTE_FILTERS, type RemoteFilter } from "@/lib/filters";

export function RemoteFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("r") ?? "all") as RemoteFilter;

  function update(next: RemoteFilter) {
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("r");
    else sp.set("r", next);
    // Changing the filter resets to page 1 — pagination only applies
    // within a given filter set.
    sp.delete("p");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="shrink-0">Remote:</span>
      <select
        value={current}
        onChange={(e) => update(e.target.value as RemoteFilter)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {REMOTE_FILTERS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
