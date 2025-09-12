const CompanyLogos = () => {
  const companies = [
    { 
      name: "Google", 
      element: (
        <div className="flex items-center space-x-2">
          <span className="text-3xl font-bold" style={{color: '#4285F4'}}>G</span>
          <span className="text-3xl font-bold" style={{color: '#EA4335'}}>o</span>
          <span className="text-3xl font-bold" style={{color: '#FBBC04'}}>o</span>
          <span className="text-3xl font-bold" style={{color: '#4285F4'}}>g</span>
          <span className="text-3xl font-bold" style={{color: '#34A853'}}>l</span>
          <span className="text-3xl font-bold" style={{color: '#EA4335'}}>e</span>
        </div>
      )
    },
    { 
      name: "Apple", 
      element: <span className="text-2xl font-semibold text-gray-800">🍎 Apple</span>
    },
    { 
      name: "Microsoft", 
      element: (
        <div className="flex items-center space-x-2">
          <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
            <div className="w-1.5 h-1.5" style={{backgroundColor: '#F25022'}}></div>
            <div className="w-1.5 h-1.5" style={{backgroundColor: '#7FBA00'}}></div>
            <div className="w-1.5 h-1.5" style={{backgroundColor: '#00A4EF'}}></div>
            <div className="w-1.5 h-1.5" style={{backgroundColor: '#FFB900'}}></div>
          </div>
          <span className="text-2xl font-semibold text-gray-800">Microsoft</span>
        </div>
      )
    },
    { 
      name: "Meta", 
      element: <span className="text-2xl font-bold" style={{color: '#1877F2'}}>Meta</span>
    },
    { 
      name: "Amazon", 
      element: (
        <div className="flex items-center">
          <span className="text-2xl font-bold text-black">amazon</span>
          <div className="ml-1 text-orange-500 transform scale-75">📦</div>
        </div>
      )
    },
    { 
      name: "Netflix", 
      element: <span className="text-2xl font-bold" style={{color: '#E50914'}}>NETFLIX</span>
    },
    { 
      name: "Spotify", 
      element: (
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{backgroundColor: '#1DB954'}}>
            <span className="text-white text-sm">♪</span>
          </div>
          <span className="text-2xl font-bold text-black">Spotify</span>
        </div>
      )
    },
    { 
      name: "Tesla", 
      element: <span className="text-2xl font-bold" style={{color: '#E31937'}}>TESLA</span>
    },
    { 
      name: "Uber", 
      element: <span className="text-2xl font-bold text-black">Uber</span>
    },
    { 
      name: "Airbnb", 
      element: <span className="text-2xl font-bold" style={{color: '#FF5A5F'}}>Airbnb</span>
    },
    { 
      name: "LinkedIn", 
      element: <span className="text-2xl font-bold" style={{color: '#0A66C2'}}>LinkedIn</span>
    },
    { 
      name: "Adobe", 
      element: <span className="text-2xl font-bold" style={{color: '#FF0000'}}>Adobe</span>
    },
    { 
      name: "Intel", 
      element: <span className="text-2xl font-bold" style={{color: '#0071C5'}}>intel</span>
    },
    { 
      name: "NVIDIA", 
      element: <span className="text-2xl font-bold" style={{color: '#76B900'}}>NVIDIA</span>
    },
    { 
      name: "Oracle", 
      element: <span className="text-2xl font-bold" style={{color: '#F80000'}}>ORACLE</span>
    },
    { 
      name: "IBM", 
      element: <span className="text-2xl font-bold" style={{color: '#1261FE'}}>IBM</span>
    },
    { 
      name: "Samsung", 
      element: <span className="text-2xl font-bold" style={{color: '#1428A0'}}>SAMSUNG</span>
    }
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
              <div key={`${company.name}-${index}`} className="flex items-center justify-center whitespace-nowrap px-8">
                <div className="hover:scale-110 transition-transform duration-300">
                  {company.element}
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