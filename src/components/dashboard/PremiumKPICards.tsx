import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  Eye, 
  FileText, 
  Clock, 
  Zap,
  Target,
  Award,
  Activity
} from "lucide-react";

interface DashboardStats {
  totalSearched: number;
  totalApplied: number;
  pendingReview: number;
  customResumes: number;
}

interface PremiumKPICardsProps {
  stats: DashboardStats;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  userPlan: string;
}

export const PremiumKPICards = ({ stats, timeRange, onTimeRangeChange, userPlan }: PremiumKPICardsProps) => {
  const timeRanges = [
    { label: '24h', value: '24h' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: 'All time', value: 'all' }
  ];

  const kpiData = [
    {
      title: "Total Jobs Searched",
      value: stats.totalSearched,
      icon: Eye,
      trend: { value: 12, isPositive: true },
      color: "text-primary",
      bgGradient: "from-primary/10 to-primary/5",
      description: "AI-powered job discovery",
      progress: 75,
    },
    {
      title: "Applications Sent",
      value: stats.totalApplied,
      icon: Target,
      trend: { value: 8, isPositive: true },
      color: "text-success",
      bgGradient: "from-success/10 to-success/5",
      description: "One-click applications",
      progress: 60,
    },
    {
      title: "Response Rate",
      value: Math.round((stats.pendingReview / stats.totalApplied) * 100) || 0,
      icon: Activity,
      trend: { value: 3, isPositive: false },
      color: "text-accent",
      bgGradient: "from-accent/10 to-accent/5",
      description: "Employer responses",
      progress: 45,
      suffix: "%",
    },
    {
      title: "Custom Resumes",
      value: stats.customResumes,
      icon: Award,
      trend: { value: 15, isPositive: true },
      color: "text-muted-foreground",
      bgGradient: "from-muted/10 to-muted/5",
      description: "AI-tailored resumes",
      progress: 30,
      isLocked: userPlan === 'free',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Time Range Filters */}
      <div className="flex flex-wrap gap-2">
        {timeRanges.map((range) => (
          <Button
            key={range.value}
            variant={timeRange === range.value ? "default" : "outline"}
            size="sm"
            onClick={() => onTimeRangeChange(range.value)}
            className={`transition-all duration-300 ${
              timeRange === range.value 
                ? "bg-gradient-primary shadow-premium hover:opacity-90" 
                : "hover:bg-accent/50 border-border/50 backdrop-blur-sm"
            }`}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {/* Hero KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <Card 
            key={kpi.title}
            className={`group relative overflow-hidden transition-all duration-500 hover:scale-105 hover:shadow-premium border-border/50 backdrop-blur-sm bg-gradient-to-br ${kpi.bgGradient} animate-slide-up`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {kpi.title}
              </CardTitle>
              <div className={`p-2 rounded-lg bg-background/50 backdrop-blur-sm group-hover:scale-110 transition-all duration-300`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {kpi.isLocked ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-muted-foreground">—</div>
                    <Badge variant="outline" className="text-xs">
                      Locked
                    </Badge>
                  </div>
                  <Button 
                    size="sm" 
                    className="w-full bg-gradient-primary hover:opacity-90 text-xs h-8"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Upgrade to unlock
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold tracking-tight">
                      {kpi.value.toLocaleString()}
                      {kpi.suffix && <span className="text-lg">{kpi.suffix}</span>}
                    </div>
                    <Badge 
                      variant={kpi.trend.isPositive ? "default" : "destructive"}
                      className="text-xs px-2 py-0.5"
                    >
                      {kpi.trend.isPositive ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {kpi.trend.value}%
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">{kpi.description}</p>
                      <span className="text-xs font-medium">{kpi.progress}%</span>
                    </div>
                    <Progress 
                      value={kpi.progress} 
                      className="h-1.5 bg-background/50" 
                    />
                  </div>
                </div>
              )}
            </CardContent>
            
            {/* Subtle glow effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          </Card>
        ))}
      </div>
    </div>
  );
};