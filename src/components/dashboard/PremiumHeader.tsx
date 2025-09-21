import { Bell, Search, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

export const PremiumHeader = () => {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 floating-header">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Left Section */}
          <div className="flex items-center gap-6">
            <SidebarTrigger className="lg:hidden hover-lift p-2 rounded-lg hover:bg-primary-soft/50 transition-snappy" />
            
            {/* Premium Search */}
            <div className="relative hidden md:block">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search jobs, companies, skills..." 
                className="pl-12 pr-4 w-[400px] glass-morphism border-border-elevated/50 focus:border-primary/50 focus:ring-primary/20 text-sm transition-premium"
              />
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {/* Action Buttons */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="relative hover-lift p-2.5 rounded-lg hover:bg-primary-soft/50 transition-snappy group"
            >
              <Bell className="h-4 w-4 group-hover:text-primary transition-colors" />
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-gradient-warning border-0 animate-bounce-gentle"
              >
                3
              </Badge>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="hover-lift p-2.5 rounded-lg hover:bg-primary-soft/50 transition-snappy group"
            >
              <Settings className="h-4 w-4 group-hover:text-primary transition-colors" />
            </Button>

            {/* User Profile */}
            <div className="flex items-center gap-4 pl-4 border-l border-border-elevated/50">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-display">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  Premium User
                </p>
              </div>
              <Avatar className="h-9 w-9 ring-2 ring-primary/30 hover-lift transition-premium cursor-pointer">
                <AvatarImage src="" alt={user?.email || ''} />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground font-medium">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};