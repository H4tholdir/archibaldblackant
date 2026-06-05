#!/usr/bin/env node
// Geocoding batch via Nominatim OSM (rate limit: 1 req/sec).
// Legge clienti senza coordinate dal DB e scrive risultati su file JSON.
// NON modifica il DB — l'update avviene in Fase 1b tramite job backend.
// Flags:
//   --dry-run   : stampa i clienti da geocodificare senza fare richieste HTTP
//   --limit=N   : geocodifica al massimo N clienti (default: 50)

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// User-Agent obbligatorio per Nominatim (identificativo del progetto)
const USER_AGENT = 'Formicanera-Visit-Planner/1.0 (formicanera.com; contact: deploy@formicanera.com)';
// 1100ms: rate limit Nominatim è 1 req/sec, 100ms di margine di sicurezza
const RATE_LIMIT_MS = 1100;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_RAW = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 50);
if (!Number.isInteger(LIMIT_RAW) || LIMIT_RAW < 1) {
  console.error('Errore: --limit deve essere un intero positivo (es. --limit=100)');
  process.exit(1);
}
const LIMIT = LIMIT_RAW;

const pool = new pg.Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function geocodeAddress(street, postalCode, city) {
  const parts = [street, postalCode, city, 'Italy'].filter(Boolean);
  const q = parts.join(', ');
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=it`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'it',
    },
  });

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();

  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      'SELECT id FROM agents.users ORDER BY created_at, id LIMIT 1'
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      console.error('Nessun utente trovato nel database.');
      process.exit(1);
    }

    const { rows: customers } = await client.query(`
      SELECT erp_id, name, street, postal_code, city
      FROM agents.customers
      WHERE user_id = $1
        AND city IS NOT NULL AND city != ''
        AND geo_latitude IS NULL
      ORDER BY name
      LIMIT $2
    `, [userId, LIMIT]);

    console.log(`\n=== GEOCODING BATCH (dry_run=${DRY_RUN}, limit=${LIMIT}) ===`);
    console.log(`Clienti da geocodificare: ${customers.length}`);

    if (customers.length === 0) {
      console.log('Nessun cliente da geocodificare. Tutti hanno già coordinate o city mancante.');
      return;
    }

    const results = [];
    let ok = 0;
    let fail = 0;

    for (const c of customers) {
      if (DRY_RUN) {
        console.log(`  [DRY] ${c.erp_id} "${c.name}" — ${c.street ?? '(no via)'}, ${c.postal_code ?? ''} ${c.city}`);
        results.push({ erpId: c.erp_id, name: c.name, status: 'dry_run' });
        continue;
      }

      try {
        const geo = await geocodeAddress(c.street, c.postal_code, c.city);
        if (geo) {
          console.log(`  ✓ ${c.erp_id} "${c.name}" → ${geo.lat}, ${geo.lng}`);
          results.push({ erpId: c.erp_id, name: c.name, lat: geo.lat, lng: geo.lng, displayName: geo.displayName, status: 'ok' });
          ok++;
        } else {
          console.log(`  ✗ ${c.erp_id} "${c.name}" — non trovato (${c.city})`);
          results.push({ erpId: c.erp_id, name: c.name, status: 'not_found' });
          fail++;
        }
      } catch (err) {
        console.error(`  ! ${c.erp_id} "${c.name}" — errore: ${err.message}`);
        results.push({ erpId: c.erp_id, name: c.name, status: 'error', error: err.message });
        fail++;
      }

      await sleep(RATE_LIMIT_MS);
    }

    const outDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(outDir, { recursive: true });
    // Timestamp nel nome file per non sovrascrivere run precedenti
    const outPath = path.join(outDir, `geocode-results-${Date.now()}.json`);
    await fs.writeFile(outPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      limit: LIMIT,
      ok,
      fail,
      results,
    }, null, 2));

    if (!DRY_RUN) {
      console.log(`\nCompletato: ${ok} geocodificati, ${fail} falliti`);
      console.log('NOTA: il DB non è stato modificato. Usa il job geocode-missing del backend per aggiornare il DB.');
    }
    console.log(`Risultati salvati in: ${outPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
