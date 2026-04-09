import express, { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type { DbPool } from '../db/pool';
import { createAuthMiddleware } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import type { User, UserRole } from '../db/repositories/users';
import type { JWTPayload } from '../auth-utils';
import type { RedisClient } from '../db/redis-client';
import { logger } from '../logger';
import { audit } from '../db/repositories/audit-log';
import { generateTotpSecret, getTotpUri, verifyTotpCode, generateRecoveryCodes } from '../services/mfa-service';
import type { SecurityAlertEvent } from '../services/security-alert-service';

type PasswordCacheLike = {
  get: (userId: string) => string | null;
  set: (userId: string, password: string) => void;
  clear: (userId: string) => void;
};

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { forceLogin?: boolean }) => Promise<unknown>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type MfaEncryptedSecret = { ciphertext: string; iv: string; authTag: string };

type AuthRouterDeps = {
  pool: DbPool;
  redis?: RedisClient;
  getUserByUsername: (username: string) => Promise<User | null>;
  getUserById: (userId: string) => Promise<User | null>;
  updateLastLogin: (userId: string) => Promise<void>;
  passwordCache: PasswordCacheLike;
  browserPool: BrowserPoolLike;
  generateJWT: (payload: Omit<JWTPayload, 'jti'>) => Promise<string>;
  encryptAndSavePassword?: (userId: string, password: string) => Promise<void>;
  registerDevice?: (userId: string, deviceIdentifier: string, platform: string, deviceName: string) => Promise<unknown>;
  onLoginSuccess?: (userId: string) => void;
  revokeToken?: (jti: string, ttlSeconds: number) => Promise<void>;
  sendSecurityAlert?: (event: SecurityAlertEvent, details: Record<string, unknown>) => void;
  // MFA deps (optional — feature flag)
  getMfaSecret?: (userId: string) => Promise<MfaEncryptedSecret | null>;
  saveMfaSecret?: (userId: string, ciphertext: string, iv: string, authTag: string) => Promise<void>;
  enableMfa?: (userId: string) => Promise<void>;
  saveRecoveryCodes?: (userId: string, hashes: string[]) => Promise<void>;
  consumeRecoveryCode?: (userId: string, code: string) => Promise<boolean>;
  encryptSecret?: (plaintext: string) => Promise<MfaEncryptedSecret>;
  decryptSecret?: (ciphertext: string, iv: string, authTag: string) => Promise<string>;
  generateMfaToken?: (userId: string) => Promise<string>;
  verifyMfaToken?: (token: string) => Promise<{ userId: string } | null>;
  verifyTrustToken?: (userId: string, deviceId: string, rawToken: string) => Promise<boolean>;
  createTrustToken?: (userId: string, deviceId: string) => Promise<string>;
  revokeAllTrustDevices?: (userId: string) => Promise<void>;
};

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
  deviceName: z.string().optional(),
  trustToken: z.string().optional(),
});

function createAuthRouter(deps: AuthRouterDeps) {
  const { getUserByUsername, getUserById, updateLastLogin, passwordCache, browserPool, generateJWT, encryptAndSavePassword } = deps;
  const router = Router();
  const authenticateWithRevocation = createAuthMiddleware(deps.pool, deps.redis);

  function createMfaTokenMiddleware() {
    return async function authenticateWithMfaToken(
      req: AuthRequest,
      res: express.Response,
      next: express.NextFunction,
    ) {
      if (!deps.verifyMfaToken) {
        return res.status(501).json({ success: false, error: 'MFA not configured' });
      }
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Token non fornito' });
      }
      const token = authHeader.split(' ')[1];
      const payload = await deps.verifyMfaToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: 'MFA token non valido o scaduto' });
      }
      req.user = { userId: payload.userId, username: '', role: 'agent', modules: [], jti: '' };
      next();
    };
  }

  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' },
    keyGenerator: (req) => req.ip ?? 'unknown',
  });

  const refreshRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Limite refresh raggiunto. Riprova tra un'ora." },
  });

  const mfaVerifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Troppi tentativi MFA. Riprova tra 15 minuti.' },
    keyGenerator: (req) => req.ip ?? 'unknown',
  });

  const mfaSetupRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.ip ?? 'unknown',
    message: { success: false, error: 'Troppi tentativi di setup MFA. Riprova tra 15 minuti.' },
    legacyHeaders: false,
    standardHeaders: true,
  });

  router.post('/login', loginRateLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Formato richiesta non valido' });
      }

      const { username, password, deviceId } = parsed.data;

      const user = await getUserByUsername(username);
      if (!user) {
        void audit(deps.pool, {
          action: 'auth.login_failed',
          actorRole: 'unknown',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { username },
        });
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
          const context = await browserPool.acquireContext(user.id, { forceLogin: true });
          await browserPool.releaseContext(user.id, context, true);
        } catch {
          passwordCache.clear(user.id);
          void audit(deps.pool, {
            action: 'auth.login_failed',
            actorRole: 'unknown',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { username },
          });
          if (deps.sendSecurityAlert && (user.role === 'admin' || user.role === 'ufficio')) {
            deps.sendSecurityAlert('login_failed_admin', { username, ip: req.ip, reason: 'bad_password' });
          }
          return res.status(401).json({ success: false, error: 'Credenziali non valide' });
        }
      }

      passwordCache.set(user.id, password);

      if (encryptAndSavePassword) {
        encryptAndSavePassword(user.id, password).catch(() => {});
      }

      updateLastLogin(user.id).catch(() => {});

      if (deps.onLoginSuccess) {
        Promise.resolve(deps.onLoginSuccess(user.id)).catch(() => {});
      }

      if (user.mfaEnabled && parsed.data.trustToken && parsed.data.deviceId && deps.verifyTrustToken) {
        const trusted = await deps.verifyTrustToken(user.id, parsed.data.deviceId, parsed.data.trustToken);
        if (trusted) {
          const token = await generateJWT({
            userId: user.id,
            username: user.username,
            role: user.role as UserRole,
            deviceId: parsed.data.deviceId,
            modules: user.modules,
          });
          void audit(deps.pool, {
            actorId: user.id,
            actorRole: user.role,
            action: 'auth.login_success',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { via: 'device_trust' },
          });
          return res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
          });
        }
      }

      if (user.mfaEnabled) {
        if (!deps.generateMfaToken) {
          logger.warn('User has MFA enabled but generateMfaToken not configured — skipping MFA check', { userId: user.id });
        } else {
          const mfaToken = await deps.generateMfaToken(user.id);
          return res.json({ success: true, status: 'mfa_required', mfaToken });
        }
      }

      const token = await generateJWT({
        userId: user.id,
        username: user.username,
        role: user.role as UserRole,
        deviceId: deviceId || undefined,
        modules: user.modules,
      });

      const { platform, deviceName } = parsed.data;
      if (deps.registerDevice && deviceId) {
        deps.registerDevice(user.id, deviceId, platform || 'unknown', deviceName || 'Unknown Device')
          .catch((err) => logger.warn('Failed to register device', { userId: user.id, deviceId, error: err }));
      }

      void audit(deps.pool, {
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.login_success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
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

  router.post('/refresh-credentials', authenticateWithRevocation, async (req: AuthRequest, res) => {
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

  router.post('/logout', authenticateWithRevocation, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const jti = req.user!.jti;
    if (deps.revokeToken && jti) {
      const exp = (req.user as JWTPayload).exp;
      const remainingTtl = exp ? Math.max(1, exp - Math.floor(Date.now() / 1000)) : 8 * 60 * 60;
      await deps.revokeToken(jti, remainingTtl).catch(() => {});
    }
    if (deps.revokeAllTrustDevices) {
      await deps.revokeAllTrustDevices(userId).catch(() => {});
    }
    passwordCache.clear(userId);
    void audit(deps.pool, {
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'auth.logout',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, data: { message: 'Logout effettuato con successo' } });
  });

  router.post('/refresh', refreshRateLimiter, authenticateWithRevocation, async (req: AuthRequest, res) => {
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

      const oldJti = req.user!.jti;
      if (deps.revokeToken && oldJti) {
        const oldExp = (req.user as JWTPayload).exp;
        const remainingTtl = oldExp ? Math.max(1, oldExp - Math.floor(Date.now() / 1000)) : 8 * 60 * 60;
        await deps.revokeToken(oldJti, remainingTtl).catch(() => {});
      }

      const newToken = await generateJWT({
        userId: user.userId,
        username: user.username,
        role: user.role as UserRole,
        deviceId: user.deviceId,
        modules: user.modules,
      });

      const userDetails = await getUserById(user.userId);

      void audit(deps.pool, {
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: 'auth.token_refresh',
        ipAddress: req.ip,
      });
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

  router.get('/me', authenticateWithRevocation, async (req: AuthRequest, res) => {
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
          mfaEnabled: user.mfaEnabled,
        },
      },
    });
  });

  router.post('/mfa-begin-setup', authenticateWithRevocation, async (req: AuthRequest, res) => {
    if (!deps.generateMfaToken) {
      return res.status(501).json({ success: false, error: 'MFA non configurato' });
    }
    const user = await deps.getUserById(req.user!.userId);
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    if (user.mfaEnabled) {
      return res.status(400).json({ success: false, error: 'MFA già attivo' });
    }
    const setupToken = await deps.generateMfaToken(req.user!.userId);
    void audit(deps.pool, {
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'mfa.setup_initiated',
      ipAddress: req.ip,
    });
    res.json({ success: true, setupToken });
  });

  const authenticateWithMfaToken = createMfaTokenMiddleware();

  router.post('/mfa-setup', mfaSetupRateLimiter, authenticateWithMfaToken, async (req: AuthRequest, res) => {
    if (!deps.encryptSecret || !deps.saveMfaSecret) {
      return res.status(501).json({ success: false, error: 'MFA setup not configured' });
    }
    const userId = req.user!.userId;
    const user = await deps.getUserById(userId);
    if (!user) return res.status(401).json({ success: false, error: 'Utente non trovato' });
    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, user.username);
    const { ciphertext, iv, authTag } = await deps.encryptSecret(secret);
    await deps.saveMfaSecret(userId, ciphertext, iv, authTag);
    void audit(deps.pool, { actorId: userId, actorRole: req.user!.role, action: 'mfa.setup_initiated', ipAddress: req.ip });
    res.json({ success: true, data: { uri } });
  });

  router.post('/mfa-confirm', mfaSetupRateLimiter, authenticateWithMfaToken, async (req: AuthRequest, res) => {
    if (!deps.getMfaSecret || !deps.decryptSecret || !deps.saveRecoveryCodes || !deps.enableMfa) {
      return res.status(501).json({ success: false, error: 'MFA not configured' });
    }
    const parsed = z.object({ code: z.string().length(6) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Codice OTP deve essere di 6 cifre' });
    }
    const { code } = parsed.data;
    const userId = req.user!.userId;
    const stored = await deps.getMfaSecret(userId);
    if (!stored) return res.status(400).json({ success: false, error: 'MFA setup non iniziato' });
    const secret = await deps.decryptSecret(stored.ciphertext, stored.iv, stored.authTag);
    if (!verifyTotpCode(secret, code)) {
      return res.status(401).json({ success: false, error: 'Codice OTP non valido' });
    }
    const { plaintext, hashed } = await generateRecoveryCodes();
    await deps.saveRecoveryCodes(userId, hashed);
    await deps.enableMfa(userId);
    void audit(deps.pool, { actorId: userId, actorRole: req.user!.role, action: 'mfa.enrollment_completed', ipAddress: req.ip });
    res.json({ success: true, data: { recoveryCodes: plaintext } });
  });

  router.post('/mfa-verify', mfaVerifyRateLimiter, async (req, res) => {
    if (!deps.verifyMfaToken || !deps.getMfaSecret || !deps.decryptSecret || !deps.consumeRecoveryCode || !deps.getUserById) {
      return res.status(501).json({ success: false, error: 'MFA not configured' });
    }
    const parsed = z.object({
      mfaToken: z.string(),
      code: z.string().min(6).max(16),
      rememberDevice: z.boolean().optional(),
      deviceId: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Formato richiesta non valido' });
    }
    const { mfaToken, code } = parsed.data;
    const payload = await deps.verifyMfaToken(mfaToken);
    if (!payload) return res.status(401).json({ success: false, error: 'MFA token non valido o scaduto' });
    const user = await deps.getUserById(payload.userId);
    if (!user) return res.status(401).json({ success: false, error: 'Utente non trovato' });
    const stored = await deps.getMfaSecret(payload.userId);
    if (!stored) return res.status(400).json({ success: false, error: 'MFA non configurato' });
    const secret = await deps.decryptSecret(stored.ciphertext, stored.iv, stored.authTag);
    let verified = verifyTotpCode(secret, code);
    if (!verified && code.length === 16) {
      verified = await deps.consumeRecoveryCode(payload.userId, code);
      if (verified) void audit(deps.pool, { actorId: payload.userId, actorRole: user.role, action: 'mfa.recovery_code_used', ipAddress: req.ip });
    }
    if (!verified) {
      void audit(deps.pool, { actorId: payload.userId, actorRole: user.role, action: 'mfa.verify_failed', ipAddress: req.ip });
      return res.status(401).json({ success: false, error: 'Codice OTP non valido' });
    }
    void audit(deps.pool, { actorId: payload.userId, actorRole: user.role, action: 'mfa.verify_success', ipAddress: req.ip });
    const token = await generateJWT({ userId: user.id, username: user.username, role: user.role as UserRole, deviceId: parsed.data.deviceId || undefined, modules: user.modules });
    let trustToken: string | undefined;
    if (parsed.data.rememberDevice && parsed.data.deviceId && deps.createTrustToken) {
      trustToken = await deps.createTrustToken(user.id, parsed.data.deviceId);
    }
    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
      ...(trustToken ? { trustToken } : {}),
    });
  });

  return router;
}

export { createAuthRouter, type AuthRouterDeps };
