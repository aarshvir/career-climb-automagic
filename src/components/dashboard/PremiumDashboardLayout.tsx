import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PremiumHeader } from "./PremiumHeader";
import { PremiumSidebar } from "./PremiumSidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface PremiumDashboardLayoutProps {
  children: ReactNode;
}

export const PremiumDashboardLayout = ({ children }: PremiumDashboardLayoutProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-card-elevated to-primary-soft">
        <div className="flex items-center justify-center min-h-screen">
          <div className="space-y-6 w-full max-w-lg mx-auto p-8">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-primary animate-pulse-glow" />
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-gradient-premium-card animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-xl bg-gradient-premium-card animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen bg-gradient-to-br from-background via-card-elevated to-primary-soft w-full relative overflow-hidden">
        {/* Ambient Background Effects */}
        <div className="absolute inset-0 bg-gradient-hero opacity-[0.02] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-primary opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
        
        {/* Floating Header */}
        <PremiumHeader />
        
        <div className="flex w-full relative">
          <PremiumSidebar />
          <main className="flex-1 transition-all duration-500 ease-out min-h-screen">
            <div className="container mx-auto px-6 lg:px-8 py-8 max-w-7xl">
              <div className="animate-in">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};