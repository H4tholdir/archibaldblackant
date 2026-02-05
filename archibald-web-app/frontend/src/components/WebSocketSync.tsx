import { useEffect } from "react";
import { useDraftSync } from "../hooks/useDraftSync";
import { usePendingSync } from "../hooks/usePendingSync";

/**
 * Component che inizializza la sincronizzazione WebSocket real-time
 * per draft e pending orders.
 *
 * Deve essere montato una volta sola nell'app (in AppRouter o main component).
 * Gestisce automaticamente connessione/disconnessione e sync bidirezionale.
 */
export default function WebSocketSync() {
  // Initialize draft orders real-time sync
  useDraftSync();

  // Initialize pending orders real-time sync
  usePendingSync();

  useEffect(() => {
    console.log("[WebSocketSync] Real-time sync initialized");

    return () => {
      console.log("[WebSocketSync] Real-time sync cleanup");
    };
  }, []);

  // Questo componente non renderizza nulla (sync in background)
  return null;
}
