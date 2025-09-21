import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Filter, MapPin, Briefcase, DollarSign, Clock3, Globe2 } from "lucide-react";
import { DashboardFilters, JobPreferences } from "@/lib/dashboard-api";
import { AdvancedPreferencesSheet } from "./AdvancedPreferencesSheet";
import { trackEvent } from "@/utils/analytics";

interface SearchAndFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  preferences?: JobPreferences;
  onPreferencesSave: (updates: Partial<JobPreferences>) => Promise<void> | void;
  preferencesSaving?: boolean;
}

const QUICK_FILTERS: { id: keyof DashboardFilters | "salaryThreshold" | "seniorityLevels"; label: string; icon: React.ElementType; value: boolean | string }[] = [
  { id: "remote", label: "Remote", icon: Globe2, value: true },
  { id: "employmentTypes", label: "Full-time", icon: Briefcase, value: "Full-time" },
  { id: "employmentTypes", label: "Contract", icon: Briefcase, value: "Contract" },
  { id: "salaryThreshold", label: "$120k+", icon: DollarSign, value: "120000" },
  { id: "recent", label: "Recent (<7d)", icon: Clock3, value: true },
  { id: "seniorityLevels", label: "Senior", icon: Sparkles, value: "Senior" },
  { id: "visaSponsorship", label: "Visa friendly", icon: MapPin, value: true },
];

const countFilters = (filters: DashboardFilters) => {
  let total = 0;
  if (filters.remote) total += 1;
  if (filters.recent) total += 1;
  if (filters.visaSponsorship !== undefined) total += 1;
  if (filters.salaryThreshold) total += 1;
  total += filters.employmentTypes?.length ?? 0;
  total += filters.seniorityLevels?.length ?? 0;
  total += filters.locations?.length ?? 0;
  return total;
};

export const SearchAndFilters = ({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  preferences,
  onPreferencesSave,
  preferencesSaving,
}: SearchAndFiltersProps) => {
  const [localQuery, setLocalQuery] = useState(query);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const filtersCount = useMemo(() => countFilters(filters), [filters]);

  const toggleQuickFilter = (filterId: typeof QUICK_FILTERS[number]["id"], value: boolean | string) => {
    const nextFilters: DashboardFilters = { ...filters };
    if (filterId === "employmentTypes") {
      const typedValue = value as string;
      const current = new Set(nextFilters.employmentTypes ?? []);
      if (current.has(typedValue)) {
        current.delete(typedValue);
      } else {
        current.add(typedValue);
      }
      nextFilters.employmentTypes = Array.from(current);
    } else if (filterId === "seniorityLevels") {
      const typedValue = value as string;
      const current = new Set(nextFilters.seniorityLevels ?? []);
      if (current.has(typedValue)) {
        current.delete(typedValue);
      } else {
        current.add(typedValue);
      }
      nextFilters.seniorityLevels = Array.from(current);
    } else if (filterId === "salaryThreshold") {
      const numericValue = Number(value);
      nextFilters.salaryThreshold = nextFilters.salaryThreshold === numericValue ? undefined : numericValue;
    } else if (filterId === "remote" || filterId === "recent" || filterId === "visaSponsorship") {
      const key: "remote" | "recent" | "visaSponsorship" = filterId;
      const typedValue = value as boolean;
      nextFilters[key] = nextFilters[key] ? undefined : typedValue;
    }
    onFiltersChange(nextFilters);
  };

  const handleSearch = (value: string) => {
    onQueryChange(value);
    trackEvent("ai_search", { queryLen: value.length, filtersCount });
  };

  const resetFilters = () => {
    onFiltersChange({});
  };

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Input
                value={localQuery}
                onChange={(event) => setLocalQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch(localQuery);
                  }
                }}
                placeholder="Describe your ideal job or search by keywords…"
                className="h-11 rounded-full border border-muted px-5 text-sm"
              />
              <Button
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-from)] px-4 text-white hover:bg-[var(--brand-from)]/90"
                onClick={() => handleSearch(localQuery)}
              >
                <Sparkles className="mr-1 h-4 w-4" aria-hidden />
                AI Search
              </Button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" className="rounded-full" onClick={() => setAdvancedOpen(true)}>
                  <Filter className="mr-2 h-4 w-4" aria-hidden />
                  Preferences
                  {filtersCount > 0 && <Badge className="ml-2 rounded-full bg-[var(--brand-from)] text-white">{filtersCount}</Badge>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open advanced job preferences</TooltipContent>
            </Tooltip>
            {filtersCount > 0 && (
              <Button variant="ghost" className="rounded-full" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map((quickFilter) => {
              const isActive = (() => {
                if (quickFilter.id === "employmentTypes") {
                  return filters.employmentTypes?.includes(quickFilter.value as string);
                }
                if (quickFilter.id === "seniorityLevels") {
                  return filters.seniorityLevels?.includes(quickFilter.value as string);
                }
                if (quickFilter.id === "salaryThreshold") {
                  return filters.salaryThreshold === Number(quickFilter.value);
                }
                const key = quickFilter.id as keyof DashboardFilters;
                return Boolean(filters[key]);
              })();
              const Icon = quickFilter.icon;
              return (
                <Badge
                  key={`${quickFilter.id}-${quickFilter.label}`}
                  variant={isActive ? "default" : "secondary"}
                  className={
                    "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-[var(--brand-from)] hover:text-white"
                  }
                  onClick={() => toggleQuickFilter(quickFilter.id, quickFilter.value)}
                >
                  <Icon className="mr-1.5 h-3 w-3" aria-hidden />
                  {quickFilter.label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AdvancedPreferencesSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        preferences={preferences}
        onSave={onPreferencesSave}
        saving={preferencesSaving}
      />
    </>
  );
};
