import type { Server as HTTPServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { URL } from "url";
import { verifyJWT } from "./auth-utils";
import { logger } from "./logger";
import type { WebSocketMessage, ConnectionStats } from "./types";

/**
 * WebSocket server dedicato per real-time draft/pending operations.
 * Implementa JWT authentication durante handshake e gestione connection pool per-user.
 */
type BufferedEvent = {
  event: WebSocketMessage;
  timestamp: number;
};

const EVENT_BUFFER_MAX_SIZE = 200;
const EVENT_BUFFER_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const TRANSIENT_EVENT_TYPES = new Set([
  "JOB_PROGRESS",
  "CUSTOMER_UPDATE_PROGRESS",
]);

export class WebSocketServerService {
  private static instance: WebSocketServerService;
  private wss: WebSocketServer | null = null;
  private connectionPool: Map<string, Set<WebSocket>> = new Map();
  private eventBuffer: Map<string, BufferedEvent[]> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private initTimestamp: number = 0;
  private metrics = {
    reconnectionCount: 0,
    messagesSent: 0,
    messagesReceived: 0,
    latencySamples: [] as number[],
  };

  private constructor() {}

  public static getInstance(): WebSocketServerService {
    if (!WebSocketServerService.instance) {
      WebSocketServerService.instance = new WebSocketServerService();
    }
    return WebSocketServerService.instance;
  }

  /**
   * Initialize WebSocket server on dedicated path /ws/realtime
   */
  public initialize(httpServer: HTTPServer): void {
    this.initTimestamp = Date.now();
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/ws/realtime",
    });

    this.wss.on(
      "connection",
      async (ws: WebSocket, request: IncomingMessage) => {
        try {
          const userId = await this.authenticateConnection(ws, request);

          if (!userId) {
            ws.close(1008, "Authentication failed");
            return;
          }

          this.registerConnection(userId, ws);
          logger.info("WebSocket client authenticated", { userId });

          // Replay buffered events if client provides lastEventTs
          if (request.url) {
            const connUrl = new URL(
              request.url,
              `http://${request.headers.host}`,
            );
            const lastEventTs = connUrl.searchParams.get("lastEventTs");
            if (lastEventTs) {
              this.replayEvents(userId, ws, lastEventTs);
            }
          }

          ws.on("close", () => {
            this.unregisterConnection(userId, ws);
            logger.info("WebSocket client disconnected", { userId });
          });

          ws.on("error", (error) => {
            logger.error("WebSocket client error", { userId, error });
            this.unregisterConnection(userId, ws);
          });

          // Handle client messages (heartbeat + tracking)
          ws.on("message", (data: Buffer | string) => {
            this.metrics.messagesReceived++;
            const msg = typeof data === "string" ? data : data.toString();
            if (msg === "ping") {
              if (ws.readyState === ws.OPEN) {
                ws.send("pong");
              }
            }
          });

          // Ping/pong heartbeat with latency tracking
          (ws as any).isAlive = true;
          (ws as any).pingTime = 0;
          ws.on("pong", () => {
            (ws as any).isAlive = true;
            const latency = Date.now() - (ws as any).pingTime;
            if (latency > 0 && latency < 10000) {
              // Valid latency sample
              this.metrics.latencySamples.push(latency);
              // Keep only last 100 samples
              if (this.metrics.latencySamples.length > 100) {
                this.metrics.latencySamples.shift();
              }
            }
          });
        } catch (error) {
          logger.error("WebSocket connection error", { error });
          ws.close(1011, "Internal server error");
        }
      },
    );

    // Start ping/pong heartbeat every 30 seconds + purge stale buffered events
    this.pingInterval = setInterval(() => {
      if (!this.wss) return;

      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          return ws.terminate();
        }
        (ws as any).isAlive = false;
        (ws as any).pingTime = Date.now();
        ws.ping();
      });

      this.purgeStaleEvents();
    }, 30000);

    logger.info("WebSocket server initialized on /ws/realtime");
  }

  /**
   * Authenticate WebSocket connection via JWT token from query param or header
   */
  private async authenticateConnection(
    ws: WebSocket,
    request: IncomingMessage,
  ): Promise<string | null> {
    try {
      // Try query param first: ?token=xxx
      let token: string | null = null;

      if (request.url) {
        const url = new URL(request.url, `http://${request.headers.host}`);
        token = url.searchParams.get("token");
      }

      // Fallback to Authorization header
      if (!token && request.headers.authorization) {
        const authHeader = request.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.split(" ")[1];
        }
      }

      if (!token) {
        logger.warn("WebSocket connection attempt without token");
        return null;
      }

      const payload = await verifyJWT(token);

      if (!payload || !payload.userId) {
        logger.warn("WebSocket connection with invalid JWT");
        return null;
      }

      return payload.userId;
    } catch (error) {
      logger.error("WebSocket authentication error", { error });
      return null;
    }
  }

  /**
   * Register a WebSocket connection for a user
   */
  private registerConnection(userId: string, ws: WebSocket): void {
    if (!this.connectionPool.has(userId)) {
      this.connectionPool.set(userId, new Set());
    } else {
      // User reconnecting - increment counter
      this.metrics.reconnectionCount++;
    }
    this.connectionPool.get(userId)!.add(ws);
  }

  /**
   * Unregister a WebSocket connection for a user
   */
  private unregisterConnection(userId: string, ws: WebSocket): void {
    const userConnections = this.connectionPool.get(userId);
    if (userConnections) {
      userConnections.delete(ws);
      if (userConnections.size === 0) {
        this.connectionPool.delete(userId);
      }
    }
  }

  /**
   * Buffer an event for replay on reconnection.
   * Transient events (JOB_PROGRESS, CUSTOMER_UPDATE_PROGRESS) are excluded.
   */
  private bufferEvent(userId: string, event: WebSocketMessage): void {
    if (TRANSIENT_EVENT_TYPES.has(event.type)) return;

    if (!this.eventBuffer.has(userId)) {
      this.eventBuffer.set(userId, []);
    }

    const buffer = this.eventBuffer.get(userId)!;
    buffer.push({ event, timestamp: Date.now() });

    if (buffer.length > EVENT_BUFFER_MAX_SIZE) {
      buffer.splice(0, buffer.length - EVENT_BUFFER_MAX_SIZE);
    }
  }

  /**
   * Purge stale events from all user buffers (older than EVENT_BUFFER_MAX_AGE_MS)
   */
  private purgeStaleEvents(): void {
    const cutoff = Date.now() - EVENT_BUFFER_MAX_AGE_MS;

    for (const [userId, buffer] of this.eventBuffer) {
      const firstValidIndex = buffer.findIndex((e) => e.timestamp > cutoff);
      if (firstValidIndex === -1) {
        this.eventBuffer.delete(userId);
      } else if (firstValidIndex > 0) {
        buffer.splice(0, firstValidIndex);
      }
    }
  }

  /**
   * Replay buffered events to a client that reconnected with lastEventTs
   */
  private replayEvents(
    userId: string,
    ws: WebSocket,
    lastEventTs: string,
  ): void {
    const buffer = this.eventBuffer.get(userId);
    if (!buffer || buffer.length === 0) return;

    const lastTs = new Date(lastEventTs).getTime();
    if (isNaN(lastTs)) return;

    const eventsToReplay = buffer.filter(
      (e) => new Date(e.event.timestamp).getTime() > lastTs,
    );

    if (eventsToReplay.length === 0) return;

    logger.info("Replaying buffered events on reconnect", {
      userId,
      count: eventsToReplay.length,
      lastEventTs,
    });

    for (const { event } of eventsToReplay) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
        this.metrics.messagesSent++;
      }
    }
  }

  /**
   * Broadcast event to all connections of a specific user (multi-device sync)
   */
  public broadcast(userId: string, event: WebSocketMessage): void {
    this.bufferEvent(userId, event);

    const userConnections = this.connectionPool.get(userId);

    if (!userConnections || userConnections.size === 0) {
      return;
    }

    const message = JSON.stringify(event);
    let sentCount = 0;

    userConnections.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });

    this.metrics.messagesSent += sentCount;

    logger.debug("Broadcast to user", {
      userId,
      eventType: event.type,
      connections: userConnections.size,
    });
  }

  /**
   * Broadcast event to all connected users (admin features)
   */
  public broadcastToAll(event: WebSocketMessage): void {
    if (!this.wss) return;

    const message = JSON.stringify(event);
    let sentCount = 0;

    this.wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });

    this.metrics.messagesSent += sentCount;

    logger.debug("Broadcast to all users", {
      eventType: event.type,
      connections: sentCount,
    });
  }

  /**
   * Get connection statistics for monitoring
   */
  public getStats(): ConnectionStats {
    const totalConnections = this.wss?.clients.size || 0;
    const activeUsers = this.connectionPool.size;
    const uptime = this.initTimestamp > 0 ? Date.now() - this.initTimestamp : 0;

    // Calculate average latency from samples
    const averageLatency =
      this.metrics.latencySamples.length > 0
        ? this.metrics.latencySamples.reduce((sum, val) => sum + val, 0) /
          this.metrics.latencySamples.length
        : 0;

    // Build connectionsPerUser map
    const connectionsPerUser: { [userId: string]: number } = {};
    this.connectionPool.forEach((connections, userId) => {
      connectionsPerUser[userId] = connections.size;
    });

    return {
      totalConnections,
      activeUsers,
      uptime,
      reconnectionCount: this.metrics.reconnectionCount,
      messagesSent: this.metrics.messagesSent,
      messagesReceived: this.metrics.messagesReceived,
      averageLatency: Math.round(averageLatency * 100) / 100, // round to 2 decimals
      connectionsPerUser,
    };
  }

  /**
   * Graceful shutdown - close all connections
   */
  public async shutdown(): Promise<void> {
    logger.info("Shutting down WebSocket server...");

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (!this.wss) return;

    // Close all client connections gracefully
    const closePromises: Promise<void>[] = [];

    this.wss.clients.forEach((ws) => {
      closePromises.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
            ws.close(1000, "Server shutdown");
            ws.once("close", () => resolve());
            // Timeout fallback
            setTimeout(() => resolve(), 5000);
          } else {
            resolve();
          }
        }),
      );
    });

    await Promise.all(closePromises);

    // Close the server
    await new Promise<void>((resolve, reject) => {
      this.wss?.close((error) => {
        if (error) {
          logger.error("Error closing WebSocket server", { error });
          reject(error);
        } else {
          logger.info("WebSocket server closed");
          resolve();
        }
      });
    });

    this.connectionPool.clear();
    this.wss = null;
  }
}
