-- Migration 055: espande campionario_strip_url per le famiglie coperte
-- dai nuovi strip mappati in CAMPIONARIO_STRIPS (espansione da 16 a 150+ strip).
-- Usa MTB541 CDN: https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-{N}.jpg
-- Usa MTB457 CDN: https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-{NN}.jpg
-- Solo famiglie NOT YET covered da migration 054 (usa WHERE campionario_strip_url IS NULL).

-- ── MTB541 strip 01 — Pera corta (822, 830) ──────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-01.jpg'
WHERE campionario_strip_url IS NULL
  AND ('822' = ANY(family_codes) OR '830' = ANY(family_codes) OR '8830' = ANY(family_codes)
    OR '830EF' = ANY(family_codes) OR '5830' = ANY(family_codes));

-- ── MTB541 strip 02 — Pera lunga (830L, 830RL) ───────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-02.jpg'
WHERE campionario_strip_url IS NULL
  AND ('830L' = ANY(family_codes) OR '8830L' = ANY(family_codes)
    OR '830RL' = ANY(family_codes) OR '8830RL' = ANY(family_codes)
    OR '830LEF' = ANY(family_codes) OR 'S6830L' = ANY(family_codes)
    OR '5830L' = ANY(family_codes) OR 'S6830RL' = ANY(family_codes));

-- ── MTB541 strip 05 — Sfera con collo (802), ZR sfera ────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-05.jpg'
WHERE campionario_strip_url IS NULL
  AND ('802' = ANY(family_codes) OR 'ZR6801' = ANY(family_codes)
    OR 'ZR801L' = ANY(family_codes) OR 'ZR8801L' = ANY(family_codes));

-- ── MTB541 strip 07 — Mikropräparation (830M, 838M, 889M, 953M) ──────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-07.jpg'
WHERE campionario_strip_url IS NULL
  AND ('830M' = ANY(family_codes) OR '838M' = ANY(family_codes)
    OR '889M' = ANY(family_codes) OR '953M' = ANY(family_codes)
    OR '8830M' = ANY(family_codes) OR '8953M' = ANY(family_codes));

-- ── MTB541 strip 08 — Cilindro KR corto (835KR) ──────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-08.jpg'
WHERE campionario_strip_url IS NULL
  AND ('835KR' = ANY(family_codes) OR '8835KR' = ANY(family_codes)
    OR '835KREF' = ANY(family_codes) OR '6835KR' = ANY(family_codes));

-- ── MTB541 strip 09 — Cilindri KR vari (836KR, 837KR, 842KR) ─────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-09.jpg'
WHERE campionario_strip_url IS NULL
  AND ('836KR' = ANY(family_codes) OR '8836KR' = ANY(family_codes)
    OR '837KR' = ANY(family_codes) OR '837KREF' = ANY(family_codes)
    OR '842KR' = ANY(family_codes));

-- ── MTB541 strip 10 — Coniche KR corti (845KR, 846KR, PrepMarker) ────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-10.jpg'
WHERE campionario_strip_url IS NULL
  AND ('845KR' = ANY(family_codes) OR '8845KR' = ANY(family_codes)
    OR '845KREF' = ANY(family_codes) OR '846KR' = ANY(family_codes)
    OR '8846KR' = ANY(family_codes) OR '846KREF' = ANY(family_codes)
    OR '845KRD' = ANY(family_codes));

-- ── MTB541 strip 11 — Conica KR medio (847KR) ────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-11.jpg'
WHERE campionario_strip_url IS NULL
  AND ('847KR' = ANY(family_codes) OR '8847KR' = ANY(family_codes)
    OR '847KREF' = ANY(family_codes) OR 'S6847KR' = ANY(family_codes));

-- ── MTB541 strip 12 — Conica KR lungo (848KR, 8372P) ────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-12.jpg'
WHERE campionario_strip_url IS NULL
  AND ('848KR' = ANY(family_codes) OR '8848KR' = ANY(family_codes)
    OR '8372P' = ANY(family_codes) OR '8372PL' = ANY(family_codes)
    OR '6847KRD' = ANY(family_codes));

-- ── MTB541 strip 13 — Coniche standard (845, 846, 847 senza KR) ──────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-13.jpg'
WHERE campionario_strip_url IS NULL
  AND ('845' = ANY(family_codes) OR '846' = ANY(family_codes)
    OR '847' = ANY(family_codes) OR '8846' = ANY(family_codes)
    OR '8847' = ANY(family_codes));

-- ── MTB541 strip 14 — Conica lunga (848) ─────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-14.jpg'
WHERE campionario_strip_url IS NULL
  AND ('848' = ANY(family_codes) OR '8848' = ANY(family_codes) OR '5848' = ANY(family_codes));

-- ── MTB541 strip 15 — Rosette ceramica (K1SM, PolyBur) ───────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-15.jpg'
WHERE campionario_strip_url IS NULL
  AND ('K1SM' = ANY(family_codes) OR 'PolyBur' = ANY(family_codes) OR 'P1' = ANY(family_codes));

-- ── MTB541 strip 16 — CT rosette H1SM/H1SEM ──────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-16.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H1SM' = ANY(family_codes));

-- ── MTB541 strip 17 — CT H1/H2 base ─────────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-17.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H1' = ANY(family_codes) OR 'H1SE' = ANY(family_codes)
    OR 'H1S' = ANY(family_codes) OR 'H2' = ANY(family_codes));

-- ── MTB541 strip 18 — Tagliacorone CT (H4MC, H4MCL, 4ZR) ────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-18.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H4MC' = ANY(family_codes) OR 'H4MCL' = ANY(family_codes)
    OR 'H4MCXL' = ANY(family_codes) OR '4ZR' = ANY(family_codes)
    OR '4ZRS' = ANY(family_codes));

-- ── MTB541 strip 19 — CT H32, rimozione restauri ─────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-19.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H32' = ANY(family_codes) OR '5985' = ANY(family_codes));

-- ── MTB541 strip 26 — Faccette (868, 834, 6844) ──────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-26.jpg'
WHERE campionario_strip_url IS NULL
  AND ('868' = ANY(family_codes) OR '8868' = ANY(family_codes)
    OR '868B' = ANY(family_codes) OR '834' = ANY(family_codes)
    OR '6844' = ANY(family_codes));

-- ── MTB541 strip 32 — Spalle divergenti (884, 885, 886) ──────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-32.jpg'
WHERE campionario_strip_url IS NULL
  AND ('884' = ANY(family_codes) OR '8884' = ANY(family_codes)
    OR '885' = ANY(family_codes) OR '8885' = ANY(family_codes)
    OR '886' = ANY(family_codes) OR '8886' = ANY(family_codes));

-- ── MTB541 strip 33 — Forma lente (852, 955, 956) ────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-33.jpg'
WHERE campionario_strip_url IS NULL
  AND ('852' = ANY(family_codes) OR '8852' = ANY(family_codes)
    OR '955EF' = ANY(family_codes) OR '8955' = ANY(family_codes)
    OR '956EF' = ANY(family_codes) OR '8956' = ANY(family_codes));

-- ── MTB541 strip 34 — Fiammetta/ago (883, 889) ───────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-34.jpg'
WHERE campionario_strip_url IS NULL
  AND ('883' = ANY(family_codes) OR '6883' = ANY(family_codes)
    OR '889' = ANY(family_codes) OR '6889' = ANY(family_codes)
    OR '8889' = ANY(family_codes));

-- ── MTB541 strip 37 — OccluShaper (811, 370, 909) ────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-37.jpg'
WHERE campionario_strip_url IS NULL
  AND ('811' = ANY(family_codes) OR '370' = ANY(family_codes)
    OR '8370' = ANY(family_codes) OR '909' = ANY(family_codes)
    OR '6909' = ANY(family_codes) OR '5909' = ANY(family_codes));

-- ── MTB541 strip 38 — Reciprocanti (899, DF1) ────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-38.jpg'
WHERE campionario_strip_url IS NULL
  AND ('899' = ANY(family_codes) OR '8899' = ANY(family_codes)
    OR 'DF1' = ANY(family_codes) OR 'DF1C' = ANY(family_codes)
    OR 'DF1F' = ANY(family_codes) OR 'DF1EF' = ANY(family_codes));

-- ── MTB541 strip 39 — Football/oliva (368) ───────────────────────────────────
-- Nota: 368 era già coperta da MTB457-06 in migration 054; questo copre
-- le varianti EF/UF/L di 368 che non sono in MTB457.
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-39.jpg'
WHERE campionario_strip_url IS NULL
  AND ('368EF' = ANY(family_codes) OR '368UF' = ANY(family_codes)
    OR '8368L' = ANY(family_codes) OR '5368' = ANY(family_codes));

-- ── MTB541 strip 40 — Oliva/granata ZR (ZR8379, 390) ─────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-40.jpg'
WHERE campionario_strip_url IS NULL
  AND ('ZR8379' = ANY(family_codes) OR '8380' = ANY(family_codes)
    OR '379EF' = ANY(family_codes) OR '5379' = ANY(family_codes));

-- ── MTB541 strip 43 — CT studio H11/H21/H71 ─────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-43.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H11' = ANY(family_codes) OR 'H21' = ANY(family_codes)
    OR 'H71' = ANY(family_codes) OR 'H21R' = ANY(family_codes));

-- ── MTB541 strip 44 — CT studio H31R/H51/H52 ─────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-44.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H31R' = ANY(family_codes) OR 'H31' = ANY(family_codes)
    OR 'H51' = ANY(family_codes) OR 'H52' = ANY(family_codes));

-- ── MTB541 strip 45 — CT studio H281-H284 ────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-45.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H281' = ANY(family_codes) OR 'H282' = ANY(family_codes)
    OR 'H283' = ANY(family_codes) OR 'H283E' = ANY(family_codes)
    OR 'H284' = ANY(family_codes) OR 'H281K' = ANY(family_codes)
    OR 'H282K' = ANY(family_codes) OR 'H283K' = ANY(family_codes)
    OR 'H284K' = ANY(family_codes) OR 'H336' = ANY(family_codes));

-- ── MTB541 strip 46 — CT studio H133/H33/H30L ────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-46.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H133' = ANY(family_codes) OR 'H133F' = ANY(family_codes)
    OR 'H133UF' = ANY(family_codes) OR 'H33' = ANY(family_codes)
    OR 'H33L' = ANY(family_codes) OR 'H30L' = ANY(family_codes)
    OR 'H33R' = ANY(family_codes));

-- ── MTB541 strip 47 — CT studio H7/H16/H17/H18 ───────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-47.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H7' = ANY(family_codes) OR 'H7S' = ANY(family_codes)
    OR 'H7L' = ANY(family_codes) OR 'H245' = ANY(family_codes)
    OR 'H16' = ANY(family_codes) OR 'H17' = ANY(family_codes)
    OR 'H18' = ANY(family_codes));

-- ── MTB541 strip 48 — CT studio Q-series composito ───────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-48.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H48LQ' = ANY(family_codes) OR 'H48XLQ' = ANY(family_codes)
    OR 'H379Q' = ANY(family_codes) OR 'H390Q' = ANY(family_codes)
    OR 'H134Q' = ANY(family_codes) OR 'H135Q' = ANY(family_codes)
    OR 'H50AQ' = ANY(family_codes) OR 'H246Q' = ANY(family_codes));

-- ── MTB541 strip 49 — CT studio metalliche varie ─────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-49.jpg'
WHERE campionario_strip_url IS NULL
  AND ('H41' = ANY(family_codes) OR 'H46' = ANY(family_codes)
    OR 'H47L' = ANY(family_codes) OR 'H207' = ANY(family_codes)
    OR 'H207D' = ANY(family_codes) OR 'H297' = ANY(family_codes)
    OR 'H375R' = ANY(family_codes));

-- ── MTB541 strip 50 — Paro-Diamanten (831, 832) + impianto (227A) ────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-50.jpg'
WHERE campionario_strip_url IS NULL
  AND ('831' = ANY(family_codes) OR '8831' = ANY(family_codes)
    OR '832' = ANY(family_codes) OR '8832' = ANY(family_codes)
    OR '831EF' = ANY(family_codes) OR '8831L' = ANY(family_codes)
    OR '831LEF' = ANY(family_codes) OR '8832L' = ANY(family_codes)
    OR '227A' = ANY(family_codes) OR '227B' = ANY(family_codes));

-- ── MTB457 strip 05 — Varianti ZR (ZR8863, ZR8879, ZR8850, ecc.) ────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-05.jpg'
WHERE campionario_strip_url IS NULL
  AND ('ZR8863' = ANY(family_codes) OR 'ZR8862' = ANY(family_codes)
    OR 'ZR8856' = ANY(family_codes) OR 'ZR8881' = ANY(family_codes)
    OR 'ZR8850' = ANY(family_codes) OR 'ZR8379' = ANY(family_codes)
    OR 'ZR8390' = ANY(family_codes) OR 'ZR8849' = ANY(family_codes));
