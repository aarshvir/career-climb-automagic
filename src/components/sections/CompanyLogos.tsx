import companyLogos from "@/assets/company-logos.png";

const CompanyLogos = () => {
  const companies = [
    { name: "Google", logo: "🇬", color: "bg-gradient-to-r from-blue-500 via-red-500 via-yellow-500 to-green-500 bg-clip-text text-transparent" },
    { name: "Apple", logo: "🍎", color: "text-gray-700" },
    { name: "Microsoft", logo: "⊞", color: "text-blue-600" },
    { name: "Meta", logo: "∞", color: "text-blue-500" },
    { name: "Amazon", logo: "📦", color: "text-orange-500" },
    { name: "Netflix", logo: "🎬", color: "text-red-600" },
    { name: "Spotify", logo: "🎵", color: "text-green-500" },
    { name: "Tesla", logo: "⚡", color: "text-red-500" },
    { name: "Uber", logo: "🚗", color: "text-black" },
    { name: "Airbnb", logo: "🏠", color: "text-red-500" },
    { name: "LinkedIn", logo: "💼", color: "text-blue-700" },
    { name: "Twitter", logo: "🐦", color: "text-blue-400" },
    { name: "Adobe", logo: "🎨", color: "text-red-600" },
    { name: "Intel", logo: "💻", color: "text-blue-600" },
    { name: "NVIDIA", logo: "🎮", color: "text-green-600" },
    { name: "Oracle", logo: "⚙️", color: "text-red-600" },
    { name: "IBM", logo: "🔷", color: "text-blue-700" },
    { name: "Samsung", logo: "📱", color: "text-blue-800" }
  ];

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-muted-foreground mb-8 tracking-wider uppercase">
            GET HIRED BY TOP COMPANIES WORLDWIDE
          </p>
        </div>
        
        <div className="relative overflow-hidden">
          <div className="flex animate-scroll">
            {[...companies, ...companies].map((company, index) => (
              <div key={`${company.name}-${index}`} className="flex items-center justify-center whitespace-nowrap px-6">
                <div className="flex items-center space-x-3 hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">{company.logo}</span>
                  <span className={`text-xl md:text-2xl font-bold ${company.color}`}>
                    {company.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyLogos;