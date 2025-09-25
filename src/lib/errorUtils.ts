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

  if (message.includes("new row violates row-level security policy")) {
    return "Permission denied. Please ensure you're logged in and try again.";
  } else if (message.includes("bucket")) {
    return "Storage configuration error. Please contact support.";
  } else if (message.includes("permission")) {
    return "Permission denied. Please ensure you're logged in and try again.";
  } else if (message.includes("network")) {
    return "Network error. Please check your connection and try again.";
  } else if (message.includes("timeout")) {
    return "Request timed out. Please try again.";
  } else if (errorDetails?.statusCode === 413) {
    return "File too large. Please upload a smaller file.";
  }

  return defaultMessage;
};

export const logError = (context: string, error: unknown) => {
  console.error(`${context}:`, error);
};
