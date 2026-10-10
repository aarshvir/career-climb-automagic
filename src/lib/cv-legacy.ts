import { mvpSupabase } from "./cv-database";
import { MAX_CV_BYTES } from "./cv-extraction";

export type LegacyCvRecord = {
  id: string;
  storage_path: string;
  /** The actual stored filename; a previous human-readable filename may be unavailable. */
  original_filename: string;
  created_at: string | null;
};

const LEGACY_BUCKET = "jobassist";
const LEGACY_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
} as const;

async function requireLegacyOwner(userId: string): Promise<void> {
  if (!userId || userId === "." || userId === ".." || userId.includes("/") || userId.includes("\\")) {
    throw new Error("The legacy CV folder is invalid.");
  }
  const { data, error } = await mvpSupabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again before accessing an existing CV.");
  if (data.user.id !== userId) throw new Error("You can only access existing CVs in your own account.");
}

function legacyExtension(filename: string): keyof typeof LEGACY_TYPES | undefined {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") return undefined;
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension && extension in LEGACY_TYPES ? extension as keyof typeof LEGACY_TYPES : undefined;
}

/** Read legacy files directly from storage. Never create metadata or change the old bucket. */
export async function listLegacyCvs(userId: string): Promise<LegacyCvRecord[]> {
  await requireLegacyOwner(userId);
  const records: LegacyCvRecord[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await mvpSupabase.storage.from(LEGACY_BUCKET).list(userId, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) throw new Error("Existing CVs could not be loaded. Your previous files have not been changed. Please retry.");
    for (const item of data) {
      if (!item.id || !legacyExtension(item.name)) continue; // Folders and non-CV files.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      records.push({
        id: item.id,
        storage_path: `${userId}/${item.name}`,
        original_filename: item.name,
        created_at: item.created_at && Number.isFinite(Date.parse(item.created_at)) ? item.created_at : null,
      });
    }
    if (data.length < 100) return records;
  }
}

/** Returns a local File for the explicit extraction/review/import journey; no persistence. */
export async function downloadLegacyCv(record: LegacyCvRecord, userId: string): Promise<File> {
  await requireLegacyOwner(userId);
  const extension = legacyExtension(record.original_filename);
  if (!extension || record.storage_path !== `${userId}/${record.original_filename}`) {
    throw new Error("The existing CV reference is invalid or belongs to another account. No file has been accessed.");
  }
  const { data, error } = await mvpSupabase.storage.from(LEGACY_BUCKET).download(record.storage_path);
  if (error || !data) throw new Error("Your existing CV could not be downloaded. The original file has not been changed. Please retry.");
  if (data.size === 0) throw new Error("This existing file is empty. Choose another CV.");
  if (data.size > MAX_CV_BYTES) throw new Error("This existing CV exceeds 5 MB. Download and save a smaller version before importing it.");
  return new File([data], record.original_filename, { type: LEGACY_TYPES[extension] });
}
