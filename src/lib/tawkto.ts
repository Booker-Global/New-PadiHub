/**
 * Tawk.to live chat widget helpers.
 *
 * The widget script itself is loaded once, globally, by <TawkToWidget/>
 * (rendered from RootLayout so it's present on every page). Anywhere else
 * in the app — e.g. "Start Chat" buttons — can call toggleTawkChat() to
 * open/close it via the official Tawk_API.toggle() method.
 *
 * Configuration is via VITE_TAWKTO_PROPERTY_ID / VITE_TAWKTO_WIDGET_ID
 * (build-time env vars, same pattern as VITE_STRIPE_PUBLISHABLE_KEY — see
 * src/pages/payments/methods.tsx). If unset, the script is not injected and
 * toggleTawkChat() safely no-ops.
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

const TAWKTO_PROPERTY_ID = env.VITE_TAWKTO_PROPERTY_ID?.trim() || '';
const TAWKTO_WIDGET_ID = env.VITE_TAWKTO_WIDGET_ID?.trim() || 'default';

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
