import type { Page } from 'puppeteer';
import { logger } from '../../logger';
import { waitForDevExpressIdle } from './devexpress-utils';

// Validated live 2026-05-28 against all ERP ListViews:
// - SALESTABLE (Ordini):          MODIF col i=47, default sort=MODIF DESC → row 0 = oggi
// - CUSTPACKINGSLIPJOUR (DDT):    MODIF col i=24, default sort recenti prima → row 0 = oggi
// - CUSTINVOICEJOUR (Fatture):    MODIF col i=31, default sort recenti prima → row 0 = ieri
// - INVENTTABLE (Prodotti):       MODIF col i=21, visibile nel DOM
// - PRICEDISCTABLE (Prezzi):      MODIF col i=31, no sort → valori FEB 2026 (ok, cambia raramente)
// CUSTTABLE (Clienti): MODIF assente dalla ListView — usa erpModifiedAt da DetailView nel DB.
//
// GetRowValues con campo singolo restituisce un Date object (non array) per campi DATETIME.

export type SentinelResult =
  | { status: 'unchanged'; maxModifiedAt: Date }
  | { status: 'changed';   maxModifiedAt: Date }
  | { status: 'unknown';   reason: string };

// 30s di tolleranza per clock skew tra backend e DB
const FUTURE_TOLERANCE_MS = 30_000;

const SENTINEL_ROWS_TO_CHECK = 20;
const GETROWVALUES_TIMEOUT_MS = 15_000;

/**
 * Reads MODIFIEDDATETIME for the first N rows on page 1 (default sort) and
 * returns the MAX value. Returns null if the column is absent or unavailable.
 *
 * Uses the exact same GetRowValues API pattern as extractPageRowsViaApi — validated
 * live against all 5 ERP ListViews that expose MODIFIEDDATETIME.
 */
export async function readListViewMaxModified(
  page: Page,
  url: string,
  maxRows = SENTINEL_ROWS_TO_CHECK,
): Promise<Date | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForDevExpressIdle(page);

    return await page.evaluate(
      (maxR: number, timeoutMs: number) =>
        new Promise<string | null>((resolve) => {
          const w = window as unknown as Record<string, unknown>;
          const gn = Object.keys(w).find((k) => {
            try {
              const o = w[k] as Record<string, unknown>;
              return typeof o?.GetRowValues === 'function' && typeof o?.GetColumn === 'function';
            } catch { return false; }
          });
          if (!gn) return resolve(null);

          const grid = w[gn] as Record<string, unknown>;

          // Verify MODIFIEDDATETIME column exists in this grid
          const colCount: number = (grid.GetColumnCount as () => number)();
          let hasModif = false;
          for (let i = 0; i < colCount; i++) {
            const col = (grid.GetColumn as (i: number) => Record<string, unknown> | null)(i);
            if (col && (col.fieldName as string)?.toUpperCase() === 'MODIFIEDDATETIME') {
              hasModif = true;
              break;
            }
          }
          if (!hasModif) return resolve(null);

          const apiRows: number = (grid.GetVisibleRowsOnPage as () => number)();
          const visibleRows = apiRows > 0 ? apiRows : 0;
          if (visibleRows === 0) return resolve(null);

          const rowsToRead = Math.min(visibleRows, maxR);
          const modifiedDates: number[] = [];
          let completed = 0;

          for (let r = 0; r < rowsToRead; r++) {
            ((idx: number) => {
              (grid.GetRowValues as (r: number, f: string, cb: (v: unknown) => void) => void)(
                idx,
                'MODIFIEDDATETIME',
                (val: unknown) => {
                  if (val instanceof Date && !isNaN(val.getTime())) {
                    modifiedDates.push(val.getTime());
                  } else if (typeof val === 'string' && val) {
                    const t = new Date(val).getTime();
                    if (!isNaN(t)) modifiedDates.push(t);
                  }
                  completed++;
                  if (completed >= rowsToRead) {
                    resolve(modifiedDates.length > 0 ? new Date(Math.max(...modifiedDates)).toISOString() : null);
                  }
                },
              );
            })(r);
          }

          setTimeout(() => {
            resolve(modifiedDates.length > 0 ? new Date(Math.max(...modifiedDates)).toISOString() : null);
          }, timeoutMs);
        }),
      maxRows,
      GETROWVALUES_TIMEOUT_MS,
    ).then((iso) => (iso ? new Date(iso) : null));
  } catch (err) {
    logger.warn('[SentinelCheck] errore lettura MODIFIEDDATETIME', { url, error: String(err).substring(0, 120) });
    return null;
  }
}

/**
 * Decides whether a full sync can be skipped by comparing the most recently
 * modified record on page 1 with last_sync_at.
 *
 * Conservative by design: any unknown/error condition returns status='unknown',
 * which callers treat as "must sync".
 *
 * @param maxStalenessMs - forza sync se lastSyncAt è più vecchio di questo valore
 *   (guard contro MODIFIEDDATETIME bloccato nell'ERP). Default: nessun cap.
 */
export function evaluateSentinel(
  maxModifiedAt: Date | null,
  lastSyncAt: Date | null,
  maxStalenessMs?: number,
): SentinelResult {
  if (maxModifiedAt === null) {
    return { status: 'unknown', reason: 'modif_unavailable' };
  }
  if (lastSyncAt === null) {
    return { status: 'unknown', reason: 'never_synced' };
  }
  // Guard 1: lastSyncAt nel futuro → clock skew o bug di scrittura → forza sync
  if (lastSyncAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return { status: 'unknown', reason: 'future_timestamp' };
  }
  // Guard 2: dati troppo vecchi rispetto al cap → forza sync indipendentemente dal sentinel
  if (maxStalenessMs !== undefined && Date.now() - lastSyncAt.getTime() > maxStalenessMs) {
    return { status: 'unknown', reason: 'stale' };
  }
  if (maxModifiedAt.getTime() <= lastSyncAt.getTime()) {
    return { status: 'unchanged', maxModifiedAt };
  }
  return { status: 'changed', maxModifiedAt };
}

/** Max staleness per tipo di sync — forza sync anche se sentinel dice "unchanged" */
export const SENTINEL_MAX_STALENESS_MS = {
  'sync-orders':    2 * 60 * 60 * 1000,  // 2h
  'sync-ddt':       2 * 60 * 60 * 1000,
  'sync-invoices':  2 * 60 * 60 * 1000,
  'sync-customers': 2 * 60 * 60 * 1000,
  'sync-prices':    6 * 60 * 60 * 1000,  // 6h
  'sync-products':  6 * 60 * 60 * 1000,
} as const satisfies Record<string, number>;

/**
 * Full sentinel check: navigate + read + evaluate. Used by sync handlers.
 *
 * @param maxStalenessMs - se omesso, nessun cap di staleness applicato.
 *   Passare `SENTINEL_MAX_STALENESS_MS['sync-xxx']` per abilitare il guard.
 */
export async function checkListViewSentinel(
  page: Page,
  url: string,
  lastSyncAt: Date | null,
  maxStalenessMs?: number,
): Promise<SentinelResult> {
  const maxModifiedAt = await readListViewMaxModified(page, url);
  const result = evaluateSentinel(maxModifiedAt, lastSyncAt, maxStalenessMs);
  logger.debug('[SentinelCheck] risultato', {
    url,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    maxModifiedAt: maxModifiedAt?.toISOString() ?? null,
    status: result.status,
  });
  return result;
}
