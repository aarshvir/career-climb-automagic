import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  MessageSquare
} from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CVManager } from "./CVManager";

const navigationItems = [
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

export const PremiumSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const [userPlan] = useState("pro"); // TODO: Get from context

  const isActive = (url: string) => location.pathname === url;

  const handleUpgrade = () => {
    navigate("/pricing");
  };

  return (
    <Sidebar className="border-r border-border/50 bg-gradient-to-b from-background to-background/50 backdrop-blur-xl">
      <SidebarHeader className="border-b border-border/50 p-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-display font-semibold text-lg">JobVance</h2>
              <p className="text-xs text-muted-foreground">AI Job Search</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-3 py-2">
            Main Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    className={`group relative w-full justify-start px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      isActive(item.url)
                        ? "bg-gradient-primary text-primary-foreground shadow-premium"
                        : "hover:bg-accent/50 hover:shadow-card"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 ${collapsed ? 'mx-auto' : 'mr-3'} transition-colors`} />
                    {!collapsed && (
                      <>
                        <span className="font-medium">{item.title}</span>
                        {item.badge && (
                          <Badge 
                            variant={isActive(item.url) ? "secondary" : "outline"} 
                            className="ml-auto text-xs h-5"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <>
            <SidebarGroup className="mt-6">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-3 py-2">
                Quick Actions
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="space-y-3 px-3">
                  <CVManager userPlan={userPlan} />
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-6">
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-3 py-2">
                Usage & Plan
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-accent/5 border border-border/50 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm capitalize">{userPlan} Plan</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>AI Searches</span>
                        <span>85/100</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Applications</span>
                        <span>23/50</span>
                      </div>
                      <Progress value={46} className="h-2" />
                    </div>
                  </div>

                  {userPlan === 'free' && (
                    <Button 
                      onClick={handleUpgrade}
                      className="w-full mt-4 bg-gradient-primary hover:opacity-90 text-sm h-8"
                    >
                      <Crown className="h-3 w-3 mr-2" />
                      Upgrade Plan
                    </Button>
                  )}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-4">
        {!collapsed && (
          <Button 
            variant="ghost" 
            className="w-full justify-start text-left hover:bg-accent/50"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-4 w-4 mr-3" />
            Settings
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};