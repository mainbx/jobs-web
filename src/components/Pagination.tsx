"use client";

/**
 * Numbered paginator. Always shows the first page, last page, and a
 * window of ±2 around the current page. Ellipses fill any gaps wider
 * than one.
 *
 *     « Prev   1  …  5  6  [7]  8  9  …  20   Next »
 *
 * The link model is URL-driven (`?p=N`), so the page stays a Server
 * Component — this component just renders anchors. On click, Next.js
 * navigates and the RSC re-fetches Supabase with the new filters +
 * page.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const WINDOW = 2; // show current ± WINDOW

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  pageCount,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  /** Actual number of rows rendered on the current page (≤ pageSize). */
  pageCount: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(nextPage: number): string {
    const sp = new URLSearchParams(params.toString());
    if (nextPage <= 1) sp.delete("p");
    else sp.set("p", String(nextPage));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // "Showing 1–100 of 5,432" status line
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + pageCount;

  if (totalPages <= 1) {
    // Single-page feed — no paginator, but surface the count for
    // confidence.
    return (
      <nav
        aria-label="Pagination"
        className="flex items-center justify-end pt-6 text-sm text-zinc-600 dark:text-zinc-400"
      >
        <span>
          {totalCount === 0
            ? "No results"
            : `${totalCount.toLocaleString()} ${totalCount === 1 ? "result" : "results"}`}
        </span>
      </nav>
    );
  }

  const pages = buildPageList(page, totalPages, WINDOW);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 pt-6 text-sm text-zinc-600 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        {totalCount > 0 ? (
          <>
            Showing{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {from.toLocaleString()}
            </span>
            {"–"}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {to.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {totalCount.toLocaleString()}
            </span>
          </>
        ) : (
          "No results on this page"
        )}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <PaginationLink
          label="« Prev"
          href={href(page - 1)}
          disabled={page <= 1}
          ariaLabel="Previous page"
        />
        {pages.map((p, idx) =>
          p === null ? (
            <span
              key={`ellipsis-${idx}`}
              aria-hidden="true"
              className="px-1.5 py-1 text-zinc-400 dark:text-zinc-600"
            >
              …
            </span>
          ) : (
            <PageButton
              key={p}
              pageNumber={p}
              href={href(p)}
              current={p === page}
              totalPages={totalPages}
            />
          ),
        )}
        <PaginationLink
          label="Next »"
          href={href(page + 1)}
          disabled={page >= totalPages}
          ariaLabel="Next page"
        />
      </div>
    </nav>
  );
}

function PageButton({
  pageNumber,
  href,
  current,
  totalPages,
}: {
  pageNumber: number;
  href: string;
  current: boolean;
  totalPages: number;
}) {
  const label = `Page ${pageNumber} of ${totalPages}`;
  const base =
    "min-w-[2.25rem] rounded-md px-2.5 py-1.5 text-center font-medium transition-colors";
  if (current) {
    return (
      <span
        aria-current="page"
        aria-label={`${label}, current page`}
        className={
          base +
          " border border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
        }
      >
        {pageNumber}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={true}
      aria-label={label}
      className={
        base +
        " border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
      }
    >
      {pageNumber}
    </Link>
  );
}

function PaginationLink({
  label,
  href,
  disabled,
  ariaLabel,
}: {
  label: string;
  href: string;
  disabled: boolean;
  ariaLabel: string;
}) {
  const base =
    "rounded-md px-2.5 py-1.5 font-medium transition-colors border";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={
          base +
          " cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
        }
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={true}
      aria-label={ariaLabel}
      className={
        base +
        " border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
      }
    >
      {label}
    </Link>
  );
}

/**
 * Compute the list of page numbers (with `null` placeholders for
 * ellipses) to render given a current page, total, and window size.
 *
 *   buildPageList(7, 20, 2) → [1, null, 5, 6, 7, 8, 9, null, 20]
 *   buildPageList(1, 20, 2) → [1, 2, 3, null, 20]
 *   buildPageList(20, 20, 2) → [1, null, 18, 19, 20]
 *   buildPageList(3, 5, 2) → [1, 2, 3, 4, 5]
 *   buildPageList(1, 1, 2) → [1]
 */
export function buildPageList(
  current: number,
  total: number,
  windowSize: number,
): (number | null)[] {
  if (total <= 1) return [1];
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let i = current - windowSize; i <= current + windowSize; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push(null); // ellipsis placeholder
    out.push(p);
    prev = p;
  }
  return out;
}
