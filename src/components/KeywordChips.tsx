"use client";

/**
 * Collapsible keyword-chip panel.
 *
 * The filter row gets a compact toggle ("Keywords ▾" with a selected
 * count), and the full chip grid + ad-hoc input expands below only
 * when the user clicks it. Default is collapsed so the feed isn't
 * crowded by 60+ chips wrapping onto multiple rows.
 *
 * Chips are two flavors:
 *   - **Built-ins** from `KEYWORDS` in `lib/filters.ts` — fixed labels
 *     (Software, Backend, Robotics, GPU, Applied Science, …).
 *   - **Custom** — user-entered values that aren't in the catalog.
 *     Stored in the same `?k=…` URL param (comma-separated) and
 *     rendered with a dashed emerald outline and a "×" remover.
 *
 * Both flavors become title-ILIKE substring matches in the server-side
 * query (`keywordOrClause`), combined with OR logic.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KEYWORDS } from "@/lib/filters";

const BUILTIN_MATCHES = new Set(KEYWORDS.map((k) => k.match));

export function KeywordChips() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selected = new Set(
    (params.get("k") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  // Default: panel closed. Auto-open when the URL carries any keyword
  // so a deep-linked filter is immediately visible + editable.
  const [open, setOpen] = useState<boolean>(selected.size > 0);

  // Custom chips = currently-selected keywords that aren't in the
  // built-in catalog. They persist in the URL just like built-in chips.
  const customChips = Array.from(selected).filter((m) => !BUILTIN_MATCHES.has(m));

  function commitSelection(next: Set<string>) {
    const sp = new URLSearchParams(params.toString());
    if (next.size > 0) sp.set("k", Array.from(next).join(","));
    else sp.delete("k");
    // Toggling / adding resets to page 1 — pagination only applies
    // within a given filter set.
    sp.delete("p");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggle(match: string) {
    const next = new Set(selected);
    if (next.has(match)) next.delete(match);
    else next.add(match);
    commitSelection(next);
  }

  function removeCustom(match: string) {
    const next = new Set(selected);
    next.delete(match);
    commitSelection(next);
  }

  function addCustom(raw: string) {
    const clean = raw.trim().toLowerCase();
    // Empty, duplicate, or contains the delimiter we use for storage
    // — all rejected.
    if (!clean || selected.has(clean) || clean.includes(",")) return;
    const next = new Set(selected);
    next.add(clean);
    commitSelection(next);
  }

  function clearAll() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("k");
    sp.delete("p");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-2">
      {/* Toggle bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="keyword-panel"
          className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        >
          <span>Keywords</span>
          {selected.size > 0 && (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              {selected.size}
            </span>
          )}
          <span
            className="text-xs text-zinc-500 transition-transform dark:text-zinc-400"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        {selected.size > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            clear all
          </button>
        )}
      </div>

      {/* Expanded panel */}
      {open && (
        <div
          id="keyword-panel"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          {KEYWORDS.map(({ label, match }) => {
            const on = selected.has(match);
            return (
              <button
                key={match}
                type="button"
                onClick={() => toggle(match)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (on
                    ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500")
                }
              >
                {label}
              </button>
            );
          })}

          {/* Custom chips — dashed emerald outline differentiates them from
              built-ins; inline "×" removes without collapsing the panel. */}
          {customChips.map((match) => (
            <span
              key={`custom-${match}`}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-600 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200"
            >
              <span>{match}</span>
              <button
                type="button"
                onClick={() => removeCustom(match)}
                className="-mr-1 rounded-full px-1 leading-none text-emerald-700 hover:bg-emerald-200 dark:text-emerald-300 dark:hover:bg-emerald-900"
                aria-label={`Remove keyword ${match}`}
              >
                ×
              </button>
            </span>
          ))}

          <AddKeywordButton onAdd={addCustom} />
        </div>
      )}
    </div>
  );
}

function AddKeywordButton({ onAdd }: { onAdd: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input as soon as it appears so the user can just type.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function commit() {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-zinc-400 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-600 hover:text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-400 dark:hover:text-zinc-100"
      >
        + add keyword
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-400 bg-white px-2 py-0.5 dark:border-zinc-600 dark:bg-zinc-900">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder="e.g. analyst"
        className="w-32 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
      />
    </span>
  );
}
