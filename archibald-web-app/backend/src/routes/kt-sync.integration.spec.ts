import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../db/pool';

function createKtSyncMockPool(overrides?: {
  orders?: Array<{
    id: string; order_number: string; customer_name: string;
    customer_account_num: string | null; creation_date: string;
    discount_percent: string | null; order_description: string | null;
  }>;
  lastDateByEsercizio?: Map<string, string>;
}): DbPool {
  const orders = overrides?.orders ?? [];
  const lastDateByEsercizio = overrides?.lastDateByEsercizio;
  const ftCounterParams: unknown[][] = [];

  return {
    query: vi.fn().mockImplementation((text: string, params?: unknown[]) => {
      if (text.includes("FROM agents.order_records") && text.includes("ANY($2")) {
        return { rows: orders, rowCount: orders.length };
      }
      if (text.includes("FROM shared.sub_clients")) {
        // Return a subclient that matches profile-001
        return {
          rows: [{
            codice: 'C00001',
            ragione_sociale: 'Cliente Test',
            suppl_ragione_sociale: null,
            indirizzo: null, cap: null, localita: null, prov: null,
            telefono: null, fax: null, email: null,
            partita_iva: null, cod_fiscale: null, zona: null,
            pers_da_contattare: null, email_amministraz: null,
            agente: null, agente2: null, settore: null, classe: null,
            pag: null, listino: null, banca: null, valuta: null,
            cod_nazione: null, aliiva: null, contoscar: null, tipofatt: null,
            telefono2: null, telefono3: null, url: null,
            cb_nazione: null, cb_bic: null, cb_cin_ue: null, cb_cin_it: null,
            abicab: null, contocorr: null,
            matched_customer_profile_id: 'profile-001',
            match_confidence: 'high',
            arca_synced_at: null,
            customer_match_count: 0,
            sub_client_match_count: 0,
          }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM agents.customers") && text.includes("account_num")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("FROM agents.order_articles")) {
        return {
          rows: [{
            id: 1, order_id: orders[0]?.id ?? 'x', user_id: 'u',
            article_code: "ART-001", article_description: "Test",
            quantity: 1, unit_price: 100, discount_percent: 0,
            line_amount: 100, vat_percent: 22, vat_amount: 22,
            line_total_with_vat: 122, warehouse_quantity: null,
            warehouse_sources_json: null, created_at: "2026-01-01",
          }],
          rowCount: 1,
        };
      }
      if (text.includes("ft_counter") && text.includes("max_date")) {
        const esercizio = params?.[1] as string | undefined;
        const maxDate = (esercizio && lastDateByEsercizio?.get(esercizio)) ?? '';
        return { rows: [{ max_date: maxDate }], rowCount: 1 };
      }
      if (text.includes("INSERT INTO agents.ft_counter") && text.includes("RETURNING")) {
        ftCounterParams.push(params ?? []);
        return { rows: [{ last_number: 1 }], rowCount: 1 };
      }
      if (text.includes("UPDATE agents.order_records") && text.includes("arca_kt_synced_at")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    _ftCounterParams: ftCounterParams,
  } as unknown as DbPool;
}

const ESERCIZIO = '2026';
const LAST_DATE = '2026-04-01';
const OLD_DATE = '2026-03-05T00:00:00Z';   // < LAST_DATE

describe('createKtSyncRouter — date adjustment', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('passa docDate = last_date quando creation_date è antecedente', async () => {
    const { createKtSyncRouter } = await import('./kt-sync');
    const pool = createKtSyncMockPool({
      orders: [{
        id: 'ord-001', order_number: 'ORD-001',
        customer_name: 'Cliente Test',
        customer_account_num: 'profile-001',
        creation_date: OLD_DATE,
        discount_percent: null, order_description: null,
      }],
      lastDateByEsercizio: new Map([[ESERCIZIO, LAST_DATE]]),
    });

    const router = createKtSyncRouter({ pool });

    // Simula chiamata POST / con orderIds = ['ord-001']
    const req = {
      user: { userId: 'user-test' },
      body: { orderIds: ['ord-001'] },
    } as any;
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json } as any;

    // Invoca il handler della prima route (POST /)
    const handler = (router as any).stack[0].route.stack[0].handle;
    await handler(req, res);

    // Cerca la chiamata getNextDocNumber (INSERT INTO ft_counter con RETURNING)
    const ftCall = (pool as any)._ftCounterParams[0] as unknown[];
    // ftCall = [esercizio, userId, tipodoc, docDate]
    expect(ftCall[3]).toBe(LAST_DATE);
  });
});
