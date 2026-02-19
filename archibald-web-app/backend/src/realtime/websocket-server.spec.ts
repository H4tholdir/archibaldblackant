import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  createWebSocketServer,
  type WebSocketServerModule,
  type WebSocketMessage,
} from './websocket-server';

function createMockWss() {
  const clients = new Set<any>();
  return {
    on: vi.fn(),
    clients,
    close: vi.fn((cb: (err?: Error) => void) => cb()),
  };
}

function createMockWs(readyState = 1) {
  return {
    readyState,
    OPEN: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
  };
}

describe('createWebSocketServer', () => {
  let wsServer: WebSocketServerModule;
  let mockWss: ReturnType<typeof createMockWss>;

  beforeEach(() => {
    mockWss = createMockWss();
    wsServer = createWebSocketServer({
      createWss: () => mockWss as any,
      verifyToken: vi.fn().mockResolvedValue({ userId: 'user-1', username: 'agent1', role: 'agent' }),
    });
  });

  afterEach(async () => {
    await wsServer.shutdown();
  });

  describe('initialize', () => {
    test('sets up WebSocket server with connection handler', () => {
      wsServer.initialize({} as any);

      expect(mockWss.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('broadcast', () => {
    test('sends message to all connections of a user', () => {
      wsServer.initialize({} as any);

      const ws = createMockWs();
      wsServer.registerConnection('user-1', ws as any);

      const event: WebSocketMessage = {
        type: 'PENDING_CREATED',
        payload: { test: true },
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcast('user-1', event);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event));
    });

    test('does not send to users without connections', () => {
      wsServer.initialize({} as any);

      const event: WebSocketMessage = {
        type: 'PENDING_CREATED',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      // Should not throw
      wsServer.broadcast('unknown-user', event);
    });

    test('sends to multiple connections of same user', () => {
      wsServer.initialize({} as any);

      const ws1 = createMockWs();
      const ws2 = createMockWs();
      wsServer.registerConnection('user-1', ws1 as any);
      wsServer.registerConnection('user-1', ws2 as any);

      const event: WebSocketMessage = {
        type: 'TEST',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcast('user-1', event);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    test('skips closed connections', () => {
      wsServer.initialize({} as any);

      const ws = createMockWs(3); // CLOSED
      wsServer.registerConnection('user-1', ws as any);

      const event: WebSocketMessage = {
        type: 'TEST',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcast('user-1', event);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('event buffering', () => {
    test('buffers non-transient events', () => {
      wsServer.initialize({} as any);

      const event: WebSocketMessage = {
        type: 'PENDING_CREATED',
        payload: { id: 'p1' },
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcast('user-1', event);

      const ws = createMockWs();
      wsServer.registerConnection('user-1', ws as any);

      const lastEventTs = new Date(Date.now() - 60000).toISOString();
      wsServer.replayEvents('user-1', ws as any, lastEventTs);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event));
    });

    test('does not buffer transient events (JOB_PROGRESS)', () => {
      wsServer.initialize({} as any);

      const event: WebSocketMessage = {
        type: 'JOB_PROGRESS',
        payload: { progress: 50 },
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcast('user-1', event);

      const ws = createMockWs();
      wsServer.registerConnection('user-1', ws as any);

      const lastEventTs = new Date(Date.now() - 60000).toISOString();
      wsServer.replayEvents('user-1', ws as any, lastEventTs);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('unregisterConnection', () => {
    test('removes connection from pool', () => {
      wsServer.initialize({} as any);

      const ws = createMockWs();
      wsServer.registerConnection('user-1', ws as any);
      wsServer.unregisterConnection('user-1', ws as any);

      const event: WebSocketMessage = {
        type: 'TEST',
        payload: {},
        timestamp: new Date().toISOString(),
      };
      wsServer.broadcast('user-1', event);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    test('returns connection statistics', () => {
      wsServer.initialize({} as any);

      const ws = createMockWs();
      wsServer.registerConnection('user-1', ws as any);

      const stats = wsServer.getStats();

      expect(stats.activeUsers).toBe(1);
      expect(stats.connectionsPerUser['user-1']).toBe(1);
    });
  });

  describe('broadcastToAll', () => {
    test('sends to all registered users', () => {
      wsServer.initialize({} as any);

      const ws1 = createMockWs();
      const ws2 = createMockWs();
      wsServer.registerConnection('user-1', ws1 as any);
      wsServer.registerConnection('user-2', ws2 as any);

      const event: WebSocketMessage = {
        type: 'SYSTEM',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      wsServer.broadcastToAll(event);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });
  });
});
