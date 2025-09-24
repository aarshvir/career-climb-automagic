import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import jobvanceIcon from "@/assets/jobvance-icon.png";
import { Link, useLocation } from "react-router-dom";
import { useSignInFlow } from "@/hooks/useSignInFlow";
import { useNavigate } from "react-router-dom";
import { Loader2, User, LogOut, Settings, BarChart3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


const Header = () => {
  const { user, signOut, loading, isRetrying, environment } = useAuth();
  const { handlePrimaryAction } = useSignInFlow();
  const location = useLocation();
  const navigate = useNavigate();
  

  const isActive = (path: string) => location.pathname === path;

  const handleGetStarted = () => {
    handlePrimaryAction();
  };

  const handleDashboard = () => {
    handlePrimaryAction();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
          <img src={jobvanceIcon} alt="JobVance" className="h-8 w-8 mr-2 md:mr-3" />
          <span className="text-xl md:text-2xl font-bold">
            <span className="text-foreground">Job</span>
            <span className="text-primary">Vance.io</span>
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center space-x-8">
          <Link 
            to="/" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/') ? 'text-primary' : ''}`}
          >
            Home
          </Link>
          <Link 
            to="/#features" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/') ? 'text-primary' : ''}`}
          >
            Features
          </Link>
          <Link 
            to="/how-it-works" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/how-it-works') ? 'text-primary' : ''}`}
          >
            How It Works
          </Link>
          <Link 
            to="/pricing" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/pricing') ? 'text-primary' : ''}`}
          >
            Pricing
          </Link>
          <Link 
            to="/blog" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/blog') ? 'text-primary' : ''}`}
          >
            Blog
          </Link>
          <Link 
            to="/faq" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/faq') ? 'text-primary' : ''}`}
          >
            FAQ
          </Link>
          {user && (
            <Link 
              to="/dashboard" 
              className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/dashboard') ? 'text-primary' : ''}`}
            >
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center space-x-2 md:space-x-4">
          {loading || isRetrying ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                {isRetrying ? 'Retrying...' : 'Loading...'}
              </span>
            </div>
           ) : user ? (
             <div className="flex items-center space-x-2">
               {/* Show "Go to Dashboard" button on non-dashboard pages */}
               {location.pathname !== '/dashboard' && (
                 <Button 
                   variant="default" 
                   size="sm" 
                   onClick={handleDashboard}
                   className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                 >
                   <BarChart3 className="mr-2 h-4 w-4" />
                   Go to Dashboard
                 </Button>
               )}
               
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                     <Avatar className="h-8 w-8">
                       <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email || "User"} />
                       <AvatarFallback>
                         {user.email ? user.email.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                       </AvatarFallback>
                     </Avatar>
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent className="w-56" align="end" forceMount>
                   <div className="flex items-center justify-start gap-2 p-2">
                     <div className="flex flex-col space-y-1 leading-none">
                       <p className="font-medium">{user.email}</p>
                       <p className="w-[200px] truncate text-sm text-muted-foreground">
                         {user.user_metadata?.full_name || "User"}
                       </p>
                     </div>
                   </div>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={handleDashboard}>
                     <BarChart3 className="mr-2 h-4 w-4" />
                     <span>Dashboard</span>
                   </DropdownMenuItem>
                   <DropdownMenuItem>
                     <Settings className="mr-2 h-4 w-4" />
                     <span>Settings</span>
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem onClick={signOut}>
                     <LogOut className="mr-2 h-4 w-4" />
                     <span>Sign out</span>
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/auth')}
                disabled={isRetrying}
              >
                Sign In
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => navigate('/auth')}
                disabled={isRetrying}
              >
                Get Started
              </Button>
            </div>
          )}
        </div>
      </div>
      
    </header>
  );
};

export default Header;