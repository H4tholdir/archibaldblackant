import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';
import type { DbPool } from '../db/pool';
import type * as SpecialBonusesRepo from '../db/repositories/special-bonuses';
import type * as BonusConditionsRepo from '../db/repositories/bonus-conditions';
import type { BonusConditionId } from '../db/repositories/bonus-conditions';
import type { SpecialBonusId } from '../db/repositories/special-bonuses';

type BonusesRouterDeps = {
  pool: DbPool;
  specialBonusesRepo: typeof SpecialBonusesRepo;
  bonusConditionsRepo: typeof BonusConditionsRepo;
};

const createSpecialBonusSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});

const createConditionSchema = z.discriminatedUnion('conditionType', [
  z.object({
    title: z.string().min(1).max(200),
    rewardAmount: z.number().positive(),
    conditionType: z.literal('manual'),
  }),
  z.object({
    title: z.string().min(1).max(200),
    rewardAmount: z.number().positive(),
    conditionType: z.literal('budget'),
    budgetThreshold: z.number().positive(),
  }),
]);

function createBonusesRouter(deps: BonusesRouterDeps): Router {
  const { pool, specialBonusesRepo, bonusConditionsRepo } = deps;
  const router = Router();

  // Special bonuses
  router.get('/special', async (req: AuthRequest, res) => {
    try {
      const data = await specialBonusesRepo.getByUserId(pool, req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting special bonuses', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/special', async (req: AuthRequest, res) => {
    const parsed = createSpecialBonusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues });

    try {
      const data = await specialBonusesRepo.insert(pool, req.user!.userId, parsed.data);
      res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('Error creating special bonus', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.delete('/special/:id', async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id, 10) as SpecialBonusId;
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID non valido' });

    try {
      const deleted = await specialBonusesRepo.deleteById(pool, id, req.user!.userId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Premio non trovato' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting special bonus', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // Bonus conditions
  router.get('/conditions', async (req: AuthRequest, res) => {
    try {
      const data = await bonusConditionsRepo.getByUserId(pool, req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting bonus conditions', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/conditions', async (req: AuthRequest, res) => {
    const parsed = createConditionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues });

    try {
      const data = await bonusConditionsRepo.insert(pool, req.user!.userId, parsed.data);
      res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('Error creating bonus condition', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.patch('/conditions/:id/achieve', async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id, 10) as BonusConditionId;
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID non valido' });

    try {
      // Fetch condition first to check type
      const conditions = await bonusConditionsRepo.getByUserId(pool, req.user!.userId);
      const condition = conditions.find((c) => c.id === id);
      if (!condition) return res.status(404).json({ success: false, error: 'Condizione non trovata' });
      if (condition.conditionType === 'budget') {
        return res.status(400).json({ success: false, error: 'Le condizioni di tipo budget vengono valutate automaticamente' });
      }

      const updated = await bonusConditionsRepo.markAchieved(pool, id, req.user!.userId);
      if (!updated) return res.status(404).json({ success: false, error: 'Condizione non trovata' });
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error achieving bonus condition', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.delete('/conditions/:id', async (req: AuthRequest, res) => {
    const id = parseInt(req.params.id, 10) as BonusConditionId;
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID non valido' });

    try {
      const deleted = await bonusConditionsRepo.deleteById(pool, id, req.user!.userId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Condizione non trovata' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting bonus condition', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

export { createBonusesRouter, type BonusesRouterDeps };
