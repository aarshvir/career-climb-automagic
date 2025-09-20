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

interface SaveResumeRecordOptions {
  userId: string;
  filePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
}

interface SaveResumeRecordResult {
  error: PostgrestError | null;
}

export const saveResumeRecord = async ({
  userId,
  filePath,
  originalFileName,
  fileSize,
  mimeType,
}: SaveResumeRecordOptions): Promise<SaveResumeRecordResult> => {
  const metadataPayload = {
    user_id: userId,
    file_path: filePath,
    file_name: originalFileName,
    file_size: fileSize,
    mime_type: mimeType,
  };

  const { error } = await supabase.from("resumes").insert(metadataPayload);

  if (!error) {
    return { error: null };
  }

  if (!isMissingResumeMetadataError(error)) {
    return { error };
  }

  console.warn("Resume metadata columns missing, falling back to minimal record", error);

  const { error: fallbackError } = await supabase.from("resumes").insert({
    user_id: userId,
    file_path: filePath,
  });

  return { error: fallbackError };
};
