# Matching Finale Arca ↔ PWA — 2026-04-08

## Riepilogo esecutivo

| Categoria | N |
|-----------|---|
| KT manuali (confermati da Excel) | 45 |
| KT auto-matched (algoritmo Jaccard) | 115 |
| KT non matchati | 23 |
| KT speciali (no match / converti) | 3 |
| **TOTALE KT 2026 in Arca** | **186** |
| Ordini Fresis con FT collegate | 18 |
| Ordini Fresis senza FT (periodo pre-app) | 17 |

---

## SEZIONE A — KT Manuali (45)

### A.1 — Fuzzy match confermati da Sheet 1 (9)

| KT | Ordine PWA | Note |
|----|------------|------|
| 38 | 48509 | confermato |
| 40 | 46799 | confermato |
| 145 | 47978 | confermato |
| 179 | 48656 | confermato |
| 25 | 46665 | confermato |
| 68 | 47034 | confermato |
| 122 | 47811 | confermato |
| 416 | **46883** | CORRETTO da 52084 |
| 456 | 52084 | assegnato dopo correzione KT416 |

### A.2 — Coppie ovvie da Sheet 2 (24)

| KT | Ordine PWA | Note |
|----|------------|------|
| 4 | 46524 | |
| 19 | 46645 | |
| 22 | 46643 | |
| 35 | 46707 | |
| 41 | 46796 | |
| 51 | 46976 | |
| 52 | 46875 | |
| 59 | 46977 | |
| 83 | 47168 | |
| 118 | 48002 | orig. annullato da NC, confermato |
| 120 | 48070 | |
| 121 | 47763 | |
| 124 | 48072 | orig. annullato da NC, confermato |
| 151 | 48229 | |
| 171 | 48428 | |
| 177 | 48533 | |
| 181 | 48661 | |
| 188 | 48796 | |
| 206 | 49006 | |
| 241 | 49391 | |
| 275 | 50203 | |
| 296 | 50362 | |
| 379 | 51489 | |
| 414 | 46530 | |

### A.3 — Da Sheet 3 (anomalie)

| KT | Ordine(i) PWA | Note |
|----|---------------|------|
| 207 | 49004 | |
| 242 | 49395 | |
| 270 | 49860 + 50086 | due ordini |
| 183 | 48822 | stesso ordine di KT198 |
| 198 | 48822 | stesso ordine di KT183 |

### A.4 — Da Sheet 4 (ordini PWA senza KT)

| KT | Ordine PWA | Note |
|----|------------|------|
| 70 | 47180 | era classificato come FT per errore |
| 64 | 47932 | |
| 125 | 48065 | |
| 236 | 49312 | |
| 279 | 51812 | |
| 427 | 52258 | |
| 437 | 52259 | |

---

## SEZIONE B — KT Speciali (3)

| KT | Stato |
|----|-------|
| 189 | KT_NO_MATCH — backorder, nessun ordine PWA corrispondente |
| 258 | KT_NO_MATCH — backorder, nessun ordine PWA corrispondente |
| 282 | KT_CONVERT_TO_FT — era KT, deve diventare FT in Arca (azione manuale richiesta) |

---

## SEZIONE C — KT Auto-matched (115)

Matchati dall'algoritmo Jaccard + mappa CODICECF→account_num.
Score = tot_ratio×0.35 + jaccard×0.65. Soglia Jaccard: 0.4 (CF mappato) / 0.6 (altrimenti).

*(lista completa disponibile nello script `/tmp/full_matching2.py` — output sezione "TUTTI I KT MATCHATI")*

---

## SEZIONE D — KT Non Matchati (23)

### D.1 — Alta confidenza (totale esatto + CF già mappato) — 7

Questi 7 KT hanno un candidato con tot_ratio ≥ 0.9 ma Jaccard < soglia (articoli mancanti nel DB PWA).
**Proposta**: accettarli manualmente.

| KT | CF Arca | Tot KT | Ordine candidato | Cliente | Tot Ordine | Jaccard |
|----|---------|--------|-----------------|---------|------------|---------|
| 8 | C00197 | €138.86 | 46513 | Studio Dr. Indelli Enrico | €138.86 | 0.50 |
| 14 | C00014 | €255.39 | 46520 | Clinica Giordano Srl | €255.39 | 0.00 |
| 15 | C54495 | €243.72 | 46522 | Prisma Evolution Srls | €243.72 | 0.50 |
| 17 | C11730 | €103.85 | 46644 | Centro Odontoiatrico Espo | €103.85 | 0.50 |
| 74 | C00922 | €320.01 | 47103 | Centanni Gianluca Lab. Od. | €320.01 | 0.00 |
| 110 | C07772 | €171.41 | 47547 | Gargiulo Dott. Alberto | €171.41 | 0.50 |
| 246 | C00016 | €223.60 | 49537 | C.O.S. Srl | €223.60 | 0.00 |

> ⚠️ **Azione richiesta**: confermare o correggere questi 7 prima dell'esecuzione.

### D.2 — Media confidenza (candidato presente ma Jaccard=0) — 6

| KT | CF | Tot KT | Ordine candidato | Cliente | Tot Ordine | Note |
|----|-----|--------|-----------------|---------|------------|------|
| 21 | C00592 | €330.00 | 49394 | Dr. Sergio Catale | €330.00 | totale esatto, j=0.00 |
| 117 | C11998 | €2304.02 | 47719 | Centro Sanadent Srl | €2304.02 | totale esatto, j=0.00 |
| 142 | C11014 | €205.00 | 47976 | Langone Studio Dentistico | €204.99 | totale quasi esatto, j=0.00 |
| 191 | C01021 | €295.00 | 48830 | Dentist Family S.R.L. | €295.00 | totale esatto, j=0.33 |
| 240 | C01555 | €330.00 | 49394 | Dr. Sergio Catale | €330.00 | totale esatto, j=0.33 |
| 273 | C00387 | €100.00 | 50205 | Studio Dentistico Antonel | €100.01 | totale quasi esatto, j=0.57 |

> ⚠️ **Azione richiesta**: confermare o escludere questi 6. Nota: KT21 e KT240 puntano allo stesso ordine (49394) — uno dei due è sbagliato.

### D.3 — Nessun candidato o ratio troppo bassa — 10

| KT | CF | Tot KT | Candidato migliore | Note |
|----|-----|--------|-------------------|------|
| 79 | C00720 | €310.00 | Centanni €320.01 (ratio 0.97) | j=0.00, diverso CF mappato |
| 136 | C00720 | €168.85 | Gargiulo €171.41 (ratio 0.98) | j=0.00, CF già usato per KT110 |
| 168 | C00606 | €340.00 | Dr. Catale €330.00 (ratio 0.97) | j=0.00 |
| 184 | C11412 | €470.01 | NESSUN CANDIDATO | — |
| 211 | C01425 | €515.01 | Studio Manfredonia €539.99 (ratio 0.95) | j=0.00 |
| 234 | C11751 | €266.00 | Clinica Giordano €255.39 (ratio 0.96) | j=0.00 |
| 297 | C11751 | €220.01 | Prisma Evolution €243.72 (ratio 0.90) | j=0.00 |
| 352 | C00606 | €80.01 | NESSUN CANDIDATO | — |
| 397 | C21304 | €620.00 | Magma Center €600.02 (ratio 0.97) | j=0.00 |
| 458 | C00779 | €410.01 | Centro Marchitiello €387.67 (ratio 0.94) | j=0.00 |

> Questi 10 potrebbero essere ordini scritti direttamente in Arca senza passare dalla PWA, oppure ordini molto antichi senza articoli nel DB.

---

## SEZIONE E — FT → Ordini Fresis (18 ordini linkati)

### E.1 — Da Excel Sheet 5 (7)

| Ordine Fresis | FT Arca |
|---------------|---------|
| 47958 | 57, 144, 141 |
| 48227 | 150 |
| 48228 | 150 |
| 49017 | 213, 220 |
| 49493 | 252 |
| 50326 | 289, 290, 291 |
| 51787 | 381, 382, 383, 384, 385, 386 |

### E.2 — Da DB esistente (11 ulteriori)

| Ordine Fresis | FT Arca |
|---------------|---------|
| 50538 | 302, 303, 304, 305, 306, 307 |
| 50756 | 316, 317, 318, 319 |
| 50848 | 320, 321, 322, 323, 324, 325 |
| 51002 | 341 |
| 51107 | 333, 334, 335, 339 |
| 51152 | 336, 337, 338, 340 |
| 51475 | 362, 363, 365, 366, 367, 368, 369 |
| 51657 | 373, 374, 376, 377 |
| 51847 | 392, 393 |
| 51976 | 407, 408, 409 |
| 52146 | 411, 412, 413 |

### E.3 — NC senza match (5, corrette)

FT NC (note di credito) senza ordine Fresis corrispondente — **da escludere**:

| FT |
|----|
| 48934 |
| 49286 |
| 49771 |
| 51447 |
| 51450 |

### E.4 — Ordini Fresis senza FT (17)

Ordini del periodo pre-app (inizio 2026) — probabilmente normali perché la PWA non era ancora in uso.

---

## SEZIONE F — Piano di esecuzione

Una volta confermato questo report, i passi da eseguire sono:

1. **Migration 054**: aggiunge colonna `arca_kt_number TEXT` a `agents.order_records`
2. **Wipe**: cancella tutti i record da `agents.fresis_history`
3. **Import KT**: inserisce tutti i 186 KT 2026 in `fresis_history` con `archibald_order_id` linkato
4. **Import FT**: inserisce tutti i 223 FT 2026 in `fresis_history` con link ai rispettivi ordini Fresis
5. **KT→order link**: aggiorna `order_records.arca_kt_number` per i 160 KT matchati

### Prerequisito manuale

- **KT282** deve essere convertito in FT direttamente in ArcaPro prima dell'import

---

*Generato: 2026-04-08 | Script: `/tmp/full_matching2.py` | Sorgenti: COOP16 doctes.dbf + docrig.dbf + DB PWA + MATCHING-REVIEW-2026-04-06.xlsx*
