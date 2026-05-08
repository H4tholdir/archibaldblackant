import type { DbPool } from '../../db/pool';
import { logger } from '../../logger';

/**
 * Completeness guard per gli HTML scraper handler.
 *
 * Protegge da scrape parziali (timeout pagina, filter drift, risposta DevExpress troncata)
 * che altrimenti verrebbero trattati come autorevoli dai sync service,
 * causando cancellazioni massive di record validi nel DB.
 *
 * Logica:
 * 1. Se rows.length === 0 → abort sempre (invariante assoluta)
 * 2. Se esiste un conteggio DB precedente per questo userId/tabella:
 *    - Se rows.length < previousCount * DROP_THRESHOLD → abort
 *    - Il threshold 0.70 permette riduzioni legittime fino al 30% tra sync consecutive
 *      (clienti rimossi, ordini completati, ecc.)
 */
export async function checkScraperCompleteness(
  pool: DbPool,
  tableName: string,
  userId: string,
  scrapedCount: number,
  entityLabel: string,
): Promise<void> {
  const DROP_THRESHOLD = 0.70;

  const ALLOWED_TABLES = new Set([
    'agents.customers',
    'agents.order_records',
    'agents.order_ddts',
    'agents.order_invoices',
  ]);
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`checkScraperCompleteness: unexpected table '${tableName}'`);
  }

  if (scrapedCount === 0) {
    throw new Error(
      `HTML scraper completeness guard: 0 rows for ${entityLabel} — aborting to prevent DB overwrite`,
    );
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM ${tableName} WHERE user_id = $1`,
    [userId],
  );
  const previousCount = parseInt(rows[0].count, 10);

  if (previousCount > 0 && scrapedCount < previousCount * DROP_THRESHOLD) {
    throw new Error(
      `HTML scraper completeness guard: expected ≥${Math.floor(previousCount * DROP_THRESHOLD)} rows` +
      ` (70% of ${previousCount} in DB), got ${scrapedCount} for ${entityLabel}` +
      ` — possible partial scrape (timeout/pagination miss), aborting`,
    );
  }

  logger.info(`[HTML scraper] Completeness OK: ${scrapedCount} rows scraped` +
    (previousCount > 0 ? `, previous DB count: ${previousCount}` : ', first sync'), { entityLabel });
}

/**
 * shouldStop cooperativo: ferma lo scraper se c'è un task P≤100 in coda per l'utente.
 * Prevenisce che una sync background (P500) blocchi submit-order (P10) per tutta la durata.
 *
 * TODO (Fase 2B): implementare completamente con query su agent_operation_queue.
 * Per ora: sempre false (comportamento invariato rispetto al PDF).
 * La priority lane del Conductor (P500 < P10) già garantisce l'ordine di esecuzione;
 * questo shouldStop sarebbe un'ottimizzazione per ridurre la latenza di preemption.
 */
export function makeCooperativeShouldStop(
  _pool: DbPool,
  _userId: string,
): () => boolean {
  // TODO Fase 2B: implementare con:
  // const hasPriorityTask = await pool.query(
  //   `SELECT 1 FROM system.agent_operation_queue
  //    WHERE user_id = $1 AND status = 'enqueued' AND priority <= 100 LIMIT 1`,
  //   [userId]
  // );
  // return hasPriorityTask.rows.length > 0;
  return () => false;
}
