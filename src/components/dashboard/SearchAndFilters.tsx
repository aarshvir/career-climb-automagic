import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

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

  return (
    <div className="flex gap-4 items-center">
      <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by keyword, company, or job title..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
    </div>
  );
};