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
export class WebSocketServerService {
  private static instance: WebSocketServerService;
  private wss: WebSocketServer | null = null;
  private connectionPool: Map<string, Set<WebSocket>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

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

          ws.on("close", () => {
            this.unregisterConnection(userId, ws);
            logger.info("WebSocket client disconnected", { userId });
          });

          ws.on("error", (error) => {
            logger.error("WebSocket client error", { userId, error });
            this.unregisterConnection(userId, ws);
          });

          // Ping/pong heartbeat
          (ws as any).isAlive = true;
          ws.on("pong", () => {
            (ws as any).isAlive = true;
          });
        } catch (error) {
          logger.error("WebSocket connection error", { error });
          ws.close(1011, "Internal server error");
        }
      },
    );

    // Start ping/pong heartbeat every 30 seconds
    this.pingInterval = setInterval(() => {
      if (!this.wss) return;

      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          return ws.terminate();
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
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
   * Broadcast event to all connections of a specific user (multi-device sync)
   */
  public broadcast(userId: string, event: WebSocketMessage): void {
    const userConnections = this.connectionPool.get(userId);

    if (!userConnections || userConnections.size === 0) {
      return;
    }

    const message = JSON.stringify(event);

    userConnections.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    });

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

    return {
      totalConnections,
      activeUsers,
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
