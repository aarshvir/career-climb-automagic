import { mvpSupabase, type CvDocument } from "./cv-database";
import { CV_MIME_TYPES, validateCvFile, validateCvText } from "./cv-extraction";
import { downloadBlob, safeDocumentFilename } from "./document-download";

export { extractCvText, MAX_CV_BYTES, MAX_CV_TEXT_LENGTH } from "./cv-extraction";
export type { CvDocument, ApplicationPack, TrackedApplication } from "./cv-database";
export const CV_DOCUMENT_BUCKET = "cv-documents";

export class CvSaveUnconfirmedError extends Error {
  constructor(public readonly documentId: string) {
    super(`Your file was uploaded, but we could not confirm whether its CV record was saved. Refresh your saved CV list before uploading again. Your uploaded file has been preserved. If it remains missing, contact support with reference ${documentId}.`);
    this.name = "CvSaveUnconfirmedError";
  }
}

function isDefiniteMetadataRejection(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  // SQL data/constraint/access errors reject the transaction. Transport failures,
  // missing responses and PostgREST representation errors do not prove rejection.
  return typeof error.code === "string" && /^(22|23|42)[A-Z0-9]{3}$/.test(error.code);
}

async function requireOwner(userId: string): Promise<void> {
  const { data, error } = await mvpSupabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again before accessing your CV.");
  if (data.user.id !== userId) throw new Error("You can only access CVs in your own account.");
}

function assertOwnedPath(cv: CvDocument): void {
  if (!cv.storage_path.startsWith(`${cv.user_id}/`) || cv.storage_path.includes("..")) {
    throw new Error("The CV storage reference is invalid. Your file has not been accessed.");
  }
}

export async function uploadCvDocument(userId: string, file: File, reviewedText: string): Promise<CvDocument> {
  const type = validateCvFile(file);
  const text = validateCvText(reviewedText);
  await requireOwner(userId);
  const documentId = crypto.randomUUID();
  const storagePath = `${userId}/${documentId}.${type}`;
  const bucket = mvpSupabase.storage.from(CV_DOCUMENT_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, file, { contentType: CV_MIME_TYPES[type], upsert: false });
  if (uploadError) throw new Error("Your CV file could not be uploaded. Check your connection and try again.");
  let metadataError: unknown;
  try {
    const { data, error } = await mvpSupabase.from("cv_documents").insert({
      id: documentId,
      user_id: userId,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: CV_MIME_TYPES[type],
      byte_size: file.size,
      text_content: text,
    }).select().single();
    if (!error && data?.id === documentId && data.user_id === userId && data.storage_path === storagePath) return data;
    metadataError = error;
  } catch (error) {
    metadataError = error;
  }

  // An insert can commit even when its response is lost. Reconcile before cleanup.
  try {
    await requireOwner(userId);
    const { data, error } = await mvpSupabase.from("cv_documents").select()
      .eq("id", documentId).eq("user_id", userId).eq("storage_path", storagePath).maybeSingle();
    if (error) throw error;
    if (data) {
      if (data.id === documentId && data.user_id === userId && data.storage_path === storagePath) return data;
      throw new Error("The reconciliation response did not match the uploaded CV.");
    }
  } catch {
    throw new CvSaveUnconfirmedError(documentId);
  }
  // A currently absent row does not prove that an in-flight write failed.
  if (!isDefiniteMetadataRejection(metadataError)) throw new CvSaveUnconfirmedError(documentId);
  try {
    const { error: rollbackError } = await bucket.remove([storagePath]);
    if (rollbackError) throw rollbackError;
  } catch {
    throw new Error("Your CV was not saved, and its uploaded file could not be cleaned up. Please retry or contact support to remove the orphan file.");
  }
  throw new Error("Your CV details could not be saved. The upload was not completed, and its temporary file was removed.");
}

export async function listCvDocuments(userId: string): Promise<CvDocument[]> {
  await requireOwner(userId);
  const { data, error } = await mvpSupabase.from("cv_documents").select().eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error("Your saved CVs could not be loaded. Please retry.");
  return data ?? [];
}

export async function downloadOriginalCv(cv: CvDocument): Promise<void> {
  await requireOwner(cv.user_id);
  assertOwnedPath(cv);
  const { data, error } = await mvpSupabase.storage.from(CV_DOCUMENT_BUCKET).download(cv.storage_path);
  if (error || !data) throw new Error("Your original CV could not be downloaded. Please retry.");
  downloadBlob(data, safeDocumentFilename(cv.original_filename));
}

export async function deleteCvDocument(cv: CvDocument): Promise<void> {
  await requireOwner(cv.user_id);
  assertOwnedPath(cv);
  // Keep metadata on storage failure so deletion can be retried honestly.
  const { error: storageError } = await mvpSupabase.storage.from(CV_DOCUMENT_BUCKET).remove([cv.storage_path]);
  if (storageError) throw new Error("Your CV file could not be deleted. Please retry.");
  const { error } = await mvpSupabase.from("cv_documents").delete().eq("id", cv.id).eq("user_id", cv.user_id);
  if (error) throw new Error("The file was removed, but its saved record could not be deleted. Please retry to finish deletion.");
}
