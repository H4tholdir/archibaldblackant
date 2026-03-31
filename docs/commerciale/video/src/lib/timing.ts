// src/lib/timing.ts
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Durata in frame per ogni scena (usata da Series.Sequence) */
export const SCENE_FRAMES = {
  logo:          120,   // 4s
  problem:       420,   // 14s
  solution:      150,   // 5s
  orders:        540,   // 18s
  iva:           480,   // 16s
  pending:       480,   // 16s
  storico:       600,   // 20s
  clients:       540,   // 18s
  warehouse:     420,   // 14s
  quotes:        420,   // 14s
  dashboard:     480,   // 16s
  documents:     480,   // 16s
  integrations:  540,   // 18s
  notifications: 420,   // 14s
  closing:       300,   // 10s
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);
// = 6390 frame = ~213s = ~3:33

/** Frame di crossfade tra scene */
export const TRANSITION = 15;

// Legacy: mantieni SCENE_DURATION per compatibilità con scene vecchie durante migrazione
export const SCENE_DURATION = {
  ...SCENE_FRAMES,
  // Legacy key aliases (scene v1)
  logoIntro:     SCENE_FRAMES.logo,
  customers:     SCENE_FRAMES.clients,
  bot:           180,  // scena Bot vecchia non presente in SCENE_FRAMES v2
} as const;
