import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, Settings, BarChart3, Briefcase, Calendar, Download } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import SEOHead from '@/components/SEOHead'
import InterestFormDialog from '@/components/InterestFormDialog'

interface JobApplication {
  id: string
  job_title: string
  company_name: string
  job_url: string
  resume_url: string
  application_status: 'pending' | 'applied' | 'callback' | 'rejected'
  match_score: number
  created_at: string
}

interface UserProfile {
  subscription_plan: 'starter' | 'professional' | 'enterprise'
  subscription_status: 'active' | 'inactive' | 'cancelled'
}

const Dashboard = () => {
  const { user, signOut } = useAuth()
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInterestForm, setShowInterestForm] = useState(false)

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    try {
      // Note: Using placeholder data since tables may not exist yet
      // In a real app, these would be actual database queries
      
      setProfile({
        subscription_plan: 'starter',
        subscription_status: 'active'
      })
      
      // Placeholder applications data
      setApplications([])
      
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    totalApplications: applications.length,
    pendingApplications: applications.filter(app => app.application_status === 'pending').length,
    callbacks: applications.filter(app => app.application_status === 'callback').length,
    averageMatchScore: applications.length > 0 
      ? Math.round(applications.reduce((sum, app) => sum + app.match_score, 0) / applications.length)
      : 0
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500'
      case 'applied': return 'bg-blue-500'
      case 'callback': return 'bg-green-500'
      case 'rejected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'starter': return 'bg-blue-500'
      case 'professional': return 'bg-purple-500'
      case 'enterprise': return 'bg-gold-500'
      default: return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <>
      <SEOHead 
        title="Dashboard - JobVance AI Job Application Automation"
        description="Manage your AI-powered job applications, track interview callbacks, and monitor your job search progress with JobVance dashboard."
        keywords="job application dashboard, AI job search tracking, interview callbacks, job automation analytics"
        canonical="https://jobvance.io/dashboard"
        noindex={true}
      />
      <div className="min-h-screen bg-background">
        <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Welcome back, {user?.user_metadata?.full_name || user?.email}
              </h1>
              <p className="text-muted-foreground">
                Manage your job applications and track your progress
              </p>
            </div>
            <div className="flex gap-2">
              <Badge className={`${getPlanColor(profile?.subscription_plan || 'starter')} text-white`}>
                {profile?.subscription_plan?.toUpperCase() || 'STARTER'} PLAN
              </Badge>
              <Badge variant={profile?.subscription_status === 'active' ? 'default' : 'secondary'}>
                {profile?.subscription_status?.toUpperCase() || 'INACTIVE'}
              </Badge>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalApplications}</div>
                <p className="text-xs text-muted-foreground">This month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingApplications}</div>
                <p className="text-xs text-muted-foreground">Awaiting application</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Callbacks</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.callbacks}</div>
                <p className="text-xs text-muted-foreground">Interview requests</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Match Score</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.averageMatchScore}%</div>
                <p className="text-xs text-muted-foreground">Average match</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="applications" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="resumes">Resumes</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Job Applications</CardTitle>
                <CardDescription>
                  Your latest job applications and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {applications.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No applications yet</p>
                    <Button onClick={() => setShowInterestForm(true)}>Start Job Automation</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {applications.map((app) => (
                      <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-semibold">{app.job_title}</h3>
                          <p className="text-sm text-muted-foreground">{app.company_name}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={`${getStatusColor(app.application_status)} text-white`}>
                              {app.application_status.toUpperCase()}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Match: {app.match_score}%
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={app.job_url} target="_blank" rel="noopener noreferrer">
                              View Job
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={app.resume_url} download>
                              <Download className="w-4 h-4 mr-1" />
                              Resume
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resumes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resume Management</CardTitle>
                <CardDescription>
                  Upload and manage your resumes for different job applications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Upload Resume</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag and drop your resume or click to browse
                  </p>
                  <Button>Choose File</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Job Preferences</CardTitle>
                <CardDescription>
                  Configure your job search preferences and automation settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Preferred Locations</label>
                    <p className="text-sm text-muted-foreground">
                      Set up your preferred job locations in the settings
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Job Titles</label>
                    <p className="text-sm text-muted-foreground">
                      Configure the job titles you're interested in
                    </p>
                  </div>
                  <Button>
                    <Settings className="w-4 h-4 mr-2" />
                    Configure Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account and subscription
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Profile Information</h3>
                  <p className="text-sm text-muted-foreground">Email: {user?.email}</p>
                  <p className="text-sm text-muted-foreground">
                    Member since: {new Date(user?.created_at || '').toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Subscription</h3>
                  <p className="text-sm text-muted-foreground">
                    Current plan: {profile?.subscription_plan?.toUpperCase() || 'STARTER'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Status: {profile?.subscription_status?.toUpperCase() || 'INACTIVE'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowInterestForm(true)}>Upgrade Plan</Button>
                  <Button variant="destructive" onClick={signOut}>
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
        <Footer />
      </div>
      
      <InterestFormDialog 
        open={showInterestForm} 
        onOpenChange={setShowInterestForm} 
      />
    </>
  )
}

export default Dashboard