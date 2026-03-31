/** Frame di inizio per ogni scena a 30fps */
export const SCENE_START = {
  logoIntro:     0,    // 0s
  problem:       90,   // 3s
  solution:      330,  // 11s
  orders:        420,  // 14s
  dashboard:     720,  // 24s
  customers:     1020, // 34s
  bot:           1260, // 42s
  notifications: 1500, // 50s
  closing:       1710, // 57s
} as const;

/** Durata in frame per ogni scena */
export const SCENE_DURATION = {
  logoIntro:     90,
  problem:       240,
  solution:      90,
  orders:        300,
  dashboard:     300,
  customers:     240,
  bot:           240,
  notifications: 210,
  closing:       540,
} as const;

export const TOTAL_FRAMES = 2250; // 75s @ 30fps
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
