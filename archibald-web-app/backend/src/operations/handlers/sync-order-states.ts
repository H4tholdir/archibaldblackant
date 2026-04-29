import type { DbPool } from '../../db/pool';
import type { Order } from '../../db/repositories/orders';
import { getOrdersByUser, updateOrderState, resetArticlesSyncedAt } from '../../db/repositories/orders';
import { clearVerificationFlag } from '../../db/repositories/order-verification';
import type { OperationHandler } from '../operation-processor';

type OrderState =
  | 'creato'
  | 'piazzato'
  | 'inviato_verona'
  | 'modifica'
  | 'trasferito'
  | 'transfer_error'
  | 'ordine_aperto'
  | 'spedito'
  | 'consegnato'
  | 'fatturato'
  | 'pagamento_scaduto'
  | 'pagato';

type StateDetection = {
  state: OrderState;
  confidence: 'high' | 'medium' | 'low';
  source: 'database' | 'archibald' | 'inferred';
  notes: string;
};

type StateSyncResult = {
  success: boolean;
  updated: number;
  unchanged: number;
  errors: number;
  total: number;
  updatedOrderIds: string[];
};

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

const VERIFICATION_RESOLVING_STATES: ReadonlySet<OrderState> = new Set([
  'inviato_verona', 'trasferito', 'ordine_aperto', 'spedito',
  'consegnato', 'fatturato', 'pagamento_scaduto', 'pagato',
]);

const COMPLETED_STATES: ReadonlySet<OrderState> = new Set([
  'consegnato', 'fatturato', 'pagamento_scaduto', 'pagato',
]);

function parseAmount(value: string): number {
  return parseFloat(value.replace(/\./g, '').replace(',', '.'));
}

function detectOrderState(order: Order): StateDetection {
  const firstInvoice = order.invoices[0];
  if (firstInvoice) {
    const remainingAmount = firstInvoice.invoiceRemainingAmount
      ? parseAmount(firstInvoice.invoiceRemainingAmount)
      : null;
    const isPaid =
      firstInvoice.invoiceClosed === true ||
      (remainingAmount !== null && remainingAmount <= 0);

    if (isPaid) {
      return {
        state: 'pagato',
        confidence: 'high',
        source: 'database',
        notes: `Invoice ${firstInvoice.invoiceNumber} paid`,
      };
    }

    if (firstInvoice.invoiceDueDate) {
      const dueDate = new Date(firstInvoice.invoiceDueDate);
      if (dueDate < new Date()) {
        return {
          state: 'pagamento_scaduto',
          confidence: 'high',
          source: 'database',
          notes: `Invoice ${firstInvoice.invoiceNumber} overdue since ${firstInvoice.invoiceDueDate}`,
        };
      }
    }

    return {
      state: 'fatturato',
      confidence: 'high',
      source: 'database',
      notes: `Invoice ${firstInvoice.invoiceNumber} found`,
    };
  }

  const firstDdt = order.ddts[0];
  if (firstDdt) {
    const deliveryDateStr = firstDdt.ddtDeliveryDate || order.deliveryDate;
    if (deliveryDateStr) {
      const deliveryDate = new Date(deliveryDateStr);
      if (deliveryDate <= new Date()) {
        return {
          state: 'consegnato',
          confidence: 'high',
          source: 'database',
          notes: `DDT ${firstDdt.ddtNumber}, delivery date ${deliveryDateStr} has passed`,
        };
      }
      return {
        state: 'spedito',
        confidence: 'high',
        source: 'database',
        notes: `DDT ${firstDdt.ddtNumber}, delivery expected ${deliveryDateStr}`,
      };
    }
    return {
      state: 'spedito',
      confidence: 'medium',
      source: 'database',
      notes: `DDT ${firstDdt.ddtNumber} found, no delivery date`,
    };
  }

  const hasTransferStatus = order.transferStatus !== null && order.transferStatus !== undefined;
  if (!order.archibaldOrderId && !hasTransferStatus) {
    return {
      state: 'creato',
      confidence: 'high',
      source: 'database',
      notes: 'Order exists in app but not yet sent to Archibald',
    };
  }

  if (!order.sentToVeronaAt) {
    // Se l'ERP mostra già uno stato avanzato (es. batch-send fallito ma ERP ha
    // processato l'ordine manualmente), non bloccare su 'piazzato': lasciare
    // che i controlli ERP sottostanti determinino lo stato corretto.
    const erpHasAdvancedState =
      order.status != null ||
      (order.transferStatus != null && order.transferStatus.toLowerCase() !== 'modifica');
    if (!erpHasAdvancedState) {
      return {
        state: 'piazzato',
        confidence: 'high',
        source: 'database',
        notes: 'Order sent to Archibald but not yet sent to Verona',
      };
    }
  }

  if (order.status) {
    const statusLower = order.status.toLowerCase();

    if (statusLower.includes('ordine aperto') || statusLower.includes('open')) {
      return { state: 'ordine_aperto', confidence: 'high', source: 'archibald', notes: `Archibald status: ${order.status}` };
    }
    if (statusLower.includes('consegnato') || statusLower.includes('delivered')) {
      return { state: 'spedito', confidence: 'high', source: 'archibald', notes: `Archibald status: ${order.status} (tag = affidato a corriere)` };
    }
    if (statusLower.includes('fatturato') || statusLower.includes('invoiced')) {
      return { state: 'fatturato', confidence: 'high', source: 'archibald', notes: `Archibald status: ${order.status}` };
    }
    if (statusLower.includes('trasferito') || statusLower.includes('transferred')) {
      return { state: 'trasferito', confidence: 'high', source: 'archibald', notes: `Archibald status: ${order.status}` };
    }
    if (statusLower.includes('modifica') || statusLower.includes('modification')) {
      return { state: 'modifica', confidence: 'medium', source: 'archibald', notes: `Archibald status: ${order.status}` };
    }
    if (statusLower.includes('error') || statusLower.includes('errore')) {
      return { state: 'transfer_error', confidence: 'medium', source: 'archibald', notes: `Archibald status: ${order.status}` };
    }
  }

  if (
    order.state &&
    order.state !== 'creato' &&
    order.state !== 'piazzato'
  ) {
    return {
      state: order.state as OrderState,
      confidence: 'low',
      source: 'database',
      notes: 'Using last known state from database',
    };
  }

  return {
    state: 'inviato_verona',
    confidence: 'medium',
    source: 'inferred',
    notes: 'Sent to Verona but further state unclear',
  };
}

function createSyncOrderStatesHandler(pool: DbPool): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const forceRefresh = data.forceRefresh === true;

    const threeWeeksAgo = new Date(Date.now() - THREE_WEEKS_MS).toISOString();
    const orders = await getOrdersByUser(pool, userId, {
      dateFrom: threeWeeksAgo,
      limit: 5000,
    });

    const total = orders.length;
    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    const updatedOrderIds: string[] = [];

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      try {
        const detection = detectOrderState(order);

        if (detection.state !== order.state || forceRefresh) {
          await updateOrderState(
            pool,
            userId,
            order.id,
            detection.state,
            'system',
            `Auto-detected from ${detection.source}: ${detection.notes}`,
            detection.confidence,
            detection.source,
          );
          if (detection.state !== order.state) {
            if (VERIFICATION_RESOLVING_STATES.has(detection.state)) {
              await clearVerificationFlag(pool, order.id, userId);
            }
            if (!COMPLETED_STATES.has(detection.state)) {
              await resetArticlesSyncedAt(pool, userId, order.id);
            }
          }
          updated++;
          updatedOrderIds.push(order.id);
        } else {
          unchanged++;
        }
      } catch {
        errors++;
      }

      if ((i + 1) % 50 === 0 || i === orders.length - 1) {
        const percent = Math.round(((i + 1) / total) * 100);
        onProgress(percent, `Processed ${i + 1}/${total} orders`);
      }
    }

    const result: StateSyncResult = { success: true, updated, unchanged, errors, total, updatedOrderIds };
    return result as unknown as Record<string, unknown>;
  };
}

export {
  createSyncOrderStatesHandler,
  detectOrderState,
  type OrderState,
  type StateDetection,
  type StateSyncResult,
};
