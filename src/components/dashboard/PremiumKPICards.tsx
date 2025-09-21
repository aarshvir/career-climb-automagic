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
  Activity,
  Crown
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
    { label: 'Today', value: '24h', icon: Clock },
    { label: '7 Days', value: '7d', icon: TrendingUp },
    { label: '30 Days', value: '30d', icon: Activity },
    { label: 'All Time', value: 'all', icon: Target }
  ];

  const kpiData = [
    {
      title: "Jobs Discovered",
      value: stats.totalSearched,
      icon: Eye,
      trend: { value: 12, isPositive: true },
      color: "text-primary",
      bgGradient: "bg-gradient-primary",
      description: "AI-powered discovery",
      progress: 85,
      target: 1000,
    },
    {
      title: "Applications Sent",
      value: stats.totalApplied,
      icon: Target,
      trend: { value: 18, isPositive: true },
      color: "text-success",
      bgGradient: "bg-gradient-success",
      description: "Auto-applications",
      progress: 72,
      target: 100,
    },
    {
      title: "Response Rate",
      value: Math.round((stats.pendingReview / stats.totalApplied) * 100) || 32,
      icon: Activity,
      trend: { value: 5, isPositive: true },
      color: "text-accent",
      bgGradient: "bg-gradient-warning",
      description: "Employer responses",
      progress: 65,
      suffix: "%",
      target: 50,
    },
    {
      title: "AI Resumes",
      value: stats.customResumes,
      icon: Award,
      trend: { value: 25, isPositive: true },
      color: "text-warning",
      bgGradient: "bg-gradient-primary",
      description: "Tailored versions",
      progress: userPlan === 'free' ? 0 : 45,
      isLocked: userPlan === 'free',
      target: 25,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Enhanced Time Range Filters */}
      <div className="flex flex-wrap gap-3">
        {timeRanges.map((range, index) => (
          <Button
            key={range.value}
            variant={timeRange === range.value ? "default" : "outline"}
            size="sm"
            onClick={() => onTimeRangeChange(range.value)}
            className={`group relative transition-premium animate-in-delayed ${
              timeRange === range.value 
                ? "bg-gradient-primary shadow-elevated hover:shadow-premium text-primary-foreground border-0" 
                : "hover:bg-primary-soft/30 border-border-elevated/50 glass-morphism hover:border-primary/30"
            }`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <range.icon className="h-3.5 w-3.5 mr-2" />
            {range.label}
          </Button>
        ))}
      </div>

      {/* World-Class KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <Card 
            key={kpi.title}
            className="group relative overflow-hidden premium-card hover-lift transition-premium animate-in-delayed border-border-elevated/50"
            style={{ animationDelay: `${index * 150}ms` }}
          >
            {/* Card Header */}
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="space-y-1">
                <CardTitle className="text-sm font-display font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {kpi.title}
                </CardTitle>
                <p className="text-xs text-muted-foreground/70">{kpi.description}</p>
              </div>
              <div className={`p-3 rounded-xl ${kpi.bgGradient} shadow-inner group-hover:scale-110 transition-premium`}>
                <kpi.icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>

            {/* Card Content */}
            <CardContent className="space-y-6">
              {kpi.isLocked ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-display font-bold text-muted-foreground">—</div>
                    <Badge variant="outline" className="text-xs border-border-elevated/50">
                      <Crown className="h-3 w-3 mr-1" />
                      Pro Only
                    </Badge>
                  </div>
                  <Button 
                    size="sm" 
                    className="w-full bg-gradient-primary hover:opacity-90 shadow-card transition-premium text-xs h-9"
                  >
                    <Zap className="h-3 w-3 mr-2" />
                    Upgrade to Pro
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Main Metric */}
                  <div className="flex items-baseline gap-3">
                    <div className="text-3xl font-display font-bold tracking-tight">
                      {kpi.value.toLocaleString()}
                      {kpi.suffix && <span className="text-lg text-muted-foreground">{kpi.suffix}</span>}
                    </div>
                    <Badge 
                      variant={kpi.trend.isPositive ? "default" : "destructive"}
                      className={`text-xs px-2.5 py-0.5 font-medium ${
                        kpi.trend.isPositive 
                          ? "bg-success-soft text-success border-success/20" 
                          : "bg-destructive-soft text-destructive border-destructive/20"
                      }`}
                    >
                      {kpi.trend.isPositive ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {kpi.trend.value}%
                    </Badge>
                  </div>
                  
                  {/* Progress Section */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground font-medium">
                        Progress to goal
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{kpi.progress}%</span>
                        <span className="text-xs text-muted-foreground">of {kpi.target}</span>
                      </div>
                    </div>
                    <Progress 
                      value={kpi.progress} 
                      className="h-2 bg-muted/50 rounded-full overflow-hidden"
                    />
                  </div>
                </div>
              )}
            </CardContent>
            
            {/* Ambient Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            
            {/* Border Glow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none" />
          </Card>
        ))}
      </div>
    </div>
  );
};