import { useRef, useEffect, useCallback } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

function generateIntentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type UseUiTrackingArgs = {
  type: 'new-order' | 'edit-pending';
  customerId: string;
  customerName: string;
  pendingOrderId: string | null;
};

export function useUiOperationTracking(args: UseUiTrackingArgs): {
  complete: (pendingOrderId: string) => void;
} {
  const intentIdRef = useRef<string>('');
  const startedRef = useRef(false);
  const { send } = useWebSocketContext();

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    intentIdRef.current = generateIntentId();
    void send('UI_OPERATION_STARTED', {
      intentId: intentIdRef.current,
      type: args.type,
      customerId: args.customerId,
      customerName: args.customerName,
      pendingOrderId: args.pendingOrderId,
      timestamp: Date.now(),
    });
    // Se l'utente abbandona senza salvare, l'intent resta aperto.
    // Il backend lo chiuderà via TTL (expires_at 24h in ui_operation_intents).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = useCallback(
    (pendingOrderId: string) => {
      if (!intentIdRef.current) return;
      void send('UI_OPERATION_COMPLETED', {
        intentId: intentIdRef.current,
        pendingOrderId,
        timestamp: Date.now(),
      });
    },
    [send],
  );

  return { complete };
}
