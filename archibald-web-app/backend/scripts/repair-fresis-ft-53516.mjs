// Repair script: genera FT mancanti per ordine Archibald 53516 (inviato il 25/04/2026)
// Le 4 righe fresis_history hanno archibald_order_id='53516', source='app', arca_data=NULL
// Il bug nel WHERE clause (replace + dot mismatch) le aveva saltate durante send-to-verona.

import pg from 'pg';
import process from 'process';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const USER_ID = 'bbed531f-97a5-4250-865e-39ec149cd048';
const ARCHIBALD_ORDER_ID = '53516';
const ESERCIZIO = '2026';
const DOC_DATE = '2026-04-25';

function round2(n) {
  return Math.round(n * 100) / 100;
}

function generateArcaData(record, ftNumber) {
  const datadoc = DOC_DATE;
  const numerodoc = String(ftNumber);
  const codicecf = record.sub_client_codice;
  const zona = record.sub_client_data?.zona ?? '0';

  const righe = record.items.map((item, idx) => {
    const discount = item.discount ?? 0;
    const prezzoTot = round2(item.quantity * item.price * (1 - discount / 100));
    return {
      ID: 0, ID_TESTA: 0, ESERCIZIO: ESERCIZIO, TIPODOC: 'FT',
      NUMERODOC: numerodoc, DATADOC: datadoc, CODICECF: codicecf,
      MAGPARTENZ: '00001', MAGARRIVO: '00001', AGENTE: '', AGENTE2: '',
      VALUTA: 'EUR', CAMBIO: 1, CODICEARTI: item.articleCode,
      NUMERORIGA: idx + 1, ESPLDISTIN: '',
      UNMISURA: item.unit ?? 'PZ', QUANTITA: item.quantity, QUANTITARE: item.quantity,
      SCONTI: discount > 0 ? String(discount) : '', PREZZOUN: item.price,
      PREZZOTOT: prezzoTot, ALIIVA: String(item.vat).padStart(2, '0'),
      CONTOSCARI: '01', OMIVA: false, OMMERCE: false, PROVV: '', PROVV2: '',
      DATACONSEG: datadoc,
      DESCRIZION: `${item.articleCode} ${item.description ?? item.productName ?? ''}`.slice(0, 40),
      TIPORIGAD: '', RESTOSCORP: 0, RESTOSCUNI: 0, CODCAUMAG: '99',
      ZONA: zona, SETTORE: '', GRUPPO: '00001', CLASSE: '',
      RIFFROMT: 0, RIFFROMR: 0, PREZZOTOTM: prezzoTot, NOTE: '', COMMESSA: '',
      TIMESTAMP: null, USERNAME: '', FATT: 1, LOTTO: '', MATRICOLA: '',
      EUROCAMBIO: 1, U_PESON: 0, U_PESOL: 0, U_COLLI: 0, U_GIA: 0, U_MAGP: '', U_MAGA: '',
    };
  });

  const totMerce = round2(record.items.reduce((s, i) => s + i.quantity * i.price, 0));
  const totNetto = round2(righe.reduce((s, r) => s + r.PREZZOTOT, 0));
  const totSconto = round2(totMerce - totNetto);
  const vatGroups = new Map();
  for (const r of righe) {
    const rate = Number(r.ALIIVA);
    vatGroups.set(rate, (vatGroups.get(rate) ?? 0) + r.PREZZOTOT);
  }
  const totIva = round2([...vatGroups.entries()].reduce((s, [rate, base]) => s + round2(base * rate / 100), 0));
  const totDoc = round2(totNetto + totIva);
  const scontiStr = record.discount_percent != null ? String(record.discount_percent) : '';
  const scontiF = record.discount_percent != null ? (100 - record.discount_percent) / 100 : 1;

  const d = record.sub_client_data;
  const testata = {
    ID: 0, ESERCIZIO, ESANNO: ESERCIZIO, TIPODOC: 'FT', NUMERODOC: numerodoc,
    DATADOC: datadoc, CODICECF: codicecf, CODCNT: '001',
    MAGPARTENZ: '00001', MAGARRIVO: '00001', NUMRIGHEPR: righe.length,
    AGENTE: '', AGENTE2: '', VALUTA: 'EUR', PAG: '0001',
    SCONTI: scontiStr, SCONTIF: scontiF, SCONTOCASS: '', SCONTOCASF: 1,
    PROVV: '', PROVV2: '', CAMBIO: 1, DATADOCFOR: null, NUMERODOCF: '',
    TIPOMODULO: 'F', LISTINO: '1', ZONA: zona, SETTORE: '', DESTDIV: '',
    DATACONSEG: datadoc, TRDATA: null, TRORA: '', PESOLORDO: 0, PESONETTO: 0,
    VOLUME: 0, VETTORE1: '', V1DATA: null, V1ORA: '', VETTORE2: '', V2DATA: null, V2ORA: '',
    TRCAUSALE: '', COLLI: '', SPEDIZIONE: '', PORTO: '',
    NOTE: record.notes ?? '', SPESETR: 0, SPESETRIVA: '22', SPESETRCP: '19', SPESETRPER: '',
    SPESEIM: 0, SPESEIMIVA: '22', SPESEIMCP: '29',
    SPESEVA: 0, SPESEVAIVA: '22', SPESEVACP: '29',
    ACCONTO: 0, ABBUONO: 0, TOTIMP: totNetto, TOTDOC: totDoc,
    SPESE: '', SPESEBOLLI: 0, SPESEINCAS: 0, SPESEINEFF: 0, SPESEINDOC: 0,
    SPESEINIVA: '', SPESEINCP: '', SPESEESENZ: 0, CODCAUMAG: '99', CODBANCA: '1',
    PERCPROVV: 0, IMPPROVV: 0, TOTPROVV: 0, PERCPROVV2: 0, IMPPROVV2: 0, TOTPROVV2: 0,
    TOTIVA: totIva, ASPBENI: '', SCORPORO: false, TOTMERCE: totMerce,
    TOTSCONTO: totSconto, TOTNETTO: totNetto, TOTESEN: 0, IMPCOND: 0, RITCOND: 0,
    TIPOFATT: 'N', TRIANGOLAZ: false, NOMODIFICA: false, NOEVASIONE: false,
    COMMESSA: '', EUROCAMBIO: 1, EXPORT_I: false, CB_BIC: '', CB_NAZIONE: 'IT',
    CB_CIN_UE: '', CB_CIN_IT: '', ABICAB: '', CONTOCORR: '', CARICATORE: '',
    COMMITTENT: '', PROPRMERCE: '', LUOGOCAR: '', LUOGOSCAR: '', SDTALTRO: '',
    TIMESTAMP: null, USERNAME: '',
  };

  const destinazione = d ? {
    CODICECF: codicecf, CODICEDES: '001',
    RAGIONESOC: d.ragioneSociale ?? record.sub_client_name,
    SUPPRAGSOC: d.supplRagioneSociale ?? '', INDIRIZZO: d.indirizzo ?? '',
    CAP: d.cap ?? '', LOCALITA: d.localita ?? '', PROVINCIA: d.prov ?? '',
    CODNAZIONE: 'IT', AGENTE: '', AGENTE2: '', SETTORE: '', ZONA: d.zona ?? '',
    VETTORE: '', TELEFONO: d.telefono ?? '', FAX: d.fax ?? '',
    PERSONARIF: d.persDaContattare ?? '', TIMESTAMP: null, USERNAME: '',
  } : null;

  return { testata, righe, destinazione_diversa: destinazione };
}

async function getNextFtNumber(client) {
  const res = await client.query(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
     VALUES ($1, $2, 'FT', 1, $3)
     ON CONFLICT (esercizio, user_id, tipodoc)
     DO UPDATE SET
       last_number = agents.ft_counter.last_number + 1,
       last_date   = GREATEST(agents.ft_counter.last_date, $3)
     RETURNING last_number`,
    [ESERCIZIO, USER_ID, DOC_DATE],
  );
  return res.rows[0].last_number;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, sub_client_codice, sub_client_name, sub_client_data,
              items, discount_percent, notes
       FROM agents.fresis_history
       WHERE user_id = $1
         AND archibald_order_id = $2
         AND arca_data IS NULL
         AND source = 'app'
       ORDER BY created_at`,
      [USER_ID, ARCHIBALD_ORDER_ID],
    );

    if (rows.length === 0) {
      console.log('Nessuna riga da riparare (arca_data già presente o ordine non trovato).');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Trovate ${rows.length} righe da riparare.`);

    for (const row of rows) {
      const items = row.items;
      const exportItems = items.filter(i => !i.isGhostArticle);

      if (exportItems.length === 0) {
        console.log(`  [SKIP] ${row.sub_client_name} — solo articoli ghost, nessuna FT.`);
        await client.query(
          `UPDATE agents.fresis_history
           SET current_state = 'inviato_verona', state_updated_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [row.id, USER_ID],
        );
        continue;
      }

      const ftNumber = await getNextFtNumber(client);
      const recordForGen = { ...row, items: exportItems };
      const arcaData = generateArcaData(recordForGen, ftNumber);
      const invoiceNumber = `FT ${ftNumber}/${ESERCIZIO}`;

      await client.query(
        `UPDATE agents.fresis_history
         SET arca_data = $1, invoice_number = $2, current_state = 'inviato_verona',
             state_updated_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [JSON.stringify(arcaData), invoiceNumber, row.id, USER_ID],
      );

      console.log(`  [OK] ${row.sub_client_name} → ${invoiceNumber}`);
    }

    await client.query('COMMIT');
    console.log('Repair completato con successo.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Errore durante repair:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
