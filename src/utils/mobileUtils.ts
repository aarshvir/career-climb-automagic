export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|samsung/.test(userAgent);
};

export const isSamsungDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('samsung');
};

export const cloneFile = (file: File): File => {
  // Create a new File object to prevent "file changed" errors on mobile
  return new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
};

export const validateFileIntegrity = (originalFile: File, clonedFile: File): boolean => {
  return (
    originalFile.name === clonedFile.name &&
    originalFile.size === clonedFile.size &&
    originalFile.type === clonedFile.type
  );
};

export const getMobileUploadTimeouts = () => {
  const isMobile = isMobileDevice();
  return {
    uploadTimeout: isMobile ? 60000 : 30000, // 60s for mobile, 30s for desktop
    retryDelay: isMobile ? 2000 : 1000, // 2s for mobile, 1s for desktop
    maxRetries: isMobile ? 3 : 2, // More retries for mobile
  };
};