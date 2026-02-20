import { createServer, type Server as HTTPServer } from 'http';
import { describe, expect, test, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createWebSocketServer,
  type WebSocketServerModule,
  type WebSocketMessage,
} from './websocket-server';

const VALID_TOKEN = 'test-valid-token';
const NO_MESSAGE_TIMEOUT_MS = 100;

type TestUserId = string;

function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  timestamp?: string,
): WebSocketMessage {
  return {
    type,
    payload,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

function waitForMessage(ws: WebSocket): Promise<WebSocketMessage> {
  return new Promise((resolve) => {
    ws.once('message', (data: Buffer | string) => {
      const msg = typeof data === 'string' ? data : data.toString();
      resolve(JSON.parse(msg) as WebSocketMessage);
    });
  });
}

function waitForNMessages(ws: WebSocket, count: number): Promise<WebSocketMessage[]> {
  return new Promise((resolve) => {
    const messages: WebSocketMessage[] = [];
    function onMessage(data: Buffer | string) {
      const msg = typeof data === 'string' ? data : data.toString();
      messages.push(JSON.parse(msg) as WebSocketMessage);
      if (messages.length >= count) {
        ws.off('message', onMessage);
        resolve(messages);
      }
    }
    ws.on('message', onMessage);
  });
}

function expectNoMessage(ws: WebSocket): Promise<'no-message'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      resolve('no-message');
    }, NO_MESSAGE_TIMEOUT_MS);

    function onMsg() {
      clearTimeout(timer);
      ws.off('message', onMsg);
      reject(new Error('Unexpected message received'));
    }

    ws.on('message', onMsg);
  });
}

describe('WebSocket integration', () => {
  let httpServer: HTTPServer;
  let wsServer: WebSocketServerModule;
  let serverPort: number;
  const activeClients: WebSocket[] = [];

  const verifyTokenMock = vi.fn(async (token: string) => {
    if (token === VALID_TOKEN || token.startsWith('token-for-')) {
      const userId = token === VALID_TOKEN ? 'user-1' : token.replace('token-for-', '');
      return { userId };
    }
    return null;
  });

  function connectClient(
    userId: TestUserId,
    options?: { lastEventTs?: string },
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const token = userId === 'user-1' ? VALID_TOKEN : `token-for-${userId}`;
      let url = `ws://127.0.0.1:${serverPort}?token=${token}`;
      if (options?.lastEventTs) {
        url += `&lastEventTs=${encodeURIComponent(options.lastEventTs)}`;
      }

      const ws = new WebSocket(url);
      activeClients.push(ws);

      ws.on('open', () => resolve(ws));
      ws.on('error', (err) => reject(err));
    });
  }

  beforeAll(async () => {
    httpServer = createServer();
    wsServer = createWebSocketServer({
      createWss: (server: HTTPServer) => new WebSocketServer({ server }),
      verifyToken: verifyTokenMock,
    });
    wsServer.initialize(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = httpServer.address();
    serverPort = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterEach(() => {
    for (const ws of activeClients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    }
    activeClients.length = 0;
  });

  afterAll(async () => {
    await wsServer.shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('authenticated connection', () => {
    test('connects via ?token query param and calls verifyToken', async () => {
      const ws = await connectClient('user-1');

      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(verifyTokenMock).toHaveBeenCalledWith(VALID_TOKEN);
    });
  });

  describe('broadcast', () => {
    test('delivers message with correct shape to single user', async () => {
      const ws = await connectClient('user-1');
      const messagePromise = waitForMessage(ws);

      const event = makeEvent('JOB_COMPLETED', {
        jobId: 'j1',
        operationType: 'SUBMIT_ORDER',
      });
      wsServer.broadcast('user-1', event);

      const received = await messagePromise;

      expect(received).toEqual(event);
    });

    test('delivers all 4 processor event types', async () => {
      const userId = 'user-evt-types';
      const ws = await connectClient(userId);

      const eventTypes = ['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED', 'JOB_FAILED'] as const;

      for (const eventType of eventTypes) {
        const messagePromise = waitForMessage(ws);

        const event = makeEvent(eventType, {
          jobId: `job-${eventType}`,
          operationType: 'SUBMIT_ORDER',
        });
        wsServer.broadcast(userId, event);

        const received = await messagePromise;

        expect(received).toEqual({
          type: eventType,
          payload: { jobId: `job-${eventType}`, operationType: 'SUBMIT_ORDER' },
          timestamp: expect.any(String),
        });
      }
    });

    test('broadcast to non-existent user does not throw', () => {
      const event = makeEvent('JOB_COMPLETED', { jobId: 'j-orphan' });

      expect(() => wsServer.broadcast('non-existent-user', event)).not.toThrow();
    });
  });

  describe('broadcastToAll', () => {
    test('both connected clients receive the message', async () => {
      const ws1 = await connectClient('user-1');
      const ws2 = await connectClient('user-ba-2');

      const msg1Promise = waitForMessage(ws1);
      const msg2Promise = waitForMessage(ws2);

      const event = makeEvent('SYSTEM', { announcement: 'maintenance' });
      wsServer.broadcastToAll(event);

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);

      expect(msg1).toEqual(event);
      expect(msg2).toEqual(event);
    });
  });
});
