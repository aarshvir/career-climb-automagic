import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import jobvanceHexagon from "@/assets/jobvance-hexagon-transparent.png";
import { Link, useLocation } from "react-router-dom";
import InterestFormDialog from "@/components/InterestFormDialog";
import { useState } from "react";

const Header = () => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const location = useLocation();
  const [showInterestForm, setShowInterestForm] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleGetStarted = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }
    
    setShowInterestForm(true);
  };

  const handleDashboard = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }
    
    setShowInterestForm(true);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity group">
          <div className="relative">
            <img 
              src={jobvanceHexagon} 
              alt="JobVance Logo" 
              className="h-8 w-8 transition-transform group-hover:scale-105"
            />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">
            <span className="text-foreground">Job</span>
            <span className="text-primary">Vance</span>
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

        <div className="flex items-center space-x-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse"></div>
           ) : user ? (
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={handleDashboard}>
                Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={signInWithGoogle}>
                Sign In
              </Button>
              <Button variant="hero" size="sm" onClick={handleGetStarted}>
                Get Started
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <InterestFormDialog 
        open={showInterestForm} 
        onOpenChange={setShowInterestForm} 
      />
    </header>
  );
};

export default Header;