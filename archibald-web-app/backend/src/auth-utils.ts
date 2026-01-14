import * as jose from 'jose';
import { logger } from './logger';
import type { UserRole } from './user-db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-key-change-in-production'
);
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = '8h';

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
}

export async function generateJWT(payload: JWTPayload): Promise<string> {
  const jwt = await new jose.SignJWT({ ...payload })
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
      role: (payload.role as UserRole) || 'agent',
    };
  } catch (error) {
    logger.warn('JWT verification failed', { error });
    return null;
  }
}
