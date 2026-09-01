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

    window.Tawk_API = {};
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
