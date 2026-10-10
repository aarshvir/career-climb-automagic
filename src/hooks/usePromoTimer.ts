import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const PROMO_DURATION = 3 * 60 * 1000; // 3 minutes in milliseconds

export const usePromoTimer = () => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isPromoActive, setIsPromoActive] = useState(false);

  useEffect(() => {
    if (user && !isPromoActive) {
      // Start timer when user logs in
      const startTime = Date.now();
      const endTime = startTime + PROMO_DURATION;
      
      setIsPromoActive(true);
      setTimeLeft(PROMO_DURATION);

      const timer = setInterval(() => {
        const now = Date.now();
        const remaining = endTime - now;
        
        if (remaining <= 0) {
          setTimeLeft(0);
          setIsPromoActive(false);
          clearInterval(timer);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [user, isPromoActive]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return {
    timeLeft,
    isPromoActive,
    formattedTime: formatTime(timeLeft)
  };
};