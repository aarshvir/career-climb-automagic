import { Gift } from "lucide-react";

const PromoStrip = () => {
  return (
    <div className="bg-gradient-primary text-primary-foreground py-2 overflow-hidden relative">
      <div className="animate-[slide-left_20s_linear_infinite] whitespace-nowrap">
        <div className="inline-flex items-center space-x-8 px-4">
          <div className="flex items-center space-x-2">
            <Gift className="h-4 w-4" />
            <span className="text-sm font-medium">
              Exclusive offer: Try risk free. Free 7 day trial, no credit card details required
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Gift className="h-4 w-4" />
            <span className="text-sm font-medium">
              Exclusive offer: Try risk free. Free 7 day trial, no credit card details required
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Gift className="h-4 w-4" />
            <span className="text-sm font-medium">
              Exclusive offer: Try risk free. Free 7 day trial, no credit card details required
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Gift className="h-4 w-4" />
            <span className="text-sm font-medium">
              Exclusive offer: Try risk free. Free 7 day trial, no credit card details required
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromoStrip;