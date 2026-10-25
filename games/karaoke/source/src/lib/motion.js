// Motion identity: "Playful", tuned for a party screen.
// One signature spring for ~80% of UI, three durations, one entrance (rise like a lyric line).

export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 };
export const springSoft = { type: "spring", stiffness: 220, damping: 26 };
export const springPop = { type: "spring", stiffness: 520, damping: 18 };

export const dur = { quick: 0.14, standard: 0.28, slow: 0.6 };

export const easeOut = [0.05, 0.7, 0.1, 1];
export const easeIn = [0.3, 0, 1, 1];

export const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: dur.standard * 1.4, ease: easeOut } },
  exit: { opacity: 0, y: -10, transition: { duration: dur.standard * 0.7, ease: easeIn } },
};

export const stagger = (each = 0.04, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
});

export const screen = {
  initial: { opacity: 0, scale: 0.985, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: dur.slow, ease: easeOut },
    transitionEnd: { filter: "none" },
  },
  exit: { opacity: 0, scale: 1.01, filter: "blur(6px)", transition: { duration: dur.standard, ease: easeIn } },
};
