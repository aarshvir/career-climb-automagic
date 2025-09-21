export type AnalyticsPayload = Record<string, unknown>;

export const trackEvent = (name: string, payload: AnalyticsPayload = {}) => {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("analytics", {
          detail: {
            name,
            payload,
            timestamp: Date.now(),
          },
        }),
      );
    }
  } catch (error) {
    console.error("Failed to dispatch analytics event", name, error);
  }

  if (import.meta.env.DEV) {
    console.info(`[analytics] ${name}`, payload);
  }
};
