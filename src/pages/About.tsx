import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, Target, Users, Zap, ArrowRight } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { SeoHead } from '@/components/SEOHead'
import PromoStrip from '@/components/PromoStrip'
import organizationData from '../../public/jsonld/organization.json';

const About = () => {
  const stats = [
    { number: '50,000+', label: 'Job Applications Sent' },
    { number: '85%', label: 'Interview Success Rate' },
    { number: '10,000+', label: 'Happy Job Seekers' },
    { number: '500+', label: 'Partner Companies' }
  ]

  const values = [
    {
      icon: Target,
      title: 'Precision Targeting',
      description: 'Our AI analyzes job descriptions and tailors your applications for maximum impact and relevance.'
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Apply to 20+ jobs daily while you focus on interview preparation and skill development.'
    },
    {
      icon: Users,
      title: 'Human-Centered',
      description: 'We believe technology should amplify human potential, not replace it. Every application is personally crafted.'
    },
    {
      icon: CheckCircle,
      title: 'Quality Assured',
      description: 'Every application is optimized for ATS systems and reviewed for quality before submission.'
    }
  ]

  const team = [
    {
      name: 'Alex Chen',
      role: 'CEO & Founder',
      bio: 'Former LinkedIn recruiter with 10+ years in talent acquisition.',
      image: '/api/placeholder/150/150'
    },
    {
      name: 'Sarah Kim',
      role: 'CTO',
      bio: 'AI/ML expert with experience at Google and Microsoft.',
      image: '/api/placeholder/150/150'
    },
    {
      name: 'Marcus Rodriguez',
      role: 'Head of Product',
      bio: 'Product strategist who helped scale multiple unicorn startups.',
      image: '/api/placeholder/150/150'
    }
  ]

  return (
    <>
      <SeoHead
        title="About JobVance - AI Job Application Automation Company"
        description="Learn about JobVance's mission to revolutionize job searching with AI automation. Meet our team and discover how we help professionals find their dream jobs faster."
        canonicalPath="/about"
        structuredData={organizationData}
      />
      <div className="min-h-screen bg-background">
        <PromoStrip />
        <Header />
      
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-primary overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <Badge className="bg-white/20 text-white border-white/30 mb-6">
              Our Story
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              About JobVance: Revolutionizing Job Search with AI
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              We're on a mission to eliminate the tedious parts of job hunting, 
              so you can focus on what matters: landing your dream role.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl lg:text-5xl font-bold text-primary mb-2">
                  {stat.number}
                </div>
                <div className="text-muted-foreground font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-5xl font-bold mb-6">
                Our Mission
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Job searching shouldn't be a full-time job. We believe talented individuals 
                deserve to spend their time preparing for interviews and building skills, 
                not manually filling out endless application forms.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
              <div>
                <h3 className="text-2xl font-bold mb-6">The Problem We Solve</h3>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    The modern job market is broken. Talented professionals spend 80% of their 
                    job search time on administrative tasks: browsing job boards, customizing 
                    resumes, and filling out repetitive application forms.
                  </p>
                  <p>
                    Meanwhile, the best opportunities get hundreds of applications within hours. 
                    By the time you manually apply, you're already competing with hundreds of others.
                  </p>
                  <p>
                    JobVance.io changes this dynamic. Our AI works 24/7 to find, match, and 
                    apply to the perfect roles for you, giving you a competitive edge in today's 
                    fast-paced job market.
                  </p>
                </div>
              </div>
              <div className="relative">
                <Card className="p-8 bg-gradient-subtle border-0 shadow-elegant">
                  <CardContent className="p-0">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-primary mb-2">24/7</div>
                      <div className="text-muted-foreground">
                        Automated job searching while you sleep
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold mb-6">
              What Drives Us
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Our core values shape everything we do, from product development to customer support.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <Card key={index} className="p-6 text-center hover:shadow-lg transition-all duration-300">
                <CardContent className="p-0">
                  <value.icon className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-3">{value.title}</h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold mb-6">
              Meet the Team
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              We're a team of experienced professionals who've been on both sides of the hiring process.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {team.map((member, index) => (
              <Card key={index} className="text-center p-6 hover:shadow-lg transition-all duration-300">
                <CardContent className="p-0">
                  <div className="w-24 h-24 bg-gradient-primary rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{member.name}</h3>
                  <p className="text-primary font-medium mb-3">{member.role}</p>
                  <p className="text-muted-foreground text-sm">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-primary">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-3xl lg:text-5xl font-bold mb-6">
              Ready to Transform Your Job Search?
            </h2>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Join thousands of professionals who've accelerated their career growth with AI-powered job applications.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90">
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

        <Footer />
      </div>
    </>
  )
}

export default About