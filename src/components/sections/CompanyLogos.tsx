const CompanyLogos = () => {
  const companies = [
    "Coinbase", "Spotify", "Microsoft", "Meta", "SpaceX", "Google", "Apple", "Amazon", 
    "Netflix", "Tesla", "Uber", "Airbnb", "Twitter", "LinkedIn", "Slack", "Dropbox", 
    "Zoom", "Salesforce", "Adobe", "Intel", "NVIDIA", "Oracle", "IBM", "Samsung"
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
              <div key={`${company}-${index}`} className="flex items-center justify-center whitespace-nowrap px-8">
                <span className="text-2xl md:text-3xl font-bold text-muted-foreground">
                  {company}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyLogos;