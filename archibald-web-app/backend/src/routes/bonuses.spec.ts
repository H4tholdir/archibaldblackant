import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createBonusesRouter, type BonusesRouterDeps } from './bonuses';
import type { SpecialBonus, SpecialBonusId } from '../db/repositories/special-bonuses';
import type { BonusCondition, BonusConditionId } from '../db/repositories/bonus-conditions';

const TEST_USER_ID = 'user-test-456';

const sampleSpecialBonus: SpecialBonus = {
  id: 1 as SpecialBonusId,
  userId: TEST_USER_ID,
  title: 'Premio trimestrale',
  amount: 500,
  receivedAt: '2026-01-15',
  notes: 'Ottimo risultato Q1',
  createdAt: new Date('2026-01-16T09:00:00Z'),
};

const sampleManualCondition: BonusCondition = {
  id: 10 as BonusConditionId,
  userId: TEST_USER_ID,
  title: 'Visita 10 nuovi clienti',
  rewardAmount: 200,
  conditionType: 'manual',
  budgetThreshold: null,
  isAchieved: false,
  achievedAt: null,
  createdAt: new Date('2026-02-01T08:00:00Z'),
};

const sampleBudgetCondition: BonusCondition = {
  id: 11 as BonusConditionId,
  userId: TEST_USER_ID,
  title: 'Raggiungi 50.000€ di fatturato',
  rewardAmount: 1000,
  conditionType: 'budget',
  budgetThreshold: 50000,
  isAchieved: false,
  achievedAt: null,
  createdAt: new Date('2026-02-01T08:00:00Z'),
};

function createMockDeps(): BonusesRouterDeps {
  return {
    pool: {} as BonusesRouterDeps['pool'],
    specialBonusesRepo: {
      getByUserId: vi.fn().mockResolvedValue([sampleSpecialBonus]),
      insert: vi.fn().mockResolvedValue(sampleSpecialBonus),
      deleteById: vi.fn().mockResolvedValue(true),
    } as unknown as BonusesRouterDeps['specialBonusesRepo'],
    bonusConditionsRepo: {
      getByUserId: vi.fn().mockResolvedValue([sampleManualCondition, sampleBudgetCondition]),
      insert: vi.fn().mockResolvedValue(sampleManualCondition),
      markAchieved: vi.fn().mockResolvedValue({ ...sampleManualCondition, isAchieved: true, achievedAt: new Date('2026-03-01T10:00:00Z') }),
      deleteById: vi.fn().mockResolvedValue(true),
    } as unknown as BonusesRouterDeps['bonusConditionsRepo'],
  };
}

function createApp(deps: BonusesRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: TEST_USER_ID, username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/bonuses', createBonusesRouter(deps));
  return app;
}

describe('createBonusesRouter', () => {
  let deps: BonusesRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/bonuses/special', () => {
    test('returns list of special bonuses for authenticated user', async () => {
      const res = await request(app).get('/api/bonuses/special');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [{ ...sampleSpecialBonus, createdAt: sampleSpecialBonus.createdAt.toISOString() }],
      });
      expect(deps.specialBonusesRepo.getByUserId).toHaveBeenCalledWith(deps.pool, TEST_USER_ID);
    });

    test('returns empty array when user has no special bonuses', async () => {
      (deps.specialBonusesRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const res = await request(app).get('/api/bonuses/special');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [] });
    });

    test('returns 500 when repo throws', async () => {
      (deps.specialBonusesRepo.getByUserId as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/api/bonuses/special');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('POST /api/bonuses/special', () => {
    const validPayload = {
      title: 'Nuovo premio',
      amount: 300,
      receivedAt: '2026-03-15',
      notes: 'Note opzionali',
    };

    test('creates a special bonus and returns 201', async () => {
      const res = await request(app).post('/api/bonuses/special').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { ...sampleSpecialBonus, createdAt: sampleSpecialBonus.createdAt.toISOString() },
      });
      expect(deps.specialBonusesRepo.insert).toHaveBeenCalledWith(deps.pool, TEST_USER_ID, validPayload);
    });

    test('returns 400 when title is missing', async () => {
      const res = await request(app).post('/api/bonuses/special').send({ amount: 300, receivedAt: '2026-03-15' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when amount is not positive', async () => {
      const res = await request(app).post('/api/bonuses/special').send({ title: 'Test', amount: -10, receivedAt: '2026-03-15' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when receivedAt has invalid date format', async () => {
      const res = await request(app).post('/api/bonuses/special').send({ title: 'Test', amount: 100, receivedAt: '15-03-2026' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 500 when repo throws', async () => {
      (deps.specialBonusesRepo.insert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/api/bonuses/special').send(validPayload);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('DELETE /api/bonuses/special/:id', () => {
    test('deletes a special bonus and returns success', async () => {
      const res = await request(app).delete('/api/bonuses/special/1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(deps.specialBonusesRepo.deleteById).toHaveBeenCalledWith(deps.pool, 1, TEST_USER_ID);
    });

    test('returns 404 when bonus not found', async () => {
      (deps.specialBonusesRepo.deleteById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/bonuses/special/999');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Premio non trovato' });
    });

    test('returns 400 for non-numeric id', async () => {
      const res = await request(app).delete('/api/bonuses/special/abc');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'ID non valido' });
    });

    test('returns 500 when repo throws', async () => {
      (deps.specialBonusesRepo.deleteById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).delete('/api/bonuses/special/1');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('GET /api/bonuses/conditions', () => {
    test('returns list of bonus conditions for authenticated user', async () => {
      const res = await request(app).get('/api/bonuses/conditions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [
          { ...sampleManualCondition, createdAt: sampleManualCondition.createdAt.toISOString() },
          { ...sampleBudgetCondition, createdAt: sampleBudgetCondition.createdAt.toISOString() },
        ],
      });
      expect(deps.bonusConditionsRepo.getByUserId).toHaveBeenCalledWith(deps.pool, TEST_USER_ID);
    });

    test('returns 500 when repo throws', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/api/bonuses/conditions');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('POST /api/bonuses/conditions', () => {
    test('creates a manual condition and returns 201', async () => {
      const payload = { title: 'Visita clienti', rewardAmount: 200, conditionType: 'manual' };
      const res = await request(app).post('/api/bonuses/conditions').send(payload);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { ...sampleManualCondition, createdAt: sampleManualCondition.createdAt.toISOString() },
      });
      expect(deps.bonusConditionsRepo.insert).toHaveBeenCalledWith(deps.pool, TEST_USER_ID, payload);
    });

    test('creates a budget condition with threshold and returns 201', async () => {
      const budgetCreated = { ...sampleBudgetCondition };
      (deps.bonusConditionsRepo.insert as ReturnType<typeof vi.fn>).mockResolvedValueOnce(budgetCreated);
      const payload = { title: 'Raggiungi fatturato', rewardAmount: 1000, conditionType: 'budget', budgetThreshold: 50000 };
      const res = await request(app).post('/api/bonuses/conditions').send(payload);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: true,
        data: { ...sampleBudgetCondition, createdAt: sampleBudgetCondition.createdAt.toISOString() },
      });
      expect(deps.bonusConditionsRepo.insert).toHaveBeenCalledWith(deps.pool, TEST_USER_ID, payload);
    });

    test('returns 400 when budget condition is missing budgetThreshold', async () => {
      const payload = { title: 'Budget senza soglia', rewardAmount: 500, conditionType: 'budget' };
      const res = await request(app).post('/api/bonuses/conditions').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when conditionType is invalid', async () => {
      const payload = { title: 'Condizione', rewardAmount: 100, conditionType: 'unknown' };
      const res = await request(app).post('/api/bonuses/conditions').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when rewardAmount is not positive', async () => {
      const payload = { title: 'Condizione', rewardAmount: 0, conditionType: 'manual' };
      const res = await request(app).post('/api/bonuses/conditions').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 500 when repo throws', async () => {
      (deps.bonusConditionsRepo.insert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).post('/api/bonuses/conditions').send({ title: 'Test', rewardAmount: 100, conditionType: 'manual' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('PATCH /api/bonuses/conditions/:id/achieve', () => {
    const achievedCondition: BonusCondition = {
      ...sampleManualCondition,
      isAchieved: true,
      achievedAt: new Date('2026-03-01T10:00:00Z'),
    };

    test('marks a manual condition as achieved', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sampleManualCondition]);
      (deps.bonusConditionsRepo.markAchieved as ReturnType<typeof vi.fn>).mockResolvedValueOnce(achievedCondition);
      const res = await request(app).patch(`/api/bonuses/conditions/${sampleManualCondition.id}/achieve`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { ...achievedCondition, createdAt: achievedCondition.createdAt.toISOString(), achievedAt: achievedCondition.achievedAt!.toISOString() },
      });
      expect(deps.bonusConditionsRepo.markAchieved).toHaveBeenCalledWith(deps.pool, sampleManualCondition.id, TEST_USER_ID);
    });

    test('returns 400 when trying to achieve a budget condition', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sampleBudgetCondition]);
      const res = await request(app).patch(`/api/bonuses/conditions/${sampleBudgetCondition.id}/achieve`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Le condizioni di tipo budget vengono valutate automaticamente',
      });
    });

    test('returns 404 when condition not found in user list', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const res = await request(app).patch('/api/bonuses/conditions/999/achieve');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Condizione non trovata' });
    });

    test('returns 404 when markAchieved returns null', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce([sampleManualCondition]);
      (deps.bonusConditionsRepo.markAchieved as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const res = await request(app).patch(`/api/bonuses/conditions/${sampleManualCondition.id}/achieve`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Condizione non trovata' });
    });

    test('returns 400 for non-numeric id', async () => {
      const res = await request(app).patch('/api/bonuses/conditions/abc/achieve');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'ID non valido' });
    });

    test('returns 500 when repo throws', async () => {
      (deps.bonusConditionsRepo.getByUserId as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).patch('/api/bonuses/conditions/10/achieve');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });

  describe('DELETE /api/bonuses/conditions/:id', () => {
    test('deletes a bonus condition and returns success', async () => {
      const res = await request(app).delete('/api/bonuses/conditions/10');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(deps.bonusConditionsRepo.deleteById).toHaveBeenCalledWith(deps.pool, 10, TEST_USER_ID);
    });

    test('returns 404 when condition not found', async () => {
      (deps.bonusConditionsRepo.deleteById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const res = await request(app).delete('/api/bonuses/conditions/999');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Condizione non trovata' });
    });

    test('returns 400 for non-numeric id', async () => {
      const res = await request(app).delete('/api/bonuses/conditions/abc');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'ID non valido' });
    });

    test('returns 500 when repo throws', async () => {
      (deps.bonusConditionsRepo.deleteById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).delete('/api/bonuses/conditions/10');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore server' });
    });
  });
});
