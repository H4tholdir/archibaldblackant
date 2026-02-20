import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import { authenticateJWT } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import type { User, UserRole } from '../db/repositories/users';
import type { JWTPayload } from '../auth-utils';
import { logger } from '../logger';

type PasswordCacheLike = {
  get: (userId: string) => string | null;
  set: (userId: string, password: string) => void;
  clear: (userId: string) => void;
};

type BrowserPoolLike = {
  acquireContext: (userId: string) => Promise<unknown>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type AuthRouterDeps = {
  pool: DbPool;
  getUserByUsername: (username: string) => Promise<User | null>;
  getUserById: (userId: string) => Promise<User | null>;
  updateLastLogin: (userId: string) => Promise<void>;
  passwordCache: PasswordCacheLike;
  browserPool: BrowserPoolLike;
  generateJWT: (payload: JWTPayload) => Promise<string>;
  encryptAndSavePassword?: (userId: string, password: string) => Promise<void>;
};

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
  deviceName: z.string().optional(),
});

function createAuthRouter(deps: AuthRouterDeps) {
  const { getUserByUsername, getUserById, updateLastLogin, passwordCache, browserPool, generateJWT, encryptAndSavePassword } = deps;
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Formato richiesta non valido' });
      }

      const { username, password, deviceId } = parsed.data;

      const user = await getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Credenziali non valide o utente non autorizzato' });
      }

      if (!user.whitelisted) {
        return res.status(403).json({ success: false, error: 'Utente non autorizzato' });
      }

      const cachedPassword = passwordCache.get(user.id);
      const needsValidation = cachedPassword !== password;

      if (needsValidation) {
        try {
          passwordCache.set(user.id, password);
          const context = await browserPool.acquireContext(user.id);
          await browserPool.releaseContext(user.id, context, true);
        } catch {
          passwordCache.clear(user.id);
          return res.status(401).json({ success: false, error: 'Credenziali non valide' });
        }
      }

      passwordCache.set(user.id, password);

      if (encryptAndSavePassword) {
        encryptAndSavePassword(user.id, password).catch(() => {});
      }

      updateLastLogin(user.id).catch(() => {});

      const token = await generateJWT({
        userId: user.id,
        username: user.username,
        role: user.role as UserRole,
        deviceId: deviceId || undefined,
      });

      res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
      });
    } catch (error) {
      logger.error('Login error', { error });
      res.status(500).json({ success: false, error: 'Errore interno del server' });
    }
  });

  router.post('/refresh-credentials', authenticateJWT, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = z.object({ password: z.string().min(1, 'Password richiesta') }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Password richiesta' });
      }

      passwordCache.set(userId, parsed.data.password);
      res.json({ success: true, data: { message: 'Credenziali aggiornate' } });
    } catch (error) {
      logger.error('Error refreshing credentials', { error });
      res.status(500).json({ success: false, error: 'Errore interno del server' });
    }
  });

  router.post('/logout', authenticateJWT, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    passwordCache.clear(userId);
    res.json({ success: true, data: { message: 'Logout effettuato con successo' } });
  });

  router.post('/refresh', authenticateJWT, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const cachedPassword = passwordCache.get(user.userId);

      if (!cachedPassword) {
        return res.status(401).json({
          success: false,
          error: 'CREDENTIALS_EXPIRED',
          message: 'Sessione scaduta. Effettua nuovamente il login.',
        });
      }

      const newToken = await generateJWT({
        userId: user.userId,
        username: user.username,
        role: user.role as UserRole,
        deviceId: user.deviceId,
      });

      const userDetails = await getUserById(user.userId);

      res.json({
        success: true,
        token: newToken,
        user: {
          id: user.userId,
          username: user.username,
          fullName: userDetails?.fullName || user.username,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error('JWT refresh error', { error });
      res.status(500).json({ success: false, error: 'Errore durante il refresh del token' });
    }
  });

  router.get('/me', authenticateJWT, async (req: AuthRequest, res) => {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utente non trovato' });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          whitelisted: user.whitelisted,
          lastLoginAt: user.lastLoginAt,
        },
      },
    });
  });

  return router;
}

export { createAuthRouter, type AuthRouterDeps };
