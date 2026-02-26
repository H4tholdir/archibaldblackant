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
};

const COLUMNS = `
  codice, ragione_sociale, suppl_ragione_sociale,
  indirizzo, cap, localita, prov,
  telefono, fax, email,
  partita_iva, cod_fiscale, zona,
  pers_da_contattare, email_amministraz
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
  };
}

async function getAllSubclients(pool: DbPool): Promise<Subclient[]> {
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients ORDER BY ragione_sociale ASC`,
  );
  return rows.map(mapRowToSubclient);
}

async function searchSubclients(pool: DbPool, query: string): Promise<Subclient[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<SubclientRow>(
    `SELECT ${COLUMNS} FROM shared.sub_clients
     WHERE ragione_sociale ILIKE $1
        OR suppl_ragione_sociale ILIKE $1
        OR codice ILIKE $1
        OR partita_iva ILIKE $1
        OR localita ILIKE $1
        OR cod_fiscale ILIKE $1
        OR indirizzo ILIKE $1
        OR cap ILIKE $1
     ORDER BY ragione_sociale ASC`,
    [pattern],
  );
  return rows.map(mapRowToSubclient);
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

async function upsertSubclients(pool: DbPool, subclients: Subclient[]): Promise<number> {
  if (subclients.length === 0) {
    return 0;
  }

  const valuePlaceholders: string[] = [];
  const params: unknown[] = [];

  for (let i = 0; i < subclients.length; i++) {
    const offset = i * 15;
    const placeholders = Array.from({ length: 15 }, (_, j) => `$${offset + j + 1}`);
    valuePlaceholders.push(`(${placeholders.join(', ')})`);

    const sc = subclients[i];
    params.push(
      sc.codice, sc.ragioneSociale, sc.supplRagioneSociale,
      sc.indirizzo, sc.cap, sc.localita, sc.prov,
      sc.telefono, sc.fax, sc.email,
      sc.partitaIva, sc.codFiscale, sc.zona,
      sc.persDaContattare, sc.emailAmministraz,
    );
  }

  const result = await pool.query(
    `INSERT INTO shared.sub_clients (
      codice, ragione_sociale, suppl_ragione_sociale,
      indirizzo, cap, localita, prov,
      telefono, fax, email,
      partita_iva, cod_fiscale, zona,
      pers_da_contattare, email_amministraz
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

export {
  getAllSubclients,
  searchSubclients,
  getSubclientByCodice,
  deleteSubclient,
  upsertSubclients,
  deleteSubclientsByCodici,
  countSubclients,
  mapRowToSubclient,
  type SubclientRow,
  type Subclient,
};
