import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LocationDropdownProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface Location {
  name: string;
  is_remote: boolean;
  country: string;
}

export function LocationDropdown({ 
  value, 
  onValueChange, 
  placeholder = "Select a location",
  className 
}: LocationDropdownProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getLocations() {
      try {
        // Fetches all rows from the 'locations' table
        const { data, error } = await supabase
          .from('locations')
          .select('name, is_remote, country')
          .order('name', { ascending: true }); // Alphabetical order

        if (error) {
          console.error('Error fetching locations:', error);
          return;
        }

        if (data) {
          setLocations(data);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      } finally {
        setLoading(false);
      }
    }

    getLocations();
  }, []);

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Loading locations..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {locations.map((location) => (
          <SelectItem key={location.name} value={location.name}>
            {location.name}
            {location.is_remote && (
              <span className="ml-2 text-xs text-muted-foreground">🌐</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
