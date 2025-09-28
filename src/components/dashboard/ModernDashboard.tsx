import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Briefcase, 
  Target, 
  Clock, 
  FileText, 
  TrendingUp,
  Users,
  DollarSign,
  MapPin,
  ExternalLink,
  Bookmark,
  Eye,
  Zap,
  Filter,
  MoreHorizontal,
  Building2,
  Star,
  Calendar,
  MessageSquare,
  BarChart3
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PlanPersistenceTest } from "./PlanPersistenceTest";

interface ModernDashboardProps {
  stats: {
    totalSearched: number;
    totalApplied: number;
    pendingReview: number;
    customResumes: number;
  };
  userPlan: string;
  onFetchJobs: () => Promise<number>;
}

// Mock job data for demonstration
const mockJobs = [
  {
    id: "1",
    title: "Senior Software Engineer",
    company: "TechCorp",
    location: "San Francisco, CA",
    salary: "$120,000 - $180,000",
    matchScore: 92,
    status: "Not Applied",
    type: "Full-time",
    posted: "2 days ago",
    description: "We're looking for a senior software engineer to join our growing team..."
  },
  {
    id: "2", 
    title: "Full Stack Developer",
    company: "StartupXYZ",
    location: "Remote",
    salary: "$90,000 - $130,000",
    matchScore: 87,
    status: "Applied",
    type: "Full-time",
    posted: "1 week ago",
    description: "Join our innovative startup as a full stack developer..."
  },
  {
    id: "3",
    title: "Frontend Developer",
    company: "DesignCo",
    location: "New York, NY",
    salary: "$85,000 - $120,000",
    matchScore: 78,
    status: "Not Applied",
    type: "Full-time",
    posted: "3 days ago",
    description: "We need a creative frontend developer to build beautiful user interfaces..."
  },
  {
    id: "4",
    title: "Backend Engineer",
    company: "DataFlow",
    location: "Austin, TX",
    salary: "$100,000 - $150,000",
    matchScore: 85,
    status: "Not Applied",
    type: "Full-time",
    posted: "5 days ago",
    description: "Looking for a backend engineer to scale our infrastructure..."
  },
  {
    id: "5",
    title: "DevOps Engineer",
    company: "CloudTech",
    location: "Seattle, WA",
    salary: "$110,000 - $160,000",
    matchScore: 73,
    status: "Applied",
    type: "Full-time",
    posted: "1 week ago",
    description: "Join our DevOps team to manage cloud infrastructure..."
  }
];

export const ModernDashboard: React.FC<ModernDashboardProps> = ({ 
  stats, 
  userPlan, 
  onFetchJobs 
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    return "text-orange-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-50 border-green-200";
    if (score >= 60) return "bg-blue-50 border-blue-200";
    return "bg-orange-50 border-orange-200";
  };

  return (
    <div className="space-y-8">
      {/* Modern Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Manage your job search and track applications</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Zap className="h-4 w-4 mr-2" />
            Fetch Jobs
          </Button>
        </div>
      </div>

      {/* Plan Persistence Test - Temporary */}
      <PlanPersistenceTest />

      {/* Clean Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Jobs Searched</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSearched}</p>
              </div>
              <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Applications</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalApplied}</p>
              </div>
              <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Target className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingReview}</p>
              </div>
              <div className="h-10 w-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Resumes</p>
                <p className="text-2xl font-bold text-gray-900">{stats.customResumes}</p>
              </div>
              <div className="h-10 w-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Opportunities Table */}
      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Job Opportunities
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                {mockJobs.length} matches found • {userPlan === 'free' ? '5' : 'All'} visible on {userPlan} plan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              {userPlan === 'free' && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Zap className="h-4 w-4 mr-2" />
                  Upgrade
                </Button>
              )}
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
                {mockJobs.map((job, index) => {
                  const isVisible = index < (userPlan === 'free' ? 3 : mockJobs.length);
                  const isPaidFeature = !isVisible && userPlan === 'free';
                  
                  return (
                    <tr 
                      key={job.id}
                      className={cn(
                        "hover:bg-gray-50 transition-colors cursor-pointer",
                        !isVisible && "opacity-40",
                        isPaidFeature && "bg-gray-50"
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div className={cn(
                            "font-medium text-sm text-gray-900",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.title : '████████████████'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {isVisible ? job.type : '████'}
                            </Badge>
                            <Badge 
                              variant={job.status === 'Applied' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {isVisible ? job.status : '██████'}
                            </Badge>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                              <Building2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "font-medium text-sm text-gray-900",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.company : '████████'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className={cn(
                            "text-sm text-gray-600",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.location : '████████████'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-gray-400" />
                          <span className={cn(
                            "text-sm text-gray-600",
                            !isVisible && "blur-sm select-none"
                          )}>
                            {isVisible ? job.salary : '██████████████'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border",
                          isVisible ? getScoreBg(job.matchScore) : "bg-gray-100 border-gray-200 blur-sm select-none"
                        )}>
                          {isVisible ? (
                            <>
                              <div className={cn("w-2 h-2 rounded-full mr-2", getScoreColor(job.matchScore))} />
                              {job.matchScore}%
                            </>
                          ) : (
                            '████'
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge 
                          variant={job.status === 'Applied' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {isVisible ? job.status : '██████'}
                        </Badge>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isVisible ? (
                            <>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Bookmark className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Zap className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <div className="flex gap-2">
                              <div className="h-8 w-8 bg-gray-200 rounded"></div>
                              <div className="h-8 w-8 bg-gray-200 rounded"></div>
                              <div className="h-8 w-8 bg-gray-200 rounded"></div>
                              <div className="h-8 w-8 bg-gray-200 rounded"></div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {userPlan === 'free' && mockJobs.length > 3 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t border-blue-200 p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Unlock More Opportunities
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Upgrade to Pro to see all {mockJobs.length} job matches and get unlimited access
                </p>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Zap className="h-4 w-4 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
