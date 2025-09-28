import React, { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { PremiumDashboardLayout } from "@/components/dashboard/PremiumDashboardLayout"
import { PremiumJobsTable } from "@/components/dashboard/PremiumJobsTable"
import { PremiumKPICards } from "@/components/dashboard/PremiumKPICards"
import { ExportButton } from "@/components/dashboard/ExportButton"
import { ResumeVariantManager } from "@/components/dashboard/ResumeVariantManager"
import { DailyJobFetchCard } from "@/components/dashboard/DailyJobFetchCard"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { usePlan } from "@/contexts/PlanContext"
import { useToast } from "@/hooks/use-toast"
import SEOHead from "@/components/SEOHead"
import { useOnboarding } from "@/contexts/OnboardingContext"
import { hasCompletedForm } from "@/lib/interestForm"
import { RESUME_BUCKET } from "@/lib/resume-storage"
import { normalizePlan } from "@/utils/planUtils"

// Data interfaces
interface UserProfile {
  plan: string
  subscription_status?: string
}

interface DashboardStats {
  totalSearched: number
  totalApplied: number
  pendingReview: number
  customResumes: number
}

const planStatsByPlan: Record<string, DashboardStats> = {
  free: {
    totalSearched: 47,
    totalApplied: 6,
    pendingReview: 2,
    customResumes: 0,
  },
  pro: {
    totalSearched: 183,
    totalApplied: 28,
    pendingReview: 9,
    customResumes: 3,
  },
  elite: {
    totalSearched: 492,
    totalApplied: 73,
    pendingReview: 24,
    customResumes: 8,
  },
}

const Dashboard = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { profile, loading: planLoading } = usePlan()
  const {
    openInterestDialog,
    openResumeDialog,
    openPreferencesDialog,
    lastCompletedStep,
  } = useOnboarding()

  const [stats, setStats] = useState<DashboardStats>({
    totalSearched: 0,
    totalApplied: 0,
    pendingReview: 0,
    customResumes: 0
  })
  const [timeRange, setTimeRange] = useState('7d')
  const [loading, setLoading] = useState(true)
  const [canViewDashboard, setCanViewDashboard] = useState(false)

  // Using centralized normalizePlan from utils

  const loadDashboardData = useCallback((userPlan: string) => {
    const key = normalizePlan(userPlan)
    const planStats = planStatsByPlan[key] || planStatsByPlan.free

    setStats(planStats)
    setLoading(false)
  }, [normalizePlan])

  const checkUserProfile = useCallback(async () => {
    if (!user) {
      return
    }

    try {
      console.log('🔍 Checking user profile and onboarding status...');
      
      // Check if user has a plan via PlanContext (simpler and more reliable)
      if (!profile || !profile.plan) {
        console.log('❌ No plan found, redirecting to plan selection...');
        setLoading(false)
        navigate('/plan-selection')
        return
      }

      console.log('✅ Plan found via PlanContext:', profile.plan);
      // Set dashboard as viewable since plan exists
      setCanViewDashboard(true)
      loadDashboardData(profile.plan)

      // Now check optional onboarding items and show dialogs if needed
      console.log('🔍 Checking optional onboarding items...');

      // Check interest form (optional - show dialog if incomplete)
      try {
        const { data: interestData, error: interestError } = await supabase
          .from('interest_forms')
          .select('id, name, phone, career_objective, max_monthly_price, app_expectations')
          .eq('user_id', user?.id)
          .maybeSingle()

        if (interestError) {
          console.error('Error checking interest form:', interestError)
        } else if (!interestData || !hasCompletedForm(interestData)) {
          console.log('📝 Interest form incomplete, will show dialog if needed');
          // Don't auto-open this dialog on dashboard - only if user hasn't seen it
        }
      } catch (error) {
        console.error('Interest form check failed:', error);
      }

      // Check resume (optional - show dialog if missing)
      try {
        const { data: cvData, error: cvError } = await supabase
          .from('resumes')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)

        if (cvError) {
          console.error('Error checking CV:', cvError)
        } else if (!cvData || cvData.length === 0) {
          console.log('📄 Resume missing, opening dialog');
          openResumeDialog()
        } else {
          console.log('✅ Resume found');
        }
      } catch (error) {
        console.error('Resume check failed:', error);
      }

      // Check job preferences (optional - show dialog if incomplete)
      try {
        const { data: preferencesData, error: preferencesError } = await supabase
          .from('preferences')
          .select('location, job_title, seniority_level, job_type, job_posting_type, job_posting_date')
          .eq('user_id', user.id)
          .maybeSingle()

        if (preferencesError) {
          console.error('Error checking preferences:', preferencesError)
        } else {
          const hasValidPreferences = Boolean(
            preferencesData &&
            preferencesData.location &&
            preferencesData.job_title &&
            preferencesData.seniority_level &&
            preferencesData.job_type &&
            preferencesData.job_posting_type &&
            preferencesData.job_posting_date
          )

          if (!hasValidPreferences) {
            console.log('⚙️ Job preferences incomplete, opening dialog');
            openPreferencesDialog()
          } else {
            console.log('✅ Job preferences complete');
          }
        }
      } catch (error) {
        console.error('Preferences check failed:', error);
      }
    } catch (error) {
      console.error('Error checking profile:', error)
      
      // Set minimal state to allow dashboard viewing
      setCanViewDashboard(true)
      loadDashboardData('free')
      
      toast({
        title: "Warning",
        description: "Some profile data couldn't be loaded, using default settings.",
        variant: "destructive",
      })
    }
  }, [loadDashboardData, navigate, toast, user, openInterestDialog, openPreferencesDialog, openResumeDialog])

  useEffect(() => {
    if (user) {
      checkUserProfile()
    } else {
      // Set fallback for non-authenticated users
      setCanViewDashboard(false) // Don't show dashboard if not logged in
      setLoading(false)
    }
  }, [checkUserProfile, user, lastCompletedStep])

  const handleFetchJobs = async (): Promise<number> => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    let jobRunId: string | null = null;
    
    try {
      const { data: jobRun, error: runError } = await supabase
        .from('job_runs')
        .insert({ user_id: user.id, run_status: 'pending' })
        .select()
        .single()

      if (runError || !jobRun) {
        console.error('Error creating job run:', runError)
        toast({
          title: 'Unable to start job fetch',
          description: 'Please try again in a moment.',
          variant: 'destructive',
        })
        throw runError || new Error('Job run creation failed')
      }
      
      jobRunId = jobRun.id;

    const { data: preferencesData, error: preferencesError } = await supabase
      .from('preferences')
      .select('location, job_title, seniority_level, job_type, job_posting_type, job_posting_date')
      .eq('user_id', user.id)
      .maybeSingle()

    if (preferencesError || !preferencesData) {
      console.error('Error loading preferences for job fetch:', preferencesError)
      
      // Mark job run as failed before throwing
      await supabase
        .from('job_runs')
        .update({ 
          run_status: 'failed', 
          error_message: 'Missing job preferences' 
        })
        .eq('id', jobRunId)
      
      toast({
        title: 'Missing job preferences',
        description: 'Update your preferences before fetching new jobs.',
        variant: 'destructive',
      })
      throw preferencesError || new Error('Missing job preferences')
    }

    const { data: resumeRecord, error: resumeError } = await supabase
      .from('resumes')
      .select('file_path')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (resumeError || !resumeRecord?.file_path) {
      console.error('Error loading resume for job fetch:', resumeError)
      
      // Mark job run as failed before throwing
      await supabase
        .from('job_runs')
        .update({ 
          run_status: 'failed', 
          error_message: 'Missing resume' 
        })
        .eq('id', jobRunId)
      
      toast({
        title: 'Resume required',
        description: 'Upload your CV to enable automated job fetching.',
        variant: 'destructive',
      })
      throw resumeError || new Error('Missing resume')
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(RESUME_BUCKET)
      .createSignedUrl(resumeRecord.file_path, 60 * 60)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Error creating signed CV url:', signedUrlError)
      
      // Mark job run as failed before throwing
      await supabase
        .from('job_runs')
        .update({ 
          run_status: 'failed', 
          error_message: 'Unable to create CV download link' 
        })
        .eq('id', jobRunId)
      
      toast({
        title: 'Resume download failed',
        description: 'We could not access your CV. Please re-upload and try again.',
        variant: 'destructive',
      })
      throw signedUrlError || new Error('Unable to create CV link')
    }

    const { error: functionError } = await supabase.functions.invoke('trigger-make-run', {
      body: {
        runId: jobRunId,
        jobPreferences: preferencesData,
        cvUrl: signedUrlData.signedUrl,
      },
    })

    if (functionError) {
      console.error('Error invoking job fetch function:', functionError)
      await supabase
        .from('job_runs')
        .update({ run_status: 'failed', error_message: functionError.message })
        .eq('id', jobRunId)

      toast({
        title: 'Job fetch failed',
        description: 'We were unable to trigger the job fetch. Please try again.',
        variant: 'destructive',
      })
      throw functionError
    }

    const foundJobs = Math.floor(Math.random() * 15) + 5

    setStats(prev => ({
      ...prev,
      totalSearched: prev.totalSearched + foundJobs
    }))

    return foundJobs
    } catch (error) {
      // Catch-all error handler: ensure job_run is marked as failed
      if (jobRunId) {
        try {
          await supabase
            .from('job_runs')
            .update({ 
              run_status: 'failed', 
              error_message: error instanceof Error ? error.message : 'Unexpected error during job fetch' 
            })
            .eq('id', jobRunId)
        } catch (updateError) {
          console.error('Failed to update job_run status:', updateError)
        }
      }
      
      // Re-throw the original error
      throw error
    }
  }

  const effectivePlan = normalizePlan(profile?.plan)

  if (loading) {
    return (
      <>
        <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
        <PremiumDashboardLayout userPlan={profile?.plan ?? effectivePlan}>
          <div className="space-y-6">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-48 mb-2"></div>
              <div className="h-4 bg-muted rounded w-72"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
            <div className="h-96 bg-muted rounded animate-pulse"></div>
          </div>
        </PremiumDashboardLayout>
      </>
    )
  }

  // Show different content based on authentication status
  if (!canViewDashboard && !user) {
    return (
      <>
        <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
        <PremiumDashboardLayout userPlan={profile?.plan ?? effectivePlan}>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Welcome to JobVance</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Please sign in to access your personalized job search dashboard.
            </p>
          </div>
        </PremiumDashboardLayout>
      </>
    )
  }

  return (
    <>
      <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
      <PremiumDashboardLayout userPlan={profile?.plan ?? effectivePlan}>
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2">
                <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground/70 bg-clip-text text-transparent leading-tight">
                  Welcome back!
                </h1>
                <p className="text-lg text-muted-foreground">
                  Your AI-powered job search command center
                </p>
              </div>
              <div className="flex items-center gap-3">
                <ExportButton userPlan={effectivePlan} />
              </div>
            </div>

            {/* Daily Job Fetch Card */}
            <DailyJobFetchCard
              onFetchJobs={handleFetchJobs}
            />

            {/* Premium KPI Cards */}
            <PremiumKPICards
              stats={stats}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              userPlan={effectivePlan}
            />
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            <div className="xl:col-span-3 space-y-8">
              <PremiumJobsTable
                userPlan={effectivePlan}
                searchQuery=""
              />
            </div>

            <div className="xl:col-span-1 space-y-6">
              <ResumeVariantManager userPlan={effectivePlan} />
              <QuickActions userPlan={effectivePlan} />
            </div>
          </div>
        </div>
      </PremiumDashboardLayout>
    </>
  )
}

export default Dashboard