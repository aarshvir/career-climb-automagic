import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MapPin, 
  Calendar, 
  ExternalLink, 
  Bookmark, 
  Zap, 
  FileText, 
  Mail,
  Building2,
  DollarSign,
  Clock,
  Users,
  Award,
  Lock
} from "lucide-react";
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
  description?: string;
  requirements?: string[];
  benefits?: string[];
  company_size?: string;
  industry?: string;
}

interface JobDetailsDrawerProps {
  job: JobMatch | null;
  isOpen: boolean;
  onClose: () => void;
  userPlan: string;
  onSaveJob?: (jobId: string) => void;
  isSaved?: boolean;
}

export const JobDetailsDrawer = ({ 
  job, 
  isOpen, 
  onClose, 
  userPlan,
  onSaveJob,
  isSaved = false
}: JobDetailsDrawerProps) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);

  if (!job) return null;

  const isPaidPlan = userPlan !== 'free';
  
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

  const handleOptimizeATS = async () => {
    if (!isPaidPlan) return;
    
    setIsOptimizing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsOptimizing(false);
  };

  const handleGenerateCV = async () => {
    if (!isPaidPlan) return;
    
    setIsGeneratingCV(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsGeneratingCV(false);
  };

  const mockDescription = `We are seeking a talented ${job.job_title} to join our growing team. In this role, you will be responsible for developing and maintaining high-quality software solutions that drive our business forward.

Key Responsibilities:
• Design and develop scalable web applications using modern technologies
• Collaborate with cross-functional teams to define and implement new features
• Write clean, maintainable, and well-documented code
• Participate in code reviews and contribute to technical discussions
• Stay up-to-date with emerging technologies and industry best practices

What We Offer:
• Competitive salary and equity package
• Comprehensive health, dental, and vision insurance
• Flexible work arrangements and remote-friendly culture
• Professional development opportunities and conference attendance
• Modern office with top-tier equipment and amenities`;

  const mockRequirements = [
    "Bachelor's degree in Computer Science or related field",
    "3+ years of experience in software development",
    "Proficiency in React, TypeScript, and Node.js",
    "Experience with cloud platforms (AWS, GCP, or Azure)",
    "Strong problem-solving and communication skills"
  ];

  const highlightedKeywords = [
    "React", "TypeScript", "Node.js", "AWS", "Software Development", 
    "Computer Science", "Cloud Platforms", "Problem-solving"
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl p-0 bg-background/95 backdrop-blur-lg border-l border-border/50">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border/50 bg-gradient-to-r from-background/50 to-background/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground font-medium">
                    {job.company_name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {job.job_type}
                  </Badge>
                </div>
                <SheetTitle className="text-xl font-bold text-foreground leading-tight">
                  {job.job_title}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-4 mt-2 text-sm">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {job.salary_range}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(job.posted_date)}
                  </div>
                </SheetDescription>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <Badge 
                  variant={job.ats_score >= 80 ? 'default' : 'secondary'}
                  className={cn(
                    "font-mono text-xs",
                    job.ats_score >= 80 && "bg-success/10 text-success border-success/20"
                  )}
                >
                  {job.ats_score}% Match
                </Badge>
                <div className="flex gap-1">
                  {highlightedKeywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Action Toolbar */}
          <div className="p-4 border-b border-border/50 bg-muted/20">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSaveJob?.(job.id)}
                className={cn(
                  "hover-lift",
                  isSaved && "bg-primary/10 border-primary/20"
                )}
              >
                <Bookmark className={cn(
                  "h-3 w-3 mr-2",
                  isSaved && "fill-primary text-primary"
                )} />
                {isSaved ? 'Saved' : 'Save Job'}
              </Button>

              {isPaidPlan ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOptimizeATS}
                    disabled={isOptimizing}
                    className="hover-lift"
                  >
                    <Zap className="h-3 w-3 mr-2" />
                    {isOptimizing ? 'Optimizing...' : 'Optimize ATS'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateCV}
                    disabled={isGeneratingCV}
                    className="hover-lift"
                  >
                    <FileText className="h-3 w-3 mr-2" />
                    {isGeneratingCV ? 'Generating...' : 'Generate CV'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="opacity-60 cursor-not-allowed"
                  >
                    <Lock className="h-3 w-3 mr-2" />
                    Optimize ATS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="opacity-60 cursor-not-allowed"
                  >
                    <Lock className="h-3 w-3 mr-2" />
                    Generate CV
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                className="hover-lift"
              >
                <Mail className="h-3 w-3 mr-2" />
                Cover Letter
              </Button>

              <Button
                size="sm"
                asChild
                className="bg-gradient-primary hover:opacity-90 hover-lift ml-auto"
              >
                <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-2" />
                  Apply Now
                </a>
              </Button>
            </div>

            {!isPaidPlan && (
              <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Unlock ATS optimization and CV generation
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Get pro features to boost your application success
                    </p>
                  </div>
                  <Button size="sm" className="bg-gradient-primary hover:opacity-90">
                    <Zap className="h-3 w-3 mr-1" />
                    Upgrade
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Company Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Company Size:</span>
                  <span className="font-medium">51-200 employees</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Industry:</span>
                  <span className="font-medium">Technology</span>
                </div>
              </div>

              {/* Job Description */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Job Description
                </h3>
                <div className="prose prose-sm max-w-none text-foreground">
                  {mockDescription.split('\n').map((paragraph, index) => (
                    <p key={index} className="mb-3 text-sm leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Requirements */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Requirements
                </h3>
                <ul className="space-y-2">
                  {mockRequirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-foreground leading-relaxed">
                        {requirement}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Matched Keywords */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Matched Keywords
                </h3>
                <div className="flex flex-wrap gap-2">
                  {highlightedKeywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};