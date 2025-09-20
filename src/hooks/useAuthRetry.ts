import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface AuthRetryState {
  retryCount: number;
  isRetrying: boolean;
  lastError: Error | null;
}

export const useAuthRetry = () => {
  const [retryState, setRetryState] = useState<AuthRetryState>({
    retryCount: 0,
    isRetrying: false,
    lastError: null,
  });
  const { toast } = useToast();

  const executeWithRetry = useCallback(async (
    authFunction: () => Promise<void>,
    maxRetries: number = 3,
    retryMessage?: string
  ) => {
    setRetryState(prev => ({ ...prev, isRetrying: true }));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await authFunction();
        
        // Success - reset retry state
        setRetryState({
          retryCount: 0,
          isRetrying: false,
          lastError: null,
        });
        
        return;
      } catch (error) {
        const errorObj = error as Error;
        console.warn(`Auth attempt ${attempt} failed:`, errorObj);
        
        setRetryState(prev => ({
          ...prev,
          retryCount: attempt,
          lastError: errorObj,
        }));

        if (attempt === maxRetries) {
          // Final failure
          setRetryState(prev => ({ ...prev, isRetrying: false }));
          
          toast({
            title: 'Authentication Failed',
            description: retryMessage || `Failed after ${maxRetries} attempts. Please try again later.`,
            variant: 'destructive',
          });
          
          throw errorObj;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }, [toast]);

  const resetRetryState = useCallback(() => {
    setRetryState({
      retryCount: 0,
      isRetrying: false,
      lastError: null,
    });
  }, []);

  return {
    ...retryState,
    executeWithRetry,
    resetRetryState,
  };
};