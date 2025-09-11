import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface LemonSqueezyCheckoutProps {
  variantId: string;
  planName: string;
  children?: React.ReactNode;
  className?: string;
}

const LemonSqueezyCheckout = ({ 
  variantId, 
  planName, 
  children, 
  className 
}: LemonSqueezyCheckoutProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleCheckout = async () => {
    setIsLoading(true);
    
    try {
      // Open Lemon Squeezy checkout
      const checkoutUrl = `https://your-store.lemonsqueezy.com/checkout/buy/${variantId}`;
      window.open(checkoutUrl, '_blank');
      
      toast({
        title: "Redirecting to checkout",
        description: `Opening ${planName} checkout in a new tab`,
      });
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: "Checkout error",
        description: "Failed to open checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleCheckout}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? "Opening checkout..." : (children || "Subscribe")}
    </Button>
  );
};

export default LemonSqueezyCheckout;