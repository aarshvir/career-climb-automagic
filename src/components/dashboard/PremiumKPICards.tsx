import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  Eye, 
  Award, 
  Activity,
  Crown,
  Lock,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    { label: 'Today', value: '24h', icon: Activity },
    { label: '7 Days', value: '7d', icon: TrendingUp },
    { label: '30 Days', value: '30d', icon: Activity },
    { label: 'All Time', value: 'all', icon: Award }
  ];

  const kpiData = [
    {
      title: "Jobs Discovered",
      value: stats.totalSearched,
      icon: Eye,
      trend: 12,
      progress: 85,
      locked: false,
    },
    {
      title: "Applications Sent",
      value: stats.totalApplied,
      icon: Briefcase,
      trend: 18,
      progress: 72,
      locked: false,
    },
    {
      title: "Response Rate",
      value: Math.round((stats.pendingReview / stats.totalApplied) * 100) || 32,
      icon: Activity,
      trend: 5,
      progress: 65,
      suffix: "%",
      locked: false,
    },
    {
      title: "AI Resumes",
      value: stats.customResumes,
      icon: Award,
      trend: 25,
      progress: userPlan === 'free' ? 0 : 45,
      locked: userPlan === 'free',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-2xl lg:text-3xl font-bold text-foreground">
            Dashboard Overview
          </h2>
          <p className="text-base text-muted-foreground">
            Track your AI-powered job search journey
          </p>
        </div>
        <div className="glass-card p-1">
          <div className="flex flex-wrap gap-1">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => onTimeRangeChange(range.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 interactive-element",
                  timeRange === range.value
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <range.icon className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">{range.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Enhanced KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi, index) => (
          <Card key={index} className={cn(
            "premium-card-interactive relative overflow-hidden border-0 shadow-md hover:shadow-lg",
            "bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm",
            kpi.locked && "opacity-70"
          )}>
            <CardContent className="p-6">
              {kpi.locked && (
                <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                  <div className="text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <Badge variant="secondary" className="text-xs font-medium">Pro Feature</Badge>
                    <Button size="sm" variant="default" className="text-xs font-medium hover-lift">
                      Upgrade Now
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "p-2.5 rounded-xl transition-all duration-300 group-hover:scale-105",
                  index === 0 && "bg-gradient-to-br from-primary/20 to-primary/10",
                  index === 1 && "bg-gradient-to-br from-success/20 to-success/10", 
                  index === 2 && "bg-gradient-to-br from-warning/20 to-warning/10",
                  index === 3 && "bg-gradient-to-br from-info/20 to-info/10"
                )}>
                  <kpi.icon className={cn(
                    "h-5 w-5",
                    index === 0 && "text-primary",
                    index === 1 && "text-success",
                    index === 2 && "text-warning", 
                    index === 3 && "text-info"
                  )} />
                </div>
                <Badge 
                  variant={kpi.trend > 0 ? "default" : "destructive"} 
                  className={cn(
                    "text-xs font-medium",
                    kpi.trend > 0 && "bg-success/10 text-success border-success/20"
                  )}
                >
                  {kpi.trend > 0 ? "↗" : "↘"} {Math.abs(kpi.trend)}%
                </Badge>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 truncate">{kpi.title}</p>
                  <p className="text-2xl lg:text-3xl font-bold text-foreground leading-none">
                    {kpi.value.toLocaleString()}
                    {kpi.suffix && <span className="text-lg text-muted-foreground">{kpi.suffix}</span>}
                  </p>
                </div>
                
                {kpi.progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium">Goal Progress</span>
                      <span className="text-foreground font-semibold">{kpi.progress}%</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                      <div 
                        className={cn(
                          "h-2 rounded-full transition-all duration-1000 ease-out",
                          index === 0 && "bg-gradient-to-r from-primary to-primary/80",
                          index === 1 && "bg-gradient-to-r from-success to-success/80",
                          index === 2 && "bg-gradient-to-r from-warning to-warning/80",
                          index === 3 && "bg-gradient-to-r from-info to-info/80"
                        )}
                        style={{ 
                          width: `${kpi.progress}%`,
                          animationDelay: `${index * 150}ms`
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};