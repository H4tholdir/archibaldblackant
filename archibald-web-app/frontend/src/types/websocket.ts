/**
 * WebSocket client types for real-time sync
 */

export type WebSocketState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

export interface WebSocketEvent {
  type: string;
  payload: unknown;
  timestamp: string;
}

export type WebSocketEventHandler = (payload: unknown) => void;

export interface WebSocketHookReturn {
  state: WebSocketState;
  send: (type: string, payload: unknown) => Promise<void>;
  subscribe: (eventType: string, callback: WebSocketEventHandler) => () => void;
  unsubscribe: (eventType: string, callback: WebSocketEventHandler) => void;
}

/**
 * WebSocket health statistics (mirror of backend ConnectionStats)
 */
export interface WebSocketHealthStats {
  totalConnections: number;
  activeUsers: number;
  uptime: number;
  reconnectionCount: number;
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number;
  connectionsPerUser: { [userId: string]: number };
}

export interface WebSocketHealthResponse {
  success: boolean;
  status: "healthy" | "idle" | "offline";
  stats: WebSocketHealthStats;
}
