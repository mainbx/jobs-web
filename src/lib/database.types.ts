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
    };
  };
};

/** Convenience alias for a single open-job row. */
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
