/**
 * Detection and escape helpers for in-app browsers.
 *
 * In-app browsers (WhatsApp, Facebook, Instagram, Messenger, …) embed a WebView that usually
 * does not grant geolocation, so Erätutka cannot read the hunter's own position. The choice of
 * browser is the receiving app's to make and there is no URL parameter that forces the system
 * browser, so instead we detect the WebView and guide the hunter out.
 *
 * These are pure functions of the User-Agent string, kept apart from the React component so
 * they can be reasoned about (and tested) without a browser or any app context.
 */

const IN_APP_PATTERNS = [
  /whatsapp/i,
  /fban/i,
  /fbav/i,
  /fb_iab/i,
  /messenger/i,
  /instagram/i,
  /line\//i,
  /snapchat/i,
  /tiktok/i,
  /bytedance/i,
  /musical_ly/i,
  /gsa\//i,
];

export function isInAppBrowser(ua: string): boolean {
  if (!ua) return false;
  if (IN_APP_PATTERNS.some((re) => re.test(ua))) return true;
  // A standalone `wv` token marks an Android WebView (Chrome and Chrome Custom Tabs do not
  // carry it). Custom Tabs delegate permissions and usually DO support geolocation, so only
  // the raw WebView is flagged — that is the case that silently loses the position.
  return /Android/i.test(ua) && /\bwv\b/i.test(ua);
}

export function isIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/**
 * Best-effort Android escape hatch: hand the URL to the system browser.
 *
 * `intent://` cannot carry a URL fragment — the `#` starts the intent parameters — so the
 * hunt key in `#huntKey=…` cannot ride along. The query (`?huntCode=…`) does, and the full
 * URL including the fragment is passed as the documented `S.browser_fallback_url`. If the key
 * is lost this way, the invite message still carries the code and PIN, so the hunter can join.
 */
export function buildAndroidBrowserIntent(href: string): string {
  const data = href.replace(/^https?:\/\//, '').split('#')[0];
  const fallback = encodeURIComponent(href);
  return `intent://${data}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}
