/** Social apps open links in their own browser, where Google blocks sign-in ("disallowed_useragent"). */
export type InAppBrowser = 'Instagram' | 'Facebook' | 'Messenger' | 'TikTok' | 'LinkedIn';

export function detectInAppBrowser(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): InAppBrowser | null {
  if (/Instagram/i.test(userAgent)) return 'Instagram';
  if (/FBAN\/Messenger|MessengerForiOS|Orca-Android/i.test(userAgent)) return 'Messenger';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(userAgent)) return 'Facebook';
  if (/musical_ly|TikTok|BytedanceWebview/i.test(userAgent)) return 'TikTok';
  if (/LinkedInApp/i.test(userAgent)) return 'LinkedIn';
  return null;
}

export const isAndroid = (userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) => /Android/i.test(userAgent);

/** A link that asks the phone to reopen this page in its normal browser.
 * Android hands an intent to Chrome (falling back to the page itself); iOS uses Safari's scheme. */
export function openInBrowserHref(url: string, userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const target = new URL(url);
  if (isAndroid(userAgent)) return `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target.toString())};end`;
  return `x-safari-${target.toString()}`;
}
