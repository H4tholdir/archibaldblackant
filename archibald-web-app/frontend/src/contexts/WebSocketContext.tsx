/**
 * WebSocketContext - Singleton WebSocket connection provider
 *
 * Provides a single shared WebSocket instance for the entire application.
 * Replaces multiple useWebSocket() calls to avoid duplicate connections.
 *
 * Usage:
 * ```tsx
 * // Wrap authenticated routes with WebSocketProvider
 * <WebSocketProvider>
 *   <YourApp />
 * </WebSocketProvider>
 *
 * // Access WebSocket in any component
 * const { state, send, subscribe, unsubscribe } = useWebSocketContext();
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  WebSocketState,
  WebSocketEvent,
  WebSocketEventHandler,
  WebSocketHookReturn,
} from "../types/websocket";
import { websocketQueue } from "../services/websocket-queue";

const TOKEN_KEY = "archibald_jwt";

// Reconnection configuration
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const RECONNECT_MULTIPLIER = 2;

// WebSocket endpoint (production: wss://formicanera.com/ws/realtime)
const getWebSocketUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host =
    import.meta.env.VITE_WS_HOST ||
    window.location.hostname +
      (window.location.port ? `:${window.location.port}` : "");
  return `${protocol}//${host}/ws/realtime`;
};

// Create context
const WebSocketContext = createContext<WebSocketHookReturn | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * WebSocketProvider - Provides a single WebSocket connection to all children
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [state, setState] = useState<WebSocketState>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY);
  const eventHandlersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(
    new Map(),
  );
  const isIntentionalCloseRef = useRef<boolean>(false);

  /**
   * Get JWT token from localStorage
   */
  const getToken = useCallback((): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  /**
   * Send message via WebSocket or queue if disconnected
   */
  const send = useCallback((type: string, payload: unknown): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Queue for replay when reconnected
        websocketQueue.enqueue(type, payload);
        console.log(`[WebSocket] Queued operation (offline): ${type}`);
        resolve();
        return;
      }

      try {
        const message: WebSocketEvent = {
          type,
          payload,
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        console.error("[WebSocket] Failed to send message:", error);
        reject(error);
      }
    });
  }, []);

  /**
   * Subscribe to WebSocket event type
   */
  const subscribe = useCallback(
    (eventType: string, callback: WebSocketEventHandler): (() => void) => {
      if (!eventHandlersRef.current.has(eventType)) {
        eventHandlersRef.current.set(eventType, new Set());
      }
      eventHandlersRef.current.get(eventType)!.add(callback);

      // Return unsubscribe function
      return () => {
        eventHandlersRef.current.get(eventType)?.delete(callback);
      };
    },
    [],
  );

  /**
   * Unsubscribe from WebSocket event type
   */
  const unsubscribe = useCallback(
    (eventType: string, callback: WebSocketEventHandler): void => {
      eventHandlersRef.current.get(eventType)?.delete(callback);
    },
    [],
  );

  /**
   * Handle incoming WebSocket message
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as WebSocketEvent;
      const handlers = eventHandlersRef.current.get(message.type);

      if (handlers && handlers.size > 0) {
        handlers.forEach((handler) => {
          try {
            handler(message.payload);
          } catch (error) {
            console.error(
              `[WebSocket] Error in event handler for ${message.type}:`,
              error,
            );
          }
        });
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
    }
  }, []);

  /**
   * Replay queued operations after reconnect
   */
  const replayQueue = useCallback(() => {
    const queueSize = websocketQueue.size();
    if (queueSize === 0) return;

    console.log(`[WebSocket] Replaying ${queueSize} queued operations`);

    const items = websocketQueue.dequeueAll();
    items.forEach((item) => {
      send(item.type, item.payload).catch((error) => {
        console.error(
          `[WebSocket] Failed to replay operation ${item.type}:`,
          error,
        );
        // Re-queue if failed
        websocketQueue.enqueue(item.type, item.payload);
      });
    });
  }, [send]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const token = getToken();
    if (!token) {
      console.warn("[WebSocket] No auth token, cannot connect");
      setState("disconnected");
      return;
    }

    setState("connecting");

    const url = `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      // Replay queued operations
      replayQueue();
    };

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    ws.onclose = (event) => {
      console.log(
        `[WebSocket] Closed (code: ${event.code}, reason: ${event.reason})`,
      );
      wsRef.current = null;

      if (isIntentionalCloseRef.current) {
        setState("disconnected");
        return;
      }

      // Auto-reconnect with exponential backoff
      setState("reconnecting");
      const delay = reconnectDelayRef.current;

      console.log(`[WebSocket] Reconnecting in ${delay}ms...`);

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          delay * RECONNECT_MULTIPLIER,
          MAX_RECONNECT_DELAY,
        );
        connect();
      }, delay);
    };
  }, [getToken, handleMessage, replayQueue]);

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setState("disconnected");
  }, []);

  /**
   * Initialize connection on mount, cleanup on unmount
   */
  useEffect(() => {
    isIntentionalCloseRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const value: WebSocketHookReturn = {
    state,
    send,
    subscribe,
    unsubscribe,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context
 * Throws error if used outside WebSocketProvider
 */
export function useWebSocketContext(): WebSocketHookReturn {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within WebSocketProvider",
    );
  }

  return context;
}
