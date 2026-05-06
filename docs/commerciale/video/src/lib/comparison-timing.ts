// src/lib/comparison-timing.ts
export const C = {
  FPS: 30,

  // ── VIDEO 1: Order Creation ──────────────────────────────────
  V1: {
    // Durations for Series.Sequence (use as durationInFrames)
    WORKFLOWS_DUR:  600,   // 20s
    INTRO_DUR:      210,   // 7s
    CONTEXT_DUR:    240,   // 8s
    SPLIT_DUR:     7440,   // 248s*30fps — ERP video ends at 248s
    SUMMARY_DUR:    600,   // 20s
    TOTAL:         9090,   // 600+210+240+7440+600

    // Timer: start at frame 0 (videos now start AT order creation)
    ERP_ORDER_START_FRAME: 0,
    PWA_ORDER_START_FRAME: 0,

    // Video startFrom in composition frames (30fps)
    ERP_VIDEO_START_FROM: 420,   // 14s * 30fps
    PWA_VIDEO_START_FROM: 180,   // 6s * 30fps

    // ERP key frames (relative to split-screen start)
    ERP_CUSTOMER_START: 300,   // 10s — customer search
    ERP_CUSTOMER_DONE:  1080,  // 36s — customer selected
    ERP_ARTICLE_START:  1350,  // 45s — article search
    ERP_PACKAGING:      3390,  // 113s — packaging/qty
    ERP_SAVE:           6780,  // 226s — save
    ERP_DONE_REL:       7290,  // 243s — agente preme invia

    // PWA key frames (relative to split-screen start)
    PWA_CUSTOMER_START:     60,   // 2s — customer appears
    PWA_CUSTOMER_DONE:     120,   // 4s — customer selected
    PWA_ARTICLE_START:     210,   // 7s — article search
    PWA_PACKAGING_AUTO:    420,   // 14s — article+packaging auto
    PWA_PRICE_AUTO:        990,   // 33s — price/discount auto
    PWA_AGENT_SAVE:       2040,   // 68s — agente salva
    PWA_AGENT_DONE_REL:   2250,   // 75s — agente preme invia (primo done)
    PWA_BOT_DONE:         4980,   // 166s — ordine su ERP via bot (secondo done)
    PWA_ERP_VISIBLE:      5550,   // 185s — ordine visibile su ERP
    PWA_DONE_REL:         5670,   // 189s — fine video PWA

    // Legacy aliases (usati da InsightCard e SubtitleBar)
    CH1_FRAME:  300,   // = ERP_CUSTOMER_START
    CH2_FRAME: 1350,   // = ERP_ARTICLE_START
    CH3_FRAME: 3390,   // = ERP_PACKAGING
    CH4_FRAME: 6780,   // = ERP_SAVE
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
