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
  try {
    const userResult = await client.query(
      'SELECT id FROM agents.users ORDER BY created_at, id LIMIT 1'
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      console.error('Nessun utente trovato nel database.');
      process.exit(1);
    }

    // 1. Match confermati esistenti (campione, max 20)
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
      'SELECT COUNT(*) AS n FROM shared.sub_client_customer_matches'
    );

    // 2a. Totale candidati non confermati per P.IVA uguale
    const vatCandidatesTotal = await client.query(`
      SELECT COUNT(*) AS n
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
    `, [userId]);

    // 2b. Campione candidati (max 30)
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

    // 3. Sub-clients senza nessun match confermato
    const unmatched = await client.query(`
      SELECT COUNT(*) AS n_senza_match
      FROM shared.sub_clients sc
      WHERE NOT EXISTS (
        SELECT 1 FROM shared.sub_client_customer_matches m
        WHERE m.sub_client_codice = sc.codice
      )
    `);

    const vatCandidatesTotalCount = Number(vatCandidatesTotal.rows[0].n);

    const report = {
      generatedAt: new Date().toISOString(),
      userId,
      confirmedMatchesTotal: Number(confirmedCount.rows[0].n),
      confirmedMatchesSample: confirmed.rows,
      vatCandidatesTotal: vatCandidatesTotalCount,
      vatCandidatesSample: vatCandidates.rows,
      subClientsWithoutAnyMatch: Number(unmatched.rows[0].n_senza_match),
    };

    const outPath = path.join(__dirname, '..', 'data', 'audit-visit-matching.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));

    console.log('\n=== AUDIT MATCHING ARCA↔ARCHIBALD ===\n');
    console.log(`Match confermati totali: ${report.confirmedMatchesTotal}`);
    console.log(`Sub-clients senza nessun match: ${report.subClientsWithoutAnyMatch}`);
    console.log(`\nCandidati per P.IVA uguale (non ancora confermati): ${vatCandidatesTotalCount} (campione: ${vatCandidates.rows.length})`);
    vatCandidates.rows.slice(0, 10).forEach(r =>
      console.log(`  ARCA ${r.arca_codice} "${r.arca_nome}" ↔ ERP ${r.erp_id} "${r.archibald_nome}"`)
    );
    console.log('\nCampione match confermati (primi 5):');
    confirmed.rows.slice(0, 5).forEach(r =>
      console.log(`  ${r.sub_client_codice} "${r.ragione_sociale}" ↔ ${r.erp_id} "${r.customer_name}" (${r.city})`)
    );
    console.log(`\nReport salvato in: ${outPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
