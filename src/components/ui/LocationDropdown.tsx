import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationDropdownProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface Location {
  name: string;
  geo_id: string;
}

export function LocationDropdown({ 
  value, 
  onValueChange, 
  placeholder = "Select a location",
  className 
}: LocationDropdownProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function getLocations() {
      try {
        console.log('Fetching locations from Supabase...');
        const { data, error } = await supabase
          .from('locations')
          .select('name, geo_id')
          .order('name', { ascending: true });

        if (error) {
          console.error('Error fetching locations:', error);
          setError(`Failed to load locations: ${error.message}`);
          return;
        }

        console.log('Locations fetched:', data);
        if (data) {
          setLocations(data);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        setError('Failed to load locations');
      } finally {
        setLoading(false);
      }
    }

    getLocations();
  }, []);

  // Filter locations based on search query
  const filteredLocations = locations.filter(location =>
    location.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (locationName: string) => {
    onValueChange(locationName);
    setOpen(false);
    setSearchQuery('');
  };

  if (loading) {
    return (
      <Button
        variant="outline"
        role="combobox"
        disabled
        className={cn("w-full justify-between", className)}
      >
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading locations...</span>
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        variant="outline"
        role="combobox"
        disabled
        className={cn("w-full justify-between", className)}
      >
        <span className="text-muted-foreground">{error}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  if (locations.length === 0) {
    return (
      <Button
        variant="outline"
        role="combobox"
        disabled
        className={cn("w-full justify-between", className)}
      >
        <span className="text-muted-foreground">No locations available</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {value ? (
            locations.find((location) => location.name === value)?.name
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search locations..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No location found.</CommandEmpty>
            <CommandGroup>
              {filteredLocations.map((location) => (
                <CommandItem
                  key={location.geo_id}
                  value={location.name}
                  onSelect={() => handleSelect(location.name)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === location.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {location.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
