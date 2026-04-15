import type { DbPool } from '../../db/pool';
import * as ordersRepo from '../../db/repositories/orders';
import type { OperationHandler } from '../operation-processor';
import { generateArcaData } from '../../services/generate-arca-data';
import type { GenerateInput } from '../../services/generate-arca-data';
import { getNextFtNumber } from '../../services/ft-counter';
import { batchMarkSold } from '../../db/repositories/warehouse';
import { logger } from '../../logger';

type SendToVeronaData = {
  orderId: string;
};

type OrderHeaderData = {
  salesStatus: string | null;
  documentStatus: string | null;
  transferStatus: string | null;
};

type SendToVeronaBot = {
  sendOrderToVerona: (orderId: string) => Promise<{ success: boolean; message: string }>;
  readOrderHeader: (orderId: string) => Promise<OrderHeaderData | null>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

const SEND_TO_VERONA_PROGRESS: Record<string, { progress: number; label: string }> = {
  'sendToVerona.navigation': { progress: 10, label: 'Navigazione alla lista ordini' },
  'sendToVerona.filter': { progress: 20, label: 'Impostazione filtro ordini' },
  'sendToVerona.search': { progress: 30, label: 'Ricerca ordine' },
  'sendToVerona.select': { progress: 40, label: 'Selezione ordine' },
  'sendToVerona.confirm': { progress: 50, label: 'Conferma invio a Verona' },
  'sendToVerona.verify': { progress: 65, label: 'Verifica invio completato' },
  'sendToVerona.complete': { progress: 80, label: 'Finalizzazione' },
};

async function handleSendToVerona(
  pool: DbPool,
  bot: SendToVeronaBot,
  data: SendToVeronaData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  broadcast?: (userId: string, event: { type: string; payload: unknown }) => void,
): Promise<{ success: boolean; message: string; sentToVeronaAt: string }> {
  if (data.orderId.startsWith('ghost-')) {
    return { success: false, message: 'Ordine ghost: nessun ordine Archibald da inviare', sentToVeronaAt: '' };
  }

  bot.setProgressCallback(async (category) => {
    const mapped = SEND_TO_VERONA_PROGRESS[category];
    if (mapped) {
      onProgress(mapped.progress, mapped.label);
    } else {
      onProgress(50, 'Invio in corso...');
    }
  });

  onProgress(5, 'Avvio invio a Verona');
  const result = await bot.sendOrderToVerona(data.orderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  const sentToVeronaAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await ordersRepo.updateOrderState(pool, userId, data.orderId, 'inviato_verona', 'system', result.message, null, 'send-to-verona');

  await pool.query(
    'UPDATE agents.order_records SET sent_to_verona_at = $1 WHERE id = $2 AND user_id = $3',
    [sentToVeronaAt, data.orderId, userId],
  );

  await batchMarkSold(pool, userId, `pending-${data.orderId}`, { orderDate: sentToVeronaAt });

  broadcast?.(userId, { type: 'WAREHOUSE_UPDATED', payload: { orderId: data.orderId } });

  // Aggiornamento garantito: il bot ha inviato con successo, quindi lo stato è
  // per definizione "IN ATTESA DI APPROVAZIONE" indipendentemente dai tempi ERP.
  await pool.query(
    `UPDATE agents.order_records
       SET transfer_status = 'IN ATTESA DI APPROVAZIONE', last_sync = $1
     WHERE id = $2 AND user_id = $3`,
    [Math.floor(Date.now() / 1000), data.orderId, userId],
  );

  onProgress(83, 'Lettura stato ordine da ERP');
  try {
    const header = await bot.readOrderHeader(data.orderId);

    if (header) {
      await pool.query(
        `UPDATE agents.order_records SET
           sales_status = COALESCE($1, sales_status),
           document_status = COALESCE($2, document_status),
           transfer_status = CASE WHEN $3 IS NOT NULL AND lower($3) != 'modifica' THEN $3 ELSE transfer_status END,
           last_sync = $4
         WHERE id = $5 AND user_id = $6`,
        [header.salesStatus, header.documentStatus, header.transferStatus, Math.floor(Date.now() / 1000), data.orderId, userId],
      );
      logger.info('[SendToVerona] stato aggiornato da ERP', { orderId: data.orderId, header });
    } else {
      logger.warn('[SendToVerona] readOrderHeader non ha restituito dati, stato garantito già impostato', { orderId: data.orderId });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[SendToVerona] readOrderHeader failed, stato garantito già impostato', { orderId: data.orderId, error: message });
  }

  onProgress(85, 'Generazione documenti FT');

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
       AND archibald_order_id = $2
       AND arca_data IS NULL
       AND source = 'app'`,
    [userId, data.orderId],
  );

  const esercizio = String(new Date().getFullYear());

  for (const row of fresis.rows) {
    const docDate = new Date().toISOString().slice(0, 10);
    const ftNumber = await getNextFtNumber(pool, userId, esercizio, 'FT', docDate);

    type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
    const exportItems = (row.items as GenerateItemWithGhost[])
      .filter((i) => !i.isGhostArticle) as GenerateInput['items'];

    if (exportItems.length === 0) {
      continue;
    }

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

  onProgress(95, 'Documenti FT generati');

  await pool.query(
    `UPDATE agents.fresis_history
     SET current_state = 'inviato_verona', state_updated_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND archibald_order_id = $2
       AND source = 'app'`,
    [userId, data.orderId],
  );

  onProgress(100, 'Invio completato');

  return { success: true, message: result.message, sentToVeronaAt };
}

function createSendToVeronaHandler(
  pool: DbPool,
  createBot: (userId: string) => SendToVeronaBot,
  broadcast?: (userId: string, event: { type: string; payload: unknown }) => void,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SendToVeronaData;
    const result = await handleSendToVerona(pool, bot, typedData, userId, onProgress, broadcast);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSendToVerona, createSendToVeronaHandler, type SendToVeronaData, type SendToVeronaBot };
