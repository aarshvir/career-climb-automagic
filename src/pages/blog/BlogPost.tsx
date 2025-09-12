import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InterestFormDialog from "@/components/InterestFormDialog";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { posts } from "./posts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, User, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import NotFound from "@/pages/NotFound";

const BlogPost = () => {
  const { slug } = useParams();
  const post = posts.find(p => p.slug === slug);
  const { user, signInWithGoogle } = useAuth();
  const [showInterestForm, setShowInterestForm] = useState(false);

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

  useEffect(() => {
    if (post) {
      document.title = `${post.title} | JobVance.io Blog`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute("content", post.description);
      }

      // Add Article structured data
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": post.description,
        "author": {
          "@type": "Person", 
          "name": post.author
        },
        "datePublished": post.date,
        "dateModified": post.date,
        "publisher": {
          "@type": "Organization",
          "name": "JobVance",
          "logo": {
            "@type": "ImageObject",
            "url": "https://jobvance.io/logo.png"
          }
        },
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": `https://jobvance.io/blog/${post.slug}`
        },
        "image": "https://jobvance.io/blog-image.jpg",
        "articleSection": "Career Advice",
        "wordCount": post.content.split(' ').length,
        "timeRequired": `PT${post.readTime}M`
      });
      document.head.appendChild(script);

      return () => {
        if (document.head.contains(script)) {
          document.head.removeChild(script);
        }
      };
    }
  }, [post]);

  if (!post) {
    return <NotFound />;
  }

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .split('\n')
      .map((line, index) => {
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-3xl font-bold mt-8 mb-4">{line.replace('# ', '')}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-2xl font-semibold mt-6 mb-3">{line.replace('## ', '')}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-xl font-medium mt-4 mb-2">{line.replace('### ', '')}</h3>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={index} className="font-semibold mt-4 mb-2">{line.replace(/\*\*/g, '')}</p>;
        }
        if (line.startsWith('- ')) {
          return <li key={index} className="ml-4 mb-1">{line.replace('- ', '')}</li>;
        }
        if (line.trim() === '') {
          return <br key={index} />;
        }
        if (line.includes('[') && line.includes('](')) {
          // Simple link parsing
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
          const parts = line.split(linkRegex);
          return (
            <p key={index} className="mb-4 leading-relaxed">
              {parts.map((part, i) => {
                if (i % 3 === 1) {
                  return <Link key={i} to={parts[i + 1]} className="text-primary hover:underline">{part}</Link>;
                }
                if (i % 3 === 2) {
                  return null;
                }
                return part;
              })}
            </p>
          );
        }
        return <p key={index} className="mb-4 leading-relaxed">{line}</p>;
      });
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        <main role="main">
          <article className="py-20">
            <div className="container mx-auto px-4 max-w-4xl">
              {/* Back to Blog */}
              <Link to="/blog" className="inline-flex items-center text-primary hover:underline mb-8">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Blog
              </Link>

              {/* Article Header */}
              <header className="mb-12">
                <div className="flex flex-wrap gap-2 mb-4">
                  {post.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary">{tag}</Badge>
                  ))}
                </div>
                
                <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  {post.title}
                </h1>
                
                <p className="text-xl text-muted-foreground mb-6 leading-relaxed">
                  {post.excerpt}
                </p>
                
                <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{post.author}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </time>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{post.readTime} min read</span>
                  </div>
                </div>
              </header>

              {/* Article Content */}
              <div className="prose prose-lg max-w-none">
                {formatContent(post.content)}
              </div>

              {/* Article Footer */}
              <footer className="mt-12 pt-8 border-t border-border">
                <div className="bg-muted/30 rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4">
                    Ready to Automate Your Job Search?
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Stop spending hours on manual applications. Let JobVance AI handle the repetitive work while you focus on landing interviews.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button onClick={handleGetStarted}>Start Free Trial</Button>
                    <Link to="/how-it-works">
                      <Button variant="outline">Learn How It Works</Button>
                    </Link>
                  </div>
                </div>
              </footer>
            </div>
          </article>
        </main>
        <Footer />
      </div>
      
      <InterestFormDialog 
        open={showInterestForm} 
        onOpenChange={setShowInterestForm} 
      />
    </>
  );
};

export default BlogPost;