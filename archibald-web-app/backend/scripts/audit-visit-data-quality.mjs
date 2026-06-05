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
