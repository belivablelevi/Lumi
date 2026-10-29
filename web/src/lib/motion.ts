/** Shared motion tokens: short, natural, never blocking. */
export const ease = [0.22, 1, 0.36, 1] as const;
export const duration = { fast: 0.18, base: 0.32, slow: 0.6 } as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } },
} as const;

export const stagger = (step = 0.08) => ({ hidden: {}, show: { transition: { staggerChildren: step } } });

export const press = { whileTap: { scale: 0.97 }, transition: { duration: duration.fast, ease } } as const;
