import type { DbPool } from '../../db/pool';
import * as ordersRepo from '../../db/repositories/orders';
import type { OperationHandler } from '../operation-processor';
import { generateArcaData } from '../../services/generate-arca-data';
import type { GenerateInput } from '../../services/generate-arca-data';
import { getNextFtNumber } from '../../services/ft-counter';

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
): Promise<{ success: boolean; message: string; sentToMilanoAt: string }> {
  if (data.orderId.startsWith('ghost-')) {
    return { success: false, message: 'Ordine ghost: nessun ordine Archibald da inviare', sentToMilanoAt: '' };
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

  const sentToMilanoAt = new Date().toISOString();

  onProgress(70, 'Aggiornamento stato ordine');

  await ordersRepo.updateOrderState(pool, userId, data.orderId, 'inviato_milano', 'system', result.message, null, 'send-to-verona');

  await pool.query(
    'UPDATE agents.order_records SET sent_to_verona_at = $1 WHERE id = $2 AND user_id = $3',
    [sentToMilanoAt, data.orderId, userId],
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
       AND archibald_order_id = $2
       AND arca_data IS NULL
       AND source = 'app'`,
    [userId, data.orderId],
  );

  const esercizio = String(new Date().getFullYear());

  for (const row of fresis.rows) {
    const ftNumber = await getNextFtNumber(pool, userId, esercizio, 'FT');

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
       SET arca_data = $1, invoice_number = $2, current_state = 'inviato_milano',
           state_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [JSON.stringify(arcaData), invoiceNumber, row.id, userId],
    );
  }

  onProgress(95, 'Documenti FT generati');

  await pool.query(
    `UPDATE agents.fresis_history
     SET current_state = 'inviato_milano', state_updated_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND merged_into_order_id = $2
       AND source = 'app'`,
    [userId, data.orderId],
  );

  onProgress(100, 'Invio completato');

  return { success: true, message: result.message, sentToMilanoAt };
}

function createSendToVeronaHandler(pool: DbPool, createBot: (userId: string) => SendToVeronaBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SendToVeronaData;
    const result = await handleSendToVerona(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSendToVerona, createSendToVeronaHandler, type SendToVeronaData, type SendToVeronaBot };
