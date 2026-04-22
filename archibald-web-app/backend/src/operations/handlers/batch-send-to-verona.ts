import type { DbPool } from '../../db/pool';
import * as ordersRepo from '../../db/repositories/orders';
import type { OperationHandler } from '../operation-processor';
import { generateArcaData } from '../../services/generate-arca-data';
import type { GenerateInput } from '../../services/generate-arca-data';
import { getNextFtNumber } from '../../services/ft-counter';
import { batchMarkSold } from '../../db/repositories/warehouse';
import { logger } from '../../logger';

type BatchSendToVeronaData = {
  orderIds: string[];
};

type OrderHeaderData = {
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
};

type BatchSendToVeronaBot = {
  batchSendOrdersToVerona: (orderIds: string[]) => Promise<{
    success: boolean;
    message: string;
    sentIds: string[];
    notFoundIds: string[];
  }>;
  readOrderHeader: (orderId: string) => Promise<OrderHeaderData | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const BOT_BATCH_SEND_PROGRESS: Record<string, { progress: number; label: string }> = {
  'batchSendToVerona.navigation': { progress: 10, label: 'Apertura sezione ordini' },
  'batchSendToVerona.filter': { progress: 20, label: 'Impostazione filtro ordini' },
  'batchSendToVerona.scan': { progress: 30, label: 'Ricerca ordini nella griglia' },
  'batchSendToVerona.select': { progress: 45, label: 'Selezione ordini' },
  'batchSendToVerona.confirm': { progress: 55, label: 'Conferma invio a Verona' },
  'batchSendToVerona.verify': { progress: 70, label: 'Verifica invio completato' },
  'batchSendToVerona.complete': { progress: 80, label: 'Finalizzazione' },
};

async function handleBatchSendToVerona(
  pool: DbPool,
  bot: BatchSendToVeronaBot,
  data: BatchSendToVeronaData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: (userId: string, event: { type: string; payload: unknown }) => void,
): Promise<{ success: boolean; message: string; sentIds: string[]; notFoundIds: string[] }> {
  bot.setProgressCallback(async (category) => {
    const mapped = BOT_BATCH_SEND_PROGRESS[category];
    if (mapped) onProgress(mapped.progress, mapped.label);
  });

  // Filter out ghost orders
  const realOrderIds = data.orderIds.filter((id) => !id.startsWith('ghost-'));
  if (realOrderIds.length === 0) {
    return { success: false, message: 'Tutti gli ordini selezionati sono ghost', sentIds: [], notFoundIds: data.orderIds };
  }

  onProgress(5, `Avvio invio ${realOrderIds.length} ordini a Verona`);
  const result = await bot.batchSendOrdersToVerona(realOrderIds);

  if (!result.success) {
    throw new Error(result.message);
  }

  const sentToVeronaAt = new Date().toISOString();

  onProgress(85, 'Aggiornamento stati ordini');

  for (const orderId of result.sentIds) {
    await ordersRepo.updateOrderState(pool, userId, orderId, 'inviato_verona', 'system', result.message, null, 'send-to-verona');

    await pool.query(
      'UPDATE agents.order_records SET sent_to_verona_at = $1 WHERE id = $2 AND user_id = $3',
      [sentToVeronaAt, orderId, userId],
    );

    await batchMarkSold(pool, userId, `pending-${orderId}`, { orderDate: sentToVeronaAt });

    broadcast?.(userId, { type: 'WAREHOUSE_UPDATED', payload: { orderId } });

    // Aggiornamento garantito: il bot ha inviato con successo, quindi lo stato è
    // per definizione "IN ATTESA DI APPROVAZIONE" indipendentemente dai tempi ERP.
    await pool.query(
      `UPDATE agents.order_records
         SET transfer_status = 'IN ATTESA DI APPROVAZIONE', last_sync = $1
       WHERE id = $2 AND user_id = $3`,
      [Math.floor(Date.now() / 1000), orderId, userId],
    );

    try {
      const header = await bot.readOrderHeader(orderId);

      if (header) {
        await pool.query(
          `UPDATE agents.order_records SET
             sales_status = COALESCE($1, sales_status),
             document_status = COALESCE($2, document_status),
             transfer_status = CASE WHEN $3 IS NOT NULL AND lower($3) != 'modifica' THEN $3 ELSE transfer_status END,
             last_sync = $4
           WHERE id = $5 AND user_id = $6`,
          [header.salesStatus, header.documentStatus, header.transferStatus, Math.floor(Date.now() / 1000), orderId, userId],
        );
        logger.info('[BatchSendToVerona] stato aggiornato da ERP', { orderId, header });
      } else {
        logger.warn('[BatchSendToVerona] readOrderHeader non ha restituito dati, stato garantito già impostato', { orderId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[BatchSendToVerona] readOrderHeader failed, stato garantito già impostato', { orderId, error: message });
    }
  }

  onProgress(90, 'Generazione documenti FT');

  const esercizio = String(new Date().getFullYear());

  for (const orderId of result.sentIds) {
    const fresis = await pool.query<{
      id: number;
      items: GenerateInput['items'];
      sub_client_codice: string;
      sub_client_name: string;
      sub_client_data: GenerateInput['subClientData'];
      discount_percent: number | null;
      notes: string | null;
    }>(
      `SELECT id, items, sub_client_codice, sub_client_name, sub_client_data,
              discount_percent, notes
       FROM agents.fresis_history
       WHERE user_id = $1
         AND replace(archibald_order_id, '.', '') = $2
         AND arca_data IS NULL
         AND source = 'app'`,
      [userId, orderId],
    );

    for (const row of fresis.rows) {
      const docDate = new Date().toISOString().slice(0, 10);
      const ftNumber = await getNextFtNumber(pool, userId, esercizio, 'FT', docDate);

      type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
      const exportItems = (row.items as GenerateItemWithGhost[])
        .filter((i) => !i.isGhostArticle) as GenerateInput['items'];

      if (exportItems.length === 0) continue;

      const input: GenerateInput = {
        subClientCodice: row.sub_client_codice,
        subClientName: row.sub_client_name,
        subClientData: row.sub_client_data,
        items: exportItems,
        discountPercent: row.discount_percent ?? undefined,
        notes: row.notes ?? undefined,
      };

      const arcaData = generateArcaData(input, ftNumber, esercizio);
      const invoiceNumber = `FT ${ftNumber}/${esercizio}`;

      await pool.query(
        `UPDATE agents.fresis_history
         SET arca_data = $1, invoice_number = $2, current_state = 'inviato_verona',
             state_updated_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND user_id = $4`,
        [JSON.stringify(arcaData), invoiceNumber, row.id, userId],
      );
    }

    await pool.query(
      `UPDATE agents.fresis_history
       SET current_state = 'inviato_verona', state_updated_at = NOW(), updated_at = NOW()
       WHERE user_id = $1
         AND replace(archibald_order_id, '.', '') = $2
         AND source = 'app'`,
      [userId, orderId],
    );

    logger.info('[BatchSendToVerona] FT documents generated', { orderId });
  }

  onProgress(100, `${result.sentIds.length} ordini inviati a Verona`);

  return result;
}

function createBatchSendToVeronaHandler(
  pool: DbPool,
  createBot: (userId: string) => BatchSendToVeronaBot,
  broadcast?: (userId: string, event: { type: string; payload: unknown }) => void,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as BatchSendToVeronaData;
    const result = await handleBatchSendToVerona(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleBatchSendToVerona,
  createBatchSendToVeronaHandler,
  type BatchSendToVeronaData,
  type BatchSendToVeronaBot,
};
