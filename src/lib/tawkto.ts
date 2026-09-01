/**
 * Tawk.to live chat widget helpers.
 *
 * The widget script itself is loaded once, globally, by <TawkToWidget/>
 * (rendered from RootLayout so it's present on every page). Anywhere else
 * in the app — e.g. "Start Chat" buttons — can call toggleTawkChat() to
 * open/close it via the official Tawk_API.toggle() method.
 *
 * Defaults to PadiHub's live Tawk.to property/widget IDs (from the official
 * embed snippet), so live chat works without any env configuration. This can
 * be overridden per deployment via VITE_TAWKTO_PROPERTY_ID / VITE_TAWKTO_WIDGET_ID
 * (build-time env vars, same pattern as VITE_STRIPE_PUBLISHABLE_KEY — see
 * src/pages/payments/methods.tsx) — e.g. to point a staging build at a
 * separate Tawk.to property.
 */

declare global {
  interface Window {
    Tawk_API?: {
      toggle?: () => void;
      maximize?: () => void;
      minimize?: () => void;
      [key: string]: unknown;
    };
    Tawk_LoadStart?: Date;
  }
}

const env = import.meta.env as Record<string, string | undefined>;

// Defaults to PadiHub's live Tawk.to property/widget (from the official embed
// snippet in the Tawk.to dashboard) so live chat works out of the box even if
// the VITE_TAWKTO_* env vars aren't set in a given deployment. Override via
// env vars to point at a different property (e.g. a staging Tawk.to account).
const DEFAULT_TAWKTO_PROPERTY_ID = '6a96a23f94286534402c295a';
const DEFAULT_TAWKTO_WIDGET_ID = '1k1e6jiii';

const TAWKTO_PROPERTY_ID = env.VITE_TAWKTO_PROPERTY_ID?.trim() || DEFAULT_TAWKTO_PROPERTY_ID;
const TAWKTO_WIDGET_ID = env.VITE_TAWKTO_WIDGET_ID?.trim() || DEFAULT_TAWKTO_WIDGET_ID;

/** Whether a Tawk.to property ID has been configured for this build. */
export function isTawkToConfigured(): boolean {
  return Boolean(TAWKTO_PROPERTY_ID);
}

/** The embed script URL for the configured Tawk.to property/widget. */
export function getTawkToEmbedSrc(): string {
  return `https://embed.tawk.to/${TAWKTO_PROPERTY_ID}/${TAWKTO_WIDGET_ID}`;
}

/**
 * Opens/closes the Tawk.to chat widget via Tawk_API.toggle(). Safe to call
 * even if the widget hasn't finished loading (or isn't configured) yet.
 */
export function toggleTawkChat(): void {
  if (typeof window === 'undefined') return;
  window.Tawk_API?.toggle?.();
}
