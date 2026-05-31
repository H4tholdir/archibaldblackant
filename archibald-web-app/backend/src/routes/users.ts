import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { UserTarget, PrivacySettings } from '../db/repositories/users';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type UsersRouterDeps = {
  pool: DbPool;
  getUserTarget: (userId: string) => Promise<UserTarget | null>;
  updateUserTarget: (userId: string, yearlyTarget: number, currency: string, commissionRate: number, bonusAmount: number, bonusInterval: number, extraBudgetInterval: number, extraBudgetReward: number, monthlyAdvance: number, hideCommissions: boolean) => Promise<void>;
  updateFullName: (userId: string, fullName: string) => Promise<void>;
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
  const { pool, getUserTarget, updateUserTarget, updateFullName, getPrivacySettings, setPrivacySettings } = deps;
  const router = Router();

  router.get('/me/target', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const target = await getUserTarget(userId);

      if (!target) {
        return res.status(404).json({ success: false, error: 'Target non trovato' });
      }

      res.json(target);
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

  // GET /me/current-revenue — fatturato anno corrente (usato per progress bar condizioni obiettivo)
  router.get('/me/current-revenue', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const year = new Date().getFullYear();
      const { rows } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN total_amount ~ '^[0-9.,]+( €)?$'
           THEN CAST(REPLACE(REPLACE(REPLACE(total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
           ELSE 0 END
         ), 0) AS total
         FROM agents.order_records
         WHERE user_id = $1
           AND EXTRACT(YEAR FROM (
             CASE WHEN creation_date ~ '^\\d{4}' THEN creation_date::timestamptz
             ELSE NOW() END
           )) = $2
           AND sales_status NOT LIKE '%annullat%'
           AND total_amount NOT LIKE '-%'`,
        [userId, year],
      );
      const currentYearRevenue = parseFloat(rows[0]?.total ?? '0');
      res.json({ success: true, data: { currentYearRevenue, year } });
    } catch (error) {
      logger.error('Error getting current revenue', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // PATCH /me/profile — aggiorna full_name
  router.patch('/me/profile', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = z.object({ fullName: z.string().min(1).max(100) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'fullName richiesto (max 100 caratteri)' });
        return;
      }
      await updateFullName(userId, parsed.data.fullName);
      res.json({ success: true, data: { fullName: parsed.data.fullName } });
    } catch (error) {
      logger.error('Error updating profile', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // GET /me/advances — lista anticipi extra
  router.get('/me/advances', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      type AdvanceRow = { id: number; amount: number; description: string | null; advance_date: string; created_at: string };
      const { rows } = await pool.query<AdvanceRow>(
        `SELECT id, amount, description, advance_date, created_at
         FROM agents.commission_advances WHERE user_id = $1 ORDER BY advance_date DESC`,
        [userId],
      );
      const total = rows.reduce((s, r) => s + r.amount, 0);
      res.json({ success: true, data: { advances: rows, total } });
    } catch (error) {
      logger.error('Error getting advances', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // POST /me/advances — aggiungi anticipo
  router.post('/me/advances', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const parsed = z.object({
        amount: z.number().positive(),
        description: z.string().max(200).optional(),
        advanceDate: z.string().optional(),
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'amount positivo richiesto' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO agents.commission_advances (user_id, amount, description, advance_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, parsed.data.amount, parsed.data.description ?? null, parsed.data.advanceDate ?? new Date().toISOString().split('T')[0]],
      );
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      logger.error('Error creating advance', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // DELETE /me/advances/:id
  router.delete('/me/advances/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(req.params.id ?? '0', 10);
      await pool.query(
        `DELETE FROM agents.commission_advances WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting advance', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

export { createUsersRouter, type UsersRouterDeps };
