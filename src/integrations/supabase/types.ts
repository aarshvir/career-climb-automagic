export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      interest_forms: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          name: string | null;
          phone: string | null;
          career_objective: string | null;
          max_monthly_price: number | null;
          app_expectations: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          name?: string | null;
          phone?: string | null;
          career_objective?: string | null;
          max_monthly_price?: number | null;
          app_expectations?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          name?: string | null;
          phone?: string | null;
          career_objective?: string | null;
          max_monthly_price?: number | null;
          app_expectations?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          plan: string | null;
          subscription_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          plan?: string | null;
          subscription_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan?: string | null;
          subscription_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      resumes: {
        Row: {
          id: string;
          user_id: string;
          file_path: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_path: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_path?: string;
          original_filename?: string;
          file_size?: number;
          mime_type?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      plan_selections: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          name: string;
          geo_id: string;
          country: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          geo_id: string;
          country?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          geo_id?: string;
          country?: string | null;
        };
      };
      preferences: {
        Row: {
          id: string;
          user_id: string;
          location: string | null;
          job_title: string | null;
          seniority_level: string | null;
          job_type: string | null;
          job_posting_type: string | null;
          job_posting_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          location?: string | null;
          job_title?: string | null;
          seniority_level?: string | null;
          job_type?: string | null;
          job_posting_type?: string | null;
          job_posting_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          location?: string | null;
          job_title?: string | null;
          seniority_level?: string | null;
          job_type?: string | null;
          job_posting_type?: string | null;
          job_posting_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      job_runs: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          apify_search_url: string | null;
          resume_links: Json | null;
          run_status: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          apify_search_url?: string | null;
          resume_links?: Json | null;
          run_status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          apify_search_url?: string | null;
          resume_links?: Json | null;
          run_status?: string;
        };
      };
          jobs: {
            Row: {
              id: string;
              job_run_id: string | null;
              user_id: string | null;
              created_at: string;
              title: string | null;
              company_name: string | null;
              location: string | null;
              description: string | null;
              linkedin_url: string | null;
              posted_at_text: string | null;
              match_score: number | null;
              recommended_resume_url: string | null;
              generated_resume_json: Json | null;
              status: string;
            };
            Insert: {
              id?: string;
              job_run_id?: string | null;
              user_id?: string | null;
              created_at?: string;
              title?: string | null;
              company_name?: string | null;
              location?: string | null;
              description?: string | null;
              linkedin_url?: string | null;
              posted_at_text?: string | null;
              match_score?: number | null;
              recommended_resume_url?: string | null;
              generated_resume_json?: Json | null;
              status?: string;
            };
            Update: {
              id?: string;
              job_run_id?: string | null;
              user_id?: string | null;
              created_at?: string;
              title?: string | null;
              company_name?: string | null;
              location?: string | null;
              description?: string | null;
              linkedin_url?: string | null;
              posted_at_text?: string | null;
              match_score?: number | null;
              recommended_resume_url?: string | null;
              generated_resume_json?: Json | null;
              status?: string;
            };
          };
          daily_usage: {
            Row: {
              id: string;
              user_id: string;
              fetch_date: string;
              fetch_count: number;
              created_at: string;
              updated_at: string;
            };
            Insert: {
              id?: string;
              user_id: string;
              fetch_date?: string;
              fetch_count?: number;
              created_at?: string;
              updated_at?: string;
            };
            Update: {
              id?: string;
              user_id?: string;
              fetch_date?: string;
              fetch_count?: number;
              created_at?: string;
              updated_at?: string;
            };
          };
    };
    Views: {
      [_ in never]: never
    };
    Functions: {
      [_ in never]: never
    };
    Enums: {
      [_ in never]: never
    };
    CompositeTypes: {
      [_ in never]: never
    };
  };
};

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
