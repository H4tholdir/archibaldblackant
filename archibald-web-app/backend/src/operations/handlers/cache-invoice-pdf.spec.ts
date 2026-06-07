import { describe, it, expect, vi } from 'vitest';
import { handleCacheInvoicePdf } from './cache-invoice-pdf';
import type { DbPool } from '../../db/pool';

type QueryMock = ReturnType<typeof vi.fn>;

function makePool(queryResponses: Record<number, { rows: unknown[]; rowCount?: number }> = {}): DbPool {
  let callIndex = 0;
  const query: QueryMock = vi.fn((_sql: unknown, _params?: unknown) => {
    const response = queryResponses[callIndex++] ?? { rows: [], rowCount: 1 };
    return Promise.resolve({ rows: response.rows, rowCount: response.rowCount ?? response.rows.length });
  });
  return { query } as unknown as DbPool;
}

function makeBot(overrides: Partial<{ downloadInvoicePDF: () => Promise<Buffer> }> = {}) {
  return {
    downloadInvoicePDF: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
    setProgressCallback: vi.fn(),
    ...overrides,
  };
}

describe('handleCacheInvoicePdf', () => {
  it('salva il PDF in DB quando il download riesce', async () => {
    const fakePdf = Buffer.from('pdf-content');
    const bot = makeBot({ downloadInvoicePDF: vi.fn().mockResolvedValue(fakePdf) });
    const pool = makePool({ 0: { rows: [], rowCount: 1 } });

    const result = await handleCacheInvoicePdf(bot, { pool }, { invoiceNumber: 'INV-001' }, 'user1', vi.fn());

    expect(result).toEqual({ cached: true });
    const updateCall = (pool.query as QueryMock).mock.calls[0];
    const [sql, params] = updateCall as [string, unknown[]];
    expect(sql).toContain('invoice_pdf_data');
    expect(params[0]).toEqual(fakePdf);
    expect(params[1]).toBe('user1');
    expect(params[2]).toBe('INV-001');
  });

  it('marca invoice_pdf_synced_at usando user_id diretto quando il PDF non è disponibile', async () => {
    const bot = makeBot({
      downloadInvoicePDF: vi.fn().mockRejectedValue(new Error('PDF non trovato')),
    });
    const pool = makePool({ 0: { rows: [], rowCount: 1 } });

    const result = await handleCacheInvoicePdf(bot, { pool }, { invoiceNumber: 'INV-002' }, 'user-abc', vi.fn());

    expect(result).toEqual({ cached: false });
    const updateCall = (pool.query as QueryMock).mock.calls[0];
    const [sql, params] = updateCall as [string, unknown[]];
    expect(sql).toContain('invoice_pdf_synced_at');
    // La query deve usare user_id direttamente — NON una subquery su agents.users
    expect(sql).not.toContain('SELECT id FROM agents.users');
    expect(params).toContain('user-abc');
    expect(params).toContain('INV-002');
  });

  it('restituisce cached:false senza rethrow quando il download fallisce', async () => {
    const bot = makeBot({
      downloadInvoicePDF: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const pool = makePool();
    await expect(
      handleCacheInvoicePdf(bot, { pool }, { invoiceNumber: 'INV-003' }, 'user1', vi.fn()),
    ).resolves.toEqual({ cached: false });
  });
});
