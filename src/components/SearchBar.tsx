"use client";

/**
 * Free-text search input. Writes the query to the `q` URL parameter,
 * debounced so we don't thrash the server while the user is typing.
 *
 * Kept as a client component because the input needs React state and
 * debouncing. The page itself stays a Server Component — it just
 * re-fetches whenever the URL changes.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DEBOUNCE_MS = 250;

export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Seed from URL so refresh / deep-link preserves the query.
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      // Changing the search query resets to page 1 — no point paging
      // within a filter set that no longer includes what you were on.
      next.delete("p");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <input
        type="search"
        placeholder="Search titles, companies…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          aria-label="Clear search"
        >
          clear
        </button>
      )}
    </div>
  );
}
