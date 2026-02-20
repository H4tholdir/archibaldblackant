import type { DbPool } from '../pool';

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
  created_at: string;
  updated_at: string;
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

type SubclientInput = {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  localita?: string | null;
  prov?: string | null;
  telefono?: string | null;
  fax?: string | null;
  email?: string | null;
  partitaIva?: string | null;
  codFiscale?: string | null;
  zona?: string | null;
  persDaContattare?: string | null;
  emailAmministraz?: string | null;
};

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

function createSubclientsRepository(pool: DbPool) {
  async function getAll(): Promise<Subclient[]> {
    const { rows } = await pool.query<SubclientRow>(
      'SELECT * FROM agents.subclients ORDER BY ragione_sociale',
    );
    return rows.map(mapRowToSubclient);
  }

  async function search(query: string): Promise<Subclient[]> {
    const pattern = `%${query}%`;
    const { rows } = await pool.query<SubclientRow>(
      `SELECT * FROM agents.subclients
       WHERE ragione_sociale ILIKE $1 OR codice ILIKE $2
       ORDER BY ragione_sociale`,
      [pattern, pattern],
    );
    return rows.map(mapRowToSubclient);
  }

  async function getByCodice(codice: string): Promise<Subclient | null> {
    const { rows: [row] } = await pool.query<SubclientRow>(
      'SELECT * FROM agents.subclients WHERE codice = $1',
      [codice],
    );
    return row ? mapRowToSubclient(row) : null;
  }

  async function deleteSubclient(codice: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM agents.subclients WHERE codice = $1',
      [codice],
    );
    return (rowCount ?? 0) > 0;
  }

  async function upsertBatch(
    subclients: SubclientInput[],
  ): Promise<{ inserted: number; updated: number }> {
    if (subclients.length === 0) return { inserted: 0, updated: 0 };

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < subclients.length; i++) {
      const base = i * 15;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`,
      );
      const s = subclients[i];
      values.push(
        s.codice, s.ragioneSociale, s.supplRagioneSociale ?? null,
        s.indirizzo ?? null, s.cap ?? null, s.localita ?? null,
        s.prov ?? null, s.telefono ?? null, s.fax ?? null,
        s.email ?? null, s.partitaIva ?? null, s.codFiscale ?? null,
        s.zona ?? null, s.persDaContattare ?? null, s.emailAmministraz ?? null,
      );
    }

    const { rows } = await pool.query<{ action: string }>(
      `INSERT INTO agents.subclients (
        codice, ragione_sociale, suppl_ragione_sociale,
        indirizzo, cap, localita, prov,
        telefono, fax, email,
        partita_iva, cod_fiscale, zona,
        pers_da_contattare, email_amministraz
      ) VALUES ${placeholders.join(', ')}
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
        updated_at = NOW()
      RETURNING CASE WHEN xmax = 0 THEN 'inserted' ELSE 'updated' END AS action`,
      values,
    );

    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.action === 'inserted') inserted++;
      else updated++;
    }

    return { inserted, updated };
  }

  return {
    getAll,
    search,
    getByCodice,
    delete: deleteSubclient,
    upsertBatch,
  };
}

export {
  createSubclientsRepository,
  type Subclient,
  type SubclientInput,
};
