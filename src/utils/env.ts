export const isDevEnv = () => {
  if (typeof window === "undefined") return false;
  return /lovable\.dev/.test(window.location.host) || /localhost/.test(window.location.host);
};

export const appBaseUrl = () => {
  if (typeof window === "undefined") return "https://jobvance.io";
  return isDevEnv() ? window.location.origin : "https://jobvance.io";
};

export const redirectAfterAuth = () => {
  if (typeof window === "undefined") return;
  const target = isDevEnv()
    ? `${window.location.origin}/dashboard`
    : "https://jobvance.io/dashboard";
  window.location.assign(target);
};
