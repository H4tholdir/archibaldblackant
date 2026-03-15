import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';

type MockQuery = ReturnType<typeof vi.fn>;

function createMockPool(): DbPool {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 }) as any),
    withTransaction: vi.fn(async (fn: any) => fn({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) })),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

function getQueryCall(pool: DbPool, index: number): { text: string; params?: unknown[] } {
  const calls = (pool.query as MockQuery).mock.calls;
  return { text: calls[index][0], params: calls[index][1] };
}

const anagrafeNulls = {
  agente: null,
  agente2: null,
  settore: null,
  classe: null,
  pag: null,
  listino: null,
  banca: null,
  valuta: null,
  cod_nazione: null,
  aliiva: null,
  contoscar: null,
  tipofatt: null,
  telefono2: null,
  telefono3: null,
  url: null,
  cb_nazione: null,
  cb_bic: null,
  cb_cin_ue: null,
  cb_cin_it: null,
  abicab: null,
  contocorr: null,
  matched_customer_profile_id: null,
  match_confidence: null,
  arca_synced_at: null,
  customer_match_count: 0,
  sub_client_match_count: 0,
};

const anagrafeNullsCamel = {
  agente: null,
  agente2: null,
  settore: null,
  classe: null,
  pag: null,
  listino: null,
  banca: null,
  valuta: null,
  codNazione: null,
  aliiva: null,
  contoscar: null,
  tipofatt: null,
  telefono2: null,
  telefono3: null,
  url: null,
  cbNazione: null,
  cbBic: null,
  cbCinUe: null,
  cbCinIt: null,
  abicab: null,
  contocorr: null,
  matchedCustomerProfileId: null,
  matchConfidence: null,
  arcaSyncedAt: null,
  customerMatchCount: 0,
  subClientMatchCount: 0,
};

const sampleRow = {
  codice: 'SC001',
  ragione_sociale: 'Acme S.r.l.',
  suppl_ragione_sociale: 'Acme Supplementare',
  indirizzo: 'Via Roma 1',
  cap: '20100',
  localita: 'Milano',
  prov: 'MI',
  telefono: '+39 02 1234567',
  fax: '+39 02 7654321',
  email: 'info@acme.it',
  partita_iva: 'IT12345678901',
  cod_fiscale: 'RSSMRA80A01H501Z',
  zona: 'Nord',
  pers_da_contattare: 'Mario Rossi',
  email_amministraz: 'admin@acme.it',
  ...anagrafeNulls,
  customer_match_count: 2,
  sub_client_match_count: 1,
};

const sampleRow2 = {
  codice: 'SC002',
  ragione_sociale: 'Beta Corp',
  suppl_ragione_sociale: null,
  indirizzo: 'Via Verdi 5',
  cap: '10100',
  localita: 'Torino',
  prov: 'TO',
  telefono: null,
  fax: null,
  email: 'info@beta.it',
  partita_iva: null,
  cod_fiscale: null,
  zona: 'Nord',
  pers_da_contattare: null,
  email_amministraz: null,
  ...anagrafeNulls,
  customer_match_count: 0,
  sub_client_match_count: 0,
};

describe('getAllSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all subclients mapped and ordered by ragione_sociale', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [sampleRow, sampleRow2],
      rowCount: 2,
    });

    const { getAllSubclients } = await import('./subclients');
    const result = await getAllSubclients(pool);

    expect(result).toEqual([
      {
        codice: 'SC001',
        ragioneSociale: 'Acme S.r.l.',
        supplRagioneSociale: 'Acme Supplementare',
        indirizzo: 'Via Roma 1',
        cap: '20100',
        localita: 'Milano',
        prov: 'MI',
        telefono: '+39 02 1234567',
        fax: '+39 02 7654321',
        email: 'info@acme.it',
        partitaIva: 'IT12345678901',
        codFiscale: 'RSSMRA80A01H501Z',
        zona: 'Nord',
        persDaContattare: 'Mario Rossi',
        emailAmministraz: 'admin@acme.it',
        ...anagrafeNullsCamel,
        customerMatchCount: 2,
        subClientMatchCount: 1,
      },
      {
        codice: 'SC002',
        ragioneSociale: 'Beta Corp',
        supplRagioneSociale: null,
        indirizzo: 'Via Verdi 5',
        cap: '10100',
        localita: 'Torino',
        prov: 'TO',
        telefono: null,
        fax: null,
        email: 'info@beta.it',
        partitaIva: null,
        codFiscale: null,
        zona: 'Nord',
        persDaContattare: null,
        emailAmministraz: null,
        ...anagrafeNullsCamel,
      },
    ]);
    expect(getQueryCall(pool, 0).text).toContain('ORDER BY ragione_sociale');
  });

  test('returns empty array when no subclients exist', async () => {
    const pool = createMockPool();

    const { getAllSubclients } = await import('./subclients');
    const result = await getAllSubclients(pool);

    expect(result).toEqual([]);
  });
});

describe('searchSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('searches across ragione_sociale, suppl_ragione_sociale, and codice with ILIKE', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [sampleRow],
      rowCount: 1,
    });

    const { searchSubclients } = await import('./subclients');
    await searchSubclients(pool, 'Acme');

    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('ILIKE');
    expect(call.text).toContain('ragione_sociale');
    expect(call.text).toContain('suppl_ragione_sociale');
    expect(call.text).toContain('codice');
    expect(call.params).toContain('%Acme%');
  });

  test('returns mapped subclients matching the query', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [sampleRow],
      rowCount: 1,
    });

    const { searchSubclients } = await import('./subclients');
    const result = await searchSubclients(pool, 'Acme');

    expect(result).toEqual([
      expect.objectContaining({ codice: 'SC001', ragioneSociale: 'Acme S.r.l.' }),
    ]);
  });

  test('returns empty array when no match found', async () => {
    const pool = createMockPool();

    const { searchSubclients } = await import('./subclients');
    const result = await searchSubclients(pool, 'NonExistent');

    expect(result).toEqual([]);
  });
});

describe('getSubclientByCodice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped subclient when found', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [sampleRow],
      rowCount: 1,
    });

    const { getSubclientByCodice } = await import('./subclients');
    const result = await getSubclientByCodice(pool, 'SC001');

    expect(result).toEqual(expect.objectContaining({
      codice: 'SC001',
      ragioneSociale: 'Acme S.r.l.',
      telefono: '+39 02 1234567',
    }));
    expect(getQueryCall(pool, 0).params).toEqual(['SC001']);
  });

  test('returns null when subclient not found', async () => {
    const pool = createMockPool();

    const { getSubclientByCodice } = await import('./subclients');
    const result = await getSubclientByCodice(pool, 'UNKNOWN');

    expect(result).toBeNull();
  });

  test('uses parameterized query with codice', async () => {
    const pool = createMockPool();

    const { getSubclientByCodice } = await import('./subclients');
    await getSubclientByCodice(pool, 'SC001');

    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('codice = $1');
    expect(call.params).toEqual(['SC001']);
  });
});

describe('deleteSubclient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns true when subclient deleted', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { deleteSubclient } = await import('./subclients');
    const result = await deleteSubclient(pool, 'SC001');

    expect(result).toBe(true);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('DELETE FROM shared.sub_clients');
    expect(call.params).toEqual(['SC001']);
  });

  test('returns false when subclient not found', async () => {
    const pool = createMockPool();

    const { deleteSubclient } = await import('./subclients');
    const result = await deleteSubclient(pool, 'UNKNOWN');

    expect(result).toBe(false);
  });

  test('uses parameterized query with codice', async () => {
    const pool = createMockPool();

    const { deleteSubclient } = await import('./subclients');
    await deleteSubclient(pool, 'SC001');

    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('codice = $1');
    expect(call.params).toEqual(['SC001']);
  });
});

describe('upsertSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 0 for empty input', async () => {
    const pool = createMockPool();

    const { upsertSubclients } = await import('./subclients');
    const result = await upsertSubclients(pool, []);

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('inserts subclients using ON CONFLICT upsert', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 2,
    });

    const { upsertSubclients } = await import('./subclients');
    const subclients = [
      {
        codice: 'SC001',
        ragioneSociale: 'Acme S.r.l.',
        supplRagioneSociale: null,
        indirizzo: 'Via Roma 1',
        cap: '20100',
        localita: 'Milano',
        prov: 'MI',
        telefono: null,
        fax: null,
        email: null,
        partitaIva: null,
        codFiscale: null,
        zona: null,
        persDaContattare: null,
        emailAmministraz: null,
        ...anagrafeNullsCamel,
      },
      {
        codice: 'SC002',
        ragioneSociale: 'Beta Corp',
        supplRagioneSociale: null,
        indirizzo: null,
        cap: null,
        localita: null,
        prov: null,
        telefono: null,
        fax: null,
        email: null,
        partitaIva: null,
        codFiscale: null,
        zona: null,
        persDaContattare: null,
        emailAmministraz: null,
        ...anagrafeNullsCamel,
      },
    ];

    const result = await upsertSubclients(pool, subclients);

    expect(result).toBe(2);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('INSERT INTO shared.sub_clients');
    expect(call.text).toContain('ON CONFLICT (codice) DO UPDATE');
  });

  test('passes all 39 fields per subclient in parameters', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { upsertSubclients, COLUMN_COUNT } = await import('./subclients');
    const subclient = {
      codice: 'SC001',
      ragioneSociale: 'Acme',
      supplRagioneSociale: 'Suppl',
      indirizzo: 'Via Roma',
      cap: '20100',
      localita: 'Milano',
      prov: 'MI',
      telefono: '123',
      fax: '456',
      email: 'a@b.it',
      partitaIva: 'IT123',
      codFiscale: 'CF123',
      zona: 'Nord',
      persDaContattare: 'Mario',
      emailAmministraz: 'adm@b.it',
      ...anagrafeNullsCamel,
    };

    await upsertSubclients(pool, [subclient]);

    const call = getQueryCall(pool, 0);
    expect(call.params).toHaveLength(COLUMN_COUNT);
    expect(call.params!.slice(0, 15)).toEqual([
      'SC001', 'Acme', 'Suppl',
      'Via Roma', '20100', 'Milano', 'MI',
      '123', '456', 'a@b.it',
      'IT123', 'CF123', 'Nord',
      'Mario', 'adm@b.it',
    ]);
  });
});

describe('deleteSubclientsByCodici', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 0 for empty input', async () => {
    const pool = createMockPool();

    const { deleteSubclientsByCodici } = await import('./subclients');
    const result = await deleteSubclientsByCodici(pool, []);

    expect(result).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('deletes multiple subclients by codici array', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 2,
    });

    const { deleteSubclientsByCodici } = await import('./subclients');
    const result = await deleteSubclientsByCodici(pool, ['SC001', 'SC002']);

    expect(result).toBe(2);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('DELETE FROM shared.sub_clients');
    expect(call.text).toContain('$1');
    expect(call.text).toContain('$2');
    expect(call.params).toEqual(['SC001', 'SC002']);
  });

  test('returns actual deleted count from rowCount', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { deleteSubclientsByCodici } = await import('./subclients');
    const result = await deleteSubclientsByCodici(pool, ['SC001', 'SC999']);

    expect(result).toBe(1);
  });
});

describe('countSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns total count of subclients', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [{ count: '42' }],
      rowCount: 1,
    });

    const { countSubclients } = await import('./subclients');
    const result = await countSubclients(pool);

    expect(result).toBe(42);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('COUNT(*)');
    expect(call.text).toContain('shared.sub_clients');
  });

  test('returns 0 when table is empty', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [{ count: '0' }],
      rowCount: 1,
    });

    const { countSubclients } = await import('./subclients');
    const result = await countSubclients(pool);

    expect(result).toBe(0);
  });
});

describe('mapRowToSubclient', () => {
  test('maps all snake_case columns to camelCase fields', async () => {
    const { mapRowToSubclient } = await import('./subclients');
    const result = mapRowToSubclient(sampleRow);

    expect(result).toEqual({
      codice: 'SC001',
      ragioneSociale: 'Acme S.r.l.',
      supplRagioneSociale: 'Acme Supplementare',
      indirizzo: 'Via Roma 1',
      cap: '20100',
      localita: 'Milano',
      prov: 'MI',
      telefono: '+39 02 1234567',
      fax: '+39 02 7654321',
      email: 'info@acme.it',
      partitaIva: 'IT12345678901',
      codFiscale: 'RSSMRA80A01H501Z',
      zona: 'Nord',
      persDaContattare: 'Mario Rossi',
      emailAmministraz: 'admin@acme.it',
      ...anagrafeNullsCamel,
      customerMatchCount: 2,
      subClientMatchCount: 1,
    });
  });

  test('handles null optional fields', async () => {
    const { mapRowToSubclient } = await import('./subclients');
    const result = mapRowToSubclient(sampleRow2);

    expect(result).toEqual({
      codice: 'SC002',
      ragioneSociale: 'Beta Corp',
      supplRagioneSociale: null,
      indirizzo: 'Via Verdi 5',
      cap: '10100',
      localita: 'Torino',
      prov: 'TO',
      telefono: null,
      fax: null,
      email: 'info@beta.it',
      partitaIva: null,
      codFiscale: null,
      zona: 'Nord',
      persDaContattare: null,
      emailAmministraz: null,
      ...anagrafeNullsCamel,
    });
  });
});

describe('getUnmatchedSubclients', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns subclients where matched_customer_profile_id IS NULL', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [sampleRow],
      rowCount: 1,
    });

    const { getUnmatchedSubclients } = await import('./subclients');
    const result = await getUnmatchedSubclients(pool);

    expect(result).toEqual([expect.objectContaining({ codice: 'SC001' })]);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('matched_customer_profile_id IS NULL');
  });
});

describe('setSubclientMatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('sets match fields on subclient', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { setSubclientMatch } = await import('./subclients');
    const result = await setSubclientMatch(pool, 'SC001', 'PROF-123', 'vat');

    expect(result).toBe(true);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('matched_customer_profile_id = $2');
    expect(call.text).toContain('match_confidence = $3');
    expect(call.params).toEqual(['SC001', 'PROF-123', 'vat']);
  });

  test('returns false when subclient not found', async () => {
    const pool = createMockPool();

    const { setSubclientMatch } = await import('./subclients');
    const result = await setSubclientMatch(pool, 'UNKNOWN', 'PROF-123', 'vat');

    expect(result).toBe(false);
  });
});

describe('clearSubclientMatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('clears match fields on subclient', async () => {
    const pool = createMockPool();
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    });

    const { clearSubclientMatch } = await import('./subclients');
    const result = await clearSubclientMatch(pool, 'SC001');

    expect(result).toBe(true);
    const call = getQueryCall(pool, 0);
    expect(call.text).toContain('matched_customer_profile_id = NULL');
    expect(call.text).toContain('match_confidence = NULL');
    expect(call.params).toEqual(['SC001']);
  });
});

describe('getSubclientByCustomerProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns subclient matched to given profile ID', async () => {
    const pool = createMockPool();
    const matchedRow = {
      ...sampleRow,
      matched_customer_profile_id: 'PROF-123',
      match_confidence: 'vat',
    };
    (pool.query as MockQuery).mockResolvedValueOnce({
      rows: [matchedRow],
      rowCount: 1,
    });

    const { getSubclientByCustomerProfile } = await import('./subclients');
    const result = await getSubclientByCustomerProfile(pool, 'PROF-123');

    expect(result).toEqual(expect.objectContaining({
      codice: 'SC001',
      matchedCustomerProfileId: 'PROF-123',
      matchConfidence: 'vat',
    }));
    expect(getQueryCall(pool, 0).params).toEqual(['PROF-123']);
  });

  test('returns null when no subclient matches profile', async () => {
    const pool = createMockPool();

    const { getSubclientByCustomerProfile } = await import('./subclients');
    const result = await getSubclientByCustomerProfile(pool, 'UNKNOWN');

    expect(result).toBeNull();
  });
});
