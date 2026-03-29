import { describe, expect, test, vi } from 'vitest';
import { syncInvoices, type InvoiceSyncDeps } from './invoice-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })    // order lookup
      .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 }) // upsertOrderInvoice
      .mockResolvedValue({ rows: [], rowCount: 0 }),                        // repositionOrderInvoices
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
  test('downloads, parses, and upserts invoice data via order_invoices repository', async () => {
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

  test('upserts invoices sorted by invoiceDate ASC within each order group (null dates sort last)', async () => {
    const callOrder: string[] = [];
    const pool: DbPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if ((sql as string).includes('SELECT id FROM')) {
          callOrder.push('lookup');
          return Promise.resolve({ rows: [{ id: 'ORD-42' }], rowCount: 1 });
        }
        if ((sql as string).includes('INSERT INTO')) {
          callOrder.push(`upsert:${params[2]}`); // params[2] = invoice_number in upsertOrderInvoice
          return Promise.resolve({ rows: [{ is_insert: true }], rowCount: 1 });
        }
        // repositionOrderInvoices
        callOrder.push('reposition');
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };

    const deps: InvoiceSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/invoices.pdf'),
      parsePdf: vi.fn().mockResolvedValue([
        { orderNumber: 'SO-042', invoiceNumber: 'INV-200', invoiceDate: '2026-02-01' },
        { orderNumber: 'SO-042', invoiceNumber: 'INV-100', invoiceDate: '2026-01-01' },
      ]),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncInvoices(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.invoicesProcessed).toBe(2);
    // order lookup happens once per order group, then invoices sorted by invoiceDate ASC
    expect(callOrder).toEqual(['lookup', 'upsert:INV-100', 'upsert:INV-200', 'reposition']);
  });
});
