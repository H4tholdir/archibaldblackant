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
const WATCHDOG_INTERVAL = 30000; // 30 seconds - check connection health

// Application-level heartbeat
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds pong timeout

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
  const lastEventTsRef = useRef<string | null>(null);
  const lastSyncIdRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      const data = event.data as string;

      // Handle heartbeat pong
      if (data === "pong") {
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }
        return;
      }

      const message = JSON.parse(data) as WebSocketEvent;

      console.log("[WebSocket] Received message:", {
        type: message.type,
        timestamp: message.timestamp,
      });

      if (message.timestamp) {
        lastEventTsRef.current = message.timestamp;
      }

      // Track syncId from payload for delta sync
      const payload = message.payload as Record<string, unknown> | null;
      if (
        payload &&
        typeof payload.syncId === "number" &&
        payload.syncId > lastSyncIdRef.current
      ) {
        lastSyncIdRef.current = payload.syncId;
      }

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

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (ws: WebSocket) => {
      stopHeartbeat();
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
          heartbeatTimeoutRef.current = setTimeout(() => {
            console.log("[WebSocket] Heartbeat timeout, forcing reconnect");
            ws.close(4000, "Heartbeat timeout");
          }, HEARTBEAT_TIMEOUT);
        }
      }, HEARTBEAT_INTERVAL);
    },
    [stopHeartbeat],
  );

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const token = getToken();
    if (!token) {
      console.warn("[WebSocket] No auth token, cannot connect");
      setState("disconnected");
      return;
    }

    setState("connecting");

    let url = `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
    if (lastEventTsRef.current) {
      url += `&lastEventTs=${encodeURIComponent(lastEventTsRef.current)}`;
    }
    if (lastSyncIdRef.current > 0) {
      url += `&lastSyncId=${lastSyncIdRef.current}`;
    }
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

      // Start application-level heartbeat
      startHeartbeat(ws);

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
      stopHeartbeat();

      if (isIntentionalCloseRef.current) {
        setState("disconnected");
        return;
      }

      // Auto-reconnect with exponential backoff + jitter
      setState("reconnecting");
      const baseDelay = reconnectDelayRef.current;
      const jitter = baseDelay * 0.5 * (Math.random() * 2 - 1);
      const delay = Math.max(100, baseDelay + jitter);

      console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms...`);

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          baseDelay * RECONNECT_MULTIPLIER,
          MAX_RECONNECT_DELAY,
        );
        connect();
      }, delay);
    };
  }, [getToken, handleMessage, replayQueue, startHeartbeat, stopHeartbeat]);

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    stopHeartbeat();

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setState("disconnected");
  }, [stopHeartbeat]);

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

  /**
   * Watchdog: periodically verify connection is alive, reconnect if dead
   */
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (isIntentionalCloseRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        console.log("[WebSocket] Watchdog: connection dead, reconnecting");
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
        connect();
      }
    }, WATCHDOG_INTERVAL);

    return () => clearInterval(watchdog);
  }, [connect]);

  /**
   * Visibility change: reconnect when tab becomes visible
   */
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        !isIntentionalCloseRef.current
      ) {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log("[WebSocket] Tab visible, forcing reconnect");
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [connect]);

  /**
   * Online/offline: reconnect immediately when network comes back
   */
  useEffect(() => {
    const handleOnline = () => {
      if (isIntentionalCloseRef.current) return;
      console.log("[WebSocket] Network online, forcing reconnect");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      connect();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [connect]);

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
