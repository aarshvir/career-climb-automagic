import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type CvDocument = {
  id: string;
  user_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  text_content: string;
  created_at: string;
};

export type ApplicationPack = {
  id: string;
  user_id: string;
  resume_id: string | null;
  request_id: string;
  job_title: string;
  company: string;
  job_url: string | null;
  job_description: string;
  original_text: string;
  tailored_text: string;
  matched_keywords: string[];
  missing_keywords: string[];
  status: "draft" | "approved";
  created_at: string;
};

export type ApplicationStatus = "saved" | "applied" | "interview" | "offer" | "rejected" | "withdrawn";
export type TrackedApplication = {
  id: string;
  user_id: string;
  pack_id: string | null;
  /** Absent only in legacy cached rows created before the additive link migration. */
  cv_check_id?: string | null;
  job_title: string;
  company: string;
  job_url: string | null;
  status: ApplicationStatus;
  notes: string;
  applied_at: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };

/** Explicit new-table boundary; keep the existing authenticated client/session. */
export type MvpDatabase = {
  public: {
    Tables: {
      cv_documents: Table<CvDocument, Omit<CvDocument, "id" | "created_at"> & { id?: string; created_at?: string }>;
      application_packs: Table<ApplicationPack, Omit<ApplicationPack, "id" | "created_at"> & { id?: string; created_at?: string }>;
      tracked_applications: Table<TrackedApplication, {
        id?: string;
        user_id: string;
        pack_id?: string | null;
        job_title: string;
        company?: string;
        job_url?: string | null;
        status?: ApplicationStatus;
        notes?: string;
        applied_at?: string | null;
        follow_up_at?: string | null;
        created_at?: string;
        updated_at?: string;
      }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      track_cv_check: { Args: { p_cv_check_id: string }; Returns: TrackedApplication[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export const mvpSupabase = supabase as unknown as SupabaseClient<MvpDatabase>;
