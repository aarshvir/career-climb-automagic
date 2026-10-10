import { ReactNode, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ModernSidebar, MobileSidebarContent } from "./ModernSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface PremiumDashboardLayoutProps {
  children: ReactNode;
  userPlan?: string | null;
}

export const PremiumDashboardLayout = ({ children, userPlan }: PremiumDashboardLayoutProps) => {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Ambient Background */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-l from-success/6 via-success/3 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="section-container w-full">
            <div className="space-y-8 w-full max-w-4xl mx-auto">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-primary animate-pulse-glow" />
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
              {/* Loading KPI skeletons already use the correct responsive grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-32 rounded-xl bg-card/50 animate-pulse shimmer" />
                ))}
              </div>
              <div className="h-80 rounded-xl bg-card/50 animate-pulse shimmer" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      {/* ── Mobile sidebar drawer ─────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          // override the default padding so our content fills the panel edge-to-edge
          className="p-0 w-[280px] sm:w-[320px]"
        >
          <MobileSidebarContent
            userPlan={userPlan}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="min-h-screen flex w-full bg-background">
        {/* Ambient Background */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-l from-success/6 via-success/3 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-gradient-radial from-primary/3 via-transparent to-transparent rounded-full blur-3xl" />
        </div>

        {/* ── Desktop sidebar (hidden on mobile via ModernSidebar's own class) ── */}
        <ModernSidebar userPlan={userPlan} />

        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          {/* ── Mobile top bar with hamburger ───────────────────────── */}
          <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-background/95 backdrop-blur-sm border-b border-border px-4 h-14 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="h-11 w-11 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-foreground text-sm">Dashboard</span>
          </div>

          <main className="flex-1 overflow-auto pt-20 lg:pt-24">
            <div className="content-wrapper min-h-full">
              <div className="animate-fade-in-up">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
