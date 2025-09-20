const MIME_TYPE_BY_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type AllowedResumeExtension = keyof typeof MIME_TYPE_BY_EXTENSION;

const EXTENSION_BY_MIME = Object.entries(MIME_TYPE_BY_EXTENSION).reduce(
  (acc, [extension, mime]) => {
    acc[mime] = extension as AllowedResumeExtension;
    return acc;
  },
  {} as Record<string, AllowedResumeExtension>
);

export const RESUME_BUCKET = "jobassist" as const;
export const RESUME_STORAGE_PREFIX = "resumes" as const;

export const ALLOWED_RESUME_EXTENSIONS = Object.keys(
  MIME_TYPE_BY_EXTENSION
) as AllowedResumeExtension[];

export const ALLOWED_RESUME_MIME_TYPES = Object.values(MIME_TYPE_BY_EXTENSION);

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40);
};

const removeExtension = (fileName: string) => {
  const parts = fileName.split(".");
  if (parts.length <= 1) {
    return fileName;
  }
  parts.pop();
  return parts.join(".");
};

const resolveExtensionFromMime = (
  mime: string | undefined
): AllowedResumeExtension | undefined => {
  if (!mime) {
    return undefined;
  }
  return EXTENSION_BY_MIME[mime];
};

const coerceToAllowedExtension = (
  extension: string | undefined
): AllowedResumeExtension | undefined => {
  if (!extension) {
    return undefined;
  }
  const lower = extension.toLowerCase();
  return (ALLOWED_RESUME_EXTENSIONS as string[]).includes(lower)
    ? (lower as AllowedResumeExtension)
    : undefined;
};

export const getResumeFileExtension = (
  file: File
): AllowedResumeExtension | undefined => {
  const nameExtension = coerceToAllowedExtension(file.name.split(".").pop());
  if (nameExtension) {
    return nameExtension;
  }
  return resolveExtensionFromMime(file.type);
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
  if (file.type) {
    return ALLOWED_RESUME_MIME_TYPES.includes(file.type);
  }
  return false;
};

export const normalizeResumeFile = (file: File): File => {
  const preferredType = getPreferredResumeMimeType(file);
  if (preferredType && file.type !== preferredType) {
    return new File([file], file.name, {
      type: preferredType,
      lastModified: file.lastModified,
    });
  }
  return file;
};

export const buildResumeStoragePath = (userId: string, file: File): string => {
  const extension =
    getResumeFileExtension(file) ?? resolveExtensionFromMime(file.type) ?? "pdf";
  const baseName = slugify(removeExtension(file.name)) || "resume";
  const timestamp = Date.now();
  return `${RESUME_STORAGE_PREFIX}/${userId}/${timestamp}-${baseName}.${extension}`;
};

export const getResumeDisplayName = (filePath: string): string => {
  const lastSegment = filePath.split("/").pop();
  if (!lastSegment) {
    return "Resume";
  }
  const [withoutExtension] = lastSegment.split(".");
  const nameWithoutPrefix = withoutExtension.replace(/^[0-9]+-/, "");
  const spaced = nameWithoutPrefix.replace(/-/g, " ");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Resume";
};
