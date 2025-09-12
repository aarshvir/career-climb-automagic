import { FileText, MessageSquare, Zap, Brain, Users, BarChart3 } from "lucide-react";

const AIFeatures = () => {
  const features = [
    {
      icon: FileText,
      title: "AI Resume Builder",
      description: "AI generates resumes for each job application, based on your skills and experience.",
      gradient: "from-orange-400 to-pink-500"
    },
    {
      icon: MessageSquare,
      title: "AI Cover Letter",
      description: "AI generates cover letters for each job application, increasing your chances of getting hired.",
      gradient: "from-pink-500 to-purple-600"
    },
    {
      icon: Zap,
      title: "Auto Apply",
      description: "Let AI apply to thousands of jobs for you automatically. Save time and get hired faster.",
      gradient: "from-red-500 to-orange-500"
    },
    {
      icon: Brain,
      title: "AI Interview Practice",
      description: "Practice with AI-generated interviews to gain valuable insights and confidence.",
      gradient: "from-pink-500 to-purple-600"
    },
    {
      icon: Users,
      title: "Interview Buddy",
      description: "Get real-time interview help and answers to interview questions.",
      gradient: "from-orange-400 to-purple-500"
    },
    {
      icon: BarChart3,
      title: "Resume Translator",
      description: "Automatically translate your resume to increase your chances of getting hired.",
      gradient: "from-purple-500 to-orange-400"
    }
  ];

  return (
    <section className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6">
            You are <span className="text-primary">80% more likely</span> to get hired if you use JobVance
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <h3 className="text-xl font-semibold mb-4">{feature.title}</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {feature.description}
              </p>
              
              <div className={`relative mx-auto w-80 h-64 rounded-2xl bg-gradient-to-br ${feature.gradient} p-6 flex items-center justify-center overflow-hidden`}>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-8 border border-white/30">
                  <feature.icon className="w-12 h-12 text-white mx-auto mb-4" />
                  <div className="text-white text-sm font-medium">
                    {feature.title}
                  </div>
                </div>
                
                {/* Decorative elements */}
                <div className="absolute top-4 right-4 w-2 h-2 bg-white/40 rounded-full"></div>
                <div className="absolute bottom-6 left-6 w-1 h-1 bg-white/30 rounded-full"></div>
                <div className="absolute top-1/2 right-8 w-1.5 h-1.5 bg-white/50 rounded-full"></div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <h3 className="text-2xl md:text-3xl font-display font-bold mb-6">
            We help job seekers succeed
          </h3>
          <button className="bg-primary text-white px-8 py-3 rounded-full font-semibold hover:bg-primary/90 transition-colors">
            Start now
          </button>
        </div>
      </div>
    </section>
  );
};

export default AIFeatures;