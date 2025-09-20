import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import jobvanceIcon from "@/assets/jobvance-icon.png";
import { Link, useLocation } from "react-router-dom";
import { useSignInFlow } from "@/hooks/useSignInFlow";
import { Loader2 } from "lucide-react";
import { AuthStatusIndicator } from "@/components/AuthStatusIndicator";


const Header = () => {
  const { user, signInWithGoogle, signOut, loading, isRetrying, environment } = useAuth();
  const { handlePrimaryAction } = useSignInFlow();
  const location = useLocation();
  

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
             <div className="flex items-center space-x-2 md:space-x-3">
              <AuthStatusIndicator />
              <Button variant="ghost" size="sm" onClick={handleDashboard}>
                Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 md:space-x-3">
              <AuthStatusIndicator />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={signInWithGoogle}
                disabled={isRetrying}
              >
                Sign In
              </Button>
              <Button 
                variant="hero" 
                size="sm" 
                onClick={handleGetStarted}
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