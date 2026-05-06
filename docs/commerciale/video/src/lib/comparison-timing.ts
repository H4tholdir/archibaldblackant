// src/lib/comparison-timing.ts
export const C = {
  FPS: 30,

  // ── VIDEO 1: Order Creation ──────────────────────────────────
  V1: {
    // Durations for Series.Sequence (use as durationInFrames)
    WORKFLOWS_DUR:  600,   // 20s (era 360) — più respiro per lettura
    INTRO_DUR:      210,   // 7s (era 120) — logo più tempo
    CONTEXT_DUR:    240,   // 8s (era 180) — più tempo per leggere
    SPLIT_DUR:     7440,   // 248s*30fps — ERP duration after trim (era 7860)
    SUMMARY_DUR:    600,   // 20s (era 450) — più tempo summary
    TOTAL:         9090,   // 600+210+240+7440+600

    // Timer: start at frame 0 (videos now start AT order creation)
    ERP_ORDER_START_FRAME: 0,
    PWA_ORDER_START_FRAME: 0,

    // Video startFrom in composition frames (30fps)
    ERP_VIDEO_START_FROM: 420,   // 14s * 30fps
    PWA_VIDEO_START_FROM: 180,   // 6s * 30fps

    // Key frames (relative to split-screen start = start of trimmed video)
    // NOTE: these are approximate and need calibration after visual review
    PWA_DONE_REL:  5670,  // 189s*30fps — PWA done (era 5850)
    ERP_DONE_REL:  7440,  // 248s*30fps — ERP done (era 7860)

    // Chapter frames (approximate — relative to order creation start)
    CH1_FRAME:      840,  // ~28s — customer selection
    CH2_FRAME:     2340,  // ~78s — article search
    CH3_FRAME:     3780,  // ~126s — packaging
    CH4_FRAME:     5190,  // ~173s — discount & VAT
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

    // Per CustomerSplitScreen — stessa logica (i video iniziano subito, timer parte dopo)
    CUST_ERP_ORDER_START: 0,  // video cliente ERP: agente inizia subito a creare cliente
    CUST_PWA_ORDER_START: 0,  // video cliente PWA: stessa cosa
  },
} as const;
