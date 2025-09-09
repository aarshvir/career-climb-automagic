import { Button } from "@/components/ui/button";
import logoImage from "@/assets/logo.png";
import { Twitter, Linkedin, Mail, MapPin, Phone } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-secondary/20 border-t border-border/50">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <img 
                src={logoImage} 
                alt="JobAssist.ai" 
                className="h-8 w-8 rounded-lg"
              />
              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                JobAssist.ai
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              AI-powered job application automation platform helping professionals land their dream jobs faster.
            </p>
            <div className="flex space-x-4">
              <Button variant="ghost" size="icon">
                <Twitter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Linkedin className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-primary transition-colors">Pricing</a></li>
              <li><a href="/dashboard" className="hover:text-primary transition-colors">Dashboard</a></li>
              <li><a href="/integrations" className="hover:text-primary transition-colors">Integrations</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="/about" className="hover:text-primary transition-colors">About Us</a></li>
              <li><a href="/blog" className="hover:text-primary transition-colors">Blog</a></li>
              <li><a href="/careers" className="hover:text-primary transition-colors">Careers</a></li>
              <li><a href="/contact" className="hover:text-primary transition-colors">Contact</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4">Support</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="/help" className="hover:text-primary transition-colors">Help Center</a></li>
              <li><a href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="/refund" className="hover:text-primary transition-colors">Refund Policy</a></li>
            </ul>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                support@jobassist.ai
              </div>
              <div className="flex items-center">
                <Phone className="h-4 w-4 mr-2" />
                +1 (555) 123-4567
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground">
            © 2024 JobAssist.ai. All rights reserved.
          </p>
          <div className="flex items-center space-x-4 mt-4 md:mt-0 text-sm text-muted-foreground">
            <span>🇺🇸 United States</span>
            <span>🇪🇺 Europe</span>
            <span>🇦🇪 UAE</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;