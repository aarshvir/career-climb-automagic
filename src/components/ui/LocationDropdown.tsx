import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { MapPin, Loader2 } from 'lucide-react';
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
  placeholder = "Search for a location...",
  className 
}: LocationDropdownProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedValue, setSelectedValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Update input value when value prop changes
  useEffect(() => {
    setSelectedValue(value || '');
    setInputValue(value || '');
  }, [value]);

  // Filter locations based on input
  const filteredLocations = locations.filter(location =>
    location.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  const handleInputBlur = () => {
    // Delay hiding to allow for clicks on suggestions
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleSelect = (locationName: string) => {
    setSelectedValue(locationName);
    setInputValue(locationName);
    onValueChange(locationName);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={loading ? "Loading locations..." : error ? error : placeholder}
          disabled={loading || !!error || locations.length === 0}
          className={cn("pr-10", className)}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      <Popover open={showSuggestions && filteredLocations.length > 0 && !loading && !error}>
        <PopoverContent 
          className="w-full p-0 z-50" 
          style={{ width: inputRef.current?.offsetWidth }}
          align="start"
          side="bottom"
          sideOffset={4}
        >
          <Command>
            <CommandList className="max-h-60">
              {filteredLocations.length === 0 ? (
                <CommandEmpty>No location found for "{inputValue}"</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredLocations.slice(0, 10).map((location) => (
                    <CommandItem
                      key={location.geo_id}
                      value={location.name}
                      onSelect={() => handleSelect(location.name)}
                      className="cursor-pointer"
                    >
                      <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{location.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
