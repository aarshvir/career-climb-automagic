import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  BarChart3,
  Settings,
  Crown,
  Zap,
  Target,
  Calendar,
  MessageSquare,
  LogOut,
} from "lucide-react";
import jobvanceIcon from "@/assets/jobvance-icon.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { normalizePlan, getPlanDisplayName } from "@/utils/planUtils";
import { useAuth } from "@/contexts/AuthContext";

interface ModernSidebarProps {
  userPlan?: string | null;
}

const navigationItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard", badge: null },
  { title: "Job Search", icon: Briefcase, url: "/jobs", badge: "12 new" },
  { title: "Applications", icon: Target, url: "/applications", badge: null },
  { title: "Resumes", icon: FileText, url: "/resumes", badge: null },
  { title: "Analytics", icon: BarChart3, url: "/analytics", badge: null },
  { title: "Calendar", icon: Calendar, url: "/calendar", badge: "2 interviews" },
  { title: "Messages", icon: MessageSquare, url: "/messages", badge: null },
];

// ─── Desktop sidebar (lg+ only) ────────────────────────────────────────────
export const ModernSidebar = ({ userPlan }: ModernSidebarProps) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const normalizedPlan = normalizePlan(userPlan);
  const planLimits = usePlanLimits(normalizedPlan);

  return (
    // hidden on mobile – Sheet handles it; shown from lg onwards
    <Sidebar collapsible="icon" className="hidden lg:flex border-r border-gray-200 bg-white">
      <SidebarHeader className="border-b border-gray-200 p-6">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img src={jobvanceIcon} alt="JobVance" className="h-8 w-8 shrink-0" />
          {!isCollapsed && (
            <span className="text-xl font-bold text-gray-900">
              <span className="text-gray-900">Job</span>
              <span className="text-blue-600">Vance.io</span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="p-4 space-y-6">
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu className="space-y-1">
            {navigationItems.map((item, index) => {
              const isActive = location.pathname === item.url;
              return (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className={cn(
                      "w-full justify-start gap-3 py-3 px-3 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "hover:bg-gray-50 text-gray-700"
                    )}
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-blue-600")} />
                      {!isCollapsed && (
                        <>
                          <span className="font-medium">{item.title}</span>
                          {item.badge && (
                            <span
                              className={cn(
                                "ml-auto text-xs px-2 py-1 rounded-full font-medium",
                                isActive
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-600"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Plan Status */}
        {!isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Your Plan
            </SidebarGroupLabel>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">{getPlanDisplayName(userPlan)}</span>
                <Crown className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Daily job fetches</span>
                  <span className="font-semibold text-gray-900">{planLimits.dailyJobApplications}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>CV uploads</span>
                  <span className="font-semibold text-gray-900">{planLimits.resumeVariants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Plan tier</span>
                  <span className="font-semibold text-gray-900 capitalize">{normalizedPlan}</span>
                </div>
              </div>
              {normalizedPlan === "free" && (
                <Button
                  size="sm"
                  className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                  onClick={() => navigate("/pricing")}
                >
                  <Zap className="h-3 w-3 mr-2" />
                  Upgrade Plan
                </Button>
              )}
            </div>
          </SidebarGroup>
        )}

        {/* Quick Actions */}
        {!isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick Actions
            </SidebarGroupLabel>
            <SidebarGroupContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-sm border-gray-200 hover:bg-gray-50 min-h-[44px]"
                onClick={() => navigate("/resumes")}
              >
                <FileText className="h-4 w-4" />
                Manage Resumes
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-sm border-gray-200 hover:bg-gray-50 min-h-[44px]"
                onClick={() => navigate("/preferences")}
              >
                <Target className="h-4 w-4" />
                Job Preferences
              </Button>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-gray-200 p-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 text-gray-700 min-h-[44px]"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="font-medium">Settings</span>}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 text-gray-700 min-h-[44px]"
            onClick={() => signOut()}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="font-medium">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

// ─── Mobile sidebar content (used inside Sheet, no SidebarProvider needed) ─
interface MobileSidebarContentProps {
  userPlan?: string | null;
  onClose?: () => void;
}

export const MobileSidebarContent = ({ userPlan, onClose }: MobileSidebarContentProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const normalizedPlan = normalizePlan(userPlan);
  const planLimits = usePlanLimits(normalizedPlan);

  const handleNavigate = (url: string) => {
    navigate(url);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 p-5 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          onClick={onClose}
        >
          <img src={jobvanceIcon} alt="JobVance" className="h-8 w-8 shrink-0" />
          <span className="text-xl font-bold text-gray-900">
            <span className="text-gray-900">Job</span>
            <span className="text-blue-600">Vance.io</span>
          </span>
        </Link>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Navigation */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Navigation
          </p>
          <div className="space-y-1">
            {navigationItems.map((item, index) => {
              const isActive = location.pathname === item.url;
              return (
                <button
                  key={index}
                  onClick={() => handleNavigate(item.url)}
                  className={cn(
                    "w-full flex items-center gap-3 py-3 px-3 rounded-lg transition-all duration-200 min-h-[44px]",
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "hover:bg-gray-50 text-gray-700"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-blue-600")} />
                  <span className="font-medium flex-1 text-left">{item.title}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        "text-xs px-2 py-1 rounded-full font-medium",
                        isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Plan Status */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Your Plan
          </p>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900">
                {getPlanDisplayName(userPlan)}
              </span>
              <Crown className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span>Daily job fetches</span>
                <span className="font-semibold text-gray-900">{planLimits.dailyJobApplications}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>CV uploads</span>
                <span className="font-semibold text-gray-900">{planLimits.resumeVariants}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Plan tier</span>
                <span className="font-semibold text-gray-900 capitalize">{normalizedPlan}</span>
              </div>
            </div>
            {normalizedPlan === "free" && (
              <Button
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                onClick={() => handleNavigate("/pricing")}
              >
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Quick Actions
          </p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm border-gray-200 hover:bg-gray-50 min-h-[44px]"
              onClick={() => handleNavigate("/resumes")}
            >
              <FileText className="h-4 w-4" />
              Manage Resumes
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sm border-gray-200 hover:bg-gray-50 min-h-[44px]"
              onClick={() => handleNavigate("/preferences")}
            >
              <Target className="h-4 w-4" />
              Job Preferences
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4 shrink-0">
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 text-gray-700 min-h-[44px]"
            onClick={() => handleNavigate("/settings")}
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span className="font-medium">Settings</span>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-50 text-gray-700 min-h-[44px]"
            onClick={() => signOut()}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="font-medium">Sign Out</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
