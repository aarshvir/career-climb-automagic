import React, { useState, useEffect } from "react"
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

  useEffect(() => {
    if (user) {
      checkUserProfile()
    }
  }, [user])

  const checkUserProfile = async () => {
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

      // Check if user has completed plan selection
      const { data: planSelectionData, error: planSelectionError } = await supabase
        .from('plan_selections')
        .select('id, status')
        .eq('user_id', user?.id)
        .eq('status', 'completed')
        .maybeSingle()

      if (planSelectionError) {
        console.error('Error checking plan selection:', planSelectionError)
        // Continue to check profile for backward compatibility
      }

      if (!planSelectionData) {
        // User hasn't completed plan selection yet
        navigate('/plan-selection')
        return
      }

      // Optional: Also check profiles for backward compatibility
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user?.id)
        .maybeSingle()

      if (error) {
        console.error('Error fetching profile:', error)
        // If no profile or no plan, redirect to plan selection
        navigate('/plan-selection')
        return
      }

      if (!data || !data.plan) {
        navigate('/plan-selection')
        return
      }

      setProfile(data)
      await loadDashboardData(data.plan)
    } catch (error) {
      console.error('Error checking profile:', error)
      navigate('/plan-selection')
    }
  }

  const loadDashboardData = async (userPlan: string) => {
    try {
      // Load stats based on plan with more realistic data
      const mockStats = {
        totalSearched: userPlan === 'free' ? 47 : userPlan === 'pro' ? 183 : 492,
        totalApplied: userPlan === 'free' ? 6 : userPlan === 'pro' ? 28 : 73,
        pendingReview: userPlan === 'free' ? 2 : userPlan === 'pro' ? 9 : 24,
        customResumes: userPlan === 'free' ? 0 : userPlan === 'pro' ? 3 : 8
      }
      setStats(mockStats)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
      toast({
        title: "Error",
        description: "Failed to load dashboard data. Please refresh the page.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

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