import type { DbPool } from '../pool.js';

type SubclientRow = {
  codice: string;
  ragione_sociale: string;
  suppl_ragione_sociale: string | null;
  indirizzo: string | null;
  cap: string | null;
  localita: string | null;
  prov: string | null;
  telefono: string | null;
  fax: string | null;
  email: string | null;
  partita_iva: string | null;
  cod_fiscale: string | null;
  zona: string | null;
  pers_da_contattare: string | null;
  email_amministraz: string | null;
  agente: string | null;
  agente2: string | null;
  settore: string | null;
  classe: string | null;
  pag: string | null;
  listino: string | null;
  banca: string | null;
  valuta: string | null;
  cod_nazione: string | null;
  aliiva: string | null;
  contoscar: string | null;
  tipofatt: string | null;
  telefono2: string | null;
  telefono3: string | null;
  url: string | null;
  cb_nazione: string | null;
  cb_bic: string | null;
  cb_cin_ue: string | null;
  cb_cin_it: string | null;
  abicab: string | null;
  contocorr: string | null;
  matched_customer_profile_id: string | null;
  match_confidence: string | null;
  arca_synced_at: string | null;
  customer_match_count?: number;
  sub_client_match_count?: number;
};

type Subclient = {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale: string | null;
  indirizzo: string | null;
  cap: string | null;
  localita: string | null;
  prov: string | null;
  telefono: string | null;
  fax: string | null;
  email: string | null;
  partitaIva: string | null;
  codFiscale: string | null;
  zona: string | null;
  persDaContattare: string | null;
  emailAmministraz: string | null;
  agente: string | null;
  agente2: string | null;
  settore: string | null;
  classe: string | null;
  pag: string | null;
  listino: string | null;
  banca: string | null;
  valuta: string | null;
  codNazione: string | null;
  aliiva: string | null;
  contoscar: string | null;
  tipofatt: string | null;
  telefono2: string | null;
  telefono3: string | null;
  url: string | null;
  cbNazione: string | null;
  cbBic: string | null;
  cbCinUe: string | null;
  cbCinIt: string | null;
  abicab: string | null;
  contocorr: string | null;
  matchedCustomerProfileId: string | null;
  matchConfidence: string | null;
  arcaSyncedAt: string | null;
  customerMatchCount: number;
  subClientMatchCount: number;
};

const COLUMN_COUNT = 39;

const COLUMNS = `
  codice, ragione_sociale, suppl_ragione_sociale,
  indirizzo, cap, localita, prov,
  telefono, fax, email,
  partita_iva, cod_fiscale, zona,
  pers_da_contattare, email_amministraz,
  agente, agente2, settore, classe,
  pag, listino, banca, valuta, cod_nazione,
  aliiva, contoscar, tipofatt,
  telefono2, telefono3, url,
  cb_nazione, cb_bic, cb_cin_ue, cb_cin_it, abicab, contocorr,
  matched_customer_profile_id, match_confidence, arca_synced_at
`;

function mapRowToSubclient(row: SubclientRow): Subclient {
  return {
    codice: row.codice,
    ragioneSociale: row.ragione_sociale,
    supplRagioneSociale: row.suppl_ragione_sociale,
    indirizzo: row.indirizzo,
    cap: row.cap,
    localita: row.localita,
    prov: row.prov,
    telefono: row.telefono,
    fax: row.fax,
    email: row.email,
    partitaIva: row.partita_iva,
    codFiscale: row.cod_fiscale,
    zona: row.zona,
    persDaContattare: row.pers_da_contattare,
    emailAmministraz: row.email_amministraz,
    agente: row.agente,
    agente2: row.agente2,
    settore: row.settore,
    classe: row.classe,
    pag: row.pag,
    listino: row.listino,
    banca: row.banca,
    valuta: row.valuta,
    codNazione: row.cod_nazione,
    aliiva: row.aliiva,
    contoscar: row.contoscar,
    tipofatt: row.tipofatt,
    telefono2: row.telefono2,
    telefono3: row.telefono3,
    url: row.url,
    cbNazione: row.cb_nazione,
    cbBic: row.cb_bic,
    cbCinUe: row.cb_cin_ue,
    cbCinIt: row.cb_cin_it,
    abicab: row.abicab,
    contocorr: row.contocorr,
    matchedCustomerProfileId: row.matched_customer_profile_id,
    matchConfidence: row.match_confidence,
    arcaSyncedAt: row.arca_synced_at,
    customerMatchCount: row.customer_match_count ?? 0,
    subClientMatchCount: row.sub_client_match_count ?? 0,
  };
}

async function getAllSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT sc.codice, sc.ragione_sociale, sc.suppl_ragione_sociale,
       sc.indirizzo, sc.cap, sc.localita, sc.prov,
       sc.telefono, sc.fax, sc.email,
       sc.partita_iva, sc.cod_fiscale, sc.zona,
       sc.pers_da_contattare, sc.email_amministraz,
       sc.agente, sc.agente2, sc.settore, sc.classe,
       sc.pag, sc.listino, sc.banca, sc.valuta, sc.cod_nazione,
       sc.aliiva, sc.contoscar, sc.tipofatt,
       sc.telefono2, sc.telefono3, sc.url,
       sc.cb_nazione, sc.cb_bic, sc.cb_cin_ue, sc.cb_cin_it, sc.abicab, sc.contocorr,
       sc.matched_customer_profile_id, sc.match_confidence, sc.arca_synced_at,
       (SELECT COUNT(*)::int FROM shared.sub_client_customer_matches
        WHERE sub_client_codice = sc.codice) AS customer_match_count,
       (SELECT COUNT(*)::int FROM shared.sub_client_sub_client_matches
        WHERE sub_client_codice_a = sc.codice OR sub_client_codice_b = sc.codice
       ) AS sub_client_match_count
     FROM shared.sub_clients sc
     WHERE sc.hidden = FALSE
     ORDER BY sc.ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}

function tryNormalizeAsSubclientCode(query: string): string | null {
  const upper = query.trim().toUpperCase();
  const digits = upper.startsWith('C') ? upper.slice(1) : upper;
  if (/^\d+$/.test(digits)) return `C${digits.padStart(5, '0')}`;
  return null;
}

async function searchSubclients(pool: DbPool, query: string): Promise<Subclient[]> {
  const pattern = `%${query}%`;
  const normalizedCode = tryNormalizeAsSubclientCode(query);
  const selectCols = `SELECT sc.codice, sc.ragione_sociale, sc.suppl_ragione_sociale,
       sc.indirizzo, sc.cap, sc.localita, sc.prov,
       sc.telefono, sc.fax, sc.email,
       sc.partita_iva, sc.cod_fiscale, sc.zona,
       sc.pers_da_contattare, sc.email_amministraz,
       sc.agente, sc.agente2, sc.settore, sc.classe,
       sc.pag, sc.listino, sc.banca, sc.valuta, sc.cod_nazione,
       sc.aliiva, sc.contoscar, sc.tipofatt,
       sc.telefono2, sc.telefono3, sc.url,
       sc.cb_nazione, sc.cb_bic, sc.cb_cin_ue, sc.cb_cin_it, sc.abicab, sc.contocorr,
       sc.matched_customer_profile_id, sc.match_confidence, sc.arca_synced_at,
       (SELECT COUNT(*)::int FROM shared.sub_client_customer_matches
        WHERE sub_client_codice = sc.codice) AS customer_match_count,
       (SELECT COUNT(*)::int FROM shared.sub_client_sub_client_matches
        WHERE sub_client_codice_a = sc.codice OR sub_client_codice_b = sc.codice
       ) AS sub_client_match_count
     FROM shared.sub_clients sc`;
  const baseWhere = `(sc.ragione_sociale ILIKE $1
        OR sc.suppl_ragione_sociale ILIKE $1
        OR sc.codice ILIKE $1
        OR sc.partita_iva ILIKE $1
        OR sc.localita ILIKE $1
        OR sc.cod_fiscale ILIKE $1
        OR sc.indirizzo ILIKE $1
        OR sc.cap ILIKE $1
        OR sc.telefono ILIKE $1
        OR sc.email ILIKE $1
        OR sc.zona ILIKE $1
        OR sc.agente ILIKE $1
        OR sc.pag ILIKE $1
        OR sc.listino ILIKE $1
        ${normalizedCode ? 'OR sc.codice ILIKE $2' : ''})`;
  const orderBy = normalizedCode
    ? `ORDER BY CASE WHEN sc.codice ILIKE $2 THEN 0 ELSE 1 END, sc.ragione_sociale ASC`
    : `ORDER BY sc.ragione_sociale ASC`;
  const sql = `${selectCols} WHERE sc.hidden = FALSE AND ${baseWhere} ${orderBy}`;
  const params: string[] = normalizedCode ? [pattern, normalizedCode] : [pattern];
  const { rows } = await pool.query<SubclientRow>(sql, params);
  return rows.map(mapRowToSubclient);
}

async function getHiddenSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients WHERE hidden = TRUE ORDER BY ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}

async function setSubclientHidden(pool: DbPool, codice: string, hidden: boolean): Promise<boolean> {
  const result = await pool.query(
    `UPDATE shared.sub_clients SET hidden = $2, updated_at = NOW() WHERE codice = $1`,
    [codice, hidden],
  );
  return (result.rowCount ?? 0) > 0;
}

async function getSubclientByCodice(pool: DbPool, codice: string): Promise<Subclient | null> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients WHERE codice = $1`,
    [codice],
  );
  return rows.length > 0 ? mapRowToSubclient(rows[0]) : null;
}

async function deleteSubclient(pool: DbPool, codice: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM shared.sub_clients WHERE codice = $1',
    [codice],
  );
  return (result.rowCount ?? 0) > 0;
}

function subclientToParams(sc: Subclient): unknown[] {
  return [
    sc.codice, sc.ragioneSociale, sc.supplRagioneSociale,
    sc.indirizzo, sc.cap, sc.localita, sc.prov,
    sc.telefono, sc.fax, sc.email,
    sc.partitaIva, sc.codFiscale, sc.zona,
    sc.persDaContattare, sc.emailAmministraz,
    sc.agente, sc.agente2, sc.settore, sc.classe,
    sc.pag, sc.listino, sc.banca, sc.valuta, sc.codNazione,
    sc.aliiva, sc.contoscar, sc.tipofatt,
    sc.telefono2, sc.telefono3, sc.url,
    sc.cbNazione, sc.cbBic, sc.cbCinUe, sc.cbCinIt, sc.abicab, sc.contocorr,
    sc.matchedCustomerProfileId, sc.matchConfidence, sc.arcaSyncedAt,
  ];
}

async function upsertSubclients(pool: DbPool, subclients: Subclient[]): Promise<number> {
  if (subclients.length === 0) {
    return 0;
  }

  const deduped = [...new Map(subclients.map(sc => [sc.codice, sc])).values()];

  const valuePlaceholders: string[] = [];
  const params: unknown[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const offset = i * COLUMN_COUNT;
    const placeholders = Array.from({ length: COLUMN_COUNT }, (_, j) => `$${offset + j + 1}`);
    valuePlaceholders.push(`(${placeholders.join(', ')})`);
    params.push(...subclientToParams(deduped[i]));
  }

  const result = await pool.query(
    `INSERT INTO shared.sub_clients (
      codice, ragione_sociale, suppl_ragione_sociale,
      indirizzo, cap, localita, prov,
      telefono, fax, email,
      partita_iva, cod_fiscale, zona,
      pers_da_contattare, email_amministraz,
      agente, agente2, settore, classe,
      pag, listino, banca, valuta, cod_nazione,
      aliiva, contoscar, tipofatt,
      telefono2, telefono3, url,
      cb_nazione, cb_bic, cb_cin_ue, cb_cin_it, abicab, contocorr,
      matched_customer_profile_id, match_confidence, arca_synced_at
    ) VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT (codice) DO UPDATE SET
      ragione_sociale = EXCLUDED.ragione_sociale,
      suppl_ragione_sociale = EXCLUDED.suppl_ragione_sociale,
      indirizzo = EXCLUDED.indirizzo,
      cap = EXCLUDED.cap,
      localita = EXCLUDED.localita,
      prov = EXCLUDED.prov,
      telefono = EXCLUDED.telefono,
      fax = EXCLUDED.fax,
      email = EXCLUDED.email,
      partita_iva = EXCLUDED.partita_iva,
      cod_fiscale = EXCLUDED.cod_fiscale,
      zona = EXCLUDED.zona,
      pers_da_contattare = EXCLUDED.pers_da_contattare,
      email_amministraz = EXCLUDED.email_amministraz,
      agente = EXCLUDED.agente,
      agente2 = EXCLUDED.agente2,
      settore = EXCLUDED.settore,
      classe = EXCLUDED.classe,
      pag = EXCLUDED.pag,
      listino = EXCLUDED.listino,
      banca = EXCLUDED.banca,
      valuta = EXCLUDED.valuta,
      cod_nazione = EXCLUDED.cod_nazione,
      aliiva = EXCLUDED.aliiva,
      contoscar = EXCLUDED.contoscar,
      tipofatt = EXCLUDED.tipofatt,
      telefono2 = EXCLUDED.telefono2,
      telefono3 = EXCLUDED.telefono3,
      url = EXCLUDED.url,
      cb_nazione = EXCLUDED.cb_nazione,
      cb_bic = EXCLUDED.cb_bic,
      cb_cin_ue = EXCLUDED.cb_cin_ue,
      cb_cin_it = EXCLUDED.cb_cin_it,
      abicab = EXCLUDED.abicab,
      contocorr = EXCLUDED.contocorr,
      updated_at = CASE
        WHEN ROW(
          shared.sub_clients.ragione_sociale, shared.sub_clients.suppl_ragione_sociale,
          shared.sub_clients.indirizzo, shared.sub_clients.cap, shared.sub_clients.localita,
          shared.sub_clients.prov, shared.sub_clients.telefono, shared.sub_clients.fax,
          shared.sub_clients.email, shared.sub_clients.partita_iva, shared.sub_clients.cod_fiscale,
          shared.sub_clients.zona, shared.sub_clients.pers_da_contattare,
          shared.sub_clients.email_amministraz, shared.sub_clients.agente, shared.sub_clients.agente2,
          shared.sub_clients.settore, shared.sub_clients.classe, shared.sub_clients.pag,
          shared.sub_clients.listino, shared.sub_clients.banca, shared.sub_clients.valuta,
          shared.sub_clients.cod_nazione, shared.sub_clients.aliiva, shared.sub_clients.contoscar,
          shared.sub_clients.tipofatt, shared.sub_clients.telefono2, shared.sub_clients.telefono3,
          shared.sub_clients.url, shared.sub_clients.cb_nazione, shared.sub_clients.cb_bic,
          shared.sub_clients.cb_cin_ue, shared.sub_clients.cb_cin_it, shared.sub_clients.abicab,
          shared.sub_clients.contocorr
        ) IS DISTINCT FROM ROW(
          EXCLUDED.ragione_sociale, EXCLUDED.suppl_ragione_sociale,
          EXCLUDED.indirizzo, EXCLUDED.cap, EXCLUDED.localita,
          EXCLUDED.prov, EXCLUDED.telefono, EXCLUDED.fax,
          EXCLUDED.email, EXCLUDED.partita_iva, EXCLUDED.cod_fiscale,
          EXCLUDED.zona, EXCLUDED.pers_da_contattare,
          EXCLUDED.email_amministraz, EXCLUDED.agente, EXCLUDED.agente2,
          EXCLUDED.settore, EXCLUDED.classe, EXCLUDED.pag,
          EXCLUDED.listino, EXCLUDED.banca, EXCLUDED.valuta,
          EXCLUDED.cod_nazione, EXCLUDED.aliiva, EXCLUDED.contoscar,
          EXCLUDED.tipofatt, EXCLUDED.telefono2, EXCLUDED.telefono3,
          EXCLUDED.url, EXCLUDED.cb_nazione, EXCLUDED.cb_bic,
          EXCLUDED.cb_cin_ue, EXCLUDED.cb_cin_it, EXCLUDED.abicab,
          EXCLUDED.contocorr
        )
        THEN NOW()
        ELSE shared.sub_clients.updated_at
      END`,
    params,
  );

  return result.rowCount ?? 0;
}

async function deleteSubclientsByCodici(pool: DbPool, codici: string[]): Promise<number> {
  if (codici.length === 0) {
    return 0;
  }

  const placeholders = codici.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `DELETE FROM shared.sub_clients WHERE codice IN (${placeholders})`,
    codici,
  );
  return result.rowCount ?? 0;
}

async function countSubclients(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM shared.sub_clients',
  );
  return parseInt(rows[0].count, 10);
}

async function getUnmatchedSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients
     WHERE matched_customer_profile_id IS NULL
     ORDER BY ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}

async function setSubclientMatch(
  pool: DbPool,
  codice: string,
  customerProfileId: string,
  confidence: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE shared.sub_clients
     SET matched_customer_profile_id = $2,
         match_confidence = $3,
         updated_at = NOW()
     WHERE codice = $1`,
    [codice, customerProfileId, confidence],
  );
  return (result.rowCount ?? 0) > 0;
}

async function clearSubclientMatch(pool: DbPool, codice: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE shared.sub_clients
     SET matched_customer_profile_id = NULL,
         match_confidence = NULL,
         updated_at = NOW()
     WHERE codice = $1`,
    [codice],
  );
  return (result.rowCount ?? 0) > 0;
}

async function getSubclientByCustomerProfile(
  pool: DbPool,
  profileId: string,
): Promise<Subclient | null> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients
     WHERE matched_customer_profile_id = $1`,
    [profileId],
  );
  return rows.length > 0 ? mapRowToSubclient(rows[0]) : null;
}

export {
  getAllSubclients,
  searchSubclients,
  getHiddenSubclients,
  setSubclientHidden,
  getSubclientByCodice,
  deleteSubclient,
  upsertSubclients,
  deleteSubclientsByCodici,
  countSubclients,
  mapRowToSubclient,
  getUnmatchedSubclients,
  setSubclientMatch,
  clearSubclientMatch,
  getSubclientByCustomerProfile,
  subclientToParams,
  COLUMN_COUNT,
  type SubclientRow,
  type Subclient,
};
