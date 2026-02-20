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

  function connectClientCollectingMessages(
    userId: TestUserId,
    expectedCount: number,
    options?: { lastEventTs?: string },
  ): Promise<{ ws: WebSocket; messages: WebSocketMessage[] }> {
    return new Promise((resolve, reject) => {
      const token = userId === 'user-1' ? VALID_TOKEN : `token-for-${userId}`;
      let url = `ws://127.0.0.1:${serverPort}?token=${token}`;
      if (options?.lastEventTs) {
        url += `&lastEventTs=${encodeURIComponent(options.lastEventTs)}`;
      }

      const ws = new WebSocket(url);
      activeClients.push(ws);
      const messages: WebSocketMessage[] = [];

      ws.on('message', (data: Buffer | string) => {
        const msg = typeof data === 'string' ? data : data.toString();
        messages.push(JSON.parse(msg) as WebSocketMessage);
        if (messages.length >= expectedCount) {
          ws.removeAllListeners('message');
          resolve({ ws, messages });
        }
      });

      ws.on('error', (err) => reject(err));

      setTimeout(() => {
        ws.removeAllListeners('message');
        resolve({ ws, messages });
      }, 500);
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

  describe('event replay on reconnect', () => {
    test('replays only events after lastEventTs', async () => {
      const userId = 'user-replay';
      const ws1 = await connectClient(userId);

      const firstTimestamp = new Date(Date.now() - 3000).toISOString();
      const secondTimestamp = new Date(Date.now() - 2000).toISOString();
      const thirdTimestamp = new Date(Date.now() - 1000).toISOString();

      const event1 = makeEvent('JOB_STARTED', { jobId: 'r1' }, firstTimestamp);
      const event2 = makeEvent('JOB_COMPLETED', { jobId: 'r2' }, secondTimestamp);
      const event3 = makeEvent('JOB_COMPLETED', { jobId: 'r3' }, thirdTimestamp);

      const receivedPromise = waitForNMessages(ws1, 3);
      wsServer.broadcast(userId, event1);
      wsServer.broadcast(userId, event2);
      wsServer.broadcast(userId, event3);
      await receivedPromise;

      ws1.terminate();
      await new Promise((r) => setTimeout(r, 50));

      const ws2 = await connectClientCollectingMessages(
        userId,
        2,
        { lastEventTs: firstTimestamp },
      );

      expect(ws2.messages).toEqual([event2, event3]);
    });
  });

  describe('transient event filtering', () => {
    test('JOB_PROGRESS is not replayed but JOB_COMPLETED is', async () => {
      const userId = 'user-transient';
      const ws1 = await connectClient(userId);

      const progressTimestamp = new Date(Date.now() - 2000).toISOString();
      const completedTimestamp = new Date(Date.now() - 1000).toISOString();

      const progressEvent = makeEvent('JOB_PROGRESS', { progress: 50 }, progressTimestamp);
      const completedEvent = makeEvent('JOB_COMPLETED', { jobId: 'tc1' }, completedTimestamp);

      const receivedPromise = waitForNMessages(ws1, 2);
      wsServer.broadcast(userId, progressEvent);
      wsServer.broadcast(userId, completedEvent);
      await receivedPromise;

      ws1.terminate();
      await new Promise((r) => setTimeout(r, 50));

      const beforeAllEvents = new Date(Date.now() - 5000).toISOString();
      const ws2 = await connectClientCollectingMessages(
        userId,
        1,
        { lastEventTs: beforeAllEvents },
      );

      expect(ws2.messages).toEqual([completedEvent]);
    });
  });

  describe('multi-user broadcast isolation', () => {
    test('event to user-1 is not received by user-2', async () => {
      const ws1 = await connectClient('user-1');
      const wsOther = await connectClient('user-iso-2');

      const messagePromise = waitForMessage(ws1);
      const noMessagePromise = expectNoMessage(wsOther);

      const event = makeEvent('JOB_COMPLETED', { jobId: 'iso-1' });
      wsServer.broadcast('user-1', event);

      const received = await messagePromise;
      const sentinel = await noMessagePromise;

      expect(received).toEqual(event);
      expect(sentinel).toBe('no-message');
    });
  });

  describe('multiple clients same user', () => {
    test('both clients receive the broadcast', async () => {
      const userId = 'user-multi';
      const ws1 = await connectClient(userId);
      const ws2 = await connectClient(userId);

      const msg1Promise = waitForMessage(ws1);
      const msg2Promise = waitForMessage(ws2);

      const event = makeEvent('JOB_STARTED', { jobId: 'multi-1' });
      wsServer.broadcast(userId, event);

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);

      expect(msg1).toEqual(event);
      expect(msg2).toEqual(event);
    });
  });
});
