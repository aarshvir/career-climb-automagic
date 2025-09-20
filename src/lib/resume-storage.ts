const MIME_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export const RESUME_BUCKET = "jobassist";

export type AllowedResumeExtension = keyof typeof MIME_TYPE_BY_EXTENSION;

export const ALLOWED_RESUME_EXTENSIONS = Object.keys(MIME_TYPE_BY_EXTENSION) as AllowedResumeExtension[];
export const ALLOWED_RESUME_MIME_TYPES = Object.values(MIME_TYPE_BY_EXTENSION);

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
  if (file.type && ALLOWED_RESUME_MIME_TYPES.includes(file.type)) {
    return file.type;
  }
  return undefined;
};

export const isValidResumeFile = (file: File): boolean => {
  const extension = getResumeFileExtension(file);
  if (extension) {
    return true;
  }
  return file.type ? ALLOWED_RESUME_MIME_TYPES.includes(file.type) : false;
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
  return `resumes/${userId}/${Date.now()}.${extension}`;
};
