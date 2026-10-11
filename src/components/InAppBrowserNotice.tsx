import React, { useState } from 'react';
import { Smartphone, ExternalLink, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { isInAppBrowser, isIOS, isAndroid, buildAndroidBrowserIntent } from '../utils/inAppBrowser';

/**
 * Warns when Erätutka is running inside an in-app browser (WhatsApp, Facebook, …) whose
 * WebView usually cannot grant geolocation, and offers a way out to a real browser. The
 * detection lives in `utils/inAppBrowser`.
 */
export const InAppBrowserNotice: React.FC = () => {
  const { language } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (dismissed || !isInAppBrowser(ua)) return null;

  const fi = language === 'fi';
  const android = isAndroid(ua);
  const ios = isIOS(ua);
  const href = typeof window !== 'undefined' ? window.location.href : '';

  const heading = fi ? 'Avaa Erätutka selaimessa' : 'Open Erätutka in your browser';
  const body = ios
    ? fi
      ? 'Paikannus ei toimi sovelluksen sisäisessä esikatselussa. Napauta ⋯ tai jakokuvaketta ja valitse ”Avaa Safarissa”.'
      : 'Location does not work in the in-app preview. Tap ⋯ or the share icon and choose “Open in Safari”.'
    : fi
      ? 'Paikannus ei toimi sovelluksen sisäisessä esikatselussa. Avaa linkki oikeassa selaimessa.'
      : 'Location does not work in the in-app preview. Open the link in a real browser.';

  return (
    <div className="fixed top-2 left-1/2 z-[3200] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-500/50 bg-stone-900/95 px-3.5 py-3 text-amber-100 shadow-2xl backdrop-blur-md">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-amber-300">{heading}</div>
          <p className="mt-0.5 text-[12px] leading-snug text-stone-200">{body}</p>
          {android && (
            <a
              href={buildAndroidBrowserIntent(href)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-stone-950 hover:bg-amber-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {fi ? 'Avaa selaimessa' : 'Open in browser'}
            </a>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="close"
          className="shrink-0 rounded-full p-1 text-stone-400 hover:text-stone-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
