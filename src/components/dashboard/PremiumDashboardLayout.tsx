import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ModernSidebar } from "./ModernSidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface PremiumDashboardLayoutProps {
  children: ReactNode;
  userPlan?: string | null;
}

export const PremiumDashboardLayout = ({ children, userPlan }: PremiumDashboardLayoutProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Ambient Background */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-l from-success/6 via-success/3 to-transparent rounded-full blur-3xl"></div>
        </div>
        
        <div className="flex items-center justify-center min-h-screen">
          <div className="section-container">
            <div className="space-y-8 w-full max-w-4xl mx-auto">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-primary animate-pulse-glow" />
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-64 mx-auto" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <div className="min-h-screen flex w-full bg-background">
        {/* Ambient Background */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gradient-to-r from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-l from-success/6 via-success/3 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-gradient-radial from-primary/3 via-transparent to-transparent rounded-full blur-3xl"></div>
        </div>
        
        <ModernSidebar userPlan={userPlan} />

        <div className="flex-1 flex flex-col min-h-screen">
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