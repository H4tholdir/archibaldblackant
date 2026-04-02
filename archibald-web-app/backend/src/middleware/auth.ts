import type { Request, Response, NextFunction } from "express";
import { verifyJWT } from "../auth-utils";
import { logger } from "../logger";
import type { UserRole } from "../db/repositories/users";
import type { DbPool } from "../db/pool";
import { updateLastActivity } from "../db/repositories/users";
import type { RedisClient } from "../db/redis-client";
import { isTokenRevoked } from "../db/redis-client";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: UserRole;
    deviceId?: string;
    isImpersonating?: boolean;
    realAdminId?: string;
    adminSessionId?: number;
    modules: string[];
    jti: string;
  };
}

export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token non fornito" });
  }

  const token = authHeader.split(" ")[1];
  const payload = await verifyJWT(token);

  if (!payload) {
    return res.status(401).json({ error: "Token non valido o scaduto" });
  }

  req.user = payload;
  next();
}

/**
 * Middleware to check if user has admin role
 */
export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "admin") {
    logger.warn("Non-admin user attempted to access admin endpoint", {
      userId: req.user.userId,
      username: req.user.username,
      role: req.user.role,
    });
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

function createAuthMiddleware(pool: DbPool, redis?: RedisClient) {
  return async function authenticateJWTWithActivity(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token non fornito" });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token);

    if (!payload) {
      return res.status(401).json({ error: "Token non valido o scaduto" });
    }

    if (payload && redis && payload.jti) {
      const revoked = await isTokenRevoked(redis, payload.jti);
      if (revoked) {
        return res.status(401).json({ error: "Token revocato" });
      }
    }

    req.user = payload;

    updateLastActivity(pool, payload.userId).catch(() => {});

    next();
  };
}

export { createAuthMiddleware };
