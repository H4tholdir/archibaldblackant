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
  customer_match_count: number;
  sub_client_match_count: number;
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
    customerMatchCount: row.customer_match_count,
    subClientMatchCount: row.sub_client_match_count,
  };
}

async function getAllSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients WHERE hidden = FALSE ORDER BY ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}

async function searchSubclients(pool: DbPool, query: string): Promise<Subclient[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients
     WHERE hidden = FALSE
       AND (ragione_sociale ILIKE $1
        OR suppl_ragione_sociale ILIKE $1
        OR codice ILIKE $1
        OR partita_iva ILIKE $1
        OR localita ILIKE $1
        OR cod_fiscale ILIKE $1
        OR indirizzo ILIKE $1
        OR cap ILIKE $1
        OR telefono ILIKE $1
        OR email ILIKE $1
        OR zona ILIKE $1
        OR agente ILIKE $1
        OR pag ILIKE $1
        OR listino ILIKE $1)
     ORDER BY ragione_sociale ASC`,
    [pattern],
  );
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
      updated_at = NOW()`,
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
