import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getAddressesByCustomer,
  upsertAddressesForCustomer,
  getAddressById,
  getCustomersNeedingAddressSync,
  setAddressesSyncedAt,
  type AltAddress,
} from './customer-addresses';

const userId = 'user-1';
const erpId = 'CUST-001';

const altAddr1: AltAddress = {
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '80100',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

const altAddr2: AltAddress = {
  tipo: 'Ufficio',
  nome: 'HQ',
  via: 'Via Milano 5',
  cap: '20100',
  citta: 'Milano',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount: number }> = []): DbPool {
  let callIndex = 0;
  const mockQuery = vi.fn().mockImplementation(() => {
    const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(result);
  });
  const mockTx = { query: mockQuery };
  return {
    query: mockQuery,
    withTransaction: vi.fn().mockImplementation(async (fn) => fn(mockTx)),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

describe('getAddressesByCustomer', () => {
  it('returns mapped addresses for given user and customer', async () => {
    const row = {
      id: 1, user_id: userId, erp_id: erpId,
      tipo: 'Consegna', nome: null, via: 'Via Roma 1',
      cap: '80100', citta: 'Napoli', contea: null, stato: null,
      id_regione: null, contra: null,
    };
    const pool = createMockPool([{ rows: [row], rowCount: 1 }]);

    const result = await getAddressesByCustomer(pool, userId, erpId);

    expect(result).toEqual([{
      id: 1,
      userId,
      erpId,
      tipo: 'Consegna',
      nome: null,
      via: 'Via Roma 1',
      cap: '80100',
      citta: 'Napoli',
      contea: null,
      stato: null,
      idRegione: null,
      contra: null,
    }]);
  });

  it('returns empty array when no addresses found', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);
    const result = await getAddressesByCustomer(pool, userId, erpId);
    expect(result).toEqual([]);
  });
});

describe('upsertAddressesForCustomer', () => {
  it('calls DELETE then INSERT for each address within a transaction', async () => {
    const pool = createMockPool([
      { rows: [], rowCount: 0 }, // DELETE
      { rows: [], rowCount: 1 }, // INSERT addr1
      { rows: [], rowCount: 1 }, // INSERT addr2
    ]);

    await upsertAddressesForCustomer(pool, userId, erpId, [altAddr1, altAddr2]);

    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const txQuery = (pool as any).query as ReturnType<typeof vi.fn>;
    expect(txQuery).toHaveBeenCalledTimes(3);
    expect(txQuery.mock.calls[0][0]).toContain('DELETE FROM agents.customer_addresses');
    expect(txQuery.mock.calls[1][0]).toContain('INSERT INTO agents.customer_addresses');
    expect(txQuery.mock.calls[2][0]).toContain('INSERT INTO agents.customer_addresses');
  });

  it('calls DELETE only (no INSERT) when addresses array is empty', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);

    await upsertAddressesForCustomer(pool, userId, erpId, []);

    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const txQuery = (pool as any).query as ReturnType<typeof vi.fn>;
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls[0][0]).toContain('DELETE FROM agents.customer_addresses');
  });
});

describe('getAddressById', () => {
  it('returns null when address not found', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);
    const result = await getAddressById(pool, userId, 999);
    expect(result).toBeNull();
  });

  it('returns mapped address when found', async () => {
    const row = {
      id: 42, user_id: userId, erp_id: erpId,
      tipo: 'Fattura', nome: null, via: null, cap: null,
      citta: null, contea: null, stato: null, id_regione: null, contra: null,
    };
    const pool = createMockPool([{ rows: [row], rowCount: 1 }]);
    const result = await getAddressById(pool, userId, 42);
    expect(result).toEqual({
      id: 42, userId, erpId, tipo: 'Fattura',
      nome: null, via: null, cap: null, citta: null,
      contea: null, stato: null, idRegione: null, contra: null,
    });
  });
});

describe('getCustomersNeedingAddressSync', () => {
  it('returns erp_id and name for customers with null addresses_synced_at', async () => {
    const pool = createMockPool([{
      rows: [
        { erp_id: 'CUST-001', name: 'Aaa' },
        { erp_id: 'CUST-002', name: 'Bbb' },
      ],
      rowCount: 2,
    }]);

    const result = await getCustomersNeedingAddressSync(pool, userId, 10);

    expect(result).toEqual([
      { erp_id: 'CUST-001', name: 'Aaa' },
      { erp_id: 'CUST-002', name: 'Bbb' },
    ]);
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('addresses_synced_at IS NULL');
  });

  it('also includes customers with addresses_synced_at older than 24 hours for periodic alt-address refresh', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);

    await getCustomersNeedingAddressSync(pool, userId, 10);

    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('24 hours');
  });
});

describe('setAddressesSyncedAt', () => {
  it('updates addresses_synced_at to NOW() for given customer and user', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await setAddressesSyncedAt(pool, userId, erpId);
    const q = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(q).toContain('addresses_synced_at = NOW()');
  });
});
