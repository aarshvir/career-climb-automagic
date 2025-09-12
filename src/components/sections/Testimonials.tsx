import { Star } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      id: 1,
      name: "Alex R",
      title: "Recent College Graduate",
      content: "JobVance was a **lifesaver**. Their tools helped me identify key skills I needed to develop and connected me with the right opportunities. I landed my dream job within a month!",
      rating: 5,
      date: "Dec 17, 2024",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 2,
      name: "Carlos D",
      title: "Mid-Career Professional",
      content: "The interview prep tool from JobVance was phenomenal. It used AI to analyze my speech patterns and provided personalized feedback, making me much more confident and **articulate** in my interviews. It really **made a difference**!",
      rating: 5,
      date: "Jan 10, 2025",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 3,
      name: "Rohit",
      title: "Software Engineer",
      content: "Finally starting getting **interviews at Apple and Google** and nailed the interviews with the help of JobVance. Thank you.",
      rating: 5,
      date: "Nov 23, 2024",
      avatar: "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 4,
      name: "Sandra Q",
      title: "Marketing Manager",
      content: "Goodbye generic cover letters, **hello job offers!** Life saver.",
      rating: 5,
      date: "Sep 17, 2024",
      avatar: "https://images.unsplash.com/photo-1494790108755-2616b612b3fa?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 5,
      name: "Jess G",
      title: "Product Manager",
      content: "SO GLAD I SUBSCRIBED! **Got a job in a week** using the application kit and interview help.",
      rating: 5,
      date: "Jan 4, 2025",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 6,
      name: "Maria G",
      title: "Career Changer",
      content: "Switching careers was daunting, but JobVance made it **seamless**. Their tailored resumes and job recommendations helped me **transition smoothly into a new field**. I've never felt more confident in my professional journey!",
      rating: 5,
      date: "Dec 22, 2024",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 7,
      name: "Gab",
      title: "Data Scientist",
      content: "OMG. **Game changer!**",
      rating: 5,
      date: "Nov 24, 2024",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 8,
      name: "Kathy",
      title: "UX Designer",
      content: "JobVance was **excellent** and really helped my job hunt - **thank you!**",
      rating: 5,
      date: "Mar 22, 2024",
      avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 9,
      name: "Tim Kagy",
      title: "Senior Developer",
      content: "**Landed a $110k/year job** after spending months unemployed. JobVance completely transformed my application strategy and interview skills.",
      rating: 5,
      date: "Feb 15, 2025",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    },
    {
      id: 10,
      name: "Mia P",
      title: "Business Analyst",
      content: "JobVance was **excellent** and really helped my job hunt after graduation. Their AI resume optimization got me **3x more callbacks**!",
      rating: 5,
      date: "Aug 8, 2024",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=40&h=40&fit=crop&crop=face&auto=format&q=80"
    }
  ];

  const renderContent = (content: string) => {
    return content.split('**').map((part, index) => 
      index % 2 === 1 ? (
        <span key={index} className="bg-yellow-200 px-1 rounded font-medium">
          {part}
        </span>
      ) : part
    );
  };

  return (
    <section className="py-20 lg:py-32 bg-gradient-card">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold mb-4">
            <span className="text-3xl md:text-4xl lg:text-5xl font-normal">10,000+</span> professionals and job seekers{" "}
            <br className="hidden md:block" />
            are using <span className="bg-gradient-primary bg-clip-text text-transparent">JobVance</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-white rounded-xl p-6 shadow-card hover:shadow-premium transition-all duration-300 border border-border/50"
            >
              <div className="flex items-center mb-4">
                <img
                  src={testimonial.avatar}
                  alt={testimonial.name}
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{testimonial.name}</h4>
                  <p className="text-xs text-muted-foreground">{testimonial.title}</p>
                </div>
              </div>
              
              <div className="flex mb-3">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              
              <p className="text-sm text-foreground leading-relaxed mb-4">
                {renderContent(testimonial.content)}
              </p>
              
              <p className="text-xs text-muted-foreground">{testimonial.date}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;