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
  onFetchJobs: () => Promise<number>;
}

export const JobFetchTrigger = ({ onFetchJobs }: JobFetchTriggerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [todaysBatch, setTodaysBatch] = useState<JobBatch | null>(null);
  
  useEffect(() => {
    if (!user) return;
    
    const fetchTodaysBatch = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('daily_job_batches')
        .select('*')
        .eq('user_id', user.id)
        .eq('batch_date', today)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching today\'s batch:', error);
        return;
      }
      
      setTodaysBatch(data);
    };
    
    fetchTodaysBatch();
  }, [user]);

  const handleTriggerFetch = async () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to fetch jobs.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Create or update today's batch
      const { data: batch, error: batchError } = await supabase
        .from('daily_job_batches')
        .upsert({
          user_id: user.id,
          batch_date: today,
          status: 'pending',
          triggered_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,batch_date',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (batchError) {
        console.error('Error creating batch:', batchError);
        toast({
          title: 'Error',
          description: 'Failed to start job fetch. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setTodaysBatch(batch);

      // Call the fetch function
      await onFetchJobs();
      
      // Update batch status
      const { error: updateError } = await supabase
        .from('daily_job_batches')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_jobs_scraped: 20 // Placeholder
        })
        .eq('id', batch.id);

      if (updateError) {
        console.error('Error updating batch:', updateError);
      }

      // Refresh the batch data
      const { data: updatedBatch } = await supabase
        .from('daily_job_batches')
        .select('*')
        .eq('id', batch.id)
        .single();
      
      if (updatedBatch) {
        setTodaysBatch(updatedBatch);
      }

      toast({
        title: 'Jobs fetched successfully!',
        description: 'New job opportunities have been added to your dashboard.',
      });
    } catch (error) {
      console.error('Error during job fetch:', error);
      toast({
        title: 'Fetch failed',
        description: 'Unable to fetch jobs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'pending':
        return 'yellow';
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
            <Search className="w-5 h-5" />
            Daily Job Fetch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />
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
                {todaysBatch.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                {todaysBatch.status === 'pending' && <Clock className="w-3 h-3" />}
                {todaysBatch.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                {todaysBatch.status}
              </Badge>
            </div>

            {todaysBatch.status === 'completed' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Jobs Found:</span>
                  <span className="font-medium">{todaysBatch.total_jobs_scraped}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Completed:</span>
                  <span className="text-muted-foreground">
                    {todaysBatch.completed_at ? new Date(todaysBatch.completed_at).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              </div>
            )}

            {todaysBatch.status === 'pending' && (
              <div className="space-y-2">
                <Progress value={45} className="w-full" />
                <p className="text-sm text-muted-foreground">
                  Searching for new opportunities...
                </p>
              </div>
            )}

            {todaysBatch.status === 'failed' && todaysBatch.error_message && (
              <div className="text-sm text-destructive">
                Error: {todaysBatch.error_message}
              </div>
            )}

            <Button 
              onClick={handleTriggerFetch}
              disabled={loading || todaysBatch.status === 'pending'}
              className="w-full"
              variant={todaysBatch.status === 'completed' ? 'outline' : 'default'}
            >
              <Zap className="w-4 h-4 mr-2" />
              {todaysBatch.status === 'completed' ? 'Fetch Again' : 'Retry Fetch'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No jobs fetched today. Start your daily job search now!
            </p>
            <Button 
              onClick={handleTriggerFetch}
              disabled={loading}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              {loading ? 'Fetching...' : 'Fetch Today\'s Jobs'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};