import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Search, Clock, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface JobBatch {
  id: string;
  batch_date: string;
  status: string;
  total_jobs_scraped: number;
  triggered_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface JobFetchTriggerProps {
  userPlan: string | null;
}

export function JobFetchTrigger({ userPlan }: JobFetchTriggerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [triggering, setTriggering] = useState(false);

  const triggerJobFetch = async () => {
    if (!user) return;

    setTriggering(true);
    try {
      // Create a new job run record
      const { data: jobRun, error: runError } = await supabase
        .from('job_runs')
        .insert({ user_id: user.id, run_status: 'pending' })
        .select()
        .single();

      if (runError) throw runError;

      // Call the Supabase Edge Function to trigger the Make.com webhook
      const { error: functionError } = await supabase.functions.invoke('trigger-make-run', {
        body: { runId: jobRun.id },
      });

      if (functionError) {
        await supabase
          .from('job_runs')
          .update({ run_status: 'failed' })
          .eq('id', jobRun.id);
        throw functionError;
      }
      
      console.log('Job fetch triggered for run:', jobRun.id);

      toast({
        title: "Job Fetch Triggered",
        description: "Your daily job search has been initiated. Results will appear shortly.",
      });

    } catch (error) {
      console.error('Error triggering job fetch:', error);
      toast({
        title: "Failed to Trigger",
        description: "Failed to start job fetching. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'processing':
        return <Zap className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'yellow';
      case 'processing':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Daily Job Fetch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded mb-2"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Daily Job Fetch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {todaysBatch ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Today's Status:</span>
              <Badge 
                variant="outline" 
                className="flex items-center gap-1"
                style={{ 
                  borderColor: `hsl(var(--${getStatusColor(todaysBatch.status)}))`,
                  color: `hsl(var(--${getStatusColor(todaysBatch.status)}))` 
                }}
              >
                {getStatusIcon(todaysBatch.status)}
                {todaysBatch.status.charAt(0).toUpperCase() + todaysBatch.status.slice(1)}
              </Badge>
            </div>

            {todaysBatch.status === 'processing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing jobs...</span>
                  <span>{todaysBatch.total_jobs_scraped} found</span>
                </div>
                <Progress value={65} className="h-2" />
              </div>
            )}

            {todaysBatch.status === 'completed' && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Completed! Found {todaysBatch.total_jobs_scraped} jobs
                  </span>
                </div>
              </div>
            )}

            {todaysBatch.status === 'failed' && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Failed: {todaysBatch.error_message || 'Unknown error'}
                  </span>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2"
                  onClick={triggerJobFetch}
                  disabled={triggering}
                >
                  Retry
                </Button>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Triggered at: {new Date(todaysBatch.triggered_at).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-center py-4">
              <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-4">
                Start your daily job search to discover new opportunities
              </p>
              <Button 
                onClick={triggerJobFetch}
                disabled={triggering || userPlan === 'free'}
                className="w-full"
              >
                {triggering ? (
                  <>
                    <Zap className="h-4 w-4 mr-2 animate-pulse" />
                    Triggering...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Fetch Today's Jobs
                  </>
                )}
              </Button>
            </div>
            
            <div className="text-xs text-center text-muted-foreground">
              Available once per day • {userPlan} plan
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}