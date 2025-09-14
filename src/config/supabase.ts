// Supabase configuration management
// This file centralizes Supabase URL configuration for easy domain switching

// Current configuration - update these values when switching to custom domain
export const SUPABASE_CONFIG = {
  // Production URLs - switch these when custom domain is ready
  url: "https://gvftdfriujrkpptdueyb.supabase.co",
  publishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZnRkZnJpdWpya3BwdGR1ZXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDkzOTIsImV4cCI6MjA3MzAyNTM5Mn0.NrjUlE8YB-M7pspX0We2kikfYDTvngqezR6hPhFna0k",
  
  // Future custom domain configuration (uncomment when ready)
  // url: "https://api.jobvance.io",
  // publishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZnRkZnJpdWpya3BwdGR1ZXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NDkzOTIsImV4cCI6MjA3MzAyNTM5Mn0.NrjUlE8YB-M7pspX0We2kikfYDTvngqezR6hPhFna0k",
}

// Helper function to get the base domain for redirects
export const getAuthRedirectUrl = () => {
  const baseUrl = window.location.origin
  return `${baseUrl}/auth/callback`
}

/**
 * Instructions for switching to custom domain:
 * 
 * 1. Set up DNS CNAME record:
 *    - Name: api (or auth)
 *    - Value: gvftdfriujrkpptdueyb.supabase.co
 *    - This creates api.jobvance.io
 * 
 * 2. Configure in Supabase Dashboard:
 *    - Go to Project Settings → Custom Domain
 *    - Add api.jobvance.io
 *    - Wait for SSL provisioning
 * 
 * 3. Update this file:
 *    - Comment out current url
 *    - Uncomment custom domain url
 *    - Deploy changes
 * 
 * 4. Update Google OAuth:
 *    - Add api.jobvance.io to authorized domains
 *    - Update redirect URLs
 */