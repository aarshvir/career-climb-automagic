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
      jobs: {
        Row: {
          apply_url: string | null
          company: string | null
          created_at: string | null
          id: string
          resume_variant_path: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          apply_url?: string | null
          company?: string | null
          created_at?: string | null
          id?: string
          resume_variant_path?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          apply_url?: string | null
          company?: string | null
          created_at?: string | null
          id?: string
          resume_variant_path?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      resumes: {
        Row: {
          created_at: string | null
          file_path: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          file_path: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          file_path?: string
          id?: string
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
