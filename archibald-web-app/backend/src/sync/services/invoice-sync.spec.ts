import { describe, expect, test, vi } from 'vitest';
import { syncInvoices, type InvoiceSyncDeps } from './invoice-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): InvoiceSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/invoices.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { orderNumber: 'SO-001', invoiceNumber: 'INV-001', invoiceDate: '2026-01-20', invoiceAmount: '100.00' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncInvoices', () => {
  test('downloads, parses, and updates orders with invoice data', async () => {
    const deps = createMockDeps();
    const result = await syncInvoices(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.invoicesProcessed).toBe(1);
  });

  test('stops on shouldStop', async () => {
    const deps = createMockDeps();
    const result = await syncInvoices(deps, 'user-1', vi.fn(), () => true);
    expect(result.success).toBe(false);
  });

  test('cleans up PDF on error', async () => {
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    await syncInvoices(deps, 'user-1', vi.fn(), () => false);
    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/invoices.pdf');
  });

  test('reports progress at 100', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();
    await syncInvoices(deps, 'user-1', onProgress, () => false);
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('stops during DB loop when shouldStop returns true mid-iteration', async () => {
    const totalRecords = 15;
    const invoices = Array.from({ length: totalRecords }, (_, i) => ({
      orderNumber: `SO-${String(i).padStart(3, '0')}`,
      invoiceNumber: `INV-${String(i).padStart(3, '0')}`,
      invoiceDate: '2026-01-20',
      invoiceAmount: `${(i + 1) * 100}.00`,
    }));
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ id: `ORD-1` }], rowCount: 1 });
    const deps = createMockDeps(pool);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(invoices);

    let dbLoopCalls = 0;
    const shouldStop = () => {
      dbLoopCalls++;
      return dbLoopCalls > 3;
    };

    const result = await syncInvoices(deps, 'user-1', vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('db-loop');
  });
});
