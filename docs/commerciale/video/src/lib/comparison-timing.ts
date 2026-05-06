// src/lib/comparison-timing.ts
export const C = {
  FPS: 30,

  // ── VIDEO 1: Order Creation ──────────────────────────────────
  V1: {
    // Durations for Series.Sequence (use as durationInFrames)
    WORKFLOWS_DUR:  360,   // 12s
    INTRO_DUR:      120,   // 4s
    CONTEXT_DUR:    180,   // 6s
    SPLIT_DUR:     7860,   // 262s * 30fps (ERP is the longer video)
    SUMMARY_DUR:    450,   // 15s
    TOTAL:         8970,   // 360+120+180+7860+450

    // Relative frames within OrderSplitScreen (frame 0 = split-screen start)
    PWA_DONE_REL:  5850,   // 195 * 30
    ERP_DONE_REL:  7860,   // 262 * 30  (= SPLIT_DUR)

    // Callout chapter frames (relative to split-screen start)
    CH1_FRAME:      840,   // ~28s
    CH2_FRAME:     2340,   // ~78s
    CH3_FRAME:     3780,   // ~126s
    CH4_FRAME:     5190,   // ~173s
  },

  // ── VIDEO 2: New Customer + Order ───────────────────────────
  V2: {
    // Durations for Series.Sequence
    WORKFLOWS_DUR:    360,   // 12s
    INTRO_DUR:        120,   // 4s
    CONTEXT_DUR:      180,   // 6s
    CUST_SPLIT_DUR:  5340,   // 178s * 30fps (ERP customer, longer)
    ORD_SPLIT_DUR:   2760,   // 92s * 30fps  (ERP order, longer)
    SUMMARY_DUR:      600,   // 20s
    TOTAL:           9360,   // 360+120+180+5340+2760+600

    // Relative frames within CustomerSplitScreen (frame 0 = customer split start)
    CUST_PWA_DONE_REL:  3660,  // 122 * 30
    CUST_ERP_DONE_REL:  5340,  // 178 * 30  (= CUST_SPLIT_DUR)
    DEVICE_FRAME:        540,  // ~18s
    FORM_FRAME:         2040,  // ~68s

    // Relative frames within OrderContinuationSplitScreen (frame 0 = order split start)
    ORD_PWA_DONE_REL:  1950,  // 65 * 30
    ORD_ERP_DONE_REL:  2760,  // 92 * 30  (= ORD_SPLIT_DUR)

    // Seconds offset for cumulative timer in Part B
    // (Part B timer shows: offsetSeconds + currentFrame/fps)
    CUST_ERP_DURATION_S:  178,  // seconds, offset for ERP cumulative display
    CUST_PWA_DURATION_S:  122,  // seconds, offset for PWA cumulative display
  },
} as const;
