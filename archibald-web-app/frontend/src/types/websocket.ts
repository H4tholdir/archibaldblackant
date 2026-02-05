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
