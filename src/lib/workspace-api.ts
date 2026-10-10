import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  mvpSupabase,
  type ApplicationPack,
  type TrackedApplication,
} from "@/lib/cv-database";
import { listCvDocuments } from "@/lib/cv-documents";

export const applicationStatuses = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export const entitlementSchema = z.object({
  creditsRemaining: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  billingConfigured: z.boolean(),
  billingMode: z.enum(["test", "live"]).nullable().optional(),
  paymentProvider: z.enum(["paddle", "stripe"]).nullable().optional(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;
export type WorkspaceAccess = {
  entitlement: Entitlement | null;
  entitlementError: string | null;
};
export const jobInputSchema = z.object({
  resumeId: z.string().uuid(),
  jobTitle: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200),
  jobUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(isEmployerUrl, "Use an https:// employer link, or leave it empty."),
  jobDescription: z
    .string()
    .trim()
    .min(80, "Paste the complete job description (at least 80 characters).")
    .max(20000),
  requestId: z.string().uuid(),
});
export function isEmployerUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function safeEmployerUrl(
  value: string | null | undefined,
): string | null {
  return value && isEmployerUrl(value) ? value : null;
}
export function workspaceCounts(
  applications: Pick<TrackedApplication, "status">[],
) {
  return {
    saved: applications.filter((a) => a.status === "saved").length,
    applied: applications.filter((a) => a.status === "applied").length,
    interviews: applications.filter((a) => a.status === "interview").length,
  };
}

async function invoke<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // Surface only the server's public error field, never raw payloads or credentials.
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        throw new Error(payload.error.slice(0, 400));
      }
    }
    throw new Error(
      "The service could not complete this request. Please retry.",
    );
  }
  if (data === null)
    throw new Error("The service returned no result. Please retry.");
  return data;
}

export async function getEntitlement(): Promise<Entitlement> {
  return entitlementSchema.parse(await invoke<unknown>("get-entitlement", {}));
}
export async function loadWorkspace(userId: string) {
  const [cvs, packs, applications, access] = await Promise.all([
    listCvDocuments(userId),
    mvpSupabase
      .from("application_packs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    mvpSupabase
      .from("tracked_applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    // An access-service outage must not hide independently saved records.
    // Unknown access stays null; callers must not authorize metered work from it.
    getEntitlement().then<WorkspaceAccess>(
      entitlement => ({ entitlement, entitlementError: null }),
    ).catch((): WorkspaceAccess => ({
      entitlement: null,
      entitlementError: "Pack access could not be checked. Refresh access before creating a new pack or starting checkout.",
    })),
  ]);
  if (packs.error || applications.error)
    throw new Error(
      "Your saved records could not be loaded. Retry to refresh them.",
    );
  return {
    cvs,
    packs: packs.data ?? [],
    applications: applications.data ?? [],
    ...access,
  };
}
export async function createPack(
  input: z.infer<typeof jobInputSchema>,
): Promise<ApplicationPack> {
  const valid = jobInputSchema.parse(input);
  const result = await invoke<{ pack: ApplicationPack }>("tailor-cv", valid);
  if (!result.pack?.id)
    throw new Error("No application pack was saved. Please retry.");
  return result.pack;
}
export async function approvePack(pack: ApplicationPack, text: string) {
  if (text.trim().length < 80 || text.length > 60000)
    throw new Error(
      "The reviewed CV must contain between 80 and 60,000 characters.",
    );
  const result = await mvpSupabase
    .from("application_packs")
    .update({ tailored_text: text.trim(), status: "approved" })
    .eq("id", pack.id)
    .eq("user_id", pack.user_id)
    .select()
    .single();
  if (result.error || !result.data)
    throw new Error(
      "Your review could not be saved. No approval was recorded.",
    );
  return result.data;
}
export async function trackPack(pack: ApplicationPack) {
  // Existing tracker progress must not be reset when a saved pack is clicked twice.
  const existing = await mvpSupabase
    .from("tracked_applications")
    .select("id")
    .eq("user_id", pack.user_id)
    .eq("pack_id", pack.id)
    .maybeSingle();
  if (existing.error)
    throw new Error("Your tracker could not be checked. Please retry.");
  if (existing.data) return;
  const result = await mvpSupabase.from("tracked_applications").insert({
    user_id: pack.user_id,
    pack_id: pack.id,
    job_title: pack.job_title,
    company: pack.company,
    job_url: pack.job_url || null,
    status: "saved",
    notes: "",
  });
  if (result.error && result.error.code !== "23505")
    throw new Error("The application could not be saved to your tracker.");
}
export async function addApplication(
  userId: string,
  input: { jobTitle: string; company: string; jobUrl: string },
) {
  if (
    input.jobTitle.trim().length < 2 ||
    input.jobTitle.length > 200 ||
    input.company.length > 200 ||
    !isEmployerUrl(input.jobUrl)
  ) {
    throw new Error(
      "Enter the role and a valid https:// employer link, or leave the link empty.",
    );
  }
  const result = await mvpSupabase.from("tracked_applications").insert({
    user_id: userId,
    pack_id: null,
    job_title: input.jobTitle.trim(),
    company: input.company.trim(),
    job_url: input.jobUrl.trim() || null,
    status: "saved",
    notes: "",
  });
  if (result.error) throw new Error("The application could not be saved.");
}
export async function updateApplication(
  application: TrackedApplication,
  patch: {
    status?: ApplicationStatus;
    notes?: string;
    follow_up_at?: string | null;
  },
) {
  if (patch.status && !applicationStatuses.includes(patch.status))
    throw new Error("Choose a supported application status.");
  if (patch.notes && patch.notes.length > 5000)
    throw new Error("Keep notes under 5,000 characters.");
  const result = await mvpSupabase
    .from("tracked_applications")
    .update({
      ...patch,
      ...(patch.status === "applied"
        ? { applied_at: application.applied_at ?? new Date().toISOString() }
        : {}),
    })
    .eq("id", application.id)
    .eq("user_id", application.user_id)
    .select("id")
    .single();
  if (result.error || !result.data)
    throw new Error("The change was not saved. Please retry.");
}
export async function deleteApplication(application: TrackedApplication) {
  const result = await mvpSupabase
    .from("tracked_applications")
    .delete()
    .eq("id", application.id)
    .eq("user_id", application.user_id)
    .select("id")
    .single();
  if (result.error || !result.data)
    throw new Error("The tracker entry was not deleted.");
}
export async function startCheckout(requestId: string) {
  return checkoutSchema.parse(await invoke<unknown>("create-checkout", { requestId }));
}

export const checkoutSchema = z.discriminatedUnion("provider", [
  z.object({provider:z.literal("paddle"),transactionId:z.string().regex(/^txn_[a-z0-9]{26}$/),billingMode:z.enum(["test","live"])}),
  z.object({provider:z.literal("stripe"),sessionId:z.string().min(1),billingMode:z.enum(["test","live"]),url:z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password;},'The checkout address was invalid.')}),
]);
