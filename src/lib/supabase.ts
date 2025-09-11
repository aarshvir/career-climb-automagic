import { createClient } from '@supabase/supabase-js'

// Use placeholder values if env vars are not set to prevent app from breaking
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          subscription_plan: 'starter' | 'professional' | 'enterprise'
          subscription_status: 'active' | 'inactive' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_plan?: 'starter' | 'professional' | 'enterprise'
          subscription_status?: 'active' | 'inactive' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          subscription_plan?: 'starter' | 'professional' | 'enterprise'
          subscription_status?: 'active' | 'inactive' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
      }
      resumes: {
        Row: {
          id: string
          user_id: string
          title: string
          file_url: string
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          file_url: string
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          file_url?: string
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      job_preferences: {
        Row: {
          id: string
          user_id: string
          locations: string[]
          job_titles: string[]
          seniority_levels: string[]
          automation_time: string
          daily_job_limit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          locations: string[]
          job_titles: string[]
          seniority_levels: string[]
          automation_time: string
          daily_job_limit: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          locations?: string[]
          job_titles?: string[]
          seniority_levels?: string[]
          automation_time?: string
          daily_job_limit?: number
          created_at?: string
          updated_at?: string
        }
      }
      job_applications: {
        Row: {
          id: string
          user_id: string
          job_title: string
          company_name: string
          job_url: string
          resume_url: string
          application_status: 'pending' | 'applied' | 'callback' | 'rejected'
          match_score: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_title: string
          company_name: string
          job_url: string
          resume_url: string
          application_status?: 'pending' | 'applied' | 'callback' | 'rejected'
          match_score: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_title?: string
          company_name?: string
          job_url?: string
          resume_url?: string
          application_status?: 'pending' | 'applied' | 'callback' | 'rejected'
          match_score?: number
          created_at?: string
          updated_at?: string
        }
      }
      blog_posts: {
        Row: {
          id: string
          title: string
          slug: string
          excerpt: string
          content: string
          featured_image: string | null
          author: string
          published: boolean
          seo_title: string
          meta_description: string
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug: string
          excerpt: string
          content: string
          featured_image?: string | null
          author: string
          published?: boolean
          seo_title: string
          meta_description: string
          tags: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          excerpt?: string
          content?: string
          featured_image?: string | null
          author?: string
          published?: boolean
          seo_title?: string
          meta_description?: string
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}