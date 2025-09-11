import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import logoImage from "@/assets/logo.png";
import { Link, useLocation } from "react-router-dom";

const Header = () => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-2">
          <img 
            src={logoImage} 
            alt="JobAssist.ai" 
            className="h-10 w-10 rounded-lg"
          />
          <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            JobAssist.ai
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
            to="/#pricing" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/') ? 'text-primary' : ''}`}
          >
            Pricing
          </Link>
          <Link 
            to="/about" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/about') ? 'text-primary' : ''}`}
          >
            About
          </Link>
          <Link 
            to="/blog" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/blog') ? 'text-primary' : ''}`}
          >
            Blog
          </Link>
          <Link 
            to="/contact" 
            className={`text-sm font-medium hover:text-primary transition-colors ${isActive('/contact') ? 'text-primary' : ''}`}
          >
            Contact
          </Link>
        </nav>

        <div className="flex items-center space-x-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse"></div>
          ) : user ? (
            <div className="flex items-center space-x-3">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  Dashboard
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={signInWithGoogle}>
                Sign In
              </Button>
              <Button variant="hero" size="sm" onClick={signInWithGoogle}>
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