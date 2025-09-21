import { useState } from "react";
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
  Sparkles
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CVManager } from "./CVManager";
import { Link } from "react-router-dom";

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
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/10 bg-card/30 backdrop-blur-sm">
      <SidebarHeader className="border-b border-border/10 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-hover rounded-lg flex items-center justify-center shadow-md">
            <span className="text-primary-foreground font-bold text-sm">J</span>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-base font-semibold text-foreground">JobVance</span>
              <span className="text-xs text-muted-foreground">AI Job Search</span>
            </div>
          )}
        </div>
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
              <CVManager userPlan="premium" />
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
                  <span className="text-sm font-semibold text-foreground">Premium Plan</span>
                  <Crown className="h-5 w-5 text-warning" />
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Job Applications</span>
                      <span className="text-xs font-semibold text-foreground">150/200</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-2">
                      <div className="bg-gradient-to-r from-primary to-primary-hover h-2 rounded-full transition-all duration-500" style={{ width: '75%' }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-muted-foreground">AI Resumes</span>
                      <span className="text-xs font-semibold text-foreground">12/20</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-2">
                      <div className="bg-gradient-to-r from-success to-info h-2 rounded-full transition-all duration-500" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                </div>
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