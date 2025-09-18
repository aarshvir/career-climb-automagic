import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Briefcase, Eye, FileText, Clock } from "lucide-react";

interface DashboardStats {
  totalSearched: number;
  totalApplied: number;
  pendingReview: number;
  customResumes: number;
}

interface KPICardsProps {
  stats: DashboardStats;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  userPlan: string;
}

export const KPICards = ({ stats, timeRange, onTimeRangeChange, userPlan }: KPICardsProps) => {
  const timeRanges = [
    { label: '24h', value: '24h' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: 'All time', value: 'all' }
  ];

  return (
    <div className="space-y-4">
      {/* Time Range Filters */}
      <div className="flex gap-2">
        {timeRanges.map((range) => (
          <Button
            key={range.value}
            variant={timeRange === range.value ? "default" : "outline"}
            size="sm"
            onClick={() => onTimeRangeChange(range.value)}
            className={timeRange === range.value ? "bg-gradient-primary" : ""}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-card transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs Searched</CardTitle>
            <Eye className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSearched.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline w-3 h-3 mr-1" />
              +12% from last period
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-card transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs Applied</CardTitle>
            <Briefcase className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalApplied.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline w-3 h-3 mr-1" />
              +8% from last period
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-card transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReview}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting employer response
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-card transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custom Resumes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {userPlan === 'free' ? (
              <div>
                <div className="text-2xl font-bold">—</div>
                <Button 
                  size="sm" 
                  className="bg-gradient-primary hover:opacity-90 text-xs p-2 h-auto mt-1"
                >
                  Upgrade to unlock
                </Button>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold">{stats.customResumes}</div>
                <p className="text-xs text-muted-foreground">
                  AI-tailored resumes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};