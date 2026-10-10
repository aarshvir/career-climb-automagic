export interface ErrorDetails {
  message?: string;
  statusCode?: number;
  details?: string;
  hint?: string;
  code?: string;
}

export const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  const errorDetails = error as ErrorDetails;
  const message = errorDetails?.message || '';

  // Mobile-specific errors
  if (message.includes("ERR_UPLOAD_FILE_CHANGED") || message.includes("file changed")) {
    return "File upload interrupted. Please try selecting and uploading your file again.";
  } else if (message.includes("new row violates row-level security policy")) {
    return "Permission denied. Please ensure you're logged in and try again.";
  } else if (message.includes("bucket")) {
    return "Storage configuration error. Please contact support.";
  } else if (message.includes("permission")) {
    return "Permission denied. Please ensure you're logged in and try again.";
  } else if (message.includes("network") || message.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  } else if (message.includes("timeout")) {
    return "Request timed out. Please try again.";
  } else if (errorDetails?.statusCode === 413) {
    return "File too large. Please upload a smaller file.";
  } else if (message.includes("session") || message.includes("auth")) {
    return "Session expired. Please refresh the page and try again.";
  }

  return defaultMessage;
};

export const logError = (context: string, error: unknown) => {
  console.error(`${context}:`, error);
};
