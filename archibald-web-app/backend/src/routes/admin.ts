import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { User, UserRole, UserTarget } from '../db/repositories/users';
import type { JWTPayload } from '../auth-utils';
import { logger } from '../logger';

type AdminRouterDeps = {
  pool: DbPool;
  getAllUsers: () => Promise<User[]>;
  getUserById: (id: string) => Promise<User | null>;
  createUser: (username: string, fullName: string, role?: UserRole) => Promise<User>;
  updateWhitelist: (id: string, whitelisted: boolean) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  updateUserTarget: (userId: string, yearlyTarget: number, currency: string, commissionRate: number, bonusAmount: number, bonusInterval: number, extraBudgetInterval: number, extraBudgetReward: number, monthlyAdvance: number, hideCommissions: boolean) => Promise<void>;
  getUserTarget: (userId: string) => Promise<UserTarget | null>;
  generateJWT: (payload: JWTPayload) => Promise<string>;
  createAdminSession: (adminUserId: string, targetUserId: string) => Promise<number>;
  closeAdminSession: (sessionId: number) => Promise<void>;
};

const createUserSchema = z.object({
  username: z.string().min(1),
  fullName: z.string().min(1),
  role: z.enum(['agent', 'admin']).default('agent'),
});

const updateTargetSchema = z.object({
  yearlyTarget: z.number().min(0),
  currency: z.string().default('EUR'),
  commissionRate: z.number().min(0),
  bonusAmount: z.number().min(0),
  bonusInterval: z.number().int().min(1),
  extraBudgetInterval: z.number().int().min(0),
  extraBudgetReward: z.number().min(0),
  monthlyAdvance: z.number().min(0),
  hideCommissions: z.boolean(),
});

function createAdminRouter(deps: AdminRouterDeps) {
  const { getAllUsers, getUserById, createUser, updateWhitelist, deleteUser, updateUserTarget, getUserTarget, generateJWT, createAdminSession, closeAdminSession } = deps;
  const router = Router();

  router.get('/users', async (req: AuthRequest, res) => {
    try {
      let users = await getAllUsers();
      const { role } = req.query;
      if (role === 'agent' || role === 'admin') {
        users = users.filter((u) => u.role === role);
      }
      res.json({
        success: true,
        users: users.map((u) => ({
          id: u.id, username: u.username, fullName: u.fullName,
          role: u.role, whitelisted: u.whitelisted, lastLoginAt: u.lastLoginAt,
        })),
      });
    } catch (error) {
      logger.error('Error listing users', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/users', async (req: AuthRequest, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const user = await createUser(parsed.data.username, parsed.data.fullName, parsed.data.role as UserRole);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      logger.error('Error creating user', { error });
      res.status(500).json({ success: false, error: 'Errore creazione utente' });
    }
  });

  router.patch('/users/:id/whitelist', async (req: AuthRequest, res) => {
    try {
      const { whitelisted } = req.body;
      if (typeof whitelisted !== 'boolean') {
        return res.status(400).json({ success: false, error: 'whitelisted deve essere boolean' });
      }
      await updateWhitelist(req.params.id, whitelisted);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating whitelist', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento whitelist' });
    }
  });

  router.delete('/users/:id', async (req: AuthRequest, res) => {
    try {
      await deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting user', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione utente' });
    }
  });

  router.get('/users/:id/target', async (req: AuthRequest, res) => {
    try {
      const target = await getUserTarget(req.params.id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'Target non trovato' });
      }
      res.json({ success: true, data: target });
    } catch (error) {
      logger.error('Error fetching user target', { error });
      res.status(500).json({ success: false, error: 'Errore recupero target' });
    }
  });

  router.put('/users/:id/target', async (req: AuthRequest, res) => {
    try {
      const parsed = updateTargetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions } = parsed.data;
      await updateUserTarget(req.params.id, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating user target', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento target' });
    }
  });

  router.post('/impersonate', async (req: AuthRequest, res) => {
    try {
      const adminUser = req.user!;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ success: false, error: 'targetUserId richiesto' });
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'Utente non trovato' });
      }

      const adminSessionId = await createAdminSession(adminUser.userId, targetUserId);

      const token = await generateJWT({
        userId: targetUser.id,
        username: targetUser.username,
        role: 'admin',
        isImpersonating: true,
        realAdminId: adminUser.userId,
        adminSessionId,
      });

      res.json({
        success: true,
        token,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          fullName: targetUser.fullName,
          role: 'admin',
          isImpersonating: true,
          realAdminName: adminUser.username,
        },
      });
    } catch (error) {
      logger.error('Impersonation error', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/stop-impersonate', async (req: AuthRequest, res) => {
    try {
      const user = req.user!;

      if (!user.isImpersonating || !user.adminSessionId) {
        return res.status(400).json({ success: false, error: 'Non stai impersonando nessuno' });
      }

      await closeAdminSession(user.adminSessionId);

      const adminUser = await getUserById(user.realAdminId!);
      if (!adminUser) {
        return res.status(404).json({ success: false, error: 'Admin originale non trovato' });
      }

      const token = await generateJWT({
        userId: adminUser.id,
        username: adminUser.username,
        role: adminUser.role as UserRole,
      });

      res.json({
        success: true,
        token,
        user: { id: adminUser.id, username: adminUser.username, fullName: adminUser.fullName, role: adminUser.role },
      });
    } catch (error) {
      logger.error('Stop impersonation error', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

export { createAdminRouter, type AdminRouterDeps };
