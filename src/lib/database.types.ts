/**
 * Hand-written type definitions for the Supabase schema.
 *
 * In the future we can generate this file from Supabase's schema
 * directly (`supabase gen types typescript --project-id <ref>`), but a
 * handwritten copy keeps us free of the Supabase CLI install while the
 * schema is small and stable.
 *
 * Source of truth: `jobwatcher/sql/supabase_schema.sql`.
 */

export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          canonical_key: string;
          company: string;
          title: string;
          posting_url: string;
          canonical_posting_url: string;
          preferred_source_company: string;
          preferred_source_job_url: string;
          source: string;
          board_type: string;
          external_job_id: string;
          posted_at: string;
          summary: string;
          location: string;
          us_or_remote_eligible: boolean;
          is_remote: boolean;
          relevant: boolean;
          tier: string | null;
          effective_posted_at: string | null;
          description: string;
          first_seen: string;
          last_seen: string;
          synced_at: string;
        };
      };
      scrape_runs_latest: {
        Row: {
          source_company: string;
          board_type: string;
          source_url: string;
          status: string;
          scraped_jobs: number;
          relevant_jobs: number;
          started_at: string;
          completed_at: string;
          notes: string;
          synced_at: string;
        };
      };
      scrape_health: {
        Row: {
          company: string;
          /**
           * Rollup of the latest drift / scrape state. Drives the
           * `/health` dashboard icon: green / yellow / red / grey.
           */
          status: "healthy" | "warning" | "failing" | "unknown";
          /**
           * Comma-joined sorted list of alert-kind tokens that fired
           * (e.g. ``"drop_30pct,stuck_at_zero"``). Empty string when
           * status is ``healthy`` / ``unknown``.
           */
          alert_kind: string;
          last_scraped_at: string | null;
          /** Raw rows fetched in today's scrape run. */
          scraped_jobs: number;
          /** Today's matches that survived the relevance matcher. */
          relevant_jobs: number;
          /**
           * Today's contribution to the mirror — relevant + US-eligible
           * rows from this run. Goes to 0 on a failed scrape because
           * no rows were touched. Use ``current_mirror_jobs`` for the
           * actual current feed size.
           */
          mirror_jobs: number;
          /**
           * Rows currently in the live mirror for this source_company
           * regardless of today's scrape outcome. Survives a failed
           * scrape because the close-stale logic in
           * ``storage._mark_missing_sources_with_conn`` is gated
           * behind ``status == "completed"``.
           *
           * Optional — added 2026-04-27. Older rows that pre-date the
           * ``2026_04_27_current_mirror_jobs.sql`` migration return
           * ``null``; the dashboard falls back to ``mirror_jobs`` in
           * that case.
           */
          current_mirror_jobs: number | null;
          detail: string;
          updated_at: string;
        };
      };
    };
  };
};

/** One scrape-health row used by the /health dashboard. */
export type ScrapeHealth = Database["public"]["Tables"]["scrape_health"]["Row"];

/** Convenience alias for a single open-job row. */
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
