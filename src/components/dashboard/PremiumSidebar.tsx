import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Home,
  LayoutDashboard,
  Briefcase,
  FileText,
  BarChart3,
  Settings,
  Crown,
  Zap,
  Target,
  Calendar,
  MessageSquare
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
import { CVManager } from "./CVManager";
import { Link } from "react-router-dom";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { normalizePlan, getPlanDisplayName } from "@/utils/planUtils";

interface PremiumSidebarProps {
  userPlan?: string | null;
}

// Removed formatPlanName - using getPlanDisplayName from utils instead

const navigationItems = [
  {
    title: "Home",
    icon: Home,
    url: "/",
    badge: null,
  },
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/dashboard",
    badge: null,
  },
  {
    title: "Job Search",
    icon: Briefcase,
    url: "/jobs",
    badge: "12 new",
  },
  {
    title: "Applications",
    icon: Target,
    url: "/applications",
    badge: null,
  },
  {
    title: "Resumes",
    icon: FileText,
    url: "/resumes",
    badge: null,
  },
  {
    title: "Analytics",
    icon: BarChart3,
    url: "/analytics",
    badge: null,
  },
  {
    title: "Calendar",
    icon: Calendar,
    url: "/calendar",
    badge: "2 interviews",
  },
  {
    title: "Messages",
    icon: MessageSquare,
    url: "/messages",
    badge: null,
  },
];

export const PremiumSidebar = ({ userPlan }: PremiumSidebarProps) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPlan = normalizePlan(userPlan);
  const planLimits = usePlanLimits(normalizedPlan);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/10 bg-card/30 backdrop-blur-sm">
      <SidebarHeader className="border-b border-border/10 p-4">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img src={jobvanceIcon} alt="JobVance" className="h-8 w-8" />
          {!isCollapsed && (
            <span className="text-xl font-bold">
              <span className="text-foreground">Job</span>
              <span className="text-primary">Vance.io</span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="p-3 space-y-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Main Navigation
          </SidebarGroupLabel>
          <SidebarMenu className="space-y-1">
            {navigationItems.map((item, index) => {
              const isActive = location.pathname === item.url
              return (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive}
                    className={cn(
                      "w-full justify-start gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "hover:bg-muted/50 hover:translate-x-1"
                    )}
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className={cn("h-4 w-4 transition-transform group-hover:scale-105", isActive && "text-primary-foreground")} />
                      {!isCollapsed && (
                        <>
                          <span className="font-medium">{item.title}</span>
                          {item.badge && (
                            <span className={cn(
                              "ml-auto text-xs px-2 py-0.5 rounded-md font-medium",
                              isActive 
                                ? "bg-primary-foreground/20 text-primary-foreground" 
                                : "bg-primary/10 text-primary"
                            )}>
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {!isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Quick Actions
            </SidebarGroupLabel>
            <div className="space-y-4">
              <CVManager userPlan={normalizedPlan} />
            </div>
          </SidebarGroup>
        )}

        {!isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Your Plan
            </SidebarGroupLabel>
            <div className="space-y-4">
              <div className="premium-card p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-foreground">{getPlanDisplayName(userPlan)}</span>
                  <Crown className="h-5 w-5 text-warning" />
                </div>
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Daily job fetches</span>
                    <span className="font-semibold text-foreground">{planLimits.dailyJobApplications}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>CV uploads</span>
                    <span className="font-semibold text-foreground">{planLimits.resumeVariants}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Plan tier</span>
                    <span className="font-semibold text-foreground capitalize">{normalizedPlan}</span>
                  </div>
                </div>
                {normalizedPlan === 'free' && (
                  <Button size="sm" className="w-full mt-4 bg-gradient-primary hover:opacity-90" onClick={() => navigate('/pricing')}>
                    <Zap className="h-3 w-3 mr-2" />
                    Upgrade Plan
                  </Button>
                )}
              </div>
            </div>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/10 p-4">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 py-3 px-3 rounded-xl hover:bg-muted/50 transition-all duration-200 group"
          onClick={() => navigate('/settings')}
        >
          <Settings className="h-5 w-5 group-hover:scale-110 transition-transform" />
          {!isCollapsed && <span className="font-medium">Settings</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};