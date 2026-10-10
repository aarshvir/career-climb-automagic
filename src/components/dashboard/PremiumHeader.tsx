import { Bell, Settings, User, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

export const PremiumHeader = () => {
  const { user } = useAuth();

  return (
    <header className="floating-header border-b border-border/10">
      <div className="content-wrapper py-0">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="lg:hidden interactive-element" />
            <div className="hidden lg:flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs, companies..."
                  className="w-72 pl-10 bg-muted/30 border-border/30 focus:bg-background/80 focus:border-primary/30 transition-all duration-200"
                />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                ⌘K
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative interactive-element">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary rounded-full text-xs flex items-center justify-center text-primary-foreground font-medium animate-pulse-glow">
                3
              </span>
            </Button>
            
            <Button variant="ghost" size="icon" className="interactive-element">
              <Settings className="h-5 w-5" />
            </Button>
            
            <Separator orientation="vertical" className="h-6 mx-2" />
            
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold leading-none text-foreground">
                  {user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Premium Plan
                </p>
              </div>
              <Avatar className="h-9 w-9 ring-2 ring-border/20 hover:ring-primary/20 transition-all duration-200">
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                  {(user?.email?.charAt(0) || 'U').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};