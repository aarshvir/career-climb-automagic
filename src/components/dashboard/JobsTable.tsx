import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Eye, Zap, FileText, Building, MapPin } from "lucide-react";
import { JobDetailsDrawer } from "./JobDetailsDrawer";

interface JobMatch {
  id: string;
  company: string;
  sector: string;
  jobTitle: string;
  jdSnippet: string;
  atsScore: number;
  cvUrl?: string;
  jobUrl: string;
  appliedStatus?: 'applied' | 'pending' | 'reviewing';
}

interface JobsTableProps {
  jobs: JobMatch[];
  userPlan: string;
  searchQuery: string;
}

export const JobsTable = ({ jobs, userPlan, searchQuery }: JobsTableProps) => {
  const [selectedJob, setSelectedJob] = useState<JobMatch | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filter jobs based on search query
  const filteredJobs = jobs.filter(job => 
    job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.sector.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Plan-based gating logic
  const getVisibleJobs = () => {
    switch (userPlan) {
      case 'elite':
        return filteredJobs; // Show all
      case 'pro':
        return filteredJobs.slice(0, 25); // Show first 25
      default:
        return filteredJobs.slice(0, 5); // Show first 5 for free
    }
  };

  const getGatedJobs = () => {
    switch (userPlan) {
      case 'elite':
        return []; // No gating
      case 'pro':
        return filteredJobs.slice(25, 35); // Show 10 gated
      default:
        return filteredJobs.slice(5, 15); // Show 10 gated
    }
  };

  const visibleJobs = getVisibleJobs();
  const gatedJobs = getGatedJobs();

  const handleJobView = (job: JobMatch) => {
    setSelectedJob(job);
    setDrawerOpen(true);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'applied': return 'bg-success/10 text-success';
      case 'pending': return 'bg-accent/10 text-accent';
      case 'reviewing': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const truncateText = (text: string, wordLimit: number = 10) => {
    const words = text.split(' ');
    if (words.length <= wordLimit) return text;
    return words.slice(0, wordLimit).join(' ') + '...';
  };

  const UpgradeButton = ({ size = "sm" }: { size?: "sm" | "default" }) => (
    <Button 
      size={size}
      className="bg-gradient-primary hover:opacity-90"
    >
      Upgrade
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Job Matches</CardTitle>
            <Badge variant="outline">
              {visibleJobs.length + gatedJobs.length} jobs found
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Job Description</TableHead>
                  <TableHead>ATS Score</TableHead>
                  <TableHead>Optimize ATS</TableHead>
                  <TableHead>Optimized CV</TableHead>
                  <TableHead>CV Link</TableHead>
                  <TableHead>Job Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Visible Jobs */}
                {visibleJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{job.company}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.sector}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{job.jobTitle}</p>
                        {job.appliedStatus && (
                          <Badge className={getStatusColor(job.appliedStatus)}>
                            {job.appliedStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {truncateText(job.jdSnippet)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleJobView(job)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold">{job.atsScore}%</div>
                        <div className={`w-2 h-2 rounded-full ${
                          job.atsScore >= 80 ? 'bg-success' : 
                          job.atsScore >= 60 ? 'bg-accent' : 'bg-destructive'
                        }`} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {userPlan === 'free' ? (
                        <UpgradeButton />
                      ) : (
                        <Button size="sm" variant="outline">
                          <Zap className="w-4 h-4 mr-1" />
                          Optimize
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {userPlan === 'free' ? (
                        <UpgradeButton />
                      ) : (
                        <Button size="sm" variant="outline">
                          <FileText className="w-4 h-4 mr-1" />
                          Generate
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.cvUrl ? (
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" asChild>
                        <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Gated Jobs (Greyed Out) */}
                {gatedJobs.map((job) => (
                  <TableRow key={`gated-${job.id}`} className="opacity-40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-muted-foreground" />
                        <span>Hidden</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">Upgrade to view</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell>
                      <UpgradeButton />
                    </TableCell>
                    <TableCell>
                      <UpgradeButton />
                    </TableCell>
                    <TableCell>
                      <UpgradeButton />
                    </TableCell>
                    <TableCell>
                      <UpgradeButton />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Upgrade Prompt for Free Users */}
          {userPlan === 'free' && filteredJobs.length > 5 && (
            <div className="mt-6 p-6 bg-gradient-card rounded-lg border text-center">
              <h3 className="text-lg font-semibold mb-2">
                {filteredJobs.length - 5} more jobs available
              </h3>
              <p className="text-muted-foreground mb-4">
                Upgrade to see all job matches and unlock powerful features like ATS optimization and custom CV generation.
              </p>
              <Button className="bg-gradient-primary hover:opacity-90">
                Upgrade Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <JobDetailsDrawer
        job={selectedJob}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        userPlan={userPlan}
      />
    </>
  );
};