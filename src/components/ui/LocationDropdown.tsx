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

  useEffect(() => {
    async function getLocations() {
      try {
        console.log('Fetching locations from Supabase...');
        // Fetches all rows from the 'locations' table
        const { data, error } = await supabase
          .from('locations')
          .select('name, geo_id')
          .order('name', { ascending: true }); // Alphabetical order

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

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="Loading locations..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder={error} />
        </SelectTrigger>
      </Select>
    );
  }

  if (locations.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <SelectValue placeholder="No locations available" />
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
          <SelectItem key={location.geo_id} value={location.name}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
