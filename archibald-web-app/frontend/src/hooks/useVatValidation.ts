import { useState, useCallback, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { customerService } from '../services/customers.service';

export type VatValidationStatus = 'idle' | 'validating' | 'done' | 'error';

type UseVatValidationReturn = {
  validate: (erpId: string, vatNumber: string) => Promise<void>;
  status: VatValidationStatus;
  errorMessage: string | null;
  reset: () => void;
};

export function useVatValidation(): UseVatValidationReturn {
  const [status, setStatus] = useState<VatValidationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { subscribe } = useWebSocketContext();
  const sessionIdRef = useRef<string | null>(null);

  const validate = useCallback(async (erpId: string, vatNumber: string) => {
    setStatus('validating');
    setErrorMessage(null);

    let sessionId: string;
    try {
      ({ sessionId } = await customerService.startEditInteractiveSession(erpId));
      sessionIdRef.current = sessionId;
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Errore avvio sessione');
      return;
    }

    const unsubscribers: Array<() => void> = [];

    async function cleanup() {
      unsubscribers.forEach((u) => u());
      unsubscribers.length = 0;
      sessionIdRef.current = null;
      try { await customerService.cancelInteractiveSession(sessionId); } catch { /* ignore */ }
    }

    unsubscribers.push(
      subscribe('CUSTOMER_INTERACTIVE_READY', async (payload: unknown) => {
        const p = payload as { sessionId: string };
        if (p.sessionId !== sessionId) return;
        try {
          await customerService.submitVatNumber(sessionId, vatNumber);
        } catch {
          await cleanup();
          setStatus('error');
          setErrorMessage('Errore durante la verifica P.IVA');
        }
      }),
    );

    unsubscribers.push(
      subscribe('CUSTOMER_VAT_RESULT', async (payload: unknown) => {
        const p = payload as { sessionId: string };
        if (p.sessionId !== sessionId) return;
        await cleanup();
        setStatus('done');
      }),
    );

    unsubscribers.push(
      subscribe('CUSTOMER_INTERACTIVE_FAILED', async (payload: unknown) => {
        const p = payload as { sessionId: string; error?: string };
        if (p.sessionId !== sessionId) return;
        await cleanup();
        setStatus('error');
        setErrorMessage(p.error || 'Validazione fallita');
      }),
    );
  }, [subscribe]);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return { validate, status, errorMessage, reset };
}
