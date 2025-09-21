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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex items-center justify-center min-h-screen">
          <div className="space-y-4 w-full max-w-md mx-auto p-6">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
            <div className="grid grid-cols-2 gap-4 mt-8">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
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
    <SidebarProvider>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 w-full">
        <PremiumHeader />
        <div className="flex w-full">
          <PremiumSidebar />
          <main className="flex-1 transition-all duration-300 ease-in-out">
            <div className="p-8 max-w-7xl mx-auto">
              <div className="animate-slide-up">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};