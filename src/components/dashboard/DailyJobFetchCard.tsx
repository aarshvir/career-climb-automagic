import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Target, 
  Zap, 
  Clock, 
  CheckCircle2, 
  RefreshCw,
  Star,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlanLimits } from "@/hooks/usePlanLimits";

interface DailyJobFetchCardProps {
  userPlan: string;
  onFetchJobs: () => Promise<number>;
}

type FetchState = 'idle' | 'loading' | 'success' | 'exhausted';

export const DailyJobFetchCard = ({ userPlan, onFetchJobs }: DailyJobFetchCardProps) => {
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchCount, setFetchCount] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [timeUntilReset, setTimeUntilReset] = useState<string>('');
  const [jobsFound, setJobsFound] = useState(0);
  
  const planLimits = usePlanLimits(userPlan);
  const dailyLimit = planLimits.dailyJobApplications; // Using this as fetch limit for now

  useEffect(() => {
    // Load from localStorage
    const today = new Date().toDateString();
    const storedData = localStorage.getItem(`jobfetch_${today}`);
    if (storedData) {
      const parsed = JSON.parse(storedData);
      setFetchCount(parsed.count);
      setLastFetchTime(new Date(parsed.lastFetch));
    }

    // Set up countdown timer
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateCountdown = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    setTimeUntilReset(`${hours}h ${minutes}m`);
  };

  const handleFetchJobs = async () => {
    if (fetchCount >= dailyLimit) return;

    setFetchState('loading');
    
    try {
      const foundJobs = await onFetchJobs();
      setJobsFound(foundJobs);
      setFetchState('success');
      
      const newCount = fetchCount + 1;
      setFetchCount(newCount);
      setLastFetchTime(new Date());
      
      // Store in localStorage
      const today = new Date().toDateString();
      localStorage.setItem(`jobfetch_${today}`, JSON.stringify({
        count: newCount,
        lastFetch: new Date().toISOString()
      }));
      
      if (newCount >= dailyLimit) {
        setFetchState('exhausted');
      }
    } catch (error) {
      setFetchState('idle');
      console.error('Fetch jobs error:', error);
    }
  };

  const getButtonContent = () => {
    switch (fetchState) {
      case 'loading':
        return (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Fetching Jobs...
          </>
        );
      case 'success':
        return (
          <>
            <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
            Found {jobsFound} Jobs
          </>
        );
      case 'exhausted':
        return (
          <>
            <Clock className="h-4 w-4 mr-2" />
            Available in {timeUntilReset}
          </>
        );
      default:
        return (
          <>
            <Zap className="h-4 w-4 mr-2" />
            Fetch Today's Jobs
          </>
        );
    }
  };

  const getButtonVariant = () => {
    switch (fetchState) {
      case 'success':
        return 'outline';
      case 'exhausted':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const isButtonDisabled = fetchState === 'loading' || fetchState === 'exhausted';
  const remainingFetches = dailyLimit - fetchCount;

  return (
    <Card className="premium-card border-0 bg-gradient-to-br from-primary/5 via-card to-accent/5 backdrop-blur-sm overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-success/5 pointer-events-none" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl" />
      
      <CardHeader className="relative z-10 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-primary shadow-lg shadow-primary/20">
              <Target className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                Daily Job Fetch
                {userPlan !== 'free' && (
                  <Badge variant="secondary" className="bg-gradient-to-r from-primary/10 to-accent/10">
                    <Star className="h-3 w-3 mr-1" />
                    {userPlan.toUpperCase()}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Discover personalized job opportunities
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">
              {remainingFetches}
            </div>
            <div className="text-xs text-muted-foreground">
              remaining today
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-6">
        {/* Progress indicators */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">Daily Usage</span>
            <span className="text-foreground font-semibold">
              {fetchCount}/{dailyLimit} fetches
            </span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
            <div 
              className="h-2 bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(fetchCount / dailyLimit) * 100}%` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleFetchJobs}
            disabled={isButtonDisabled}
            variant={getButtonVariant()}
            className={cn(
              "flex-1 h-12 font-medium transition-all duration-300",
              fetchState === 'idle' && "bg-gradient-primary hover:opacity-90 shadow-lg shadow-primary/20",
              fetchState === 'success' && "hover:bg-success/10 hover:border-success/20",
              "hover-lift"
            )}
          >
            {getButtonContent()}
          </Button>
          
          {fetchState === 'success' && (
            <Button
              variant="outline"
              size="default"
              className="px-6 h-12 hover-lift border-border/50 hover:bg-accent/50"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              View New Jobs
            </Button>
          )}
        </div>

        {/* Status information */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            {lastFetchTime && (
              <>
                <Clock className="h-3 w-3" />
                Last fetch: {lastFetchTime.toLocaleTimeString()}
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {userPlan === 'free' ? (
              <Badge variant="outline" className="text-xs">
                Free Plan • {dailyLimit}/day
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                {userPlan.toUpperCase()} • {dailyLimit}/day
              </Badge>
            )}
          </div>
        </div>

        {/* Upgrade prompt for free users */}
        {userPlan === 'free' && fetchCount >= dailyLimit && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-foreground">
                Daily limit reached
              </p>
              <p className="text-xs text-muted-foreground">
                Upgrade to Pro for 20 daily fetches or Elite for 50
              </p>
              <Button size="sm" className="bg-gradient-primary hover:opacity-90">
                <Zap className="h-3 w-3 mr-1" />
                Upgrade Now
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};