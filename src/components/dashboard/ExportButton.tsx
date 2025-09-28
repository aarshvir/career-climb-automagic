import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportButtonProps {
  userPlan: string;
}

export const ExportButton = ({ userPlan }: ExportButtonProps) => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    if (userPlan === 'free') {
      setShowUpgradeModal(true);
      return;
    }

    setExporting(true);
    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In real app, this would generate and download a CSV file
      const csvContent = "data:text/csv;charset=utf-8,Company,Job Title,Applied Date,Status\nTechCorp,Senior Developer,2024-01-15,Interview\n";
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "job_applications.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export successful",
        description: "Your job applications have been exported to CSV."
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting your data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={exporting}
      >
        <Download className="w-4 h-4 mr-2" />
        {exporting ? "Exporting..." : "Export"}
      </Button>

      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-accent" />
              Pro Feature
            </DialogTitle>
            <DialogDescription>
              Exporting your job applications data is available for Pro and Elite subscribers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gradient-card p-4 rounded-lg">
              <h4 className="font-semibold mb-2">With Pro, you can:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Export all job applications to CSV</li>
                <li>• Download detailed ATS reports</li>
                <li>• Access advanced analytics</li>
                <li>• Generate custom reports</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button 
                className="flex-1 bg-gradient-primary hover:opacity-90"
                onClick={() => {
                  setShowUpgradeModal(false);
                  window.location.href = '/pricing?upgrade=true';
                }}
              >
                Upgrade Now
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowUpgradeModal(false)}
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};