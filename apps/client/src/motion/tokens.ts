import type { Transition } from "motion/react";

export const spring = {
  snappy: { type: "spring", stiffness: 617, damping: 35.6 },
  smooth: { type: "spring", stiffness: 321, damping: 31.1 },
  bouncy: { type: "spring", stiffness: 395, damping: 17.8 },
} satisfies Record<string, Transition>;

export const dur = { micro: 0.126, base: 0.216, large: 0.378 } as const;
export const ease = { out: [0.22, 1, 0.36, 1] } as const;
export const stagger = 0.036;

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
