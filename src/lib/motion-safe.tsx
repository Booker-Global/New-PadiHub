/**
 * motion-safe.tsx — SSR-safe motion primitives for PadiHub
 *
 * ROOT CAUSE OF #418
 * ──────────────────
 * Framer Motion injects inline styles for `initial` props during
 * renderToString (SSR). The client then hydrates against those styles and
 * immediately animates away — React sees the mismatch and throws #418.
 *
 * THE CORRECT FIX (applied in entry-server.tsx)
 * ──────────────────────────────────────────────
 * <MotionConfig initial={false}> wraps the entire SSR render tree.
 * This sets the default `initial` prop to `false` for EVERY motion.*
 * element in the tree — including raw motion.div usages on dashboard/
 * analytics pages — so no inline styles are injected during renderToString.
 * Server and client emit identical markup; React hydrates cleanly.
 *
 * MotionDiv / MotionSection below are kept for API compatibility and also
 * default to initial={false} as a belt-and-suspenders guard.
 *
 * RULES
 * ─────
 * 1. Use <MotionDiv> for any element with animate / whileInView / variants
 *    on public pages.
 * 2. Raw motion.div is safe on any page because MotionConfig in
 *    entry-server.tsx suppresses initial styles globally.
 * 3. Never pass an explicit initial={{ ... }} object to MotionDiv — it
 *    overrides the false default and re-introduces the mismatch.
 */

import { motion } from 'motion/react';
import { createContext, useContext, type ReactNode } from 'react';

// ── MotionReadyProvider (kept for API compatibility) ─────────────────────────
// No longer needed for the hydration fix, but kept so existing imports don't
// break. It's a no-op passthrough.
const MotionReadyContext = createContext(true);

export function MotionReadyProvider({ children }: { children: ReactNode }) {
  return (
    <MotionReadyContext.Provider value={true}>
      {children}
    </MotionReadyContext.Provider>
  );
}

export function useMotionReady() {
  return useContext(MotionReadyContext);
}

// ── MotionDiv ────────────────────────────────────────────────────────────────
// Always renders motion.div. Uses initial={false} as the default so no inline
// styles are injected during SSR. suppressHydrationWarning silences any
// residual attribute diff that Framer Motion may add on first client paint.
type DivProps = Omit<React.ComponentProps<typeof motion.div>, 'ref'>;

export function MotionDiv({ children, initial, ...rest }: DivProps) {
  return (
    <motion.div
      initial={initial !== undefined ? initial : false}
      suppressHydrationWarning
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// ── MotionSection ────────────────────────────────────────────────────────────
type SectionProps = Omit<React.ComponentProps<typeof motion.section>, 'ref'>;

export function MotionSection({ children, initial, ...rest }: SectionProps) {
  return (
    <motion.section
      initial={initial !== undefined ? initial : false}
      suppressHydrationWarning
      {...rest}
    >
      {children}
    </motion.section>
  );
}

// ── MotionCircle ─────────────────────────────────────────────────────────────
// SVG circle with animated strokeDashoffset. Uses initial={false} by default
// so no inline styles are injected during SSR.
type CircleProps = Omit<React.ComponentProps<typeof motion.circle>, 'ref'>;

export function MotionCircle({ initial, ...rest }: CircleProps) {
  return (
    <motion.circle
      initial={initial !== undefined ? initial : false}
      suppressHydrationWarning
      {...rest}
    />
  );
}

// ── MotionProgressBar ────────────────────────────────────────────────────────
// A div used as an animated progress bar fill. Suppresses the width-from-0
// initial state during SSR so server and client emit identical markup.
export function MotionProgressBar({ initial, ...rest }: DivProps) {
  return (
    <motion.div
      initial={initial !== undefined ? initial : false}
      suppressHydrationWarning
      {...rest}
    />
  );
}
