"use client";

/**
 * Dropdown for the company-tier filter. Writes the `?t=…` URL param.
 * When active, narrows the feed to rows whose `tier` column matches
 * (FAANG+, Tier 1, Tier 2, Tier 3). "All tiers" leaves the filter off
 * — unranked companies (`tier IS NULL`) show up only in that mode.
 *
 * The tier column is populated at Supabase-sync time from
 * `jobwatcher.tiers.tier_for()`; edit that map to change which tier
 * a company belongs to.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TIER_FILTERS, type TierFilter as TierValue } from "@/lib/filters";

export function TierFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("t") ?? "all") as TierValue;

  function update(next: TierValue) {
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("t");
    else sp.set("t", next);
    // Changing the tier resets to page 1 — pagination only applies
    // within a given filter set.
    sp.delete("p");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="shrink-0">Tier:</span>
      <select
        value={current}
        onChange={(e) => update(e.target.value as TierValue)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {TIER_FILTERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
