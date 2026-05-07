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
    PWA_VIDEO_START_FROM:  30,   // 1s * 30fps (new video starts at 1s offset)

    // ERP key frames (relative to split-screen start)
    ERP_CUSTOMER_START: 300,   // 10s — customer search
    ERP_CUSTOMER_DONE:  1080,  // 36s — customer selected
    ERP_ARTICLE_START:  1350,  // 45s — article search
    ERP_PACKAGING:      3390,  // 113s — packaging/qty
    ERP_SAVE:           6780,  // 226s — save
    ERP_DONE_REL:       7290,  // 243s — agente preme invia

    // PWA key frames (relative to trim start = 1s from original)
    PWA_CUSTOMER_START:     60,   // 2s
    PWA_CUSTOMER_DONE:     120,   // 4s
    PWA_ARTICLE_START:     180,   // 6s
    PWA_PACKAGING_AUTO:    480,   // 16s
    PWA_PRICE_AUTO:        990,   // 33s
    PWA_AGENT_SAVE:       2550,   // 85s
    PWA_AGENT_DONE_REL:   2700,   // 90s (invia)
    PWA_BOT_START:        2760,   // 92s
    PWA_BOT_DONE:         5580,   // 186s (ordine su ERP)
    PWA_ERP_VISIBLE:      6150,   // 205s
    PWA_DONE_REL:         6330,   // 211s (end of video)

    // Legacy aliases
    CH1_FRAME:  450,   // split 15s
    CH2_FRAME: 1950,   // split 65s
    CH3_FRAME: 3390,   // split 113s
    CH4_FRAME: 4800,   // split 160s
  },

  // ── VIDEO 2: New Customer + Order ───────────────────────────
  V2: {
    // Scene durations
    WORKFLOWS_DUR:  600,   // 20s
    INTRO_DUR:      210,   // 7s
    CONTEXT_DUR:    240,   // 8s
    SPLIT_DUR:     7590,   // 253s * 30fps (ERP dopo trim, più lungo)
    SUMMARY_DUR:    600,   // 20s
    TOTAL:         9240,   // sum

    // Video offsets (startFrom in composition frames a 30fps)
    ERP_VIDEO_START_FROM: 330,   // 11s * 30fps
    PWA_VIDEO_START_FROM: 210,   // 7s * 30fps

    // Timer start (parti subito - ordine inizia dal primo frame)
    ERP_ORDER_START_FRAME: 0,
    PWA_ORDER_START_FRAME: 0,

    // ERP key frames (relativi alla sequenza split dopo trim)
    ERP_IVA:            450,   // 15s — IVA lookup
    ERP_DISCOUNT:      3840,   // 128s — discount pre-selezionato
    ERP_ERRORS:        3990,   // 133s — errori inline
    ERP_CLIENT_SAVED:  4410,   // 147s — cliente salvato
    ERP_ORDER_START:   5100,   // 170s — inizio ordine
    ERP_RESEARCH:      5340,   // 178s — ri-ricerca cliente
    ERP_ARTICLE:       6000,   // 200s — selezione articolo
    ERP_DISCOUNT_BUG:  6780,   // 226s — bug discount scoperto
    ERP_DONE_REL:      7470,   // 249s — ordine inviato (tempo effettivo: 231s dopo esclusione pausa)

    // ERP timer pause (agente mostra scheda cliente, non conta nel confronto)
    ERP_PAUSE_FROM: 4800,   // 160s relativo (02:40 nel video)
    ERP_PAUSE_TO:   5340,   // 178s relativo (02:58 nel video)

    // ERP tempo effettivo dopo esclusione pausa: 249 - 18 = 231s = 3:51
    ERP_EFFECTIVE_TIME_S: 231,

    // PWA key frames (relativi alla sequenza split dopo trim)
    PWA_IVA_AUTOFILL:     690,  // 23s — auto-fill IVA
    PWA_CLIENT_CONFIRMED: 1590, // 53s — cliente confermato
    PWA_ERP_SAVED:        3060, // 102s — salvato su ERP via bot
    PWA_CARD_OPEN:        3390, // 113s — scheda cliente aperta
    PWA_ORDER_TAP:        3510, // 117s — un tap → ordine
    PWA_ARTICLE:          3690, // 123s — articolo selezionato
    PWA_AGENT_DONE_REL:   3690, // 123s — agente ha finito (2:03 totale)
    PWA_BOT_DONE:         5040, // 168s — ordine piazzato su ERP (2:48 totale)
    PWA_DONE_REL:         5280, // 176s — fine video PWA

    // Chapter note frames (spread per note informative)
    CH1_FRAME:   450,  // IVA auto-fill (~15s)
    CH2_FRAME:  1800,  // Discount defaults (~60s, spread)
    CH3_FRAME:  3000,  // Error handling / wizard (~100s, spread)
    CH4_FRAME:  5100,  // Order continuity (~170s)
    CH5_FRAME:  6600,  // Discount bug (~220s)
  },
} as const;
