import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { DashboardLayout } from "@/components/dashboard/DashboardLayout"
import { JobsTable } from "@/components/dashboard/JobsTable"
import { KPICards } from "@/components/dashboard/KPICards"
import { SearchAndFilters } from "@/components/dashboard/SearchAndFilters"
import { ExportButton } from "@/components/dashboard/ExportButton"
import { useToast } from "@/hooks/use-toast"
import SEOHead from "@/components/SEOHead"

// Data interfaces
interface JobMatch {
  id: string
  company: string
  sector: string
  jobTitle: string
  jdSnippet: string
  atsScore: number
  cvUrl?: string
  jobUrl: string
  appliedStatus?: 'applied' | 'pending' | 'reviewing'
}

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
  const [jobMatches, setJobMatches] = useState<JobMatch[]>([])
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
      // Load stats based on plan
      const mockStats = {
        totalSearched: userPlan === 'free' ? 50 : userPlan === 'pro' ? 200 : 500,
        totalApplied: userPlan === 'free' ? 8 : userPlan === 'pro' ? 35 : 85,
        pendingReview: userPlan === 'free' ? 3 : userPlan === 'pro' ? 12 : 28,
        customResumes: userPlan === 'free' ? 0 : userPlan === 'pro' ? 5 : 15
      }
      setStats(mockStats)

      // Load job matches with plan-based gating
      const allMatches: JobMatch[] = [
        {
          id: '1',
          company: 'TechCorp',
          sector: 'Technology',
          jobTitle: 'Senior Frontend Developer',
          jdSnippet: 'We are looking for an experienced Frontend Developer...',
          atsScore: 92,
          jobUrl: '#',
          cvUrl: '#'
        },
        {
          id: '2',
          company: 'StartupXYZ', 
          sector: 'Fintech',
          jobTitle: 'React Developer',
          jdSnippet: 'Join our growing team as a React Developer...',
          atsScore: 88,
          jobUrl: '#'
        },
        {
          id: '3',
          company: 'BigTech Solutions',
          sector: 'Technology',
          jobTitle: 'Full Stack Engineer',
          jdSnippet: 'Looking for a versatile Full Stack Engineer...',
          atsScore: 85,
          jobUrl: '#',
          appliedStatus: 'applied'
        },
        {
          id: '4',
          company: 'InnovateNow',
          sector: 'Healthcare',
          jobTitle: 'JavaScript Developer',
          jdSnippet: 'We need a skilled JavaScript Developer...',
          atsScore: 82,
          jobUrl: '#'
        },
        {
          id: '5',
          company: 'WebFlow Systems',
          sector: 'E-commerce',
          jobTitle: 'Frontend Engineer',
          jdSnippet: 'Frontend Engineer position available...',
          atsScore: 78,
          jobUrl: '#',
          appliedStatus: 'pending'
        }
      ]

      // Add more placeholder jobs to demonstrate gating
      for (let i = 6; i <= 20; i++) {
        allMatches.push({
          id: i.toString(),
          company: `Company ${i}`,
          sector: 'Various',
          jobTitle: `Developer Role ${i}`,
          jdSnippet: `Job description for position ${i}...`,
          atsScore: Math.floor(Math.random() * 40) + 60,
          jobUrl: '#'
        })
      }

      setJobMatches(allMatches)
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

  if (loading) {
    return (
      <>
        <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
        <DashboardLayout>
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
        </DashboardLayout>
      </>
    )
  }

  return (
    <>
      <SEOHead title="Dashboard - JobVance" description="Manage your job search from your personalized dashboard" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back! Here's your job search overview</p>
            </div>
            <ExportButton userPlan={profile?.plan || 'free'} />
          </div>

          {/* KPI Cards */}
          <KPICards 
            stats={stats} 
            timeRange={timeRange} 
            onTimeRangeChange={setTimeRange}
            userPlan={profile?.plan || 'free'}
          />

          {/* Search and Filters */}
          <SearchAndFilters 
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {/* Jobs Table */}
          <JobsTable 
            jobs={jobMatches}
            userPlan={profile?.plan || 'free'}
            searchQuery={searchQuery}
          />
        </div>
      </DashboardLayout>
    </>
  )
}

export default Dashboard