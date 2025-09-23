import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  MapPin, 
  Clock, 
  ExternalLink, 
  Eye, 
  Bookmark,
  Zap,
  Building2,
  DollarSign,
  Briefcase,
  FileText,
  Star,
  Lock,
  Filter,
  MoreHorizontal
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { JobDetailsDrawer } from "./JobDetailsDrawer";
import { cn } from "@/lib/utils";

interface JobMatch {
  id: string;
  job_title: string;
  company_name: string;
  location: string;
  salary_range: string;
  posted_date: string;
  ats_score: number;
  job_url: string;
  application_status: string;
  job_type: string;
  resume_match_score?: number;
  compatibility_score?: number;
  scraped_date?: string;
}

interface PremiumJobsTableProps {
  userPlan: string;
  searchQuery: string;
}

export const PremiumJobsTable = ({ userPlan, searchQuery }: PremiumJobsTableProps) => {
  const { user } = useAuth();
  const planLimits = usePlanLimits(userPlan);
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<JobMatch | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user, searchQuery]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      // Enhanced mock data with more realistic job postings
      const mockJobs: JobMatch[] = [
        {
          id: '1',
          job_title: 'Senior Software Engineer',
          company_name: 'TechCorp',
          location: 'San Francisco, CA',
          salary_range: '$120,000 - $180,000',
          posted_date: new Date().toISOString(),
          ats_score: 85,
          job_url: 'https://example.com',
          application_status: 'not_applied',
          job_type: 'Full-time'
        },
        {
          id: '2',
          job_title: 'Product Manager',
          company_name: 'StartupXYZ',
          location: 'Remote',
          salary_range: '$100,000 - $150,000',
          posted_date: new Date(Date.now() - 86400000).toISOString(),
          ats_score: 72,
          job_url: 'https://example.com',
          application_status: 'applied',
          job_type: 'Full-time'
        },
        {
          id: '3',
          job_title: 'Frontend Developer',
          company_name: 'DesignStudio',
          location: 'New York, NY',
          salary_range: '$90,000 - $130,000',
          posted_date: new Date(Date.now() - 172800000).toISOString(),
          ats_score: 91,
          job_url: 'https://example.com',
          application_status: 'not_applied',
          job_type: 'Contract'
        },
        {
          id: '4',
          job_title: 'DevOps Engineer',
          company_name: 'CloudFirst',
          location: 'Austin, TX',
          salary_range: '$110,000 - $160,000',
          posted_date: new Date(Date.now() - 259200000).toISOString(),
          ats_score: 78,
          job_url: 'https://example.com',
          application_status: 'not_applied',
          job_type: 'Full-time'
        },
        {
          id: '5',
          job_title: 'Full Stack Developer',
          company_name: 'InnovateLab',
          location: 'Remote',
          salary_range: '$95,000 - $140,000',
          posted_date: new Date(Date.now() - 345600000).toISOString(),
          ats_score: 88,
          job_url: 'https://example.com',
          application_status: 'not_applied',
          job_type: 'Full-time'
        },
        // Add more jobs for testing plan limits
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `${i + 6}`,
          job_title: `Software Engineer ${i + 1}`,
          company_name: `Company ${i + 1}`,
          location: i % 2 === 0 ? 'Remote' : 'New York, NY',
          salary_range: `$${80 + i * 5},000 - $${120 + i * 8},000`,
          posted_date: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
          ats_score: 60 + Math.floor(Math.random() * 40),
          job_url: 'https://example.com',
          application_status: 'not_applied',
          job_type: 'Full-time'
        }))
      ];

      // Filter by search query if provided
      let filteredJobs = mockJobs;
      if (searchQuery) {
        filteredJobs = mockJobs.filter(job => 
          job.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.company_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setJobs(filteredJobs);
    } catch (error) {
      console.error('Error:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-accent";
    return "text-muted-foreground";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const toggleSaveJob = (jobId: string) => {
    setSavedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const formatSalary = (salary: string) => {
    if (!salary || salary === 'Not specified') return '—';
    return salary;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  if (loading) {
    return (
      <Card className="border-border/50 backdrop-blur-sm bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-4 rounded-lg border border-border/50">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Plan-aware row visibility
  const visibleRows = planLimits.resumeVariants === 1 ? 2 : (planLimits.resumeVariants === 3 ? 20 : 50);
  const shouldShowMaskedRows = jobs.length > visibleRows;

  const handleRowClick = (job: JobMatch) => {
    setSelectedJob(job);
    setDrawerOpen(true);
  };

  const handleSaveJob = (jobId: string) => {
    toggleSaveJob(jobId);
  };

  return (
    <>
      <Card className="premium-card border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-background/50 to-background/30 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-primary shadow-lg shadow-primary/20">
                <Briefcase className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-foreground">
                  Job Opportunities
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {jobs.length} matches found • {visibleRows} visible on {userPlan} plan
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="hover-lift">
                <Filter className="h-3 w-3 mr-2" />
                Filters
              </Button>
              {userPlan === 'free' && (
                <Button className="bg-gradient-primary hover:opacity-90 hover-lift" size="sm">
                  <Zap className="h-3 w-3 mr-2" />
                  Upgrade
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      
        <CardContent className="p-0 relative">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[300px] font-semibold">Position</TableHead>
                  <TableHead className="font-semibold">Company</TableHead>
                  <TableHead className="font-semibold">Location</TableHead>
                  <TableHead className="font-semibold">Salary</TableHead>
                  <TableHead className="font-semibold">Match Score</TableHead>
                  <TableHead className="font-semibold">JD Preview</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job, index) => {
                  const isVisible = index < visibleRows;
                  const isPaidFeature = !isVisible && userPlan === 'free';
                  
                  return (
                    <TableRow 
                      key={job.id} 
                      className={cn(
                        "border-border/50 transition-all duration-200 group cursor-pointer",
                        isVisible && "hover:bg-accent/30",
                        !isVisible && "opacity-40 hover:opacity-60",
                        isPaidFeature && "bg-muted/20"
                      )}
                      onClick={() => isVisible && handleRowClick(job)}
                    >
                      <TableCell className="py-4">
                        <div className="space-y-2">
                          <div className={cn(
                            "font-medium text-sm transition-colors line-clamp-2",
                            isVisible && "group-hover:text-primary",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.job_title : '████████████████'}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {isVisible ? job.job_type : '████'}
                            </Badge>
                            <Badge 
                              variant={job.application_status === 'applied' ? 'default' : 'secondary'} 
                              className="text-xs"
                            >
                              {isVisible ? (job.application_status === 'applied' ? 'Applied' : 'Not Applied') : '██████'}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                  
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-border/50">
                            <AvatarImage src="" alt={isVisible ? job.company_name : ''} />
                            <AvatarFallback className="text-xs bg-gradient-primary text-primary-foreground">
                              <Building2 className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "font-medium text-sm truncate max-w-[120px]",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.company_name : '████████'}
                          </span>
                        </div>
                      </TableCell>
                  
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className={cn(
                            "truncate max-w-[100px]",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.location : '████████'}
                          </span>
                        </div>
                      </TableCell>
                  
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="h-3 w-3 text-success flex-shrink-0" />
                          <span className={cn(
                            "truncate max-w-[120px]",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? formatSalary(job.salary_range) : '████████'}
                          </span>
                        </div>
                      </TableCell>
                  
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={isVisible ? job.ats_score : 0} 
                            className={cn("h-2 w-16", !isVisible && "opacity-30")} 
                          />
                          <Badge 
                            variant={getScoreBadgeVariant(job.ats_score)}
                            className={cn(
                              `text-xs font-mono ${getScoreColor(job.ats_score)}`,
                              !isVisible && "blur-sm"
                            )}
                          >
                            {isVisible ? `${job.ats_score}%` : '██%'}
                          </Badge>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className={cn(
                          "text-xs text-muted-foreground line-clamp-2 max-w-[150px]",
                          !isVisible && "blur-sm select-none"
                        )}>
                          {isVisible ? "Seeking talented individual for challenging role in dynamic environment..." : "████████████████████"}
                          {isVisible && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-auto p-0 text-primary hover:text-primary/80 text-xs font-medium mt-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(job);
                              }}
                            >
                              View Full JD
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant={job.application_status === 'applied' ? 'default' : 'secondary'}
                          className={cn(
                            "text-xs",
                            job.application_status === 'applied' && "bg-success/10 text-success border-success/20",
                            !isVisible && "blur-sm"
                          )}
                        >
                          {isVisible ? (job.application_status === 'applied' ? 'Applied' : 'Not Applied') : '██████'}
                        </Badge>
                      </TableCell>
                  
                  
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {isVisible ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSaveJob(job.id);
                                }}
                                className="h-8 w-8 p-0 hover:bg-accent/50 hover-lift"
                                title={savedJobs.has(job.id) ? "Remove from saved" : "Save job"}
                              >
                                <Bookmark 
                                  className={cn(
                                    "h-3 w-3 transition-colors",
                                    savedJobs.has(job.id) ? 'fill-primary text-primary' : 'text-muted-foreground'
                                  )}
                                />
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowClick(job);
                                }}
                                className="h-8 w-8 p-0 hover:bg-accent/50 hover-lift"
                                title="View job details"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              
                              {userPlan !== 'free' ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-8 w-8 p-0 hover:bg-accent/50 hover-lift"
                                  title="Optimize ATS"
                                >
                                  <Zap className="h-3 w-3 text-primary" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-50 cursor-not-allowed"
                                  title="Upgrade to access ATS optimization"
                                >
                                  <Lock className="h-3 w-3" />
                                </Button>
                              )}
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-8 w-8 p-0 hover:bg-accent/50 hover-lift"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={job.job_url} target="_blank" rel="noopener noreferrer" title="Open job posting">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </>
                          ) : (
                            <Button 
                              size="sm" 
                              className="bg-gradient-primary hover:opacity-90 hover-lift"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle upgrade action
                              }}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Upgrade
                            </Button>
                          )}
                        </div>
                      </TableCell>
                </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
          
          {/* Plan upgrade section for hidden rows */}
          {shouldShowMaskedRows && (
            <div className="border-t border-border/50 bg-gradient-to-r from-primary/5 to-accent/5 p-6">
              <div className="text-center space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">
                    {jobs.length - visibleRows} More Jobs Available
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Upgrade to {userPlan === 'free' ? 'Pro' : 'Elite'} to see all job matches and unlock premium features like ATS optimization and CV generation.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-xs text-muted-foreground">
                    Current: <span className="font-medium">{visibleRows} jobs</span>
                  </div>
                  <div className="text-xs text-success">
                    {userPlan === 'free' ? 'Pro: 20 jobs' : 'Elite: 50 jobs'}
                  </div>
                </div>
                <Button className="bg-gradient-primary hover:opacity-90 shadow-lg shadow-primary/20 hover-lift">
                  <Zap className="h-4 w-4 mr-2" />
                  Upgrade to {userPlan === 'free' ? 'Pro' : 'Elite'}
                </Button>
              </div>
            </div>
          )}
        
          {/* Empty state */}
          {jobs.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg text-foreground">No job matches found</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {searchQuery 
                    ? `No jobs found matching "${searchQuery}". Try adjusting your search terms or using our AI-powered search.`
                    : "Start by setting up your job preferences to see personalized recommendations powered by AI."
                  }
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" className="hover-lift">
                  <Star className="h-4 w-4 mr-2" />
                  Set Preferences
                </Button>
                <Button className="bg-gradient-primary hover:opacity-90 hover-lift">
                  <Zap className="h-4 w-4 mr-2" />
                  AI Job Search
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <JobDetailsDrawer
        job={selectedJob}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userPlan={userPlan}
        onSaveJob={handleSaveJob}
        isSaved={selectedJob ? savedJobs.has(selectedJob.id) : false}
      />
    </>
  );
};