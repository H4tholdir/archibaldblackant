// src/lib/springs.ts
import type { SpringConfig } from 'remotion';
import { Easing } from 'remotion';

/** Bounce morbido — loghi, badge, pill, hero elements */
export const springBounce: SpringConfig = {
  mass: 0.8,
  damping: 18,
  stiffness: 120,
  overshootClamping: false,
};

/** Entry decisa — cards che entrano in scena */
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

/** Elementi grandi — entrata gentile e pesante */
export const springGentle: SpringConfig = {
  mass: 1.2,
  damping: 20,
  stiffness: 80,
  overshootClamping: false,
};

/** Micro-interazioni — checkmark, dot, snap veloci */
export const springSnap: SpringConfig = {
  mass: 0.6,
  damping: 14,
  stiffness: 200,
  overshootClamping: false,
};

/** Easing Apple standard ease-out */
export const easingApple = Easing.bezier(0.25, 0.1, 0.25, 1);

/** Easing Apple fast-out (per uscite) */
export const easingAppleOut = Easing.bezier(0.0, 0.0, 0.2, 1);
