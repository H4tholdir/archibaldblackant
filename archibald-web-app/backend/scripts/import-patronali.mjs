#!/usr/bin/env node
// Importa il dataset feste patronali nella tabella system.italian_municipal_holidays.
// PREREQUISITO: migrazione 108 completa (Piano 1b) deve essere applicata.
// Idempotente: ON CONFLICT DO NOTHING su (comune, provincia).

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
    let skipped = 0;

    for (const r of data) {
      const res = await client.query(
        `INSERT INTO system.italian_municipal_holidays
           (comune, provincia, regione, date_month, date_day, holiday_name, confidence, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (comune, provincia) DO NOTHING`,
        [r.comune, r.provincia, r.regione, r.date_month, r.date_day, r.holiday_name, r.confidence,
         'patronali-campania-basilicata.json']
      );
      if (res.rowCount > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    console.log(`\n=== IMPORT FESTE PATRONALI ===`);
    console.log(`Inseriti: ${inserted}`);
    console.log(`Già presenti (skip): ${skipped}`);
    console.log(`Totale dataset: ${data.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
