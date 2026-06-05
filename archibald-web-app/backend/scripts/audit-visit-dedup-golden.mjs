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
        ROUND((SUM(fh.target_total_with_vat) / 1.22)::numeric, 2) AS tot_imponibile,
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
        AND REPLACE(fh.archibald_order_id, '.', '') != ''
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
