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

type SendToVeronaBot = {
  sendOrderToVerona: (orderId: string) => Promise<{ success: boolean; message: string }>;
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

  const orderId = data.orderId;
  const cleanOrderId = orderId.replace(/\./g, '');

  bot.setProgressCallback(async (category) => {
    const mapped = SEND_TO_VERONA_PROGRESS[category];
    if (mapped) {
      onProgress(mapped.progress, mapped.label);
    } else {
      onProgress(50, 'Invio in corso...');
    }
  });

  onProgress(5, 'Avvio invio a Verona');
  const result = await bot.sendOrderToVerona(cleanOrderId);

  if (!result.success) {
    throw new Error(result.message);
  }

  const sentToVeronaAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await ordersRepo.updateOrderState(pool, userId, orderId, 'inviato_verona', 'system', result.message, null, 'send-to-verona');

  await pool.query(
    'UPDATE agents.order_records SET sent_to_verona_at = $1 WHERE id = $2 AND user_id = $3',
    [sentToVeronaAt, orderId, userId],
  );

  await batchMarkSold(pool, userId, `pending-${orderId}`, { orderDate: sentToVeronaAt });

  // Fallback: se batchTransfer fu saltato (crash window db_committed→batchTransfer nel Conductor),
  // le riserve restano sugli UUID del pending order originale. Le marcamo vendute ora.
  const { rows: pendingUuids } = await pool.query<{ uuid: string }>(
    `SELECT DISTINCT COALESCE(merged_into_order_id, original_pending_order_id) AS uuid
     FROM agents.fresis_history
     WHERE user_id = $1
       AND replace(archibald_order_id, '.', '') = $2
       AND COALESCE(merged_into_order_id, original_pending_order_id) IS NOT NULL`,
    [userId, cleanOrderId],
  );
  for (const { uuid } of pendingUuids) {
    await batchMarkSold(pool, userId, `pending-${uuid}`, { orderDate: sentToVeronaAt });

    // Terzo fallback: se batchMarkSold non ha trovato articoli riservati (reservation mai avvenuta),
    // marca sold gli articoli disponibili in magazzino per ogni item della fresis_history (FIFO).
    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM agents.warehouse_items
       WHERE user_id = $1 AND sold_in_order = $2`,
      [userId, `pending-${uuid}`],
    );
    if (parseInt(count, 10) === 0) {
      const { rows: fresisItems } = await pool.query<{ article_code: string; quantity: number }>(
        `SELECT item->>'articleCode' AS article_code, (item->>'quantity')::int AS quantity
         FROM agents.fresis_history,
           jsonb_array_elements(items) AS item
         WHERE user_id = $1 AND original_pending_order_id = $2`,
        [userId, uuid],
      );
      for (const { article_code, quantity } of fresisItems) {
        await pool.query(
          `WITH fifo AS (
             SELECT id,
               SUM(quantity) OVER (ORDER BY id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative,
               quantity
             FROM agents.warehouse_items
             WHERE user_id = $1 AND article_code = $2
               AND sold_in_order IS NULL AND reserved_for_order IS NULL
           )
           UPDATE agents.warehouse_items wi
           SET sold_in_order = $3, reserved_for_order = NULL
           FROM fifo f
           WHERE wi.id = f.id
             AND (f.cumulative - f.quantity) < $4`,
          [userId, article_code, `pending-${uuid}`, quantity],
        );
      }
    }
  }

  broadcast?.(userId, { type: 'WAREHOUSE_UPDATED', payload: { orderId } });

  // Aggiornamento garantito: il bot ha inviato con successo, quindi lo stato è
  // per definizione "IN ATTESA DI APPROVAZIONE" indipendentemente dai tempi ERP.
  await pool.query(
    `UPDATE agents.order_records
       SET transfer_status = 'IN ATTESA DI APPROVAZIONE', last_sync = $1
     WHERE id = $2 AND user_id = $3`,
    [Math.floor(Date.now() / 1000), orderId, userId],
  );

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
       AND replace(archibald_order_id, '.', '') = $2
       AND arca_data IS NULL
       AND source = 'app'`,
    [userId, cleanOrderId],
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
       AND replace(archibald_order_id, '.', '') = $2
       AND source = 'app'`,
    [userId, cleanOrderId],
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
