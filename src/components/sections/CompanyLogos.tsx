const CompanyLogos = () => {
  const companies = [
    { name: "Coinbase", logo: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=120&h=60&fit=crop&auto=format&q=80" },
    { name: "Spotify", logo: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=120&h=60&fit=crop&auto=format&q=80" },
    { name: "Microsoft", logo: "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?w=120&h=60&fit=crop&auto=format&q=80" },
    { name: "Meta", logo: "https://images.unsplash.com/photo-1633675254053-d96c7668c3b8?w=120&h=60&fit=crop&auto=format&q=80" },
    { name: "SpaceX", logo: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=120&h=60&fit=crop&auto=format&q=80" }
  ];

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-muted-foreground mb-8 tracking-wider uppercase">
            GET HIRED BY TOP COMPANIES WORLDWIDE
          </p>
        </div>
        
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 lg:gap-16 opacity-60 hover:opacity-80 transition-opacity duration-300">
          {companies.map((company) => (
            <div key={company.name} className="flex items-center justify-center">
              <span className="text-2xl md:text-3xl font-bold text-muted-foreground">
                {company.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CompanyLogos;