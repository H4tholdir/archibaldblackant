import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { UserTarget, PrivacySettings } from '../db/repositories/users';
import { logger } from '../logger';

type UsersRouterDeps = {
  getUserTarget: (userId: string) => Promise<UserTarget | null>;
  updateUserTarget: (userId: string, yearlyTarget: number, currency: string, commissionRate: number, bonusAmount: number, bonusInterval: number, extraBudgetInterval: number, extraBudgetReward: number, monthlyAdvance: number, hideCommissions: boolean) => Promise<void>;
  getPrivacySettings: (userId: string) => Promise<PrivacySettings>;
  setPrivacySettings: (userId: string, enabled: boolean) => Promise<void>;
};

const updateTargetSchema = z.object({
  yearlyTarget: z.number().min(0),
  currency: z.string().length(3),
  commissionRate: z.number().min(0).max(1),
  bonusAmount: z.number().min(0),
  bonusInterval: z.number().int().min(1),
  extraBudgetInterval: z.number().int().min(0),
  extraBudgetReward: z.number().min(0),
  monthlyAdvance: z.number().min(0),
  hideCommissions: z.boolean(),
});

const privacySchema = z.object({
  enabled: z.boolean(),
});

function createUsersRouter(deps: UsersRouterDeps) {
  const { getUserTarget, updateUserTarget, getPrivacySettings, setPrivacySettings } = deps;
  const router = Router();

  router.get('/me/target', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const target = await getUserTarget(userId);

      if (!target) {
        return res.status(404).json({ success: false, error: 'Target non trovato' });
      }

      res.json({ success: true, data: target });
    } catch (error) {
      logger.error('Error getting user target', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.put('/me/target', async (req: AuthRequest, res) => {
    try {
      const parsed = updateTargetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      const { yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions } = parsed.data;

      await updateUserTarget(userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions);

      const monthlyTarget = Math.round(yearlyTarget / 12);

      res.json({
        success: true,
        data: {
          monthlyTarget,
          yearlyTarget,
          currency,
          commissionRate,
          bonusAmount,
          bonusInterval,
          extraBudgetInterval,
          extraBudgetReward,
          monthlyAdvance,
          hideCommissions,
        },
      });
    } catch (error) {
      logger.error('Error updating user target', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.get('/me/privacy', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const settings = await getPrivacySettings(userId);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Error getting privacy settings', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/me/privacy', async (req: AuthRequest, res) => {
    try {
      const parsed = privacySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      await setPrivacySettings(userId, parsed.data.enabled);

      res.json({ success: true, data: { enabled: parsed.data.enabled } });
    } catch (error) {
      logger.error('Error updating privacy settings', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

export { createUsersRouter, type UsersRouterDeps };
