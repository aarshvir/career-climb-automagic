import { useMemo } from "react";
import { Bell, Settings, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { PlanName, getPlanLabel } from "@/utils/plans";
import { isDevEnv } from "@/utils/env";

interface PremiumHeaderProps {
  plan?: PlanName;
}

export const PremiumHeader = ({ plan = "free" }: PremiumHeaderProps) => {
  const { user } = useAuth();

  const environmentLabel = useMemo(() => {
    if (typeof window === "undefined") return "Production";
    if (isDevEnv()) {
      return window.location.hostname.includes("lovable") ? "Preview" : "Dev";
    }
    return "Live";
  }, []);

  return (
    <header className="floating-header border-b border-border/10">
      <div className="content-wrapper py-0">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="lg:hidden interactive-element" />
            <div className="hidden items-center gap-3 lg:flex">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  placeholder="Search jobs, companies..."
                  className="w-72 rounded-full bg-muted/30 pl-10 text-sm focus:bg-background/80"
                />
              </div>
              <Badge variant="secondary" className="rounded-full">⌘K</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="rounded-full text-xs font-medium">
              {environmentLabel}
            </Badge>
            <Button variant="ghost" size="icon" className="relative interactive-element" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-from)] text-[10px] text-white">
                3
              </span>
            </Button>
            <Button variant="ghost" size="icon" className="interactive-element" aria-label="Settings">
              <Settings className="h-5 w-5" />
            </Button>
            <Separator orientation="vertical" className="mx-2 hidden h-6 lg:flex" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-sm lg:block">
                <p className="font-semibold leading-none text-foreground">{user?.email?.split("@")[0] || "User"}</p>
                <p className="text-xs text-muted-foreground">{getPlanLabel(plan)} plan</p>
              </div>
              <Badge variant="secondary" className="hidden rounded-full text-xs font-medium lg:flex">
                {getPlanLabel(plan)}
              </Badge>
              <Avatar className="h-9 w-9">
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback className="bg-gradient-to-br from-[var(--brand-from)]/20 to-[var(--brand-to)]/20 text-[var(--brand-from)] font-semibold">
                  {(user?.email?.charAt(0) || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
