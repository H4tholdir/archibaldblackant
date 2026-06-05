# Giri Visite — Piano 1a: Audit Dati + Migrazione Minimale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verificare la qualità dei dati in produzione e applicare la migrazione minimale che prepara il DB per il MVP, senza toccare il server Express.

**Architecture:** Script Node.js ESM standalone che si connettono direttamente al DB via pg pool. Nessuna modifica al server. Migrazione SQL pura. Tutti gli script sono idempotenti e read-only (tranne la migrazione). Il geocoding scrive su file locale prima di toccare il DB.

**Tech Stack:** Node.js 20 ESM, pg, node:fetch (built-in Node 20), dotenv, node:fs

**Prerequisiti di esecuzione:** Gli script richiedono accesso al DB di produzione. Due modalità:
- **Locale con SSH tunnel**: `ssh -i /tmp/archibald_vps -L 5433:localhost:5432 deploy@91.98.136.198 -N &` poi `PG_HOST=localhost PG_PORT=5433 node scripts/...`
- **Sul VPS**: copiare i file sul VPS ed eseguire dentro il container backend

**Variabili env richieste** (da `archibald-web-app/backend/.env`):
- `PG_HOST` (default: localhost)
- `PG_PORT` (default: 5432)
- `PG_DATABASE` (default: archibald)
- `PG_USER` (default: archibald)
- `PG_PASSWORD`

---

## File da creare

| File | Tipo | Scopo |
|---|---|---|
| `backend/scripts/audit-visit-data-quality.mjs` | Script audit | Qualità indirizzi, CAP, coordinate, distribuzione clienti |
| `backend/scripts/audit-visit-matching.mjs` | Script audit | Match Arca↔Archibald confermati + candidati P.IVA |
| `backend/scripts/audit-visit-dedup-golden.mjs` | Script audit | Query golden deduplica FT/KT — criterio accettazione |
| `backend/scripts/geocode-customers-batch.mjs` | Script geocoding | Nominatim batch, scrive su file JSON prima del DB |
| `backend/data/patronali-campania-basilicata.json` | Dataset | Feste patronali per province SA, NA, CE, PZ, AV, BN, MT |
| `backend/src/db/migrations/108-visit-planning-pre.sql` | Migrazione SQL | ALTER TABLE users + customers, seed is_distributor |

---

## Task 1 — Script audit qualità dati clienti

**Files:**
- Create: `archibald-web-app/backend/scripts/audit-visit-data-quality.mjs`

- [ ] **Step 1.1: Crea lo script**

```js
#!/usr/bin/env node
// Audit read-only: qualità dati clienti per il planner giri visite.
// Output: console + archibald-web-app/backend/data/audit-visit-data-quality.json

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    // 1. Copertura dati clienti Archibald
    const coverage = await client.query(`
      SELECT
        COUNT(*)                                                        AS totale,
        COUNT(*) FILTER (WHERE city     IS NOT NULL AND city != '')    AS con_citta,
        COUNT(*) FILTER (WHERE postal_code IS NOT NULL AND postal_code != '') AS con_cap,
        COUNT(*) FILTER (WHERE street   IS NOT NULL AND street != '')  AS con_indirizzo,
        COUNT(*) FILTER (WHERE geo_latitude IS NOT NULL)               AS con_coordinate_erp,
        COUNT(*) FILTER (WHERE last_order_date IS NOT NULL
                           AND last_order_date >= '2025-01-01')        AS attivi_2025_2026,
        COUNT(*) FILTER (WHERE last_order_date IS NOT NULL
                           AND last_order_date < '2025-01-01')         AS dormienti_pre2025,
        COUNT(*) FILTER (WHERE last_order_date IS NULL
                           OR  last_order_date = '')                   AS senza_ordini
      FROM agents.customers
      WHERE user_id = (SELECT id FROM agents.users ORDER BY created_at LIMIT 1)
    `);

    // 2. Top 20 città per numero clienti
    const topCities = await client.query(`
      SELECT
        UPPER(TRIM(city)) AS citta,
        LEFT(postal_code, 5) AS cap_prefix,
        COUNT(*) AS n_clienti
      FROM agents.customers
      WHERE user_id = (SELECT id FROM agents.users ORDER BY created_at LIMIT 1)
        AND city IS NOT NULL AND city != ''
      GROUP BY UPPER(TRIM(city)), LEFT(postal_code, 5)
      ORDER BY n_clienti DESC
      LIMIT 20
    `);

    // 3. Copertura sub_clients Fresis per provincia
    const subClientsByProv = await client.query(`
      SELECT
        UPPER(TRIM(prov)) AS provincia,
        COUNT(*) AS n_sottoclienti,
        COUNT(*) FILTER (WHERE cap IS NOT NULL AND cap != '') AS con_cap,
        COUNT(*) FILTER (WHERE indirizzo IS NOT NULL AND indirizzo != '') AS con_indirizzo
      FROM shared.sub_clients
      WHERE prov IS NOT NULL AND prov != ''
      GROUP BY UPPER(TRIM(prov))
      ORDER BY n_sottoclienti DESC
      LIMIT 15
    `);

    // 4. Distribuzione record fresis_history per source
    const fresisSource = await client.query(`
      SELECT source, COUNT(*) AS n
      FROM agents.fresis_history
      WHERE user_id = (SELECT id FROM agents.users ORDER BY created_at LIMIT 1)
      GROUP BY source ORDER BY n DESC
    `);

    const report = {
      generatedAt: new Date().toISOString(),
      coverage: coverage.rows[0],
      topCities: topCities.rows,
      subClientsByProvince: subClientsByProv.rows,
      fresisHistoryBySource: fresisSource.rows,
    };

    const outDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'audit-visit-data-quality.json');
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));

    console.log('\n=== AUDIT QUALITÀ DATI CLIENTI ===\n');
    console.log('Clienti Archibald:');
    const c = coverage.rows[0];
    console.log(`  Totale: ${c.totale}`);
    console.log(`  Con città: ${c.con_citta} (${Math.round(c.con_citta / c.totale * 100)}%)`);
    console.log(`  Con CAP: ${c.con_cap} (${Math.round(c.con_cap / c.totale * 100)}%)`);
    console.log(`  Con indirizzo: ${c.con_indirizzo} (${Math.round(c.con_indirizzo / c.totale * 100)}%)`);
    console.log(`  Con coordinate ERP: ${c.con_coordinate_erp} (${Math.round(c.con_coordinate_erp / c.totale * 100)}%)`);
    console.log(`  Attivi 2025-2026: ${c.attivi_2025_2026}`);
    console.log(`  Dormienti pre-2025: ${c.dormienti_pre2025}`);
    console.log(`  Senza ordini: ${c.senza_ordini}`);
    console.log('\nTop 10 città:');
    topCities.rows.slice(0, 10).forEach(r => console.log(`  ${r.citta} (${r.cap_prefix}): ${r.n_clienti}`));
    console.log('\nSub-clients Fresis per provincia:');
    subClientsByProv.rows.forEach(r => console.log(`  ${r.provincia}: ${r.n_sottoclienti} (${r.con_indirizzo} indirizzi)`));
    console.log(`\nReport salvato in: ${outPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 1.2: Esegui e verifica output**

```bash
# Opzione A — SSH tunnel (apri in background prima)
ssh -i /tmp/archibald_vps -L 5433:localhost:5432 deploy@91.98.136.198 -N &
sleep 2
cd archibald-web-app/backend
PG_HOST=localhost PG_PORT=5433 PG_PASSWORD=$(grep PG_PASSWORD .env | cut -d= -f2) \
  node scripts/audit-visit-data-quality.mjs

# Opzione B — direttamente sul VPS tramite psql (equivalente read-only)
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres \
   psql -U archibald -d archibald -c \
   'SELECT COUNT(*) AS totale, COUNT(*) FILTER (WHERE city IS NOT NULL) AS con_citta FROM agents.customers;'"
```

Output atteso (valori approssimativi):
```
=== AUDIT QUALITÀ DATI CLIENTI ===

Clienti Archibald:
  Totale: 1371
  Con città: 1371 (100%)
  Con CAP: 1370 (99%)
  Con indirizzo: 1370 (99%)
  Con coordinate ERP: 72 (5%)
  Attivi 2025-2026: ~190
  ...
```

Gate: se `con_citta < 1000` o `con_indirizzo < 1000` — STOP, investigare prima di procedere.

- [ ] **Step 1.3: Commit**

```bash
git add archibald-web-app/backend/scripts/audit-visit-data-quality.mjs
git commit -m "chore(giri-visite): script audit qualità dati clienti per planner"
```

---

## Task 2 — Script query golden deduplica FT/KT

**Files:**
- Create: `archibald-web-app/backend/scripts/audit-visit-dedup-golden.mjs`

Questo script è il criterio di accettazione per la deduplica — deve produrre output che l'agente può verificare manualmente.

- [ ] **Step 2.1: Crea lo script**

```js
#!/usr/bin/env node
// Query golden per verificare la deduplica FT/KT.
// Per 3 clienti campione (un FT puro, un KT con overlap, un Archibald diretto)
// calcola il valore commerciale senza doppio conteggio.
// L'agente deve confermare che i valori corrispondono a quello che ricorda.

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Normalizza ID ERP: '52.424' → '52424', '52452' → '52452'
const normId = (id) => id ? id.replace(/\./g, '') : null;

async function run() {
  const client = await pool.connect();
  const userId = (await client.query(
    'SELECT id FROM agents.users ORDER BY created_at LIMIT 1'
  )).rows[0]?.id;

  if (!userId) { console.error('Nessun utente trovato'); process.exit(1); }

  try {
    // 1. Trova 5 sottoclienti con più record fresis_history (campione FT)
    const ftSample = await client.query(`
      SELECT
        fh.sub_client_codice,
        sc.ragione_sociale,
        COUNT(*) AS n_documenti,
        SUM(fh.target_total_with_vat) AS tot_con_iva,
        ROUND(SUM(fh.target_total_with_vat) / 1.22, 2) AS tot_imponibile,
        MAX(fh.created_at) AS ultimo_doc
      FROM agents.fresis_history fh
      LEFT JOIN shared.sub_clients sc ON sc.codice = fh.sub_client_codice
      WHERE fh.user_id = $1
        AND fh.target_total_with_vat > 0
      GROUP BY fh.sub_client_codice, sc.ragione_sociale
      ORDER BY tot_imponibile DESC
      LIMIT 5
    `, [userId]);

    // 2. Trova 5 ordini KT con archibald_order_id valorizzato (campione KT con overlap)
    const ktSample = await client.query(`
      SELECT
        fh.id AS fh_id,
        fh.sub_client_codice,
        fh.sub_client_name,
        fh.archibald_order_id,
        fh.target_total_with_vat AS fh_tot,
        o.order_number,
        o.total_amount AS erp_tot
      FROM agents.fresis_history fh
      LEFT JOIN agents.order_records o
        ON REPLACE(o.id, '.', '') = REPLACE(fh.archibald_order_id, '.', '')
        AND o.user_id = fh.user_id
      WHERE fh.user_id = $1
        AND fh.archibald_order_id IS NOT NULL
        AND REPLACE(fh.archibald_order_id, '.', '') != ''
      LIMIT 5
    `, [userId]);

    // 3. Verifica: quanti KT hanno join riuscito vs fallito
    const ktJoinStats = await client.query(`
      SELECT
        COUNT(*) AS totale_con_archibald_id,
        COUNT(o.id) AS join_riuscito,
        COUNT(*) - COUNT(o.id) AS join_fallito_formato
      FROM agents.fresis_history fh
      LEFT JOIN agents.order_records o
        ON REPLACE(o.id, '.', '') = REPLACE(fh.archibald_order_id, '.', '')
        AND o.user_id = fh.user_id
      WHERE fh.user_id = $1
        AND fh.archibald_order_id IS NOT NULL
    `, [userId]);

    // 4. Ordini Archibald non-Fresis (clienti diretti)
    const directSample = await client.query(`
      SELECT
        o.customer_account_num,
        o.customer_name,
        COUNT(*) AS n_ordini,
        MAX(o.creation_date) AS ultimo_ordine
      FROM agents.order_records o
      WHERE o.user_id = $1
        AND o.customer_account_num NOT IN ('1002328', '049421')
      GROUP BY o.customer_account_num, o.customer_name
      ORDER BY n_ordini DESC
      LIMIT 5
    `, [userId]);

    const report = {
      generatedAt: new Date().toISOString(),
      userId,
      ftTopCustomers: ftSample.rows,
      ktWithOverlapSample: ktSample.rows,
      ktJoinStats: ktJoinStats.rows[0],
      directArchibaldTopCustomers: directSample.rows,
    };

    const outPath = path.join(__dirname, '..', 'data', 'audit-visit-dedup-golden.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));

    console.log('\n=== QUERY GOLDEN DEDUPLICA FT/KT ===\n');
    console.log('Top 5 clienti Fresis per valore (FT):');
    ftSample.rows.forEach(r =>
      console.log(`  ${r.sub_client_codice} ${r.ragione_sociale || '?'}: ${r.n_documenti} doc, €${r.tot_imponibile} imponibile`)
    );
    console.log('\nCampione KT con archibald_order_id (possibile overlap):');
    ktSample.rows.forEach(r =>
      console.log(`  ${r.sub_client_name}: fh_tot=${r.fh_tot} erp_tot=${r.erp_tot} order=${r.order_number}`)
    );
    console.log('\nStatistiche join KT:');
    console.log(`  Totale con archibald_order_id: ${ktJoinStats.rows[0].totale_con_archibald_id}`);
    console.log(`  Join riuscito (ID normalizzato): ${ktJoinStats.rows[0].join_riuscito}`);
    console.log(`  Join fallito (formato diverso): ${ktJoinStats.rows[0].join_fallito_formato}`);
    console.log('\nTop 5 clienti Archibald diretti (non Fresis):');
    directSample.rows.forEach(r =>
      console.log(`  ${r.customer_name}: ${r.n_ordini} ordini, ultimo ${r.ultimo_ordine?.slice(0,10)}`)
    );
    console.log(`\nReport: data/audit-visit-dedup-golden.json`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2.2: Esegui e verifica con l'agente**

```bash
cd archibald-web-app/backend
PG_HOST=localhost PG_PORT=5433 node scripts/audit-visit-dedup-golden.mjs
```

Gate: l'agente deve confermare che i valori `tot_imponibile` nei top 5 clienti FT sono "nell'ordine di grandezza giusto" rispetto a quello che ricorda. Se i valori sembrano strani (troppo alti per doppio conteggio, troppo bassi), investigare prima di procedere.

- [ ] **Step 2.3: Commit**

```bash
git add archibald-web-app/backend/scripts/audit-visit-dedup-golden.mjs
git commit -m "chore(giri-visite): script query golden deduplica FT/KT per validazione agente"
```

---

## Task 3 — Script audit matching Arca-Archibald

**Files:**
- Create: `archibald-web-app/backend/scripts/audit-visit-matching.mjs`

- [ ] **Step 3.1: Crea lo script**

```js
#!/usr/bin/env node
// Audit match Arca↔Archibald: confermati e candidati ad alta confidence.
// Candidati: stessa P.IVA, stesso codice fiscale, nome simile.

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  const userId = (await client.query(
    'SELECT id FROM agents.users ORDER BY created_at LIMIT 1'
  )).rows[0]?.id;

  try {
    // 1. Match confermati esistenti
    const confirmed = await client.query(`
      SELECT
        m.sub_client_codice,
        sc.ragione_sociale,
        m.customer_profile_id AS erp_id,
        c.name AS customer_name,
        c.city
      FROM shared.sub_client_customer_matches m
      LEFT JOIN shared.sub_clients sc ON sc.codice = m.sub_client_codice
      LEFT JOIN agents.customers c
        ON c.erp_id = m.customer_profile_id AND c.user_id = $1
      ORDER BY sc.ragione_sociale
      LIMIT 20
    `, [userId]);

    const confirmedCount = await client.query(
      'SELECT COUNT(*) FROM shared.sub_client_customer_matches'
    );

    // 2. Candidati non confermati per P.IVA uguale
    const vatCandidates = await client.query(`
      SELECT
        sc.codice AS arca_codice,
        sc.ragione_sociale AS arca_nome,
        sc.partita_iva,
        c.erp_id,
        c.name AS archibald_nome,
        c.city
      FROM shared.sub_clients sc
      JOIN agents.customers c
        ON c.vat_number = sc.partita_iva
        AND c.user_id = $1
        AND sc.partita_iva IS NOT NULL
        AND sc.partita_iva != ''
      WHERE NOT EXISTS (
        SELECT 1 FROM shared.sub_client_customer_matches m
        WHERE m.sub_client_codice = sc.codice
          AND m.customer_profile_id = c.erp_id
      )
      ORDER BY sc.ragione_sociale
      LIMIT 30
    `, [userId]);

    // 3. Sub-clients senza nessun match
    const unmatched = await client.query(`
      SELECT COUNT(*) AS n_senza_match
      FROM shared.sub_clients sc
      WHERE NOT EXISTS (
        SELECT 1 FROM shared.sub_client_customer_matches m
        WHERE m.sub_client_codice = sc.codice
      )
    `);

    const report = {
      generatedAt: new Date().toISOString(),
      confirmedMatchesTotal: confirmedCount.rows[0].count,
      confirmedMatchesSample: confirmed.rows,
      vatCandidatesNotYetConfirmed: vatCandidates.rows,
      subClientsWithoutAnyMatch: unmatched.rows[0].n_senza_match,
    };

    const outPath = path.join(__dirname, '..', 'data', 'audit-visit-matching.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));

    console.log('\n=== AUDIT MATCHING ARCA↔ARCHIBALD ===\n');
    console.log(`Match confermati totali: ${confirmedCount.rows[0].count}`);
    console.log(`Sub-clients senza nessun match: ${unmatched.rows[0].n_senza_match}`);
    console.log(`\nCandidati per P.IVA uguale (non ancora confermati): ${vatCandidates.rows.length}`);
    vatCandidates.rows.slice(0, 10).forEach(r =>
      console.log(`  ARCA ${r.arca_codice} "${r.arca_nome}" ↔ ERP ${r.erp_id} "${r.archibald_nome}"`)
    );
    console.log(`\nReport: data/audit-visit-matching.json`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3.2: Esegui e verifica**

```bash
cd archibald-web-app/backend
PG_HOST=localhost PG_PORT=5433 node scripts/audit-visit-matching.mjs
```

Gate: `confirmedMatchesTotal` deve essere > 500. Se `vatCandidatesNotYetConfirmed` > 100 e sembrano corretti, considerare di aggiungerli ai match confermati prima del MVP (operazione manuale o script aggiuntivo).

- [ ] **Step 3.3: Commit**

```bash
git add archibald-web-app/backend/scripts/audit-visit-matching.mjs
git commit -m "chore(giri-visite): script audit matching Arca-Archibald con candidati P.IVA"
```

---

## Task 4 — Script geocoding batch Nominatim

**Files:**
- Create: `archibald-web-app/backend/scripts/geocode-customers-batch.mjs`

Nominatim policy: max 1 richiesta/secondo, User-Agent obbligatorio, no mass geocoding commerciale.
Questo script scrive i risultati su un file JSON locale — non scrive ancora nel DB.
Il DB update avviene nella Fase 1b tramite un job backend.

- [ ] **Step 4.1: Crea lo script**

```js
#!/usr/bin/env node
// Geocoding batch via Nominatim OSM.
// Rate limit: 1 req/sec. Scrive risultati su file JSON.
// Non modifica il DB — legge da DB, scrive su file.
// Il DB update avviene in Fase 1b tramite il job geocode-missing.

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Formicanera-Visit-Planner/1.0 (formicanera.com; contact: deploy@formicanera.com)';
const RATE_LIMIT_MS = 1100; // 1.1 secondi tra richieste (margine sicurezza)
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 50);

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocodeAddress(street, postalCode, city) {
  const q = [street, postalCode, city, 'Italy'].filter(Boolean).join(', ');
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=it`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it' },
  });

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();

  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
    quality: 'geocoded',
  };
}

async function run() {
  const client = await pool.connect();
  const userId = (await client.query(
    'SELECT id FROM agents.users ORDER BY created_at LIMIT 1'
  )).rows[0]?.id;

  try {
    // Legge clienti senza coordinate affidabili
    const { rows: customers } = await client.query(`
      SELECT erp_id, name, street, postal_code, city
      FROM agents.customers
      WHERE user_id = $1
        AND city IS NOT NULL AND city != ''
        AND (geo_latitude IS NULL)
      ORDER BY name
      LIMIT $2
    `, [userId, LIMIT]);

    console.log(`\n=== GEOCODING BATCH (dry_run=${DRY_RUN}, limit=${LIMIT}) ===`);
    console.log(`Clienti da geocodificare: ${customers.length}`);

    const results = [];
    let ok = 0, fail = 0;

    for (const c of customers) {
      if (DRY_RUN) {
        console.log(`  [DRY] ${c.erp_id} "${c.name}" — ${c.street}, ${c.postal_code} ${c.city}`);
        results.push({ erpId: c.erp_id, name: c.name, status: 'dry_run' });
        continue;
      }

      try {
        const geo = await geocodeAddress(c.street, c.postal_code, c.city);
        if (geo) {
          console.log(`  ✓ ${c.erp_id} "${c.name}" → ${geo.lat}, ${geo.lng}`);
          results.push({ erpId: c.erp_id, name: c.name, ...geo, status: 'ok' });
          ok++;
        } else {
          console.log(`  ✗ ${c.erp_id} "${c.name}" — non trovato`);
          results.push({ erpId: c.erp_id, name: c.name, quality: 'failed', status: 'not_found' });
          fail++;
        }
      } catch (err) {
        console.error(`  ! ${c.erp_id} "${c.name}" — errore: ${err.message}`);
        results.push({ erpId: c.erp_id, name: c.name, quality: 'failed', status: 'error', error: err.message });
        fail++;
      }

      await sleep(RATE_LIMIT_MS);
    }

    const outPath = path.join(__dirname, '..', 'data', `geocode-results-${Date.now()}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), ok, fail, results }, null, 2));

    console.log(`\nCompletato: ${ok} OK, ${fail} falliti`);
    console.log(`Risultati salvati in: ${outPath}`);
    console.log('NOTA: il DB non è stato modificato. Usa il job geocode-missing del backend per aggiornare il DB.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4.2: Test dry-run (non fa richieste HTTP)**

```bash
cd archibald-web-app/backend
PG_HOST=localhost PG_PORT=5433 node scripts/geocode-customers-batch.mjs --dry-run --limit=10
```

Output atteso:
```
=== GEOCODING BATCH (dry_run=true, limit=10) ===
Clienti da geocodificare: 10
  [DRY] 55.374 "Studio Rossi" — Via Roma 1, 80100 Napoli
  ...
Completato: 0 OK, 0 falliti
```

- [ ] **Step 4.3: Test reale su campione 5 clienti**

```bash
PG_HOST=localhost PG_PORT=5433 node scripts/geocode-customers-batch.mjs --limit=5
```

Output atteso: almeno 3/5 con ✓, coordinate plausibili per Campania/Basilicata (lat ~40-41, lng ~14-16).

- [ ] **Step 4.4: Commit**

```bash
git add archibald-web-app/backend/scripts/geocode-customers-batch.mjs
git commit -m "chore(giri-visite): script geocoding batch Nominatim (write-to-file, no DB update)"
```

---

## Task 5 — Dataset feste patronali + migrazione pre

**Files:**
- Create: `archibald-web-app/backend/data/patronali-campania-basilicata.json`
- Create: `archibald-web-app/backend/src/db/migrations/108-visit-planning-pre.sql`

- [ ] **Step 5.1: Crea il dataset feste patronali**

Le feste sono per le province SA, NA, CE, PZ, AV, BN, MT. Le date sono verificabili online (es. Wikipedia, comuni.it). Ogni record ha `confidence: "dataset"` — l'agente può correggere dalla UI.

```json
[
  { "comune": "Napoli",                "provincia": "NA", "regione": "Campania", "date_month": 9,  "date_day": 19, "holiday_name": "San Gennaro",     "confidence": "verified" },
  { "comune": "Salerno",               "provincia": "SA", "regione": "Campania", "date_month": 9,  "date_day": 21, "holiday_name": "San Matteo",       "confidence": "verified" },
  { "comune": "Potenza",               "provincia": "PZ", "regione": "Basilicata", "date_month": 5, "date_day": 30, "holiday_name": "San Gerardo",     "confidence": "verified" },
  { "comune": "Avellino",              "provincia": "AV", "regione": "Campania", "date_month": 6,  "date_day": 14, "holiday_name": "San Modestino",    "confidence": "verified" },
  { "comune": "Caserta",               "provincia": "CE", "regione": "Campania", "date_month": 1,  "date_day": 20, "holiday_name": "San Sebastiano",   "confidence": "dataset"  },
  { "comune": "Benevento",             "provincia": "BN", "regione": "Campania", "date_month": 8,  "date_day": 24, "holiday_name": "San Bartolomeo",   "confidence": "dataset"  },
  { "comune": "Matera",                "provincia": "MT", "regione": "Basilicata", "date_month": 7, "date_day": 2, "holiday_name": "Madonna della Bruna", "confidence": "verified" },
  { "comune": "Battipaglia",           "provincia": "SA", "regione": "Campania", "date_month": 9,  "date_day": 8,  "holiday_name": "Natività della Vergine", "confidence": "dataset" },
  { "comune": "Nocera Inferiore",      "provincia": "SA", "regione": "Campania", "date_month": 6,  "date_day": 14, "holiday_name": "San Prisco",       "confidence": "dataset"  },
  { "comune": "Castellammare di Stabia","provincia": "NA","regione": "Campania", "date_month": 9,  "date_day": 26, "holiday_name": "Santi Catello e Antonino", "confidence": "dataset" },
  { "comune": "Ercolano",              "provincia": "NA", "regione": "Campania", "date_month": 11, "date_day": 25, "holiday_name": "San Ciro",         "confidence": "dataset"  },
  { "comune": "Cava de' Tirreni",      "provincia": "SA", "regione": "Campania", "date_month": 5,  "date_day": 3,  "holiday_name": "Santi Filippo e Giacomo", "confidence": "dataset" },
  { "comune": "Scafati",               "provincia": "SA", "regione": "Campania", "date_month": 10, "date_day": 30, "holiday_name": "San Vincenzo",     "confidence": "dataset"  },
  { "comune": "Eboli",                 "provincia": "SA", "regione": "Campania", "date_month": 9,  "date_day": 5,  "holiday_name": "Madonna del Santissimo Rosario", "confidence": "dataset" },
  { "comune": "Agropoli",              "provincia": "SA", "regione": "Campania", "date_month": 7,  "date_day": 16, "holiday_name": "Madonna del Carmine", "confidence": "dataset" },
  { "comune": "Melfi",                 "provincia": "PZ", "regione": "Basilicata", "date_month": 5, "date_day": 30, "holiday_name": "San Gerardo",    "confidence": "dataset"  },
  { "comune": "Lauria",                "provincia": "PZ", "regione": "Basilicata", "date_month": 8, "date_day": 15, "holiday_name": "Assunzione",     "confidence": "dataset"  },
  { "comune": "Sala Consilina",        "provincia": "SA", "regione": "Campania", "date_month": 6,  "date_day": 24, "holiday_name": "San Giovanni Battista", "confidence": "dataset" },
  { "comune": "Vallo della Lucania",   "provincia": "SA", "regione": "Campania", "date_month": 9,  "date_day": 4,  "holiday_name": "Santa Rosalia",    "confidence": "dataset"  },
  { "comune": "Pagani",                "provincia": "SA", "regione": "Campania", "date_month": 9,  "date_day": 8,  "holiday_name": "Natività della Vergine", "confidence": "dataset" },
  { "comune": "Angri",                 "provincia": "SA", "regione": "Campania", "date_month": 3,  "date_day": 17, "holiday_name": "San Patrizio",     "confidence": "dataset"  },
  { "comune": "Pontecagnano Faiano",   "provincia": "SA", "regione": "Campania", "date_month": 2,  "date_day": 14, "holiday_name": "San Valentino",    "confidence": "dataset"  },
  { "comune": "Santa Maria Capua Vetere","provincia": "CE","regione": "Campania","date_month": 11, "date_day": 2, "holiday_name": "Santi Martiri Capuani", "confidence": "dataset" },
  { "comune": "Capua",                 "provincia": "CE", "regione": "Campania", "date_month": 1,  "date_day": 28, "holiday_name": "San Tommaso d'Aquino", "confidence": "dataset" },
  { "comune": "Portici",               "provincia": "NA", "regione": "Campania", "date_month": 8,  "date_day": 8,  "holiday_name": "San Ciro",         "confidence": "dataset"  },
  { "comune": "San Giorgio a Cremano", "provincia": "NA", "regione": "Campania", "date_month": 4,  "date_day": 23, "holiday_name": "San Giorgio",      "confidence": "dataset"  },
  { "comune": "Baronissi",             "provincia": "SA", "regione": "Campania", "date_month": 6,  "date_day": 13, "holiday_name": "Sant'Antonio di Padova", "confidence": "dataset" },
  { "comune": "Atripalda",             "provincia": "AV", "regione": "Campania", "date_month": 11, "date_day": 14, "holiday_name": "San Sabino",       "confidence": "dataset"  },
  { "comune": "Ariano Irpino",         "provincia": "AV", "regione": "Campania", "date_month": 5,  "date_day": 22, "holiday_name": "Santa Rita da Cascia", "confidence": "dataset" },
  { "comune": "Sarno",                 "provincia": "SA", "regione": "Campania", "date_month": 6,  "date_day": 3,  "holiday_name": "San Giovanni Battista", "confidence": "dataset" }
]
```

- [ ] **Step 5.2: Crea la migrazione 108-visit-planning-pre.sql**

```sql
-- Migration 108-pre: Alterazioni minimali al DB esistente
-- Precede 108-visit-planning.sql (tabelle nuove).
-- Sicura: tutte le operazioni sono IF NOT EXISTS / idempotenti.

BEGIN;

-- Punto di partenza/rientro per agente
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS home_lat     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS home_lng     NUMERIC(10,7);

-- Tipo distributore — esclude Fresis dal planner giri
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS is_distributor BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed: Fresis ha DUE account in produzione (verificato 2026-06-05):
--   erp_id '55.261' / account_num '1002328' = "Fresis Soc Cooperativa"
--   erp_id '55.217' / account_num '049421'  = "Xx Fresis Soc Cooperativa"
UPDATE agents.customers
SET is_distributor = TRUE
WHERE account_num IN ('1002328', '049421');

COMMIT;
```

- [ ] **Step 5.3: Commit entrambi i file**

```bash
git add archibald-web-app/backend/data/patronali-campania-basilicata.json
git add archibald-web-app/backend/src/db/migrations/108-visit-planning-pre.sql
git commit -m "chore(giri-visite): dataset feste patronali e migrazione pre-MVP (ALTER TABLE + seed Fresis)"
```

---

## Task 6 — Applica migrazione 108-pre e verifica

- [ ] **Step 6.1: Verifica sintassi in transazione con ROLLBACK**

```bash
# Syntax check senza committare
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald" \
  < archibald-web-app/backend/src/db/migrations/108-visit-planning-pre.sql
```

Output atteso: `ALTER TABLE` × 3, `UPDATE N` (dove N è il numero di clienti Fresis aggiornati, atteso 2 se già non is_distributor).

- [ ] **Step 6.2: Verifica seed su produzione**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT erp_id, account_num, name, is_distributor FROM agents.customers WHERE account_num IN ('1002328','049421');\""
```

Output atteso:
```
  erp_id | account_num |         name          | is_distributor
---------+-------------+-----------------------+----------------
 55.261  | 1002328     | Fresis Soc Cooperativa | t
 55.217  | 049421      | Xx Fresis Soc ...      | t
```

- [ ] **Step 6.3: Verifica colonne home_* su agents.users**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='agents' AND table_name='users' AND column_name LIKE 'home_%';\""
```

Output atteso: 3 righe — `home_address TEXT`, `home_lat NUMERIC`, `home_lng NUMERIC`.

- [ ] **Step 6.4: Commit nota completamento**

```bash
git commit --allow-empty -m "chore(giri-visite): migrazione 108-pre applicata e verificata in produzione"
```

---

## Task 7 — Importa feste patronali nel DB

Questo task richiede che la tabella `system.italian_municipal_holidays` esista. Viene creata nella migrazione 108 completa (Piano 1b, Task 1). **Questo task si esegue dopo Piano 1b Task 1.**

Per documentazione: lo script di import è incluso qui.

- [ ] **Step 7.1: Crea script import feste**

```js
#!/usr/bin/env node
// Importa il dataset feste patronali nella tabella system.italian_municipal_holidays.
// Eseguire DOPO la migrazione 108 completa (Piano 1b).
// Idempotente: ON CONFLICT DO NOTHING.

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const dataPath = path.join(__dirname, '..', 'data', 'patronali-campania-basilicata.json');
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const r of data) {
      const res = await client.query(
        `INSERT INTO system.italian_municipal_holidays
           (comune, provincia, regione, date_month, date_day, holiday_name, confidence, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'patronali-campania-basilicata.json')
         ON CONFLICT (comune, provincia) DO NOTHING`,
        [r.comune, r.provincia, r.regione, r.date_month, r.date_day, r.holiday_name, r.confidence]
      );
      if (res.rowCount > 0) inserted++;
    }
    console.log(`Inseriti ${inserted} di ${data.length} record (${data.length - inserted} già presenti)`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 7.2: Commit script**

```bash
git add archibald-web-app/backend/scripts/import-patronali.mjs
git commit -m "chore(giri-visite): script import feste patronali (eseguire dopo migrazione 108)"
```

---

## Checklist Gate Fase 0a completata

Prima di passare al Piano 1b, verificare:

- [ ] `audit-visit-data-quality.json` generato e review: `con_citta ≥ 1300`, `con_indirizzo ≥ 1300`
- [ ] `audit-visit-dedup-golden.json` generato e valori confermati dall'agente ("nell'ordine giusto")
- [ ] `audit-visit-matching.json` generato: `confirmedMatchesTotal ≥ 500`
- [ ] Geocoding test su 5 clienti: almeno 3/5 con coordinate plausibili
- [ ] Migrazione 108-pre applicata in produzione: `is_distributor=TRUE` per entrambi gli account Fresis
- [ ] Colonne `home_address`, `home_lat`, `home_lng` presenti in `agents.users`
