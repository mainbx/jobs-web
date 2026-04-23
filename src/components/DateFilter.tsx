"use client";

/**
 * Dropdown for the "posted within" filter. Writes to the `d` URL param.
 * Only jobs whose `posted_at` is non-empty AND falls within the window
 * are kept (server-side filter, see `src/app/page.tsx`).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DATE_RANGES, type DateRange } from "@/lib/filters";

export function DateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("d") ?? "any") as DateRange;

  function update(next: DateRange) {
    const sp = new URLSearchParams(params.toString());
    if (next === "any") sp.delete("d");
    else sp.set("d", next);
    // Changing the window resets to page 1 — pagination only applies
    // within a given filter set.
    sp.delete("p");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="shrink-0">Posted:</span>
      <select
        value={current}
        onChange={(e) => update(e.target.value as DateRange)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {DATE_RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
