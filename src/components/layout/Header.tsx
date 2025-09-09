import { Button } from "@/components/ui/button";
import logoImage from "@/assets/logo.png";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          <img 
            src={logoImage} 
            alt="JobAssist.ai" 
            className="h-10 w-10 rounded-lg"
          />
          <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            JobAssist.ai
          </span>
        </div>
        
        <nav className="hidden md:flex items-center space-x-8">
          <a href="#home" className="text-sm font-medium hover:text-primary transition-colors">
            Home
          </a>
          <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
            Features
          </a>
          <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
            Pricing
          </a>
          <a href="#about" className="text-sm font-medium hover:text-primary transition-colors">
            About
          </a>
          <a href="/blog" className="text-sm font-medium hover:text-primary transition-colors">
            Blog
          </a>
          <a href="#contact" className="text-sm font-medium hover:text-primary transition-colors">
            Contact
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
          <Button variant="hero" size="sm">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;