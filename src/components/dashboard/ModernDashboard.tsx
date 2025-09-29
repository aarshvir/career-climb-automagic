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
import { JobListingsTable } from "./JobListingsTable";

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


export const ModernDashboard: React.FC<ModernDashboardProps> = ({ 
  stats, 
  userPlan, 
  onFetchJobs 
}) => {

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

      {/* Job Opportunities Table with Pagination */}
      <JobListingsTable userPlan={userPlan} onFetchJobs={onFetchJobs} />
    </div>
  );
};
