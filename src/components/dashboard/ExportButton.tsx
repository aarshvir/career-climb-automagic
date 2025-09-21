import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlanName, canUseFeature, gatedFeatureCopy } from "@/utils/plans";
import { useMutation } from "@tanstack/react-query";
import { DashboardApiError, exportApplications } from "@/lib/dashboard-api";
import { trackEvent } from "@/utils/analytics";

interface ExportButtonProps {
  plan: PlanName;
}

export const ExportButton = ({ plan }: ExportButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const exportMutation = useMutation<{ url: string }, DashboardApiError, void>({
    mutationFn: () => exportApplications(plan),
    onSuccess: (payload) => {
      const link = document.createElement("a");
      link.href = payload.url;
      link.download = "jobvance-applications.csv";
      link.click();
      link.remove();
      toast({
        title: "Export ready",
        description: "Your CSV download has started.",
      });
      trackEvent("export_click", { gated: false });
    },
    onError: (error) => {
      if (error?.code === "UPGRADE_REQUIRED") {
        setOpen(true);
        trackEvent("export_click", { gated: true });
      } else {
        toast({
          title: "Export failed",
          description: "We couldn't export your data right now.",
          variant: "destructive",
        });
      }
    },
  });

  const handleExport = () => {
    if (!canUseFeature(plan, "export")) {
      setOpen(true);
      trackEvent("export_click", { gated: true });
      return;
    }
    exportMutation.mutate();
  };

  return (
    <>
      <Button variant="outline" onClick={handleExport} disabled={exportMutation.isPending} className="rounded-full">
        <Download className="mr-2 h-4 w-4" aria-hidden />
        {exportMutation.isPending ? "Exporting…" : "Export CSV"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Crown className="h-5 w-5 text-[var(--brand-from)]" />
              {gatedFeatureCopy.export.title}
            </DialogTitle>
            <DialogDescription>{gatedFeatureCopy.export.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Pro includes:</p>
            <ul className="space-y-1 pl-4">
              <li>• CSV export of your pipeline</li>
              <li>• 20 applications per day automation</li>
              <li>• ATS optimization and optimized CVs</li>
              <li>• Analytics deep dive dashboard</li>
            </ul>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-full bg-[var(--brand-from)] text-white">Upgrade to Pro</Button>
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setOpen(false)}>
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
