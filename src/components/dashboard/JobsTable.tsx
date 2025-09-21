import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink, Eye, FileText, Mail, Download, Crown } from 'lucide-react';
import { JobDetailsDrawer } from './JobDetailsDrawer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { useToast } from '@/hooks/use-toast';

// Updated interface to match new database schema
interface JobMatch {
  id: string;
  job_title: string;
  company_name: string;
  job_description?: string;
  salary_range?: string;
  location?: string;
  job_url?: string;
  resume_match_score: number;
  ats_score: number;
  compatibility_score: number;
  optimized_resume_url?: string;
  cover_letter_url?: string;
  email_draft_url?: string;
  application_status: string;
  scraped_date: string;
}

interface JobsTableProps {
  userPlan: string;
  searchQuery: string;
}

export function JobsTable({ userPlan, searchQuery }: JobsTableProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const planLimits = usePlanLimits(userPlan);
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobMatch | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user]);

  const fetchJobs = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('job_applications')
        .select(`
          *,
          daily_job_batches!inner(
            batch_date,
            status
          )
        `)
        .eq('user_id', user.id)
        .order('resume_match_score', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch job applications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs based on search query
  const filteredJobs = jobs.filter(job =>
    job.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.job_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.job_description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVisibleJobs = () => {
    return filteredJobs.slice(0, planLimits.dailyJobApplications);
  };

  const getGatedJobs = () => {
    return filteredJobs.slice(planLimits.dailyJobApplications);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const downloadDocument = async (url: string, filename: string) => {
    try {
      // In a real implementation, you'd download from Supabase storage
      // For now, we'll just show a toast
      toast({
        title: "Download Started",
        description: `Downloading ${filename}...`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download document",
        variant: "destructive",
      });
    }
  };

  const openJobDetails = (job: JobMatch) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded mb-2"></div>
          ))}
        </div>
      </div>
    );
  }

  if (filteredJobs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No job matches found. Try adjusting your search or fetch new jobs.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Match Score</TableHead>
              <TableHead>ATS Score</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {getVisibleJobs().map((job) => (
              <TableRow key={job.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="font-medium">{job.company_name}</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{job.job_title}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">{job.location}</div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`font-medium ${getScoreColor(job.resume_match_score)}`}
                  >
                    {job.resume_match_score}%
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`font-medium ${getScoreColor(job.ats_score)}`}
                  >
                    {job.ats_score}%
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {job.optimized_resume_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadDocument(job.optimized_resume_url!, 'resume.pdf')}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {job.cover_letter_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadDocument(job.cover_letter_url!, 'cover-letter.pdf')}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {job.email_draft_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadDocument(job.email_draft_url!, 'email-draft.txt')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {job.application_status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openJobDetails(job)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {job.job_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* Gated Jobs (Blurred) */}
            {getGatedJobs().map((job, index) => (
              <TableRow key={`gated-${index}`} className="opacity-50 blur-sm pointer-events-none">
                <TableCell>
                  <div className="font-medium">Premium Company</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">Premium Position</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">Premium Location</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">--</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">--</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled>
                      <Crown className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">Upgrade Required</Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled>
                    <Crown className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Upgrade Prompt */}
        {!planLimits.isElite && getGatedJobs().length > 0 && (
          <div className="text-center py-8 border-t bg-gradient-to-r from-primary/10 to-secondary/10 rounded-b-lg">
            <Crown className="h-12 w-12 mx-auto mb-3 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Unlock More Opportunities</h3>
            <p className="text-muted-foreground mb-4">
              {getGatedJobs().length} more job matches available with {planLimits.isPro ? 'Elite' : 'Pro/Elite'} plan
            </p>
            <Button 
              onClick={() => window.location.href = '/pricing?upgrade=true'}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        )}
      </div>

      <JobDetailsDrawer
        job={selectedJob}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        userPlan={userPlan}
      />
    </>
  );
}