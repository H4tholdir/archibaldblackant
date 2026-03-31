import type { SpringConfig } from 'remotion';

/** Bounce morbido — per loghi e hero elements */
export const springBounce: SpringConfig = {
  mass: 0.8,
  damping: 18,
  stiffness: 120,
  overshootClamping: false,
};

/** Entry decisa — per cards che entrano in scena */
export const springCard: SpringConfig = {
  mass: 1,
  damping: 15,
  stiffness: 100,
  overshootClamping: false,
};

/** Testo preciso — slide-in senza rimbalzo */
export const springText: SpringConfig = {
  mass: 1,
  damping: 200,
  stiffness: 200,
  overshootClamping: true,
};
