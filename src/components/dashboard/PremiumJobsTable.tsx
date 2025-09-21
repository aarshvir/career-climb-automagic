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
  Briefcase
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";

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
}

interface PremiumJobsTableProps {
  userPlan: string;
  searchQuery: string;
}

export const PremiumJobsTable = ({ userPlan, searchQuery }: PremiumJobsTableProps) => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user, searchQuery]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      // For now, we'll use mock data since job_matches table doesn't exist yet
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
        }
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

  const shouldBlurContent = userPlan === 'free' && jobs.length > 3;

  return (
    <Card className="border-border/50 backdrop-blur-sm bg-gradient-card overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-background/50 to-background/30">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Job Opportunities
            <Badge variant="secondary" className="ml-2">
              {jobs.length} matches
            </Badge>
          </CardTitle>
          
          {userPlan === 'free' && (
            <Button className="bg-gradient-primary hover:opacity-90" size="sm">
              <Zap className="h-3 w-3 mr-2" />
              Upgrade for more
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0 relative">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="w-[300px]">Position</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, userPlan === 'free' ? 3 : jobs.length).map((job, index) => (
                <TableRow 
                  key={job.id} 
                  className={`border-border/50 hover:bg-accent/30 transition-all duration-200 group ${
                    shouldBlurContent && index >= 2 ? 'blur-sm' : ''
                  }`}
                >
                  <TableCell className="py-4">
                    <div className="space-y-2">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        {job.job_title}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {job.job_type}
                        </Badge>
                        <Badge variant={job.application_status === 'applied' ? 'default' : 'secondary'} className="text-xs">
                          {job.application_status}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border border-border/50">
                        <AvatarImage src="" alt={job.company_name} />
                        <AvatarFallback className="text-xs bg-gradient-primary text-primary-foreground">
                          <Building2 className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{job.company_name}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {job.location}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-3 w-3 text-success" />
                      {formatSalary(job.salary_range)}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={job.ats_score} className="h-2 w-16" />
                      <Badge 
                        variant={getScoreBadgeVariant(job.ats_score)}
                        className={`text-xs font-mono ${getScoreColor(job.ats_score)}`}
                      >
                        {job.ats_score}%
                      </Badge>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(job.posted_date)}
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSaveJob(job.id)}
                        className="h-8 w-8 p-0 hover:bg-accent/50"
                      >
                        <Bookmark 
                          className={`h-3 w-3 ${
                            savedJobs.has(job.id) ? 'fill-primary text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-accent/50"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 w-8 p-0 hover:bg-accent/50"
                      >
                        <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Free plan upgrade overlay */}
        {shouldBlurContent && (
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent flex items-end justify-center pb-8">
            <div className="text-center space-y-4 max-w-md">
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Unlock More Opportunities</h3>
                <p className="text-sm text-muted-foreground">
                  Upgrade to see all {jobs.length} job matches and get unlimited access to premium features.
                </p>
              </div>
              <Button className="bg-gradient-primary hover:opacity-90 shadow-premium">
                <Zap className="h-4 w-4 mr-2" />
                Upgrade to Premium
              </Button>
            </div>
          </div>
        )}
        
        {/* Empty state */}
        {jobs.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <div>
              <h3 className="font-medium text-lg">No job matches found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery 
                  ? `No jobs found matching "${searchQuery}". Try adjusting your search terms.`
                  : "Start by setting up your job preferences to see personalized recommendations."
                }
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};