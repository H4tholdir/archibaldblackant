import type { OrderRecord } from "./order-db-new";
import { logger } from "./logger";

/**
 * Order lifecycle states based on user flow:
 *
 * 1. creato - Created in PWA (no archibaldOrderId)
 * 2. piazzato - Sent to Archibald (has archibaldOrderId, no sentToMilanoAt)
 * 3. inviato_milano - Sent to Milano (has sentToMilanoAt)
 * 4. Milano processing states:
 *    - modifica - Modification requested
 *    - trasferito - Transferred successfully
 *    - transfer_error - Transfer failed
 * 5. Post-transfer states (if trasferito):
 *    - ordine_aperto - Order open
 *    - spedito - Shipped (has DDT)
 *    - consegnato - Delivered
 *    - fatturato - Invoiced
 */
export type OrderState =
  | "creato"
  | "piazzato"
  | "inviato_milano"
  | "modifica"
  | "trasferito"
  | "transfer_error"
  | "ordine_aperto"
  | "spedito"
  | "consegnato"
  | "fatturato";

/**
 * State detection result
 */
export interface StateDetectionResult {
  state: OrderState;
  confidence: "high" | "medium" | "low";
  source: "database" | "archibald" | "inferred";
  notes?: string;
}

/**
 * OrderStateService - Detect current order state from multiple sources
 *
 * Detection logic (priority order):
 * 1. Check database fields (archibaldOrderId, sentToMilanoAt, ddtNumber, deliveryDate)
 * 2. Check Archibald status field (if available)
 * 3. Infer from delivery date vs current date
 * 4. Fall back to last known state
 */
export class OrderStateService {
  /**
   * Detect order state from available data sources
   */
  async detectOrderState(order: OrderRecord): Promise<StateDetectionResult> {
    logger.debug(`[OrderStateService] Detecting state for order ${order.id}`);

    // Priority 1: Check if order has invoice (final state)
    if (order.invoiceNumber) {
      return {
        state: "fatturato",
        confidence: "high",
        source: "database",
        notes: `Invoice ${order.invoiceNumber} found`,
      };
    }

    // Priority 2: Check if order has DDT (shipped/delivered)
    if (order.ddtNumber) {
      // Check delivery date to determine if delivered
      if (order.ddtDeliveryDate || order.deliveryDate) {
        const deliveryDate = new Date(
          order.ddtDeliveryDate || order.deliveryDate!,
        );
        const now = new Date();

        if (deliveryDate <= now) {
          // Delivery date passed - order delivered
          return {
            state: "consegnato",
            confidence: "high",
            source: "database",
            notes: `DDT ${order.ddtNumber}, delivery date ${order.ddtDeliveryDate || order.deliveryDate} has passed`,
          };
        } else {
          // Delivery date in future - shipped but not delivered
          return {
            state: "spedito",
            confidence: "high",
            source: "database",
            notes: `DDT ${order.ddtNumber}, delivery expected ${order.ddtDeliveryDate || order.deliveryDate}`,
          };
        }
      } else {
        // Has DDT but no delivery date - assume shipped
        return {
          state: "spedito",
          confidence: "medium",
          source: "database",
          notes: `DDT ${order.ddtNumber} found, no delivery date`,
        };
      }
    }

    // Priority 3: Check database state tracking fields
    // Check if order has archibaldOrderId or transferStatus
    const archibaldOrderId = order.archibaldOrderId;
    const hasTransferStatus =
      order.transferStatus !== null && order.transferStatus !== undefined;

    // 1. Creato - No Archibald order ID and no transfer status
    if (!archibaldOrderId && !hasTransferStatus) {
      return {
        state: "creato",
        confidence: "high",
        source: "database",
        notes: "Order exists in app but not yet sent to Archibald",
      };
    }

    // 2. Piazzato - Has Archibald ID or transfer status, but not sent to Milano
    if (!order.sentToMilanoAt) {
      return {
        state: "piazzato",
        confidence: "high",
        source: "database",
        notes: "Order sent to Archibald but not yet sent to Milano",
      };
    }

    // 3. After Milano - Check Archibald status field (salesStatus) for state hints
    if (order.salesStatus) {
      const statusLower = order.salesStatus.toLowerCase();

      // Check for specific status indicators
      if (
        statusLower.includes("ordine aperto") ||
        statusLower.includes("open")
      ) {
        return {
          state: "ordine_aperto",
          confidence: "high",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }

      if (
        statusLower.includes("consegnato") ||
        statusLower.includes("delivered")
      ) {
        return {
          state: "consegnato",
          confidence: "high",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }

      if (
        statusLower.includes("fatturato") ||
        statusLower.includes("invoiced")
      ) {
        return {
          state: "fatturato",
          confidence: "high",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }

      if (
        statusLower.includes("trasferito") ||
        statusLower.includes("transferred")
      ) {
        return {
          state: "trasferito",
          confidence: "high",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }

      if (
        statusLower.includes("modifica") ||
        statusLower.includes("modification")
      ) {
        return {
          state: "modifica",
          confidence: "medium",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }

      if (statusLower.includes("error") || statusLower.includes("errore")) {
        return {
          state: "transfer_error",
          confidence: "medium",
          source: "archibald",
          notes: `Archibald status: ${order.salesStatus}`,
        };
      }
    }

    // Fallback to current state from database or inviato_milano
    if (
      order.currentState &&
      order.currentState !== "creato" &&
      order.currentState !== "piazzato"
    ) {
      return {
        state: order.currentState as OrderState,
        confidence: "low",
        source: "database",
        notes: "Using last known state from database",
      };
    }

    // Final fallback - sent to Milano but state unclear
    return {
      state: "inviato_milano",
      confidence: "medium",
      source: "inferred",
      notes: "Sent to Milano but further state unclear",
    };
  }

  /**
   * Determine if state has progressed from old to new
   */
  hasStateProgressed(oldState: OrderState, newState: OrderState): boolean {
    const stateOrder: OrderState[] = [
      "creato",
      "piazzato",
      "inviato_milano",
      "modifica",
      "trasferito",
      "transfer_error",
      "ordine_aperto",
      "spedito",
      "consegnato",
      "fatturato",
    ];

    const oldIndex = stateOrder.indexOf(oldState);
    const newIndex = stateOrder.indexOf(newState);

    if (oldIndex === -1 || newIndex === -1) {
      // Unknown state, assume progression
      return true;
    }

    // Exception: modifica and transfer_error are branching paths, not linear
    if (newState === "modifica" || newState === "transfer_error") {
      return oldState !== newState;
    }

    // Linear progression check
    return newIndex > oldIndex;
  }

  /**
   * Get human-readable state label (Italian)
   */
  getStateLabel(state: OrderState): string {
    const labels: Record<OrderState, string> = {
      creato: "Creato",
      piazzato: "Piazzato su Archibald",
      inviato_milano: "Inviato a Verona",
      modifica: "In modifica",
      trasferito: "Trasferito",
      transfer_error: "Errore trasferimento",
      ordine_aperto: "Ordine aperto",
      spedito: "Spedito",
      consegnato: "Consegnato",
      fatturato: "Fatturato",
    };

    return labels[state] || state;
  }
}
