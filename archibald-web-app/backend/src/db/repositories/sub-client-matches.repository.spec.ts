import { describe, it, expect, vi } from 'vitest';
import type { DbPool } from '../pool';

function makePool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as DbPool;
}

const repo = await import('./sub-client-matches.repository');

describe('getMatchesForSubClient', () => {
  it('returns empty arrays and skipModal=false when no rows', async () => {
    const pool = makePool([]);
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result).toEqual({ customerProfileIds: [], subClientCodices: [], skipModal: false });
  });

  it('returns customerProfileIds from sub_client_customer_matches', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ customer_profile_id: 'P001' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    } as unknown as DbPool;
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result.customerProfileIds).toEqual(['P001']);
  });

  it('returns subClientCodices from sub_client_sub_client_matches', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })                                    // customerMatches
      .mockResolvedValueOnce({ rows: [{ other_codice: 'C00099' }] })          // subClientMatches
      .mockResolvedValueOnce({ rows: [] })                                    // pref
    } as unknown as DbPool;
    const result = await repo.getMatchesForSubClient(pool, 1, 'C00001');
    expect(result.subClientCodices).toEqual(['C00099']);
  });
});

describe('getMatchesForCustomer', () => {
  it('returns customerProfileId and subClientCodices', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ sub_client_codice: 'C00099' }] })  // subclientMatches
      .mockResolvedValueOnce({ rows: [] })                                 // pref
    } as unknown as DbPool;
    const result = await repo.getMatchesForCustomer(pool, 1, 'P001');
    expect(result.customerProfileIds).toEqual(['P001']);
    expect(result.subClientCodices).toEqual(['C00099']);
  });

  it('returns skipModal from pref when set', async () => {
    const pool = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ skip_matching_modal: true }] })
    } as unknown as DbPool;
    const result = await repo.getMatchesForCustomer(pool, 2, 'P002');
    expect(result.skipModal).toBe(true);
  });
});

describe('addCustomerMatch / removeCustomerMatch', () => {
  it('addCustomerMatch calls INSERT with correct params', async () => {
    const pool = makePool();
    await repo.addCustomerMatch(pool, 'C00001', 'P001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_customer_matches'),
      ['C00001', 'P001'],
    );
  });

  it('removeCustomerMatch calls DELETE with correct params', async () => {
    const pool = makePool();
    await repo.removeCustomerMatch(pool, 'C00001', 'P001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM shared.sub_client_customer_matches'),
      ['C00001', 'P001'],
    );
  });
});

describe('addSubClientMatch / removeSubClientMatch — canonical ordering', () => {
  it('addSubClientMatch stores codiceA < codiceB regardless of input order', async () => {
    const pool = makePool();
    await repo.addSubClientMatch(pool, 'C00002', 'C00001');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_sub_client_matches'),
      ['C00001', 'C00002'],
    );
  });

  it('addSubClientMatch with already-sorted input stores same order', async () => {
    const pool = makePool();
    await repo.addSubClientMatch(pool, 'C00001', 'C00002');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.sub_client_sub_client_matches'),
      ['C00001', 'C00002'],
    );
  });

  it('removeSubClientMatch uses canonical order regardless of input', async () => {
    const pool = makePool();
    await repo.removeSubClientMatch(pool, 'C00005', 'C00003');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM shared.sub_client_sub_client_matches'),
      ['C00003', 'C00005'],
    );
  });

  it('removeSubClientMatch with reversed input produces same canonical params', async () => {
    const pool1 = makePool();
    const pool2 = makePool();
    await repo.removeSubClientMatch(pool1, 'C00003', 'C00005');
    await repo.removeSubClientMatch(pool2, 'C00005', 'C00003');
    const call1 = (pool1.query as ReturnType<typeof vi.fn>).mock.calls[0];
    const call2 = (pool2.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call1[1]).toEqual(call2[1]);
  });
});

describe('upsertSkipModal', () => {
  it('calls UPSERT with correct params', async () => {
    const pool = makePool();
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      [7, 'subclient', 'C00001', true],
    );
  });

  it('second call with skip=false overrides first call (idempotency)', async () => {
    const calls: unknown[][] = [];
    const pool = { query: vi.fn((...args: unknown[]) => { calls.push(args); return Promise.resolve({ rows: [] }); }) } as unknown as DbPool;
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', true);
    await repo.upsertSkipModal(pool, 7, 'subclient', 'C00001', false);
    expect(calls).toHaveLength(2);
    expect((calls[1] as unknown[][])[1]).toEqual([7, 'subclient', 'C00001', false]);
  });
});
