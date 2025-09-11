import { useState, useEffect } from 'react';
import { useToast } from './use-toast';

interface Subscription {
  id: string;
  status: 'active' | 'cancelled' | 'expired' | 'paused';
  planName: string;
  currentPeriodEnd: string;
}

export const useLemonSqueezy = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Check URL for successful payment
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const cancelled = urlParams.get('cancelled');

    if (success) {
      toast({
        title: "Payment successful!",
        description: "Your subscription has been activated.",
      });
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (cancelled) {
      toast({
        title: "Payment cancelled",
        description: "You can try again anytime.",
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast]);

  // Mock subscription check - replace with actual API call
  useEffect(() => {
    const checkSubscription = async () => {
      setIsLoading(true);
      try {
        // This would normally be an API call to your backend
        // that checks the user's subscription status with Lemon Squeezy
        
        // For now, simulate loading
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock subscription data - replace with real API response
        const mockSubscription = localStorage.getItem('lemon_subscription');
        if (mockSubscription) {
          setSubscription(JSON.parse(mockSubscription));
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSubscription();
  }, []);

  const updateSubscription = (newSubscription: Subscription) => {
    setSubscription(newSubscription);
    localStorage.setItem('lemon_subscription', JSON.stringify(newSubscription));
  };

  return {
    subscription,
    isLoading,
    updateSubscription,
  };
};