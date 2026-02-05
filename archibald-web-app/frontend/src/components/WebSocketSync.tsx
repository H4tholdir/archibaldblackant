import { useEffect } from "react";

/**
 * Component che inizializza la sincronizzazione WebSocket real-time
 * per draft e pending orders.
 *
 * NOTA: useDraftSync e usePendingSync sono chiamati direttamente dai componenti
 * che necessitano dei dati. Non vanno chiamati qui per evitare subscriptions duplicate.
 *
 * Questo componente rimane come placeholder per future inizializzazioni globali.
 */
export default function WebSocketSync() {
  useEffect(() => {
    console.log("[WebSocketSync] Real-time sync placeholder mounted");

    return () => {
      console.log("[WebSocketSync] Real-time sync placeholder cleanup");
    };
  }, []);

  // Questo componente non renderizza nulla (sync in background)
  return null;
}
