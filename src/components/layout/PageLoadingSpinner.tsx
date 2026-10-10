import { Loader2 } from "lucide-react";

const PageLoadingSpinner = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-primary">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <span className="text-lg font-semibold">Preparing your JobVance experience…</span>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        We&apos;re loading the next section for you. Hang tight while we optimize your dashboard and recommendations.
      </p>
    </div>
  );
};

export default PageLoadingSpinner;
