import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Trash2, Star, Plus, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useToast } from "@/hooks/use-toast";

interface ResumeVariant {
  id: string;
  name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  is_primary: boolean;
  created_at: string;
}

interface ResumeVariantManagerProps {
  userPlan: string | null;
}

export function ResumeVariantManager({ userPlan }: ResumeVariantManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const planLimits = usePlanLimits(userPlan);
  const [resumeVariants, setResumeVariants] = useState<ResumeVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchResumeVariants();
    }
  }, [user]);

  const fetchResumeVariants = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("resume_variants")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setResumeVariants(data || []);
    } catch (error) {
      console.error("Error fetching resume variants:", error);
      toast({
        title: "Error",
        description: "Failed to fetch resume variants",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (resumeVariants.length >= planLimits.resumeLimit) {
      toast({
        title: "Upload limit reached",
        description: `Your ${planLimits.plan} plan allows ${planLimits.resumeLimit} resume variant${planLimits.resumeLimit > 1 ? "s" : ""}. Upgrade to add more.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("jobassist")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("resume_variants")
        .insert([
          {
            user_id: user.id,
            name: file.name.replace(/\.[^/.]+$/, ""),
            file_path: fileName,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
            is_primary: resumeVariants.length === 0,
          },
        ]);

      if (dbError) throw dbError;

      toast({
        title: "Resume added",
        description: "Your variant is ready to use in applications.",
      });

      fetchResumeVariants();
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload resume variant",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const setPrimary = async (id: string) => {
    try {
      await supabase.from("resume_variants").update({ is_primary: false }).eq("user_id", user?.id);
      const { error } = await supabase.from("resume_variants").update({ is_primary: true }).eq("id", id);
      if (error) throw error;
      toast({ title: "Primary resume updated" });
      fetchResumeVariants();
    } catch (error) {
      console.error("Error setting primary resume:", error);
      toast({
        title: "Error",
        description: "Failed to update primary resume",
        variant: "destructive",
      });
    }
  };

  const deleteVariant = async (id: string, filePath: string) => {
    try {
      await supabase.storage.from("jobassist").remove([filePath]);
      const { error } = await supabase.from("resume_variants").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Resume removed" });
      fetchResumeVariants();
    } catch (error) {
      console.error("Error deleting resume variant:", error);
      toast({
        title: "Error",
        description: "Failed to delete resume variant",
        variant: "destructive",
      });
    }
  };

  const atLimit = resumeVariants.length >= planLimits.resumeLimit;

  if (loading) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Resume Variants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-12 animate-pulse rounded-xl bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Resume Variants
          </span>
          <Badge variant="outline" className="rounded-full text-xs">
            {resumeVariants.length}/{planLimits.resumeLimit}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumeVariants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 p-6 text-center">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Upload your primary resume to unlock personalized tailoring.</p>
              <p className="text-xs">Supports PDF, DOC, and DOCX.</p>
            </div>
            <label className="w-full">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <Button className="w-full rounded-full" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload resume"}
              </Button>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            {resumeVariants.slice(0, 3).map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between rounded-xl border p-4 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {variant.name}
                    {variant.is_primary && (
                      <Badge variant="secondary" className="flex items-center gap-1 rounded-full text-[10px]">
                        <Star className="h-3 w-3" /> Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(variant.file_size / 1024 / 1024).toFixed(2)} MB · Uploaded {new Date(variant.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!variant.is_primary && (
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPrimary(variant.id)}>
                      Make primary
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => deleteVariant(variant.id, variant.file_path)}
                    aria-label="Delete resume"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {resumeVariants.length > 3 && (
              <p className="text-xs text-muted-foreground">Showing most recent 3 of {resumeVariants.length} resumes.</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading || atLimit}
            />
            <Button
              className="w-full rounded-full"
              variant="outline"
              disabled={uploading || atLimit}
            >
              {uploading ? (
                "Uploading…"
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" /> Add variant
                </span>
              )}
            </Button>
          </label>
          {atLimit && (
            <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-center text-xs text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Resume limit reached</p>
              <p className="mb-3">Upgrade for additional slots and automatic archiving suggestions.</p>
              <Button size="sm" className="rounded-full bg-[var(--brand-from)] text-white">
                <Crown className="mr-1 h-4 w-4" /> Upgrade plan
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {planLimits.plan === "free"
              ? "Free plan stores one resume. Upgrading unlocks tailored variants per job."
              : planLimits.plan === "pro"
              ? "Pro stores up to three resumes—perfect for targeting different roles."
              : "Elite stores ten variants with concierge review."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
