import React, { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { PremiumDashboardLayout } from "@/components/dashboard/PremiumDashboardLayout"
import { PremiumJobsTable } from "@/components/dashboard/PremiumJobsTable"
import { PremiumKPICards } from "@/components/dashboard/PremiumKPICards"
import { SearchAndFilters } from "@/components/dashboard/SearchAndFilters"
import { ExportButton } from "@/components/dashboard/ExportButton"
import { ResumeVariantManager } from "@/components/dashboard/ResumeVariantManager"
import { DailyJobFetchCard } from "@/components/dashboard/DailyJobFetchCard"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { useToast } from "@/hooks/use-toast"
import SEOHead from "@/components/SEOHead"

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
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalSearched: 0,
    totalApplied: 0,
    pendingReview: 0,
    customResumes: 0
  })
  const [timeRange, setTimeRange] = useState('7d')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const loadDashboardData = useCallback((userPlan: string) => {
    const key = userPlan?.toLowerCase() || "free"
    const planStats = planStatsByPlan[key] || planStatsByPlan.free

    setStats(planStats)
    setLoading(false)
  }, [])

  const checkUserProfile = useCallback(async () => {
    if (!user) {
      return
    }

    try {
      // First check if user has filled the interest form
      const { data: interestData, error: interestError } = await supabase
        .from('interest_forms')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle()

      if (interestError) {
        console.error('Error checking interest form:', interestError)
        // Continue to check profile even if there's an error
      }

      if (!interestData) {
        // User hasn't filled the interest form yet - let the form show
        setLoading(false)
        return
      }

      const [planSelectionResult, profileResult] = await Promise.all([
        supabase
          .from('plan_selections')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('plan, subscription_status')
          .eq('id', user.id)
          .maybeSingle(),
      ])

      const { data: planSelectionData, error: planSelectionError } = planSelectionResult
      const { data: profileData, error: profileError } = profileResult

      if (planSelectionError) {
        console.error('Error checking plan selection:', planSelectionError)
      }

      if (!planSelectionData) {
        // User hasn't completed plan selection yet
        setLoading(false)
        navigate('/plan-selection')
        return
      }

      if (profileError) {
        console.error('Error fetching profile:', profileError)
        toast({
          title: "Error",
          description: "Failed to load your profile. Please refresh the page.",
          variant: "destructive",
        })
        setLoading(false)
        navigate('/plan-selection')
        return
      }

      if (!profileData || !profileData.plan) {
        setLoading(false)
        navigate('/plan-selection')
        return
      }

      setProfile(profileData)
      loadDashboardData(profileData.plan)
    } catch (error) {
      console.error('Error checking profile:', error)
      toast({
        title: "Error",
        description: "Failed to load dashboard data. Please refresh the page.",
        variant: "destructive",
      })
      navigate('/plan-selection')
      setLoading(false)
    }
  }, [loadDashboardData, navigate, toast, user])

  useEffect(() => {
    if (user) {
      checkUserProfile()
    }
  }, [checkUserProfile, user])

  const handleFetchJobs = async (): Promise<number> => {
    // Simulate job fetching
    await new Promise(resolve => setTimeout(resolve, 2000));
    const foundJobs = Math.floor(Math.random() * 15) + 5; // 5-20 jobs
    
    // Update stats
    setStats(prev => ({
      ...prev,
      totalSearched: prev.totalSearched + foundJobs
    }));
    
    return foundJobs;
  }

  if (loading) {
    return (
      <>
        <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
        <PremiumDashboardLayout>
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

  return (
    <>
      <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
      <PremiumDashboardLayout>
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
                <ExportButton userPlan={profile?.plan || 'free'} />
              </div>
            </div>

            {/* Daily Job Fetch Card */}
            <DailyJobFetchCard 
              userPlan={profile?.plan || 'free'}
              onFetchJobs={handleFetchJobs}
            />

            {/* Premium KPI Cards */}
            <PremiumKPICards 
              stats={stats} 
              timeRange={timeRange} 
              onTimeRangeChange={setTimeRange}
              userPlan={profile?.plan || 'free'}
            />
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            <div className="xl:col-span-3 space-y-8">
              <SearchAndFilters 
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
              <PremiumJobsTable 
                userPlan={profile?.plan || 'free'}
                searchQuery={searchQuery}
              />
            </div>
            
            <div className="xl:col-span-1 space-y-6">
              <ResumeVariantManager userPlan={profile?.plan || 'free'} />
              <QuickActions userPlan={profile?.plan || 'free'} />
            </div>
          </div>
        </div>
      </PremiumDashboardLayout>
    </>
  )
}

export default Dashboard