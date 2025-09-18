import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Building, MapPin, DollarSign, Clock, ExternalLink, Bookmark, FileText, Zap } from "lucide-react";

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

interface JobDetailsDrawerProps {
  job: JobMatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPlan: string;
}

export const JobDetailsDrawer = ({ job, open, onOpenChange, userPlan }: JobDetailsDrawerProps) => {
  const [loading, setLoading] = useState(false);

  if (!job) return null;

  // Mock full job description (in real app, this would be fetched on demand)
  const fullJobDescription = `
About the Role:
${job.jdSnippet}

We are seeking a talented and motivated individual to join our growing team. This position offers excellent opportunities for career growth and professional development.

Key Responsibilities:
• Develop and maintain high-quality software applications
• Collaborate with cross-functional teams to deliver exceptional user experiences
• Participate in code reviews and technical discussions
• Stay up-to-date with industry best practices and emerging technologies

Requirements:
• Bachelor's degree in Computer Science or related field
• 3+ years of experience in software development
• Strong problem-solving skills and attention to detail
• Excellent communication and teamwork abilities

What We Offer:
• Competitive salary and benefits package
• Flexible working arrangements
• Professional development opportunities
• Dynamic and inclusive work environment
  `;

  const handleTailorCV = () => {
    if (userPlan === 'free') {
      // Show upgrade modal
      return;
    }
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
    }, 2000);
  };

  const handleOptimizeATS = () => {
    if (userPlan === 'free') {
      // Show upgrade modal
      return;
    }
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
    }, 2000);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'applied': return 'bg-success/10 text-success';
      case 'pending': return 'bg-accent/10 text-accent';
      case 'reviewing': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">{job.jobTitle}</h2>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building className="w-4 h-4" />
                <span>{job.company}</span>
                <Badge variant="outline">{job.sector}</Badge>
              </div>
              {job.appliedStatus && (
                <Badge className={getStatusColor(job.appliedStatus)}>
                  {job.appliedStatus}
                </Badge>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{job.atsScore}%</div>
              <div className="text-sm text-muted-foreground">ATS Match</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold">$120k</div>
              <div className="text-sm text-muted-foreground">Est. Salary</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {userPlan === 'free' ? (
              <>
                <Button className="w-full bg-gradient-primary hover:opacity-90">
                  <FileText className="w-4 h-4 mr-2" />
                  Tailor CV (Upgrade Required)
                </Button>
                <Button className="w-full bg-gradient-primary hover:opacity-90">
                  <Zap className="w-4 h-4 mr-2" />
                  Optimize ATS (Upgrade Required)
                </Button>
              </>
            ) : (
              <>
                <Button 
                  className="w-full" 
                  onClick={handleTailorCV}
                  disabled={loading}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {loading ? "Tailoring CV..." : "Tailor CV"}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleOptimizeATS}
                  disabled={loading}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {loading ? "Optimizing..." : "Optimize ATS Score"}
                </Button>
              </>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <Bookmark className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Apply
                </a>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Job Details */}
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Job Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>San Francisco, CA (Remote)</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span>$100k - $140k per year</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>Full-time</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Full Job Description */}
            <div>
              <h3 className="font-semibold mb-2">Job Description</h3>
              <div className="text-sm text-muted-foreground whitespace-pre-line">
                {fullJobDescription}
              </div>
            </div>

            {/* ATS Analysis (Paid Feature) */}
            {userPlan !== 'free' && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2">ATS Analysis</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Keywords Match</span>
                      <span className="font-medium">85%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Experience Level</span>
                      <span className="font-medium">Perfect</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Skills Alignment</span>
                      <span className="font-medium">90%</span>
                    </div>
                  </div>
                  <div className="mt-3 p-3 bg-primary/5 rounded-lg">
                    <p className="text-sm">
                      <strong>Suggestion:</strong> Add "React hooks" and "TypeScript" to your resume to improve ATS score by an estimated 8%.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};