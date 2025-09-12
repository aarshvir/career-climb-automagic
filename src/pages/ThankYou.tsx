import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ThankYou = () => {
  return (
    <>
      <SEOHead 
        title="Thank You - JobVance"
        description="Thank you for your interest in JobVance. Our team will get back to you soon."
        keywords="thank you, job automation, ai job application"
        canonical="https://jobvance.io/thank-you"
      />
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
              <h1 className="text-4xl font-bold mb-4">Thank You!</h1>
              <p className="text-lg text-muted-foreground">
                Thanks for your interest in JobVance. Our team will get back to you soon.
              </p>
            </div>

            <Card className="bg-gradient-card shadow-card mb-8">
              <CardHeader>
                <CardTitle>What happens next?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-left">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">1</div>
                  <div>
                    <h3 className="font-medium">Review Your Information</h3>
                    <p className="text-sm text-muted-foreground">Our team will review your preferences and career objectives.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">2</div>
                  <div>
                    <h3 className="font-medium">Personalized Consultation</h3>
                    <p className="text-sm text-muted-foreground">We'll reach out to discuss how JobVance can best serve your job search needs.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium mt-0.5">3</div>
                  <div>
                    <h3 className="font-medium">Get Started</h3>
                    <p className="text-sm text-muted-foreground">Once approved, you'll receive access to start your automated job search.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Link>
              </Button>
              <Button asChild>
                <Link to="/how-it-works">
                  Learn How It Works
                </Link>
              </Button>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </>
  );
};

export default ThankYou;