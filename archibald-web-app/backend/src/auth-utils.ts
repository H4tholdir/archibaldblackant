import * as jose from "jose";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import type { UserRole } from "./db/repositories/users";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production",
);
const JWT_ALGORITHM = "HS256";
const JWT_EXPIRY = "8h";

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  deviceId?: string;
  isImpersonating?: boolean;
  realAdminId?: string;
  adminSessionId?: number;
  modules: string[];
  modules_version: number;
  jti: string;
  exp?: number;
}

export async function generateJWT(payload: Omit<JWTPayload, 'jti'>): Promise<string> {
  const jti = randomUUID();
  const jwt = await new jose.SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
  return jwt;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: (payload.role as UserRole) || "agent",
      deviceId: payload.deviceId as string | undefined,
      isImpersonating: payload.isImpersonating as boolean | undefined,
      realAdminId: payload.realAdminId as string | undefined,
      adminSessionId: payload.adminSessionId as number | undefined,
      modules: (payload.modules as string[]) || [],
      modules_version: (payload.modules_version as number) ?? 0,
      jti: payload.jti as string,
      exp: payload.exp as number | undefined,
    };
  } catch (error) {
    logger.warn("JWT verification failed", { error });
    return null;
  }
}
