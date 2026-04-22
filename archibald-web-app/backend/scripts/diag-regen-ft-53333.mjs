/**
 * diag-regen-ft-53333.mjs
 *
 * Rigenera i dati FT (arca_data) per i 5 record di fresis_history legati
 * all'ordine Archibald 53333, rimasti con arca_data=NULL dopo il bug
 * archibald_order_id dot-mismatch ('53.333' vs '53333').
 *
 * Da eseguire dentro il container backend:
 *   docker compose exec backend node scripts/diag-regen-ft-53333.mjs
 *
 * Richiede env vars: PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
 */

import pg from 'pg';
const { Pool } = pg;

const USER_ID = 'bbed531f-97a5-4250-865e-39ec149cd048';
const ARCHIBALD_ORDER_ID = '53333';
const ESERCIZIO = '2026';
const DOC_DATE = '2026-04-22';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'archibald',
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function generateArcaData(record, ftNumber, esercizio, dateIso) {
  const datadoc = dateIso ?? DOC_DATE;
  const numerodoc = String(ftNumber);
  const codicecf = record.subClientCodice;
  const zona = record.subClientData?.zona ?? '0';

  const righe = record.items.map((item, idx) => {
    const discount = item.discount ?? 0;
    const prezzoTot = round2(item.quantity * item.price * (1 - discount / 100));
    return {
      ID: 0, ID_TESTA: 0, ESERCIZIO: esercizio, TIPODOC: 'FT',
      NUMERODOC: numerodoc, DATADOC: datadoc, CODICECF: codicecf,
      MAGPARTENZ: '00001', MAGARRIVO: '00001', AGENTE: '', AGENTE2: '',
      VALUTA: 'EUR', CAMBIO: 1, CODICEARTI: item.articleCode,
      NUMERORIGA: idx + 1, ESPLDISTIN: '',
      UNMISURA: item.unit ?? 'PZ', QUANTITA: item.quantity,
      QUANTITARE: item.quantity,
      SCONTI: discount > 0 ? String(discount) : '',
      PREZZOUN: item.price, PREZZOTOT: prezzoTot,
      ALIIVA: String(item.vat).padStart(2, '0'),
      CONTOSCARI: '01', OMIVA: false, OMMERCE: false,
      PROVV: '', PROVV2: '', DATACONSEG: datadoc,
      DESCRIZION: `${item.articleCode} ${item.description ?? item.productName ?? ''}`.slice(0, 40),
      TIPORIGAD: '', RESTOSCORP: 0, RESTOSCUNI: 0, CODCAUMAG: '99',
      ZONA: zona, SETTORE: '', GRUPPO: '00001', CLASSE: '',
      RIFFROMT: 0, RIFFROMR: 0, PREZZOTOTM: prezzoTot, NOTE: '',
      COMMESSA: '', TIMESTAMP: null, USERNAME: '', FATT: 1,
      LOTTO: '', MATRICOLA: '', EUROCAMBIO: 1,
      U_PESON: 0, U_PESOL: 0, U_COLLI: 0, U_GIA: 0, U_MAGP: '', U_MAGA: '',
    };
  });

  const totMerce = round2(record.items.reduce((sum, item) => sum + item.quantity * item.price, 0));
  const totNetto = round2(righe.reduce((sum, r) => sum + r.PREZZOTOT, 0));
  const totSconto = round2(totMerce - totNetto);

  const vatGroups = new Map();
  for (const riga of righe) {
    const vatRate = Number(riga.ALIIVA);
    vatGroups.set(vatRate, (vatGroups.get(vatRate) ?? 0) + riga.PREZZOTOT);
  }
  const totIva = round2([...vatGroups.entries()].reduce(
    (sum, [rate, base]) => sum + round2(base * rate / 100), 0,
  ));
  const totDoc = round2(totNetto + totIva);

  const scontiStr = record.discountPercent != null ? String(record.discountPercent) : '';
  const scontiF = record.discountPercent != null ? (100 - record.discountPercent) / 100 : 1;

  const testata = {
    ID: 0, ESERCIZIO: esercizio, ESANNO: esercizio, TIPODOC: 'FT',
    NUMERODOC: numerodoc, DATADOC: datadoc, CODICECF: codicecf,
    CODCNT: '001', MAGPARTENZ: '00001', MAGARRIVO: '00001',
    NUMRIGHEPR: righe.length, AGENTE: '', AGENTE2: '',
    VALUTA: 'EUR', PAG: '0001',
    SCONTI: scontiStr, SCONTIF: scontiF,
    SCONTOCASS: '', SCONTOCASF: 1, PROVV: '', PROVV2: '',
    CAMBIO: 1, DATADOCFOR: null, NUMERODOCF: '', TIPOMODULO: 'F',
    LISTINO: '1', ZONA: zona, SETTORE: '', DESTDIV: '',
    DATACONSEG: datadoc, TRDATA: null, TRORA: '',
    PESOLORDO: 0, PESONETTO: 0, VOLUME: 0,
    VETTORE1: '', V1DATA: null, V1ORA: '',
    VETTORE2: '', V2DATA: null, V2ORA: '',
    TRCAUSALE: '', COLLI: '', SPEDIZIONE: '', PORTO: '',
    NOTE: record.notes ?? '',
    SPESETR: 0, SPESETRIVA: '22', SPESETRCP: '19', SPESETRPER: '',
    SPESEIM: 0, SPESEIMIVA: '22', SPESEIMCP: '29',
    SPESEVA: 0, SPESEVAIVA: '22', SPESEVACP: '29',
    ACCONTO: 0, ABBUONO: 0, TOTIMP: totNetto, TOTDOC: totDoc,
    SPESE: '', SPESEBOLLI: 0, SPESEINCAS: 0, SPESEINEFF: 0, SPESEINDOC: 0,
    SPESEINIVA: '', SPESEINCP: '', SPESEESENZ: 0, CODCAUMAG: '99',
    CODBANCA: '1', PERCPROVV: 0, IMPPROVV: 0, TOTPROVV: 0,
    PERCPROVV2: 0, IMPPROVV2: 0, TOTPROVV2: 0, TOTIVA: totIva,
    ASPBENI: '', SCORPORO: false, TOTMERCE: totMerce, TOTSCONTO: totSconto,
    TOTNETTO: totNetto, TOTESEN: 0, IMPCOND: 0, RITCOND: 0,
    TIPOFATT: 'N', TRIANGOLAZ: false, NOMODIFICA: false, NOEVASIONE: false,
    COMMESSA: '', EUROCAMBIO: 1, EXPORT_I: false,
    CB_BIC: '', CB_NAZIONE: 'IT', CB_CIN_UE: '', CB_CIN_IT: '',
    ABICAB: '', CONTOCORR: '', CARICATORE: '', COMMITTENT: '',
    PROPRMERCE: '', LUOGOCAR: '', LUOGOSCAR: '', SDTALTRO: '',
    TIMESTAMP: null, USERNAME: '',
  };

  let destinazione = null;
  if (record.subClientData) {
    const d = record.subClientData;
    destinazione = {
      CODICECF: codicecf, CODICEDES: '001',
      RAGIONESOC: d.ragioneSociale ?? record.subClientName,
      SUPPRAGSOC: d.supplRagioneSociale ?? '',
      INDIRIZZO: d.indirizzo ?? '', CAP: d.cap ?? '',
      LOCALITA: d.localita ?? '', PROVINCIA: d.prov ?? '',
      CODNAZIONE: 'IT', AGENTE: '', AGENTE2: '', SETTORE: '',
      ZONA: d.zona ?? '', VETTORE: '', TELEFONO: d.telefono ?? '',
      FAX: d.fax ?? '', PERSONARIF: d.persDaContattare ?? '',
      TIMESTAMP: null, USERNAME: '',
    };
  }

  return { testata, righe, destinazione_diversa: destinazione };
}

async function getNextFtNumber(client) {
  const result = await client.query(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
     VALUES ($1, $2, 'FT', 1, $3)
     ON CONFLICT (esercizio, user_id, tipodoc) DO UPDATE
       SET last_number = agents.ft_counter.last_number + 1,
           last_date = GREATEST(agents.ft_counter.last_date, EXCLUDED.last_date)
     RETURNING last_number`,
    [ESERCIZIO, USER_ID, DOC_DATE],
  );
  return result.rows[0].last_number;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: records } = await client.query(
      `SELECT id, sub_client_codice, sub_client_name, sub_client_data,
              items, discount_percent, notes
       FROM agents.fresis_history
       WHERE user_id = $1
         AND archibald_order_id = $2
         AND arca_data IS NULL
         AND source = 'app'
       ORDER BY sub_client_codice`,
      [USER_ID, ARCHIBALD_ORDER_ID],
    );

    console.log(`[REGEN] Trovati ${records.length} record da aggiornare`);

    if (records.length === 0) {
      console.log('[REGEN] Nessun record da aggiornare. Uscita.');
      return;
    }

    await client.query('BEGIN');

    for (const row of records) {
      const items = (row.items ?? []).filter(i => !i.isGhostArticle);

      if (items.length === 0) {
        console.log(`[REGEN] Skip ${row.sub_client_codice} (solo ghost articles)`);
        continue;
      }

      const ftNumber = await getNextFtNumber(client);
      const invoiceNumber = `FT ${ftNumber}/${ESERCIZIO}`;

      const input = {
        subClientCodice: row.sub_client_codice,
        subClientName: row.sub_client_name,
        subClientData: row.sub_client_data,
        items,
        discountPercent: row.discount_percent ?? undefined,
        notes: row.notes ?? undefined,
      };

      const arcaData = generateArcaData(input, ftNumber, ESERCIZIO, DOC_DATE);

      await client.query(
        `UPDATE agents.fresis_history
         SET arca_data = $1, invoice_number = $2,
             current_state = 'inviato_verona',
             state_updated_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [JSON.stringify(arcaData), invoiceNumber, row.id, USER_ID],
      );

      console.log(`[REGEN] ✅ ${row.sub_client_codice} ${row.sub_client_name} → ${invoiceNumber}`);
      console.log(`         righe: ${arcaData.righe.length}, totDoc: ${arcaData.testata.TOTDOC}`);
    }

    await client.query('COMMIT');
    console.log('[REGEN] ✅ COMMIT completato — tutti i record aggiornati');

    const { rows: verify } = await client.query(
      `SELECT sub_client_codice, sub_client_name, invoice_number, current_state, arca_data IS NOT NULL as has_arca
       FROM agents.fresis_history
       WHERE user_id = $1 AND archibald_order_id = $2 AND source = 'app'
       ORDER BY sub_client_codice`,
      [USER_ID, ARCHIBALD_ORDER_ID],
    );
    console.log('\n[REGEN] Verifica finale:');
    for (const r of verify) {
      console.log(`  ${r.sub_client_codice} ${r.sub_client_name}: ${r.invoice_number} | ${r.current_state} | arca_data=${r.has_arca}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[REGEN] ❌ ERRORE — ROLLBACK eseguito:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
