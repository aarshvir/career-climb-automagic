export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      daily_job_batches: {
        Row: {
          batch_date: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          make_com_webhook_url: string | null
          status: string
          total_jobs_scraped: number | null
          triggered_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_date?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          make_com_webhook_url?: string | null
          status?: string
          total_jobs_scraped?: number | null
          triggered_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_date?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          make_com_webhook_url?: string | null
          status?: string
          total_jobs_scraped?: number | null
          triggered_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          generation_status: string | null
          id: string
          job_application_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          generation_status?: string | null
          id?: string
          job_application_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          generation_status?: string | null
          id?: string
          job_application_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_forms: {
        Row: {
          app_expectations: string
          career_objective: string
          created_at: string
          email: string
          id: string
          max_monthly_price: number
          name: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_expectations: string
          career_objective: string
          created_at?: string
          email?: string
          id?: string
          max_monthly_price: number
          name: string
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_expectations?: string
          career_objective?: string
          created_at?: string
          email?: string
          id?: string
          max_monthly_price?: number
          name?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          application_deadline: string | null
          application_status: string | null
          ats_score: number | null
          batch_id: string | null
          company_name: string
          compatibility_score: number | null
          cover_letter_url: string | null
          created_at: string
          email_draft_url: string | null
          id: string
          job_description: string | null
          job_title: string
          job_url: string | null
          location: string | null
          make_com_processed_at: string | null
          optimized_resume_url: string | null
          resume_match_score: number | null
          salary_range: string | null
          scraped_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_deadline?: string | null
          application_status?: string | null
          ats_score?: number | null
          batch_id?: string | null
          company_name: string
          compatibility_score?: number | null
          cover_letter_url?: string | null
          created_at?: string
          email_draft_url?: string | null
          id?: string
          job_description?: string | null
          job_title: string
          job_url?: string | null
          location?: string | null
          make_com_processed_at?: string | null
          optimized_resume_url?: string | null
          resume_match_score?: number | null
          salary_range?: string | null
          scraped_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_deadline?: string | null
          application_status?: string | null
          ats_score?: number | null
          batch_id?: string | null
          company_name?: string
          compatibility_score?: number | null
          cover_letter_url?: string | null
          created_at?: string
          email_draft_url?: string | null
          id?: string
          job_description?: string | null
          job_title?: string
          job_url?: string | null
          location?: string | null
          make_com_processed_at?: string | null
          optimized_resume_url?: string | null
          resume_match_score?: number | null
          salary_range?: string | null
          scraped_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "daily_job_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      job_fetch_runs: {
        Row: {
          id: string
          ran_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          ran_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          ran_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_fetch_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          apify_search_url: string | null
          created_at: string
          id: string
          resume_links: Json | null
          run_status: string
          user_id: string
        }
        Insert: {
          apify_search_url?: string | null
          created_at?: string
          id?: string
          resume_links?: Json | null
          run_status?: string
          user_id: string
        }
        Update: {
          apify_search_url?: string | null
          created_at?: string
          id?: string
          resume_links?: Json | null
          run_status?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company_name: string | null
          created_at: string
          description: string | null
          generated_resume_json: Json | null
          id: string
          job_run_id: string | null
          linkedin_url: string | null
          location: string | null
          match_score: number | null
          posted_at_text: string | null
          recommended_resume_url: string | null
          status: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          description?: string | null
          generated_resume_json?: Json | null
          id?: string
          job_run_id?: string | null
          linkedin_url?: string | null
          location?: string | null
          match_score?: number | null
          posted_at_text?: string | null
          recommended_resume_url?: string | null
          status?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          description?: string | null
          generated_resume_json?: Json | null
          id?: string
          job_run_id?: string | null
          linkedin_url?: string | null
          location?: string | null
          match_score?: number | null
          posted_at_text?: string | null
          recommended_resume_url?: string | null
          status?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          country: string | null
          geo_id: string
          id: string
          name: string
        }
        Insert: {
          country?: string | null
          geo_id: string
          id?: string
          name: string
        }
        Update: {
          country?: string | null
          geo_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      plan_selections: {
        Row: {
          created_at: string
          id: string
          selected_plan: string
          selection_completed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          selected_plan: string
          selection_completed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          selected_plan?: string
          selection_completed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      preferences: {
        Row: {
          cities: string | null
          created_at: string | null
          job_title: string | null
          job_type: string | null
          location: string | null
          seniority_level: string | null
          titles: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cities?: string | null
          created_at?: string | null
          job_title?: string | null
          job_type?: string | null
          location?: string | null
          seniority_level?: string | null
          titles?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cities?: string | null
          created_at?: string | null
          job_title?: string | null
          job_type?: string | null
          location?: string | null
          seniority_level?: string | null
          titles?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          email: string | null
          id: string
          plan: string | null
          price_id: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          id: string
          plan?: string | null
          price_id?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          id?: string
          plan?: string | null
          price_id?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      resume_variants: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_primary: boolean | null
          mime_type: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_primary?: boolean | null
          mime_type?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_primary?: boolean | null
          mime_type?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          created_at: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resumes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          lemon_squeezy_id: string
          plan_name: string
          price: number
          status: string
          updated_at: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          lemon_squeezy_id: string
          plan_name: string
          price: number
          status: string
          updated_at?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          lemon_squeezy_id?: string
          plan_name?: string
          price?: number
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
