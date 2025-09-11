import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, Clock, ArrowRight, Search, User } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { supabase } from '@/lib/supabase'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  featured_image: string | null
  author: string
  tags: string[]
  created_at: string
  seo_title: string
  meta_description: string
}

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // Mock data for now - in production this would come from Supabase
  const mockPosts: BlogPost[] = [
    {
      id: '1',
      title: '5 Resume Mistakes That Cost You Job Interviews',
      slug: '5-resume-mistakes-cost-job-interviews',
      excerpt: 'Learn about the most common resume mistakes that prevent you from getting interviews and how to fix them.',
      featured_image: null,
      author: 'Sarah Johnson',
      tags: ['Resume Tips', 'Career Advice', 'Interview Prep'],
      created_at: '2024-01-15T10:00:00Z',
      seo_title: '5 Resume Mistakes That Cost You Job Interviews - JobAssist.ai',
      meta_description: 'Discover the top 5 resume mistakes that prevent job seekers from getting interviews and learn how to avoid them with expert tips.'
    },
    {
      id: '2',
      title: 'How AI is Revolutionizing Job Applications',
      slug: 'ai-revolutionizing-job-applications',
      excerpt: 'Discover how artificial intelligence is changing the job application process and what it means for job seekers.',
      featured_image: null,
      author: 'Alex Chen',
      tags: ['AI Technology', 'Job Search', 'Career Trends'],
      created_at: '2024-01-12T14:30:00Z',
      seo_title: 'How AI is Revolutionizing Job Applications - JobAssist.ai',
      meta_description: 'Learn how AI technology is transforming job applications and helping job seekers find opportunities faster than ever before.'
    },
    {
      id: '3',
      title: 'The Ultimate Guide to LinkedIn Job Searching',
      slug: 'ultimate-guide-linkedin-job-searching',
      excerpt: 'Master LinkedIn job search with proven strategies that help you stand out to recruiters and hiring managers.',
      featured_image: null,
      author: 'Marcus Rodriguez',
      tags: ['LinkedIn', 'Networking', 'Job Search'],
      created_at: '2024-01-10T09:15:00Z',
      seo_title: 'The Ultimate Guide to LinkedIn Job Searching - JobAssist.ai',
      meta_description: 'Complete guide to finding jobs on LinkedIn with expert tips on optimizing your profile and networking effectively.'
    },
    {
      id: '4',
      title: 'What Recruiters Really Look for in 2024',
      slug: 'what-recruiters-look-for-2024',
      excerpt: 'Get insider insights into what recruiters prioritize when reviewing candidates in today\'s competitive job market.',
      featured_image: null,
      author: 'Emily Davis',
      tags: ['Recruiter Insights', 'Hiring Trends', 'Career Advice'],
      created_at: '2024-01-08T16:45:00Z',
      seo_title: 'What Recruiters Really Look for in 2024 - JobAssist.ai',
      meta_description: 'Discover what recruiters and hiring managers are looking for in job candidates in 2024 with insights from industry experts.'
    },
    {
      id: '5',
      title: 'Salary Negotiation: A Complete Guide',
      slug: 'salary-negotiation-complete-guide',
      excerpt: 'Learn the art of salary negotiation with proven strategies to maximize your earning potential.',
      featured_image: null,
      author: 'David Wilson',
      tags: ['Salary Negotiation', 'Career Growth', 'Professional Development'],
      created_at: '2024-01-05T11:20:00Z',
      seo_title: 'Salary Negotiation: A Complete Guide - JobAssist.ai',
      meta_description: 'Master salary negotiation with this comprehensive guide including tactics, timing, and scripts for better compensation.'
    },
    {
      id: '6',
      title: 'Remote Work Interview Tips for 2024',
      slug: 'remote-work-interview-tips-2024',
      excerpt: 'Navigate remote work interviews successfully with these essential tips for virtual job interviews.',
      featured_image: null,
      author: 'Lisa Thompson',
      tags: ['Remote Work', 'Interview Tips', 'Virtual Interviews'],
      created_at: '2024-01-03T13:10:00Z',
      seo_title: 'Remote Work Interview Tips for 2024 - JobAssist.ai',
      meta_description: 'Ace your remote work interviews with proven tips for virtual interviews and landing remote positions.'
    }
  ]

  useEffect(() => {
    // For now, use mock data. In production, fetch from Supabase
    setPosts(mockPosts)
    setLoading(false)
  }, [])

  const allTags = Array.from(new Set(posts.flatMap(post => post.tags)))

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTag = !selectedTag || post.tags.includes(selectedTag)
    return matchesSearch && matchesTag
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getReadingTime = (content: string) => {
    const wordsPerMinute = 200
    const wordCount = content.split(' ').length
    return Math.ceil(wordCount / wordsPerMinute)
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
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-primary">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">
              Career Insights & Tips
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
                          {formatDate(filteredPosts[0].created_at)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {getReadingTime(filteredPosts[0].excerpt)} min read
                        </div>
                      </div>
                      <Button className="group">
                        Read Full Article
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
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
                  <Card key={post.id} className="hover:shadow-lg transition-all duration-300 h-full flex flex-col">
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
                        <span>{formatDate(post.created_at)}</span>
                        <span>•</span>
                        <span>{getReadingTime(post.excerpt)} min</span>
                      </div>
                      <Button variant="outline" className="w-full group">
                        Read More
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
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
  )
}

export default Blog