import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import jobvanceIcon from "@/assets/jobvance-icon.png";
import { Link, useLocation, useNavigate } from "react-router-dom";

const Header = () => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  const handleGetStarted = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
        // Navigation will happen after auth state change
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }
    
    navigate('/interest-form');
  };

  const handleDashboard = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
        // Navigation will happen after auth state change
      } catch (error) {
        console.error('Sign in failed:', error);
      }
      return;
    }
    
    navigate('/interest-form');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
          <img src={jobvanceIcon} alt="JobVance" className="h-9 w-9 mr-3" />
          <span className="text-2xl font-bold">
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
    </header>
  );
};

export default Header;