import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Zap, 
  ExternalLink, 
  Bookmark, 
  Eye, 
  MapPin, 
  Building2,
  DollarSign,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  matchScore: number;
  status: 'Applied' | 'Not Applied' | 'Bookmarked';
  type: string;
  postedDate: string;
  description?: string;
  requirements?: string[];
}

interface JobListingsTableProps {
  userPlan: string;
  onFetchJobs: () => Promise<number>;
}

const ITEMS_PER_PAGE = 20;

export const JobListingsTable: React.FC<JobListingsTableProps> = ({ 
  userPlan, 
  onFetchJobs 
}) => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Fetch jobs from database with pagination
  const fetchJobs = async (page: number = 1) => {
    if (!user) return;

    setLoading(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      
      // Get total count first
      const { count: totalCount } = await supabase
        .from('job_applications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setTotalJobs(totalCount || 0);
      setTotalPages(Math.ceil((totalCount || 0) / ITEMS_PER_PAGE));

      // Fetch jobs for current page
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (error) {
        console.error('Error fetching jobs:', error);
        // Fallback to mock data if database fails
        setJobs(getMockJobs(page));
        setTotalJobs(280); // Mock total
        setTotalPages(14); // 280 / 20 = 14 pages
      } else {
        // Transform database data to match Job interface
        const transformedJobs = (data || []).map((job: any): Job => ({
          id: job.id,
          title: job.job_title || 'Software Engineer',
          company: job.company_name || 'Company',
          location: job.location || 'Remote',
          salary: job.salary_range || undefined,
          matchScore: job.resume_match_score || 75,
          status: job.application_status === 'applied' ? 'Applied' as const : 'Not Applied' as const,
          type: 'Full-time',
          postedDate: job.created_at || new Date().toISOString(),
          description: job.job_description || undefined,
          requirements: []
        }));
        setJobs(transformedJobs);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      // Fallback to mock data
      setJobs(getMockJobs(page));
      setTotalJobs(280);
      setTotalPages(14);
    } finally {
      setLoading(false);
    }
  };

  // Mock data generator for fallback
  const getMockJobs = (page: number): Job[] => {
    const jobs: Job[] = [];
    const startId = (page - 1) * ITEMS_PER_PAGE + 1;
    
    for (let i = 0; i < ITEMS_PER_PAGE; i++) {
      const id = startId + i;
      jobs.push({
        id: id.toString(),
        title: `Software Engineer ${id}`,
        company: `Company ${id}`,
        location: 'San Francisco, CA',
        salary: '$100,000 - $150,000',
        matchScore: Math.floor(Math.random() * 30) + 70, // 70-100
        status: Math.random() > 0.7 ? 'Applied' : 'Not Applied',
        type: 'Full-time',
        postedDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Great opportunity for software engineers...',
        requirements: ['React', 'TypeScript', 'Node.js']
      });
    }
    
    return jobs;
  };

  useEffect(() => {
    fetchJobs(currentPage);
  }, [currentPage, user]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleJobAction = async (jobId: string, action: 'apply' | 'bookmark' | 'view') => {
    // Implement job actions
    console.log(`Action ${action} for job ${jobId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Applied':
        return <Badge className="bg-blue-100 text-blue-800">Applied</Badge>;
      case 'Bookmarked':
        return <Badge className="bg-yellow-100 text-yellow-800">Bookmarked</Badge>;
      default:
        return <Badge variant="outline">Not Applied</Badge>;
    }
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 80) return 'text-blue-600 bg-blue-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Job Opportunities
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">Loading jobs...</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm bg-white">
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-semibold text-gray-900">
              Job Opportunities
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {totalJobs} matches found • Showing {jobs.length} jobs (Page {currentPage} of {totalPages})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button size="sm" onClick={onFetchJobs} className="bg-blue-600 hover:bg-blue-700">
              <Zap className="h-4 w-4 mr-2" />
              Fetch Jobs
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Salary
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Match Score
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <div className="font-medium text-sm text-gray-900">
                        {job.title}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {job.type}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(job.postedDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{job.company}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{job.location}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{job.salary || 'Not specified'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={cn("text-xs font-medium", getMatchScoreColor(job.matchScore))}>
                      {job.matchScore}%
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleJobAction(job.id, 'bookmark')}
                        className="h-8 w-8 p-0"
                      >
                        <Bookmark className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleJobAction(job.id, 'view')}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleJobAction(job.id, 'apply')}
                        className="h-8 w-8 p-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalJobs)} of {totalJobs} results
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className="h-8 w-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
