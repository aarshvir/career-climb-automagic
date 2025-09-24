import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, Clock, ArrowRight, Search, User } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { SeoHead, buildWebPageJsonLd } from '@/components/SEOHead'
import { posts } from './blog/posts'
import { Link } from 'react-router-dom'
import organizationData from '../../../public/jsonld/organization.json';


const Blog = () => {
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const allTags = Array.from(new Set(posts.flatMap(post => post.tags)))

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesTag = !selectedTag || post.tags.includes(selectedTag)
    return matchesSearch && matchesTag
  })

  const blogStructuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "JobVance Career Blog",
    "description": "Expert career advice and job search automation insights",
    "url": "https://jobvance.io/blog",
    "publisher": {
      "@type": "Organization",
      "name": "JobVance",
      "logo": {
        "@type": "ImageObject",
        "url": "https://jobvance.io/logo.png"
      }
    },
    "blogPost": posts.map(post => ({
      "@type": "BlogPosting",
      "headline": post.title,
      "url": `https://jobvance.io/blog/${post.slug}`,
      "datePublished": post.date,
      "author": {
        "@type": "Person",
        "name": post.author
      },
      "image": `https://jobvance.io/images/blog/${post.slug}.png`
    }))
  };

  const webPageStructuredData = buildWebPageJsonLd({
    name: "Career Blog",
    description: "Expert career advice, job search strategies, and AI automation insights.",
    canonicalUrl: "https://jobvance.io/blog"
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <>
      <SeoHead 
        title="Career Blog - Job Search Tips & AI Automation Insights | JobVance"
        description="Expert career advice, job search strategies, and AI automation insights. Learn from industry professionals to advance your career faster."
        canonicalPath="/blog"
        structuredData={[organizationData, webPageStructuredData, blogStructuredData]}
      />
      <div className="min-h-screen bg-background">
        <Header />
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-primary">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Career Blog: Expert Job Search Tips & AI Insights
            </h1>
            <p className="text-xl text-white/90 leading-relaxed">
              Expert advice, industry insights, and proven strategies to accelerate your career growth
            </p>
          </div>
        </div>
      </section>

      {/* Search and Filter Section */}
      <section className="py-12 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedTag === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTag(null)}
                >
                  All Topics
                </Button>
                {allTags.slice(0, 6).map((tag) => (
                  <Button
                    key={tag}
                    variant={selectedTag === tag ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Article */}
      {filteredPosts.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold mb-8">Featured Article</h2>
              <Card className="overflow-hidden hover:shadow-lg transition-all duration-300">
                <div className="lg:flex">
                  <div className="lg:w-1/3 bg-gradient-subtle h-48 lg:h-auto flex items-center justify-center">
                    <div className="text-6xl font-bold text-primary/20">
                      {filteredPosts[0].title.charAt(0)}
                    </div>
                  </div>
                  <div className="lg:w-2/3">
                    <CardHeader>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {filteredPosts[0].tags.map((tag, index) => (
                          <Badge key={index} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-2xl lg:text-3xl">
                        {filteredPosts[0].title}
                      </CardTitle>
                      <CardDescription className="text-base">
                        {filteredPosts[0].excerpt}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {filteredPosts[0].author}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(filteredPosts[0].date)}
                        </div>
                         <div className="flex items-center gap-1">
                           <Clock className="w-4 h-4" />
                           {filteredPosts[0].readTime} min read
                         </div>
                      </div>
                       <Link to={`/blog/${filteredPosts[0].slug}`}>
                         <Button className="group">
                           Read Full Article
                           <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                         </Button>
                       </Link>
                    </CardContent>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Articles Grid */}
      <section className="py-16 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-8">Latest Articles</h2>
            
            {filteredPosts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No articles found matching your criteria.</p>
                <Button onClick={() => { setSearchTerm(''); setSelectedTag(null); }}>
                  Show All Articles
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                 {filteredPosts.slice(1).map((post) => (
                   <Card key={post.slug} className="hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                    <div className="bg-gradient-subtle h-48 flex items-center justify-center">
                      <div className="text-4xl font-bold text-primary/20">
                        {post.title.charAt(0)}
                      </div>
                    </div>
                    <CardHeader className="flex-1">
                      <div className="flex flex-wrap gap-1 mb-3">
                        {post.tags.slice(0, 2).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-xl line-clamp-2">
                        {post.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-3">
                        {post.excerpt}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                        <span>{post.author}</span>
                        <span>•</span>
                         <span>{formatDate(post.date)}</span>
                         <span>•</span>
                         <span>{post.readTime} min</span>
                      </div>
                       <Link to={`/blog/${post.slug}`}>
                         <Button variant="outline" className="w-full group">
                           Read More
                           <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                         </Button>
                       </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-20 bg-gradient-primary">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              Stay Updated with Career Tips
            </h2>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Get weekly insights and job market trends delivered to your inbox
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <Input 
                placeholder="Enter your email" 
                className="bg-white/10 border-white/20 text-white placeholder:text-white/60"
              />
              <Button className="bg-white text-primary hover:bg-white/90">
                Subscribe
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

export default Blog