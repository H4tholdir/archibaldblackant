// src/lib/comparison-timing.ts
export const C = {
  FPS: 30,

  // ── VIDEO 1: Order Creation ──────────────────────────────────
  V1: {
    // Scena 0: Two Workflows
    WORKFLOWS_START:   0,
    WORKFLOWS_END:     360,   // 12s

    // Scena 1: Intro
    INTRO_START:       360,
    INTRO_END:         480,   // 4s

    // Scena 2: Context
    CONTEXT_START:     480,
    CONTEXT_END:       660,   // 6s

    // Scena 3: Split-Screen (ERP: 262s, PWA: 195s)
    SPLIT_START:       660,
    PWA_DONE:          6510,  // 660 + 195*30
    ERP_DONE:          8520,  // 660 + 262*30
    SPLIT_END:         8520,

    // Scena 4: Summary
    SUMMARY_START:     8520,
    SUMMARY_END:       8970,  // 15s

    TOTAL:             8970,

    // Callout frames (assoluti, dentro split-screen)
    CH1_FRAME:         1500,  // ~28s dopo SPLIT_START
    CH2_FRAME:         3000,  // ~78s
    CH3_FRAME:         4440,  // ~126s
    CH4_FRAME:         5850,  // ~173s
  },

  // ── VIDEO 2: New Customer + Order ───────────────────────────
  V2: {
    WORKFLOWS_START:   0,
    WORKFLOWS_END:     360,

    INTRO_START:       360,
    INTRO_END:         480,

    CONTEXT_START:     480,
    CONTEXT_END:       660,

    // Part A: Customer (ERP: 178s, PWA: 122s)
    CUST_SPLIT_START:  660,
    CUST_PWA_DONE:     4320,  // 660 + 122*30
    CUST_ERP_DONE:     5700,  // 660 + 178*30

    // Part B: Order (ERP: 92s, PWA: 65s)
    ORD_SPLIT_START:   5700,
    PWA_TOTAL_DONE:    8370,  // 5700 + 187*30  (187 = 122+65)
    ERP_TOTAL_DONE:    9510,  // 5700 + 270*30  (270 = 178+92) — clamped

    SUMMARY_START:     9510,
    SUMMARY_END:       10110, // 20s

    TOTAL:             10110,

    // Callout frames Part A
    DEVICE_FRAME:      1200,
    FORM_FRAME:        2700,
  },
} as const;
