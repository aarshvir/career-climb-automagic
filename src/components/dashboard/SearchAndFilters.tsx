import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, MapPin, Briefcase, DollarSign, Clock, Zap, Sparkles } from "lucide-react";

interface SearchAndFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SearchAndFilters = ({ searchQuery, onSearchChange }: SearchAndFiltersProps) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(localQuery);
  };

  const popularFilters = [
    { label: "Remote", icon: MapPin, count: 125, color: "bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white" },
    { label: "Full-time", icon: Briefcase, count: 89, color: "bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white" },
    { label: "$100k+", icon: DollarSign, count: 67, color: "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500 hover:text-white" },
    { label: "Recent", icon: Clock, count: 45, color: "bg-purple-500/10 text-purple-600 hover:bg-purple-500 hover:text-white" }
  ];

  const aiSuggestions = [
    "Senior Software Engineer",
    "Product Manager Remote",
    "Frontend Developer React"
  ];

  return (
    <Card className="border-border/50 backdrop-blur-sm bg-gradient-card overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-background/50 to-background/30">
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-primary">
            <Search className="h-4 w-4 text-primary-foreground" />
          </div>
          Smart Job Search
          <Badge variant="secondary" className="ml-2 bg-gradient-to-r from-primary/10 to-accent/10">
            <Sparkles className="h-3 w-3 mr-1" />
            AI-Powered
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Describe your ideal job or search by keywords..." 
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              className="pl-12 pr-20 py-2.5 text-sm bg-background/50 backdrop-blur-sm border-border/50 focus:bg-background/80 transition-all duration-300"
            />
            <Button 
              type="submit"
              size="sm" 
              className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-gradient-primary hover:opacity-90 px-3 py-1.5 text-xs"
            >
              <Zap className="h-3 w-3 mr-1" />
              AI Search
            </Button>
          </div>
          <Button variant="outline" className="px-4 py-2.5 border-border/50 hover:bg-accent/50 backdrop-blur-sm text-sm">
            <Filter className="h-4 w-4 mr-2" />
            Advanced
          </Button>
        </form>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-muted-foreground mr-2">Quick Filters:</span>
            {popularFilters.map((filter) => (
              <Badge 
                key={filter.label} 
                variant="outline" 
                className={`cursor-pointer transition-all duration-300 border-border/50 ${filter.color}`}
              >
                <filter.icon className="h-3 w-3 mr-1" />
                {filter.label}
                <span className="ml-1 text-xs opacity-70">({filter.count})</span>
              </Badge>
            ))}
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-muted-foreground mr-2">AI Suggestions:</span>
            {aiSuggestions.map((suggestion) => (
              <Badge 
                key={suggestion} 
                variant="secondary" 
                className="cursor-pointer hover:bg-gradient-primary hover:text-primary-foreground transition-all duration-300 bg-gradient-to-r from-primary/5 to-accent/5"
                onClick={() => {
                  setLocalQuery(suggestion);
                  onSearchChange(suggestion);
                }}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};