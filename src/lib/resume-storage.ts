import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const MIME_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export const RESUME_BUCKET = "jobassist";

export type AllowedResumeExtension = keyof typeof MIME_TYPE_BY_EXTENSION;

export const ALLOWED_RESUME_EXTENSIONS = Object.keys(MIME_TYPE_BY_EXTENSION) as AllowedResumeExtension[];
export const ALLOWED_RESUME_MIME_TYPES = Object.values(MIME_TYPE_BY_EXTENSION);

const isAllowedMimeType = (mimeType: string): mimeType is typeof ALLOWED_RESUME_MIME_TYPES[number] => {
  return (ALLOWED_RESUME_MIME_TYPES as string[]).includes(mimeType);
};

export const getResumeFileExtension = (file: File): AllowedResumeExtension | undefined => {
  const parts = file.name.split(".");
  if (parts.length < 2) {
    return undefined;
  }
  const ext = parts.pop()?.toLowerCase();
  if (!ext) {
    return undefined;
  }
  return (ALLOWED_RESUME_EXTENSIONS as string[]).includes(ext) ? (ext as AllowedResumeExtension) : undefined;
};

export const getPreferredResumeMimeType = (file: File): string | undefined => {
  const extension = getResumeFileExtension(file);
  if (extension) {
    return MIME_TYPE_BY_EXTENSION[extension];
  }
  if (file.type && isAllowedMimeType(file.type)) {
    return file.type;
  }
  return undefined;
};

export const isValidResumeFile = (file: File): boolean => {
  const extension = getResumeFileExtension(file);
  if (extension) {
    return true;
  }
  return file.type ? isAllowedMimeType(file.type) : false;
};

export const normalizeResumeFile = (file: File): File => {
  const preferredType = getPreferredResumeMimeType(file);
  if (preferredType && file.type !== preferredType) {
    return new File([file], file.name, { type: preferredType, lastModified: file.lastModified });
  }
  return file;
};

export const buildResumeStoragePath = (userId: string, file: File): string => {
  const extension = getResumeFileExtension(file) ?? "pdf";
  return `${userId}/${Date.now()}.${extension}`;
};

const isMissingResumeMetadataError = (error: PostgrestError | null) => {
  if (!error) {
    return false;
  }

  if (error.code === "42703") {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("file_name") && message.includes("does not exist")
  ) || message.includes("column") && message.includes("does not exist");
};

const isMissingResumesTableError = (error: PostgrestError | null) => {
  if (!error) {
    return false;
  }

  if (error.code === "42P01") {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return message.includes("relation") && message.includes("resumes") && message.includes("does not exist");
};

const shouldIgnoreResumePersistenceError = (error: PostgrestError | null) => {
  return isMissingResumeMetadataError(error) || isMissingResumesTableError(error);
};

interface SaveResumeRecordOptions {
  userId: string;
  filePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
}

export interface ResumeRecord {
  id: string;
  file_path: string;
  created_at: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
}

interface SaveResumeRecordResult {
  data: ResumeRecord[] | null;
  error: PostgrestError | null;
  ignoredError?: PostgrestError | null;
  fallbackApplied?: "minimal" | "skipped";
}

export const saveResumeRecord = async ({
  userId,
  filePath,
  originalFileName,
  fileSize,
  mimeType,
}: SaveResumeRecordOptions): Promise<SaveResumeRecordResult> => {
  // For mobile devices, validate session before proceeding
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|samsung/i.test(navigator.userAgent);
  if (isMobile) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Session expired. Please refresh the page and try again.');
    }
  }

  const metadataPayload = {
    user_id: userId,
    file_path: filePath,
    file_name: originalFileName,
    file_size: fileSize,
    mime_type: mimeType,
  };

  let { data, error } = await supabase
    .from("resumes")
    .insert(metadataPayload)
    .select();

  if (isMissingResumesTableError(error)) {
    console.warn("Resumes table missing, skipping metadata insert", error);
    return { data: null, error: null, ignoredError: error, fallbackApplied: "skipped" };
  }

  if (isMissingResumeMetadataError(error)) {
    console.warn("Resume metadata columns missing, falling back to minimal record", error);
    ({ data, error } = await supabase
      .from("resumes")
      .insert({
        user_id: userId,
        file_path: filePath,
      })
      .select());

    if (shouldIgnoreResumePersistenceError(error)) {
      console.warn(
        "Minimal resume record insert failed, continuing without database metadata",
        error,
      );
      return { data: null, error: null, ignoredError: error, fallbackApplied: "skipped" };
    }

    if (!error) {
      return { data: data as ResumeRecord[] | null, error: null, fallbackApplied: "minimal" };
    }
  }

  return { data: data as ResumeRecord[] | null, error };
};

export const shouldFallbackToStorageListing = (error: PostgrestError | null) => {
  return shouldIgnoreResumePersistenceError(error);
};

export const listResumesFromStorage = async (
  userId: string,
): Promise<{ data: ResumeRecord[] | null; error: Error | null }> => {
  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .list(userId, {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    return { data: null, error };
  }

  const records = (data ?? [])
    .filter((item) => item && typeof item.name === "string" && !item.name.endsWith("/"))
    .map((item) => {
      const metadata = (item as { metadata?: Record<string, unknown> }).metadata ?? {};
      const size = typeof metadata.size === "number" ? metadata.size : null;
      const mimetype = typeof metadata.mimetype === "string" ? metadata.mimetype : null;

      return {
        id: `storage:${(item as { id?: string }).id ?? item.name}`,
        file_path: `${userId}/${item.name}`,
        file_name: item.name,
        file_size: size,
        mime_type: mimetype,
        created_at:
          item.created_at ??
          item.updated_at ??
          item.last_accessed_at ??
          new Date().toISOString(),
      } satisfies ResumeRecord;
    });

  return { data: records, error: null };
};
