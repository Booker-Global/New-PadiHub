import { useEffect } from 'react';
import { getTawkToEmbedSrc, isTawkToConfigured } from '@/lib/tawkto';

/**
 * Loads the Tawk.to live chat widget script once, globally.
 *
 * Rendered from RootLayout so it's present on every page (client-side only —
 * SSR never runs this effect). Renders nothing itself; Tawk.to injects its
 * own floating bubble once the script loads, and any "Start Chat" button can
 * call toggleTawkChat() (see src/lib/tawkto.ts) to open/close it.
 */
export default function TawkToWidget() {
  useEffect(() => {
    if (!isTawkToConfigured()) return;
    // Avoid double-injecting the script on remounts (e.g. React StrictMode).
    if (window.Tawk_API) return;

    // PadiHub renders its own single floating chat launcher (StartChatButton,
    // bottom-left) — hide Tawk.to's own default bubble once it loads so
    // there are never two competing chat widgets on screen at once, while
    // still leaving the actual chat window available via toggleTawkChat().
    //
    // Tawk.to's bubble briefly renders (and is visible) as soon as its
    // script boots, before onLoad fires and hideWidget() takes effect —
    // causing a visible flash on the right edge of the page. Hide it via a
    // CSS override the instant this effect runs (before the script is even
    // requested), then drop the override once hideWidget() has actually
    // run, so Tawk.to's own hidden state takes over for good.
    const hideBeforeLoadStyle = document.createElement('style');
    hideBeforeLoadStyle.setAttribute('data-tawkto-hide-flash', 'true');
    hideBeforeLoadStyle.textContent = '#tawkchat-container, iframe[title="chat widget"], .tawk-min-container { display: none !important; }';
    document.head.appendChild(hideBeforeLoadStyle);

    window.Tawk_API = {
      onLoad: () => {
        window.Tawk_API?.hideWidget?.();
        hideBeforeLoadStyle.remove();
      },
    };
    window.Tawk_LoadStart = new Date();

    // Mirrors Tawk.to's official embed snippet exactly (async script inserted
    // right before the first existing <script> tag, with crossorigin='*')
    // rather than appended to <body>, since some Tawk.to widget features rely
    // on this precise loading order.
    const script = document.createElement('script');
    script.async = true;
    script.src = getTawkToEmbedSrc();
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.body.appendChild(script);
    }
  }, []);

  return null;
}
