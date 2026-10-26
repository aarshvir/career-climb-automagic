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

