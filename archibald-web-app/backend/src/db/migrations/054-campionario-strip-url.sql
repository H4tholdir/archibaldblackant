-- Migration 054: aggiunge campionario_strip_url a shared.catalog_entries
-- e popola il campo per le famiglie mappate nel campionario Komet.

ALTER TABLE shared.catalog_entries
  ADD COLUMN campionario_strip_url TEXT NULL;

-- ── MTB457 strip 06 (PRIORITÀ MASSIMA — mostra fiamma vs torpedo affiancati) ─
-- Copre: 860, 862, 863, 879, 880, 892, 368, 379, 390
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-06.jpg'
WHERE '860' = ANY(family_codes) OR '862' = ANY(family_codes)
   OR '863' = ANY(family_codes) OR '879' = ANY(family_codes)
   OR '880' = ANY(family_codes) OR '892' = ANY(family_codes)
   OR '368' = ANY(family_codes) OR '379' = ANY(family_codes)
   OR '390' = ANY(family_codes);

-- ── MTB457 strip 02 — cono rovescio HP ───────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-02.jpg'
WHERE campionario_strip_url IS NULL
  AND ('807' = ANY(family_codes) OR '805' = ANY(family_codes));

-- ── MTB457 strip 01 — sfere HP ───────────────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-01.jpg'
WHERE campionario_strip_url IS NULL
  AND ('801' = ANY(family_codes) OR '6801' = ANY(family_codes));

-- ── MTB457 strip 03 — coniche + lance HP ─────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare-03.jpg'
WHERE campionario_strip_url IS NULL
  AND ('845' = ANY(family_codes) OR '846' = ANY(family_codes)
    OR '847' = ANY(family_codes) OR '848' = ANY(family_codes)
    OR '849' = ANY(family_codes) OR '850' = ANY(family_codes)
    OR '855' = ANY(family_codes) OR '856' = ANY(family_codes)
    OR '858' = ANY(family_codes) OR '859' = ANY(family_codes));

-- ── MTB541 strip 36 — 863/864 fiamma lunga FG studio ─────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-36.jpg'
WHERE campionario_strip_url IS NULL
  AND '864' = ANY(family_codes);

-- ── MTB541 strip 23 — chamfer corti ──────────────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-23.jpg'
WHERE campionario_strip_url IS NULL
  AND ('875' = ANY(family_codes) OR '876' = ANY(family_codes)
    OR '877' = ANY(family_codes));

-- ── MTB541 strip 24 — 878 chamfer cilindrico ─────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-24.jpg'
WHERE campionario_strip_url IS NULL
  AND '878' = ANY(family_codes);

-- ── MTB541 strip 30/31 — chamfer CONICO (diverso da torpedo parallelo) ────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-30.jpg'
WHERE campionario_strip_url IS NULL
  AND '878K' = ANY(family_codes);

UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-31.jpg'
WHERE campionario_strip_url IS NULL
  AND '879K' = ANY(family_codes);

-- ── MTB541 strip 21 — 881/882 cilindro testa tonda ───────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-21.jpg'
WHERE campionario_strip_url IS NULL
  AND ('881' = ANY(family_codes) OR '882' = ANY(family_codes));

-- ── MTB541 strip 06 — cono rovescio FG (807) ─────────────────────────────────
UPDATE shared.catalog_entries
SET campionario_strip_url = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari-06.jpg'
WHERE campionario_strip_url IS NULL
  AND '813' = ANY(family_codes);
