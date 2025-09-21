import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JobPreferences } from "@/lib/dashboard-api";
import { trackEvent } from "@/utils/analytics";

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  description?: string;
}

const ChipInput = ({ label, values, onChange, placeholder, description }: ChipInputProps) => {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const value = draft.trim();
    if (!value) return;
    if (!values.includes(value)) {
      onChange([...values, value]);
    }
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge
            key={value}
            variant="secondary"
            className="rounded-full px-3 py-1 text-xs"
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
            <span className="ml-2 cursor-pointer text-muted-foreground">×</span>
          </Badge>
        ))}
      </div>
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addValue();
          }
        }}
        onBlur={addValue}
      />
    </div>
  );
};

interface AdvancedPreferencesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences?: JobPreferences;
  onSave: (updates: Partial<JobPreferences>) => Promise<void> | void;
  saving?: boolean;
}

export const AdvancedPreferencesSheet = ({
  open,
  onOpenChange,
  preferences,
  onSave,
  saving,
}: AdvancedPreferencesSheetProps) => {
  const [localPrefs, setLocalPrefs] = useState<JobPreferences | undefined>(preferences);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimer = useRef<number>();

  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences);
      setIsDirty(false);
    }
  }, [preferences]);

  const updatePreferences = (updates: Partial<JobPreferences>) => {
    setLocalPrefs((prev) => ({
      ...(prev || preferences || {}),
      ...updates,
    }) as JobPreferences);
    setIsDirty(true);
  };

  const debouncedSave = (updates: Partial<JobPreferences>) => {
    updatePreferences(updates);
    if (typeof window !== "undefined") {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        onSave(updates);
        trackEvent("preferences_save", { fieldsTouched: Object.keys(updates).length });
      }, 400);
    } else {
      onSave(updates);
    }
  };

  const handleApply = async () => {
    if (!localPrefs) return;
    await onSave(localPrefs);
    setIsDirty(false);
    trackEvent("preferences_save", { fieldsTouched: "all" });
  };

  const currencies = useMemo(() => ["USD", "EUR", "GBP", "CAD"], []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] px-0">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle>Job preferences</SheetTitle>
          <SheetDescription>
            Fine-tune your sourcing criteria. Adjusting preferences immediately influences AI Search results.
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <ScrollArea className="h-[calc(100vh-9rem)] px-6 py-6">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <ChipInput
                label="Preferred locations"
                values={localPrefs?.locations || []}
                onChange={(values) => debouncedSave({ locations: values })}
                placeholder="Add city, region, or country"
                description="Include remote-friendly regions to widen search scope."
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Remote allowance</Label>
                  <Slider
                    value={[localPrefs?.remotePercentage ?? 100]}
                    max={100}
                    step={5}
                    onValueChange={([value]) => debouncedSave({ remotePercentage: value })}
                  />
                  <p className="text-xs text-muted-foreground">{localPrefs?.remotePercentage ?? 100}% remote acceptable</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Visa sponsorship</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={localPrefs?.visaSponsorship ?? false}
                      onCheckedChange={(checked) => debouncedSave({ visaSponsorship: checked })}
                    />
                    <span className="text-xs text-muted-foreground">Requires sponsorship</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Travel %</Label>
                  <Slider
                    value={[localPrefs?.travelPercentage ?? 0]}
                    max={100}
                    step={5}
                    onValueChange={([value]) => debouncedSave({ travelPercentage: value })}
                  />
                </div>
              </div>

              <ChipInput
                label="Target titles"
                values={localPrefs?.titles || []}
                onChange={(values) => debouncedSave({ titles: values })}
                placeholder="Add role (e.g. Staff Engineer)"
              />
              <ChipInput
                label="Seniority levels"
                values={localPrefs?.seniority || []}
                onChange={(values) => debouncedSave({ seniority: values })}
                placeholder="Add seniority (e.g. Senior, Lead)"
              />
              <ChipInput
                label="Industries"
                values={localPrefs?.industries || []}
                onChange={(values) => debouncedSave({ industries: values })}
                placeholder="Add industry focus"
              />
              <ChipInput
                label="Company sizes"
                values={localPrefs?.companySizes || []}
                onChange={(values) => debouncedSave({ companySizes: values })}
                placeholder="Add size band"
              />
            </div>

            <div className="space-y-6">
              <div className="grid gap-4">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Salary range</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={localPrefs?.salaryRange.currency ?? "USD"}
                    onValueChange={(currency) => debouncedSave({ salaryRange: { ...(localPrefs?.salaryRange || {}), currency } })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={localPrefs?.salaryRange.min ?? ""}
                    onChange={(event) =>
                      debouncedSave({ salaryRange: { currency: localPrefs?.salaryRange?.currency || "USD", ...(localPrefs?.salaryRange || {}), min: Number(event.target.value) || undefined } })
                    }
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={localPrefs?.salaryRange.max ?? ""}
                    onChange={(event) =>
                      debouncedSave({ salaryRange: { currency: localPrefs?.salaryRange?.currency || "USD", ...(localPrefs?.salaryRange || {}), max: Number(event.target.value) || undefined } })
                    }
                  />
                </div>
              </div>

              <ChipInput
                label="Include keywords"
                values={localPrefs?.keywordsInclude || []}
                onChange={(values) => debouncedSave({ keywordsInclude: values })}
                placeholder="Add must-have keyword"
              />
              <ChipInput
                label="Exclude keywords"
                values={localPrefs?.keywordsExclude || []}
                onChange={(values) => debouncedSave({ keywordsExclude: values })}
                placeholder="Add keyword to avoid"
              />
              <ChipInput
                label="Avoid companies"
                values={localPrefs?.excludeCompanies || []}
                onChange={(values) => debouncedSave({ excludeCompanies: values })}
                placeholder="Add company"
              />
              <ChipInput
                label="Preferred job boards"
                values={localPrefs?.preferredBoards || []}
                onChange={(values) => debouncedSave({ preferredBoards: values })}
                placeholder="Add board"
              />

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Timezone preference</Label>
                  <Input
                    value={localPrefs?.timezone ?? ""}
                    placeholder="e.g. America/Chicago"
                    onChange={(event) => debouncedSave({ timezone: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Languages</Label>
                  <Textarea
                    value={(localPrefs?.languages || []).join(", ")}
                    placeholder="Comma separated"
                    onChange={(event) =>
                      debouncedSave({ languages: event.target.value.split(",").map((lang) => lang.trim()).filter(Boolean) })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Work authorization</Label>
                  <Input
                    value={localPrefs?.workAuthorization ?? ""}
                    placeholder="e.g. US Citizen, H1B"
                    onChange={(event) => debouncedSave({ workAuthorization: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Relocation</Label>
                  <Select
                    value={localPrefs?.relocation ?? "open"}
                    onValueChange={(value: "willing" | "not_willing" | "open") => debouncedSave({ relocation: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="willing">Willing to relocate</SelectItem>
                      <SelectItem value="not_willing">Not willing</SelectItem>
                      <SelectItem value="open">Open to discussion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Max commute (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={localPrefs?.commuteMinutes ?? ""}
                    onChange={(event) => debouncedSave({ commuteMinutes: Number(event.target.value) || undefined })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Education level</Label>
                  <Input
                    value={(localPrefs?.educationLevels || []).join(", ")}
                    placeholder="e.g. BSc, MBA"
                    onChange={(event) =>
                      debouncedSave({ educationLevels: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notice period</Label>
                  <Input
                    value={localPrefs?.noticePeriod ?? ""}
                    placeholder="e.g. 2 weeks"
                    onChange={(event) => debouncedSave({ noticePeriod: event.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Preferences auto-save every few seconds. Apply changes to refresh current results immediately.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleApply} disabled={saving || !isDirty} className="bg-[var(--brand-from)] text-white">
              {saving ? "Saving…" : "Apply preferences"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
