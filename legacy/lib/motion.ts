import type { Transition, Variants } from "framer-motion";

/**
 * Central motion vocabulary. Springs (not default easings) give physical,
 * non-"AI-slop" feel. Durations mirror the CSS tokens in globals.css.
 */
export const spring = {
  /** Snappy — buttons, thumbs, small pops. */
  snappy: { type: "spring", stiffness: 500, damping: 34 } as Transition,
  /** Default — layout, sliding indicators, sheets. */
  soft: { type: "spring", stiffness: 380, damping: 32 } as Transition,
  /** Gentle — larger elements, hero pieces. */
  gentle: { type: "spring", stiffness: 220, damping: 26 } as Transition,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const dur = { fast: 0.12, base: 0.2, slow: 0.42 } as const;

/** Fade + rise, for client-revealed content only (not SSR). */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: dur.slow, ease: ease.out } },
};

/** Stagger container for lists revealed on the client. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};
