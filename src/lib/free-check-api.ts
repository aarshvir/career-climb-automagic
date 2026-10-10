import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mvpSupabase } from "./cv-database";

export type FreeCvCheck = {
  id: string;
  user_id: string;
  request_id: string;
  job_title: string;
  company: string;
  job_description: string;
  original_text: string;
  reviewed_text: string;
  method_version: string;
  status: "draft" | "approved";
  created_at: string;
  updated_at: string;
};
export type SaveFreeCheckInput = {
  requestId: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
  originalText: string;
  reviewedText: string;
  methodVersion: string;
  approved: boolean;
};
type FreeCheckInsert = Omit<FreeCvCheck, "id" | "created_at" | "updated_at">;
type FreeCheckDatabase = {
  public: {
    Tables: { cv_checks: { Row: FreeCvCheck; Insert: FreeCheckInsert; Update: never; Relationships: [] } };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
// A typed boundary on the same existing auth client, not another auth session.
const freeCheckClient = mvpSupabase as unknown as SupabaseClient<FreeCheckDatabase>;
const inputSchema = z.object({
  requestId: z.string().uuid(),
  jobTitle: z.string().max(200).trim().min(2),
  company: z.string().max(200).trim(),
  jobDescription: z.string().max(20000).trim().min(80),
  originalText: z.string().max(60000).trim().min(80),
  reviewedText: z.string().max(60000).trim().min(80),
  methodVersion: z.string().max(80).trim().min(1),
  approved: z.literal(true),
});

export class FreeCheckSaveUnconfirmedError extends Error {
  constructor(public readonly requestId: string) {
    super("We could not confirm whether your CV check was saved. Refresh your saved checks, or retry with the same save reference. No existing check has been replaced.");
    this.name = "FreeCheckSaveUnconfirmedError";
  }
}

async function requireOwner(userId: string): Promise<void> {
  const { data, error } = await freeCheckClient.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again to access your saved CV checks.");
  if (data.user.id !== userId) throw new Error("Your account changed. Saved CV checks can only be accessed by their owner.");
}

function matchesSnapshot(record: FreeCvCheck, input: FreeCheckInsert): boolean {
  return (Object.keys(input) as (keyof FreeCheckInsert)[]).every((key) => record[key] === input[key]);
}

async function findOwnedCheck(userId: string, requestId: string): Promise<FreeCvCheck | null> {
  await requireOwner(userId);
  const { data, error } = await freeCheckClient.from("cv_checks").select()
    .eq("user_id", userId).eq("request_id", requestId).maybeSingle();
  await requireOwner(userId);
  if (error) throw new Error("Saved CV checks could not be checked. Please retry.");
  if (data && (data.user_id !== userId || data.request_id !== requestId)) throw new Error("The saved CV check did not match your account.");
  return data;
}

function validatedSnapshot(record: FreeCvCheck, expected: FreeCheckInsert): FreeCvCheck {
  if (!matchesSnapshot(record, expected)) throw new Error("This save reference belongs to a different CV review. Start a new save to keep both versions separate.");
  return record;
}

/** Explicit account save only. Immutable snapshots contain inputs, never client evidence scores. */
export async function saveFreeCheck(userId: string, input: SaveFreeCheckInput): Promise<FreeCvCheck> {
  const valid = inputSchema.parse(input);
  const snapshot: FreeCheckInsert = {
    user_id: userId,
    request_id: valid.requestId,
    job_title: valid.jobTitle,
    company: valid.company,
    job_description: valid.jobDescription,
    original_text: valid.originalText,
    reviewed_text: valid.reviewedText,
    method_version: valid.methodVersion,
    status: "approved",
  };
  const existing = await findOwnedCheck(userId, valid.requestId);
  if (existing) return validatedSnapshot(existing, snapshot);
  await requireOwner(userId);
  let saved: FreeCvCheck | null = null;
  try {
    const result = await freeCheckClient.from("cv_checks").insert(snapshot).select().single();
    if (!result.error) saved = result.data;
  } catch {
    // The write may have committed before the transport lost its response.
  }
  if (saved) {
    await requireOwner(userId);
    return validatedSnapshot(saved, snapshot);
  }
  let recovered: FreeCvCheck | null;
  try {
    recovered = await findOwnedCheck(userId, valid.requestId);
  } catch {
    throw new FreeCheckSaveUnconfirmedError(valid.requestId);
  }
  if (recovered) return validatedSnapshot(recovered, snapshot);
  throw new FreeCheckSaveUnconfirmedError(valid.requestId);
}

export async function listFreeChecks(userId: string): Promise<FreeCvCheck[]> {
  await requireOwner(userId);
  const { data, error } = await freeCheckClient.from("cv_checks").select()
    .eq("user_id", userId).order("created_at", { ascending: false });
  await requireOwner(userId);
  if (error) throw new Error("Your saved CV checks could not be loaded. Please refresh to retry.");
  if (data?.some((record) => record.user_id !== userId)) throw new Error("The saved CV checks did not match your account.");
  return data ?? [];
}

export async function deleteFreeCheck(record: FreeCvCheck): Promise<void> {
  await requireOwner(record.user_id);
  const { error } = await freeCheckClient.from("cv_checks").delete().eq("id", record.id).eq("user_id", record.user_id);
  await requireOwner(record.user_id);
  if (error) throw new Error("Your saved CV check could not be deleted. Refresh your list before retrying.");
}
