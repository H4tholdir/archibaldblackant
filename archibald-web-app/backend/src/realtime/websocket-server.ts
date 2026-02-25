import type { Server as HTTPServer } from 'http';
import type { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../logger';

type WebSocketMessage = {
  type: string;
  payload: unknown;
  timestamp: string;
};

type ConnectionStats = {
  totalConnections: number;
  activeUsers: number;
  uptime: number;
  reconnectionCount: number;
  messagesSent: number;
  messagesReceived: number;
  averageLatency: number;
  connectionsPerUser: Record<string, number>;
};

type BufferedEvent = {
  event: WebSocketMessage;
  timestamp: number;
};

type VerifyTokenFn = (token: string) => Promise<{ userId: string } | null>;

type WebSocketServerDeps = {
  createWss: (httpServer: HTTPServer) => WebSocketServer;
  verifyToken: VerifyTokenFn;
};

type WebSocketServerModule = {
  initialize: (httpServer: HTTPServer) => void;
  broadcast: (userId: string, event: WebSocketMessage) => void;
  broadcastToAll: (event: WebSocketMessage) => void;
  replayEvents: (userId: string, ws: WebSocket, lastEventTs: string) => void;
  registerConnection: (userId: string, ws: WebSocket) => void;
  unregisterConnection: (userId: string, ws: WebSocket) => void;
  getStats: () => ConnectionStats;
  shutdown: () => Promise<void>;
};

const EVENT_BUFFER_MAX_SIZE = 200;
const EVENT_BUFFER_MAX_AGE_MS = 5 * 60 * 1000;
const TRANSIENT_EVENT_TYPES = new Set(['JOB_PROGRESS', 'CUSTOMER_UPDATE_PROGRESS']);
const HEARTBEAT_INTERVAL_MS = 30000;

function createWebSocketServer(deps: WebSocketServerDeps): WebSocketServerModule {
  const { verifyToken } = deps;

  const connectionPool = new Map<string, Set<WebSocket>>();
  const eventBuffer = new Map<string, BufferedEvent[]>();
  let pingInterval: NodeJS.Timeout | null = null;
  let initTimestamp = 0;
  let wss: WebSocketServer | null = null;
  const metrics = {
    reconnectionCount: 0,
    messagesSent: 0,
    messagesReceived: 0,
    latencySamples: [] as number[],
  };

  function bufferEvent(userId: string, event: WebSocketMessage): void {
    if (TRANSIENT_EVENT_TYPES.has(event.type)) return;

    if (!eventBuffer.has(userId)) {
      eventBuffer.set(userId, []);
    }

    const buffer = eventBuffer.get(userId)!;
    buffer.push({ event, timestamp: Date.now() });

    if (buffer.length > EVENT_BUFFER_MAX_SIZE) {
      buffer.splice(0, buffer.length - EVENT_BUFFER_MAX_SIZE);
    }
  }

  function purgeStaleEvents(): void {
    const cutoff = Date.now() - EVENT_BUFFER_MAX_AGE_MS;
    for (const [userId, buffer] of eventBuffer) {
      const firstValidIndex = buffer.findIndex((e) => e.timestamp > cutoff);
      if (firstValidIndex === -1) {
        eventBuffer.delete(userId);
      } else if (firstValidIndex > 0) {
        buffer.splice(0, firstValidIndex);
      }
    }
  }

  function registerConnection(userId: string, ws: WebSocket): void {
    if (!connectionPool.has(userId)) {
      connectionPool.set(userId, new Set());
    } else {
      metrics.reconnectionCount++;
    }
    connectionPool.get(userId)!.add(ws);
  }

  function unregisterConnection(userId: string, ws: WebSocket): void {
    const userConnections = connectionPool.get(userId);
    if (userConnections) {
      userConnections.delete(ws);
      if (userConnections.size === 0) {
        connectionPool.delete(userId);
      }
    }
  }

  function broadcast(userId: string, event: WebSocketMessage): void {
    bufferEvent(userId, event);

    const userConnections = connectionPool.get(userId);
    if (!userConnections || userConnections.size === 0) return;

    const message = JSON.stringify(event);
    let sentCount = 0;

    userConnections.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });

    metrics.messagesSent += sentCount;
  }

  function broadcastToAll(event: WebSocketMessage): void {
    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const [, connections] of connectionPool) {
      connections.forEach((ws) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(message);
          sentCount++;
        }
      });
    }

    metrics.messagesSent += sentCount;
  }

  function replayEvents(userId: string, ws: WebSocket, lastEventTs: string): void {
    const buffer = eventBuffer.get(userId);
    if (!buffer || buffer.length === 0) return;

    const lastTs = new Date(lastEventTs).getTime();
    if (isNaN(lastTs)) return;

    const eventsToReplay = buffer.filter(
      (e) => new Date(e.event.timestamp).getTime() > lastTs,
    );

    if (eventsToReplay.length === 0) return;

    for (const { event } of eventsToReplay) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
        metrics.messagesSent++;
      }
    }
  }

  function initialize(httpServer: HTTPServer): void {
    initTimestamp = Date.now();
    wss = deps.createWss(httpServer);

    wss.on('connection', async (ws: WebSocket, request: any) => {
      try {
        let token: string | null = null;
        if (request.url) {
          const url = new URL(request.url, `http://${request.headers.host}`);
          token = url.searchParams.get('token');
        }
        if (!token && request.headers.authorization) {
          const auth = request.headers.authorization;
          if (auth.startsWith('Bearer ')) token = auth.split(' ')[1];
        }

        if (!token) {
          ws.close(1008, 'Authentication failed');
          return;
        }

        const payload = await verifyToken(token);
        if (!payload) {
          ws.close(1008, 'Authentication failed');
          return;
        }

        const userId = payload.userId;
        registerConnection(userId, ws);

        if (request.url) {
          const connUrl = new URL(request.url, `http://${request.headers.host}`);
          const lastEventTs = connUrl.searchParams.get('lastEventTs');
          if (lastEventTs) replayEvents(userId, ws, lastEventTs);
        }

        ws.on('close', () => unregisterConnection(userId, ws));
        ws.on('error', () => unregisterConnection(userId, ws));

        ws.on('message', (data: Buffer | string) => {
          metrics.messagesReceived++;
          const msg = typeof data === 'string' ? data : data.toString();
          if (msg === 'ping' && ws.readyState === ws.OPEN) {
            ws.send('pong');
          }
        });

        (ws as any).isAlive = true;
        ws.on('pong', () => { (ws as any).isAlive = true; });
      } catch (error) {
        logger.error('WebSocket connection error', { error });
        ws.close(1011, 'Internal server error');
      }
    });

    pingInterval = setInterval(() => {
      if (!wss) return;
      wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          return ws.terminate();
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
      purgeStaleEvents();
    }, HEARTBEAT_INTERVAL_MS);
  }

  function getStats(): ConnectionStats {
    const totalConnections = wss?.clients.size || 0;
    const activeUsers = connectionPool.size;
    const uptime = initTimestamp > 0 ? Date.now() - initTimestamp : 0;

    const averageLatency =
      metrics.latencySamples.length > 0
        ? metrics.latencySamples.reduce((sum, val) => sum + val, 0) / metrics.latencySamples.length
        : 0;

    const connectionsPerUser: Record<string, number> = {};
    connectionPool.forEach((connections, userId) => {
      connectionsPerUser[userId] = connections.size;
    });

    return {
      totalConnections,
      activeUsers,
      uptime,
      reconnectionCount: metrics.reconnectionCount,
      messagesSent: metrics.messagesSent,
      messagesReceived: metrics.messagesReceived,
      averageLatency: Math.round(averageLatency * 100) / 100,
      connectionsPerUser,
    };
  }

  async function shutdown(): Promise<void> {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (!wss) return;

    const closePromises: Promise<void>[] = [];
    wss.clients.forEach((ws) => {
      closePromises.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
            ws.close(1000, 'Server shutdown');
            ws.once('close', () => resolve());
            setTimeout(() => resolve(), 5000);
          } else {
            resolve();
          }
        }),
      );
    });

    await Promise.all(closePromises);

    await new Promise<void>((resolve) => {
      wss?.close(() => resolve());
    });

    connectionPool.clear();
    eventBuffer.clear();
    wss = null;
  }

  return {
    initialize,
    broadcast,
    broadcastToAll,
    replayEvents,
    registerConnection,
    unregisterConnection,
    getStats,
    shutdown,
  };
}

export {
  createWebSocketServer,
  type WebSocketServerModule,
  type WebSocketMessage,
  type ConnectionStats,
  type WebSocketServerDeps,
};
