# Bonus & Premi System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al sistema un tab "Premi" nel profilo per gestire premi speciali e condizioni obiettivo, redesignare `BonusRoadmapWidgetNew` in un widget a 5 blocchi con hero totale + milestone card + extra-budget + premi speciali + anticipo/conguaglio, rimuovere i widget obsoleti dalla Dashboard, e aggiungere `checkBudgetMilestones` allo scheduler notifiche.

**Architecture:** Tre aree indipendenti: (1) DB + backend CRUD per `special_bonuses` e `bonus_conditions`, (2) Frontend redesign del `BonusRoadmapWidgetNew` con dati estesi e rimozione widget obsoleti, (3) Scheduler notifiche con `checkBudgetMilestones`. I dati di balance ed extra-budget vengono inglobati nel `BonusRoadmapData` esistente per evitare nuove chiamate API.

**Tech Stack:** React 19 + TypeScript strict (frontend), Express + pg pool + Zod (backend), PostgreSQL schema `agents.*`, Vitest (test).

---

## File Map

### Nuovi file
- `backend/src/db/migrations/035-bonus-system.sql` — tabelle `special_bonuses` e `bonus_conditions`
- `backend/src/db/repositories/special-bonuses.ts` — `getByUserId`, `insert`, `deleteById`
- `backend/src/db/repositories/bonus-conditions.ts` — `getByUserId`, `insert`, `markAchieved`, `deleteById`
- `backend/src/routes/bonuses.ts` — router CRUD per `/api/bonuses/special` e `/api/bonuses/conditions`
- `backend/src/db/repositories/special-bonuses.spec.ts` — unit test repository
- `backend/src/db/repositories/bonus-conditions.spec.ts` — unit test repository
- `backend/src/routes/bonuses.spec.ts` — integration test route
- `frontend/src/services/bonuses.service.ts` — funzioni API fetch per premi
- `frontend/src/components/BonusesTab.tsx` — tab "Premi" nel profilo

### File modificati
- `backend/src/db/migrate.ts` — aggiungere `035` alla lista migrazioni
- `backend/src/dashboard-service.ts` — aggiungere `specialBonuses` in `bonusRoadmap`, merge `balance`+`extraBudget`
- `backend/src/server.ts` — registrare il router `/api/bonuses`
- `backend/src/sync/notification-scheduler.ts` — aggiungere `checkBudgetMilestones`
- `frontend/src/types/dashboard.ts` — estendere `BonusRoadmapData` con `balance`, `extraBudget`, `specialBonuses`; rimuovere top-level `balance`/`extraBudget` da `DashboardData`
- `frontend/src/pages/Dashboard.tsx` — rimuovere KpiCardsWidget, ForecastWidgetNew, ActionSuggestionWidgetNew, BalanceWidget, ExtraBudgetWidget; passare dati estesi a `BonusRoadmapWidgetNew`
- `frontend/src/components/widgets/BonusRoadmapWidgetNew.tsx` — redesign completo a 5 blocchi
- `frontend/src/pages/ProfilePage.tsx` — aggiungere tab "Premi" con `BonusesTab`

---

## Task 1: Migration SQL 035

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/035-bonus-system.sql`
- Modify: `archibald-web-app/backend/src/db/migrate.ts`

- [ ] **Step 1: Creare il file di migrazione**

```sql
-- 035-bonus-system.sql
CREATE TABLE IF NOT EXISTS agents.special_bonuses (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  amount      DOUBLE PRECISION NOT NULL,
  received_at DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_special_bonuses_user ON agents.special_bonuses(user_id);

CREATE TABLE IF NOT EXISTS agents.bonus_conditions (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  reward_amount    DOUBLE PRECISION NOT NULL,
  condition_type   TEXT NOT NULL CHECK (condition_type IN ('budget', 'manual')),
  budget_threshold DOUBLE PRECISION,
  is_achieved      BOOLEAN NOT NULL DEFAULT FALSE,
  achieved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_conditions_user ON agents.bonus_conditions(user_id);
```

- [ ] **Step 2: Aggiungere '035' alla lista migrazioni**

Aprire `archibald-web-app/backend/src/db/migrate.ts` e cercare la lista dei file di migrazione (array con stringhe `'001-...'`). Aggiungere `'035-bonus-system.sql'` in fondo all'array.

- [ ] **Step 3: Verificare che il build passi**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: build completato senza errori TypeScript.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/035-bonus-system.sql archibald-web-app/backend/src/db/migrate.ts
git commit -m "feat(db): add special_bonuses and bonus_conditions tables (035)"
```

---

## Task 2: Repository `special-bonuses`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/special-bonuses.ts`
- Create: `archibald-web-app/backend/src/db/repositories/special-bonuses.spec.ts`

- [ ] **Step 1: Scrivere il test fallente**

```typescript
// special-bonuses.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestPool, destroyTestPool } from '../test-helpers';
import type { DbPool } from '../pool';
import { getByUserId, insert, deleteById } from './special-bonuses';

describe('special-bonuses repository', () => {
  let pool: DbPool;

  beforeEach(async () => {
    pool = await createTestPool();
  });

  afterEach(async () => {
    await destroyTestPool(pool);
  });

  describe('insert', () => {
    it('inserts a special bonus and returns it', async () => {
      const userId = 'test-user-1';
      const params = {
        title: 'Premio fiera Rimini',
        amount: 1000,
        receivedAt: '2026-01-15',
        notes: 'Ottimo risultato',
      };

      const result = await insert(pool, userId, params);

      expect(result).toEqual(expect.objectContaining({
        id: expect.any(Number),
        userId,
        title: params.title,
        amount: params.amount,
        receivedAt: expect.any(String),
        notes: params.notes,
      }));
    });
  });

  describe('getByUserId', () => {
    it('returns only bonuses for the given user', async () => {
      const userId = 'test-user-2';
      await insert(pool, userId, { title: 'Premio A', amount: 500, receivedAt: '2026-02-01' });
      await insert(pool, 'other-user', { title: 'Premio B', amount: 600, receivedAt: '2026-02-01' });

      const results = await getByUserId(pool, userId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Premio A');
    });
  });

  describe('deleteById', () => {
    it('deletes only the matching bonus', async () => {
      const userId = 'test-user-3';
      const bonus = await insert(pool, userId, { title: 'Da eliminare', amount: 100, receivedAt: '2026-01-01' });

      const deleted = await deleteById(pool, bonus.id, userId);

      expect(deleted).toBe(true);
      const remaining = await getByUserId(pool, userId);
      expect(remaining).toHaveLength(0);
    });

    it('returns false when id does not belong to user', async () => {
      const userId = 'test-user-4';
      const bonus = await insert(pool, userId, { title: 'Non mio', amount: 100, receivedAt: '2026-01-01' });

      const deleted = await deleteById(pool, bonus.id, 'wrong-user');

      expect(deleted).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- special-bonuses.spec
```
Expected: FAIL — "Cannot find module './special-bonuses'"

- [ ] **Step 3: Implementare il repository**

```typescript
// special-bonuses.ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type SpecialBonusId = Brand<number, 'SpecialBonusId'>;

type SpecialBonus = {
  id: SpecialBonusId;
  userId: string;
  title: string;
  amount: number;
  receivedAt: string; // ISO date string YYYY-MM-DD
  notes: string | null;
  createdAt: Date;
};

type InsertSpecialBonusParams = {
  title: string;
  amount: number;
  receivedAt: string;
  notes?: string;
};

type SpecialBonusRow = {
  id: number;
  user_id: string;
  title: string;
  amount: number;
  received_at: string;
  notes: string | null;
  created_at: Date;
};

function mapRow(row: SpecialBonusRow): SpecialBonus {
  return {
    id: row.id as SpecialBonusId,
    userId: row.user_id,
    title: row.title,
    amount: row.amount,
    receivedAt: row.received_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

async function getByUserId(pool: DbPool, userId: string): Promise<SpecialBonus[]> {
  const { rows } = await pool.query<SpecialBonusRow>(
    `SELECT id, user_id, title, amount, received_at::text, notes, created_at
     FROM agents.special_bonuses
     WHERE user_id = $1
     ORDER BY received_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

async function insert(pool: DbPool, userId: string, params: InsertSpecialBonusParams): Promise<SpecialBonus> {
  const { rows } = await pool.query<SpecialBonusRow>(
    `INSERT INTO agents.special_bonuses (user_id, title, amount, received_at, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, title, amount, received_at::text, notes, created_at`,
    [userId, params.title, params.amount, params.receivedAt, params.notes ?? null],
  );
  return mapRow(rows[0]);
}

async function deleteById(pool: DbPool, id: SpecialBonusId, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.special_bonuses WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export { getByUserId, insert, deleteById, type SpecialBonus, type SpecialBonusId, type InsertSpecialBonusParams };
```

- [ ] **Step 4: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- special-bonuses.spec
```
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/special-bonuses.ts archibald-web-app/backend/src/db/repositories/special-bonuses.spec.ts
git commit -m "feat(repo): add special-bonuses repository with CRUD"
```

---

## Task 3: Repository `bonus-conditions`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/bonus-conditions.ts`
- Create: `archibald-web-app/backend/src/db/repositories/bonus-conditions.spec.ts`

- [ ] **Step 1: Scrivere il test fallente**

```typescript
// bonus-conditions.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestPool, destroyTestPool } from '../test-helpers';
import type { DbPool } from '../pool';
import { getByUserId, insert, markAchieved, deleteById } from './bonus-conditions';

describe('bonus-conditions repository', () => {
  let pool: DbPool;

  beforeEach(async () => {
    pool = await createTestPool();
  });

  afterEach(async () => {
    await destroyTestPool(pool);
  });

  describe('insert', () => {
    it('inserts a manual condition', async () => {
      const userId = 'test-user-1';
      const result = await insert(pool, userId, {
        title: 'Acquisire 3 clienti Komet',
        rewardAmount: 2000,
        conditionType: 'manual',
      });

      expect(result).toEqual(expect.objectContaining({
        id: expect.any(Number),
        userId,
        title: 'Acquisire 3 clienti Komet',
        rewardAmount: 2000,
        conditionType: 'manual',
        budgetThreshold: null,
        isAchieved: false,
        achievedAt: null,
      }));
    });

    it('inserts a budget condition with threshold', async () => {
      const userId = 'test-user-2';
      const result = await insert(pool, userId, {
        title: 'Superare €75k',
        rewardAmount: 5000,
        conditionType: 'budget',
        budgetThreshold: 75000,
      });

      expect(result).toEqual(expect.objectContaining({
        conditionType: 'budget',
        budgetThreshold: 75000,
        isAchieved: false,
      }));
    });
  });

  describe('getByUserId', () => {
    it('returns conditions only for given user', async () => {
      const userId = 'test-user-3';
      await insert(pool, userId, { title: 'Cond A', rewardAmount: 100, conditionType: 'manual' });
      await insert(pool, 'other-user', { title: 'Cond B', rewardAmount: 200, conditionType: 'manual' });

      const results = await getByUserId(pool, userId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Cond A');
    });
  });

  describe('markAchieved', () => {
    it('sets is_achieved=true and achievedAt', async () => {
      const userId = 'test-user-4';
      const cond = await insert(pool, userId, { title: 'Da raggiungere', rewardAmount: 500, conditionType: 'manual' });

      const result = await markAchieved(pool, cond.id, userId);

      expect(result).toEqual(expect.objectContaining({
        isAchieved: true,
        achievedAt: expect.any(Date),
      }));
    });

    it('returns null when id does not belong to user', async () => {
      const userId = 'test-user-5';
      const cond = await insert(pool, userId, { title: 'Non mio', rewardAmount: 500, conditionType: 'manual' });

      const result = await markAchieved(pool, cond.id, 'wrong-user');

      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('deletes and returns true', async () => {
      const userId = 'test-user-6';
      const cond = await insert(pool, userId, { title: 'Da eliminare', rewardAmount: 100, conditionType: 'manual' });

      const deleted = await deleteById(pool, cond.id, userId);

      expect(deleted).toBe(true);
      expect(await getByUserId(pool, userId)).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- bonus-conditions.spec
```
Expected: FAIL — "Cannot find module './bonus-conditions'"

- [ ] **Step 3: Implementare il repository**

```typescript
// bonus-conditions.ts
import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type BonusConditionId = Brand<number, 'BonusConditionId'>;

type ConditionType = 'budget' | 'manual';

type BonusCondition = {
  id: BonusConditionId;
  userId: string;
  title: string;
  rewardAmount: number;
  conditionType: ConditionType;
  budgetThreshold: number | null;
  isAchieved: boolean;
  achievedAt: Date | null;
  createdAt: Date;
};

type InsertBonusConditionParams = {
  title: string;
  rewardAmount: number;
  conditionType: ConditionType;
  budgetThreshold?: number;
};

type BonusConditionRow = {
  id: number;
  user_id: string;
  title: string;
  reward_amount: number;
  condition_type: string;
  budget_threshold: number | null;
  is_achieved: boolean;
  achieved_at: Date | null;
  created_at: Date;
};

function mapRow(row: BonusConditionRow): BonusCondition {
  return {
    id: row.id as BonusConditionId,
    userId: row.user_id,
    title: row.title,
    rewardAmount: row.reward_amount,
    conditionType: row.condition_type as ConditionType,
    budgetThreshold: row.budget_threshold,
    isAchieved: row.is_achieved,
    achievedAt: row.achieved_at,
    createdAt: row.created_at,
  };
}

async function getByUserId(pool: DbPool, userId: string): Promise<BonusCondition[]> {
  const { rows } = await pool.query<BonusConditionRow>(
    `SELECT id, user_id, title, reward_amount, condition_type, budget_threshold,
            is_achieved, achieved_at, created_at
     FROM agents.bonus_conditions
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

async function insert(pool: DbPool, userId: string, params: InsertBonusConditionParams): Promise<BonusCondition> {
  const { rows } = await pool.query<BonusConditionRow>(
    `INSERT INTO agents.bonus_conditions (user_id, title, reward_amount, condition_type, budget_threshold)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, title, reward_amount, condition_type, budget_threshold,
               is_achieved, achieved_at, created_at`,
    [userId, params.title, params.rewardAmount, params.conditionType, params.budgetThreshold ?? null],
  );
  return mapRow(rows[0]);
}

async function markAchieved(pool: DbPool, id: BonusConditionId, userId: string): Promise<BonusCondition | null> {
  const { rows } = await pool.query<BonusConditionRow>(
    `UPDATE agents.bonus_conditions
     SET is_achieved = true, achieved_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, title, reward_amount, condition_type, budget_threshold,
               is_achieved, achieved_at, created_at`,
    [id, userId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

async function deleteById(pool: DbPool, id: BonusConditionId, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.bonus_conditions WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getByUserId, insert, markAchieved, deleteById,
  type BonusCondition, type BonusConditionId, type InsertBonusConditionParams, type ConditionType,
};
```

- [ ] **Step 4: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- bonus-conditions.spec
```
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/bonus-conditions.ts archibald-web-app/backend/src/db/repositories/bonus-conditions.spec.ts
git commit -m "feat(repo): add bonus-conditions repository with CRUD + markAchieved"
```

---

## Task 4: Route `/api/bonuses`

**Files:**
- Create: `archibald-web-app/backend/src/routes/bonuses.ts`
- Create: `archibald-web-app/backend/src/routes/bonuses.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Scrivere i test di integrazione fallenti**

```typescript
// bonuses.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createBonusesRouter } from './bonuses';
import { createTestPool, destroyTestPool } from '../db/test-helpers';
import type { DbPool } from '../db/pool';
import * as specialBonusesRepo from '../db/repositories/special-bonuses';
import * as bonusConditionsRepo from '../db/repositories/bonus-conditions';

const TEST_USER_ID = 'test-user-bonuses';

function buildApp(pool: DbPool) {
  const app = express();
  app.use(express.json());
  // Mock auth middleware
  app.use((req: any, _res, next) => {
    req.user = { userId: TEST_USER_ID };
    next();
  });
  app.use('/api/bonuses', createBonusesRouter({ pool, specialBonusesRepo, bonusConditionsRepo }));
  return app;
}

describe('GET /api/bonuses/special', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('returns empty array when no bonuses', async () => {
    const app = buildApp(pool);
    const res = await request(app).get('/api/bonuses/special');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('returns bonuses for authenticated user', async () => {
    const app = buildApp(pool);
    await specialBonusesRepo.insert(pool, TEST_USER_ID, { title: 'Premio test', amount: 500, receivedAt: '2026-01-01' });
    const res = await request(app).get('/api/bonuses/special');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Premio test');
  });
});

describe('POST /api/bonuses/special', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('creates a new special bonus', async () => {
    const app = buildApp(pool);
    const res = await request(app).post('/api/bonuses/special').send({
      title: 'Nuovo premio',
      amount: 1000,
      receivedAt: '2026-03-15',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Nuovo premio');
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp(pool);
    const res = await request(app).post('/api/bonuses/special').send({ amount: 100, receivedAt: '2026-01-01' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/bonuses/special/:id', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('deletes own bonus', async () => {
    const app = buildApp(pool);
    const bonus = await specialBonusesRepo.insert(pool, TEST_USER_ID, { title: 'Da eliminare', amount: 100, receivedAt: '2026-01-01' });
    const res = await request(app).delete(`/api/bonuses/special/${bonus.id}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/bonuses/conditions', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('returns empty array when no conditions', async () => {
    const app = buildApp(pool);
    const res = await request(app).get('/api/bonuses/conditions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });
});

describe('POST /api/bonuses/conditions', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('creates a manual condition', async () => {
    const app = buildApp(pool);
    const res = await request(app).post('/api/bonuses/conditions').send({
      title: 'Acquisire 3 clienti',
      rewardAmount: 2000,
      conditionType: 'manual',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.conditionType).toBe('manual');
  });

  it('creates a budget condition with threshold', async () => {
    const app = buildApp(pool);
    const res = await request(app).post('/api/bonuses/conditions').send({
      title: 'Superare €75k',
      rewardAmount: 5000,
      conditionType: 'budget',
      budgetThreshold: 75000,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.budgetThreshold).toBe(75000);
  });

  it('returns 400 when budget condition is missing threshold', async () => {
    const app = buildApp(pool);
    const res = await request(app).post('/api/bonuses/conditions').send({
      title: 'Senza soglia',
      rewardAmount: 1000,
      conditionType: 'budget',
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/bonuses/conditions/:id/achieve', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('marks manual condition as achieved', async () => {
    const app = buildApp(pool);
    const cond = await bonusConditionsRepo.insert(pool, TEST_USER_ID, { title: 'Manuale', rewardAmount: 500, conditionType: 'manual' });
    const res = await request(app).patch(`/api/bonuses/conditions/${cond.id}/achieve`);
    expect(res.status).toBe(200);
    expect(res.body.data.isAchieved).toBe(true);
  });

  it('returns 400 when trying to achieve a budget condition manually', async () => {
    const app = buildApp(pool);
    const cond = await bonusConditionsRepo.insert(pool, TEST_USER_ID, { title: 'Budget', rewardAmount: 5000, conditionType: 'budget', budgetThreshold: 75000 });
    const res = await request(app).patch(`/api/bonuses/conditions/${cond.id}/achieve`);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/bonuses/conditions/:id', () => {
  let pool: DbPool;
  beforeEach(async () => { pool = await createTestPool(); });
  afterEach(async () => { await destroyTestPool(pool); });

  it('deletes own condition', async () => {
    const app = buildApp(pool);
    const cond = await bonusConditionsRepo.insert(pool, TEST_USER_ID, { title: 'Da eliminare', rewardAmount: 100, conditionType: 'manual' });
    const res = await request(app).delete(`/api/bonuses/conditions/${cond.id}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- bonuses.spec
```
Expected: FAIL — "Cannot find module './bonuses'"

- [ ] **Step 3: Implementare la route**

```typescript
// bonuses.ts
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
```

- [ ] **Step 4: Registrare la route in `server.ts`**

In `archibald-web-app/backend/src/server.ts`, aggiungere after the existing imports:
```typescript
import { createBonusesRouter } from './routes/bonuses';
import * as specialBonusesRepo from './db/repositories/special-bonuses';
import * as bonusConditionsRepo from './db/repositories/bonus-conditions';
```

Nella funzione `createServer`, dopo le altre registrazioni `app.use('/api/...`, aggiungere:
```typescript
app.use('/api/bonuses', authenticateJWT, createBonusesRouter({ pool, specialBonusesRepo, bonusConditionsRepo }));
```

- [ ] **Step 5: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- bonuses.spec
```
Expected: PASS — 10 tests passed.

- [ ] **Step 6: Build check**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: build completato senza errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/bonuses.ts archibald-web-app/backend/src/routes/bonuses.spec.ts archibald-web-app/backend/src/server.ts
git commit -m "feat(api): add /api/bonuses router for special bonuses and conditions"
```

---

## Task 5: `checkBudgetMilestones` nello scheduler

**Files:**
- Modify: `archibald-web-app/backend/src/sync/notification-scheduler.ts`
- Modify: `archibald-web-app/backend/src/sync/notification-scheduler.spec.ts`

- [ ] **Step 1: Aggiungere i test per `checkBudgetMilestones` nel file `.spec.ts` esistente**

Aprire `archibald-web-app/backend/src/sync/notification-scheduler.spec.ts` e aggiungere in fondo:

```typescript
describe('checkBudgetMilestones', () => {
  it('calls createNotification when currentBudget >= budget_threshold', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            user_id: 'user-abc',
            title: 'Superare €75k',
            reward_amount: 5000,
            budget_threshold: 75000,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ current_budget: 87000 }] }),
    } as unknown as DbPool;

    const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
    const mockMarkAchieved = vi.fn().mockResolvedValue({ isAchieved: true });

    await checkBudgetMilestones(mockPool, mockDeps(mockCreateNotification), mockMarkAchieved);

    expect(mockCreateNotification).toHaveBeenCalledOnce();
    expect(mockMarkAchieved).toHaveBeenCalledWith(mockPool, 1, 'user-abc');
  });

  it('does not call createNotification when currentBudget < budget_threshold', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            user_id: 'user-def',
            title: 'Superare €150k',
            reward_amount: 5000,
            budget_threshold: 150000,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ current_budget: 87000 }] }),
    } as unknown as DbPool;

    const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
    const mockMarkAchieved = vi.fn().mockResolvedValue(null);

    await checkBudgetMilestones(mockPool, mockDeps(mockCreateNotification), mockMarkAchieved);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('does not process conditions already achieved (is_achieved=false filter in query)', async () => {
    // Query already filters is_achieved=false, so empty rows = already achieved
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    } as unknown as DbPool;

    const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
    const mockMarkAchieved = vi.fn();

    await checkBudgetMilestones(mockPool, mockDeps(mockCreateNotification), mockMarkAchieved);

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockMarkAchieved).not.toHaveBeenCalled();
  });
});
```

Nota: verificare come `mockDeps` è già definito nel file spec e riutilizzarlo. Se non è definito come helper, aggiungere:
```typescript
function mockDeps(createNotification: ReturnType<typeof vi.fn>): NotificationServiceDeps {
  return { createNotification } as unknown as NotificationServiceDeps;
}
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

```bash
npm test --prefix archibald-web-app/backend -- notification-scheduler.spec
```
Expected: FAIL — "checkBudgetMilestones is not exported"

- [ ] **Step 3: Implementare `checkBudgetMilestones` in `notification-scheduler.ts`**

Aggiungere il tipo e la funzione prima di `createNotificationScheduler`:

```typescript
type BudgetConditionRow = {
  id: number;
  user_id: string;
  title: string;
  reward_amount: number;
  budget_threshold: number;
};

type BudgetRow = {
  current_budget: number;
};

type MarkAchievedFn = (pool: DbPool, id: number, userId: string) => Promise<unknown>;

async function checkBudgetMilestones(
  pool: DbPool,
  deps: NotificationServiceDeps,
  markAchieved: MarkAchievedFn,
): Promise<number> {
  const { rows: conditions } = await pool.query<BudgetConditionRow>(
    `SELECT id, user_id, title, reward_amount, budget_threshold
     FROM agents.bonus_conditions
     WHERE condition_type = 'budget'
       AND is_achieved = false
       AND budget_threshold IS NOT NULL`,
  );

  let notified = 0;

  for (const cond of conditions) {
    const { rows: budgetRows } = await pool.query<BudgetRow>(
      `SELECT COALESCE(SUM(total_amount::numeric), 0) AS current_budget
       FROM agents.order_records
       WHERE user_id = $1
         AND total_amount IS NOT NULL
         AND total_amount NOT LIKE '-%'
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`,
      [cond.user_id],
    );

    const currentBudget = Number(budgetRows[0]?.current_budget ?? 0);

    if (currentBudget >= cond.budget_threshold) {
      await markAchieved(pool, cond.id, cond.user_id);
      await createNotification(deps, {
        target: 'user',
        userId: cond.user_id,
        type: 'budget_milestone',
        severity: 'success',
        title: 'Traguardo budget raggiunto!',
        body: `Hai raggiunto la condizione "${cond.title}" e guadagnato un bonus di €${cond.reward_amount.toLocaleString('it-IT')}.`,
        data: { conditionId: cond.id, conditionTitle: cond.title, rewardAmount: cond.reward_amount },
      });
      notified++;
    }
  }

  return notified;
}
```

- [ ] **Step 4: Aggiornare `createNotificationScheduler` per includere `checkBudgetMilestones`**

Sostituire il `setInterval` in `start()`:

```typescript
function start(): void {
  timers.push(
    setInterval(() => {
      checkCustomerInactivity(pool, deps).catch((error) => {
        logger.error('Failed to check customer inactivity', { error });
      });
      checkOverduePayments(pool, deps).catch((error) => {
        logger.error('Failed to check overdue payments', { error });
      });
      checkBudgetMilestones(pool, deps, markAchievedFromRepo).catch((error) => {
        logger.error('Failed to check budget milestones', { error });
      });
    }, DAILY_CHECK_MS),
  );
}
```

Aggiungere `markAchievedFromRepo` come dipendenza: nel costruttore di `createNotificationScheduler` aggiungere il parametro. Il modo più semplice che segue il pattern esistente è importare direttamente il repo:

```typescript
import { markAchieved as markAchievedFromConditions } from '../db/repositories/bonus-conditions';
```

E poi in `start()` usare `markAchievedFromConditions`.

Aggiornare l'export:

```typescript
export {
  createNotificationScheduler,
  checkCustomerInactivity,
  checkOverduePayments,
  checkBudgetMilestones,
  DAILY_CHECK_MS,
};
```

- [ ] **Step 5: Eseguire i test per verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- notification-scheduler.spec
```
Expected: PASS — tutti i test passano (inclusi i 3 nuovi).

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/sync/notification-scheduler.ts archibald-web-app/backend/src/sync/notification-scheduler.spec.ts
git commit -m "feat(scheduler): add checkBudgetMilestones for budget_milestone notifications"
```

---

## Task 6: Estendere `BonusRoadmapData` + aggiornare `dashboard-service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/types/dashboard.ts`
- Modify: `archibald-web-app/backend/src/dashboard-service.ts`

- [ ] **Step 1: Aggiungere `SpecialBonus` type e estendere `BonusRoadmapData` in `dashboard.ts`**

In `archibald-web-app/frontend/src/types/dashboard.ts`, aggiungere prima di `BonusRoadmapData`:

```typescript
export type SpecialBonus = {
  id: number;
  title: string;
  amount: number;
  receivedAt: string;
};
```

Sostituire `BonusRoadmapData`:
```typescript
export interface BonusRoadmapData {
  steps: BonusRoadmapStep[];
  currentYearRevenue: number;
  missingToNextBonus: number;
  nextBonusAmount: number;
  // Temporal comparisons
  comparisonLastYear?: TemporalComparison;
  sparkline?: SparklineData;
  // Merged data (previously in separate widgets)
  balance: BalanceData;
  extraBudget: ExtraBudgetData;
  specialBonuses: SpecialBonus[];
}
```

Modificare `DashboardData` — rimuovere `balance` e `extraBudget` dalla top-level, poiché ora sono dentro `bonusRoadmap`:
```typescript
export interface DashboardData {
  heroStatus: HeroStatusData;
  kpiCards: KpiCardData[];
  bonusRoadmap: BonusRoadmapData;
  forecast: ForecastData;
  actionSuggestion: ActionSuggestion;
  alerts: AlertData;
}
```

- [ ] **Step 2: Aggiornare `dashboard-service.ts` per includere `specialBonuses` e i dati di balance/extraBudget dentro `bonusRoadmap`**

In `archibald-web-app/backend/src/dashboard-service.ts`, aggiungere l'import del repository:
```typescript
import * as specialBonusesRepo from './db/repositories/special-bonuses';
```

Sostituire la riga `const bonusRoadmap = ...` e le successivi `balance`/`extraBudget`:

```typescript
const [bonusRoadmapBase, balance, extraBudget, specialBonuses] = await Promise.all([
  Promise.resolve(WidgetCalc.calculateBonusRoadmap(
    currentYearRevenue, userConfig.bonusInterval, userConfig.bonusAmount,
  )),
  Promise.resolve(WidgetCalc.calculateBalance(
    userConfig.commissionRate, currentYearRevenue, userConfig.monthlyAdvance,
  )),
  Promise.resolve(WidgetCalc.calculateExtraBudget(
    currentYearRevenue, userConfig.yearlyTarget,
    userConfig.extraBudgetInterval, userConfig.extraBudgetReward,
  )),
  specialBonusesRepo.getByUserId(pool, userId),
]);

const bonusRoadmap = {
  ...bonusRoadmapBase,
  balance,
  extraBudget,
  specialBonuses: specialBonuses.map((b) => ({
    id: b.id as number,
    title: b.title,
    amount: b.amount,
    receivedAt: b.receivedAt,
  })),
};
```

Aggiornare il return per rimuovere `balance` ed `extraBudget` separati:
```typescript
return { heroStatus, kpiCards, bonusRoadmap, forecast, actionSuggestion, alerts };
```

- [ ] **Step 3: Aggiornare il type in `widget.ts`**

In `archibald-web-app/backend/src/routes/widget.ts`, aggiornare `DashboardData`:
```typescript
type DashboardData = {
  heroStatus: unknown;
  kpiCards: unknown;
  bonusRoadmap: unknown;
  forecast: unknown;
  actionSuggestion: unknown;
  alerts: unknown;
};
```
(Rimuovere `balance` e `extraBudget` dalla definizione locale.)

- [ ] **Step 4: Verificare che il build passi**

```bash
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore TypeScript.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/types/dashboard.ts archibald-web-app/backend/src/dashboard-service.ts archibald-web-app/backend/src/routes/widget.ts
git commit -m "feat(types): merge balance/extraBudget/specialBonuses into BonusRoadmapData"
```

---

## Task 7: Redesign `BonusRoadmapWidgetNew` — 5 blocchi

**Files:**
- Modify: `archibald-web-app/frontend/src/components/widgets/BonusRoadmapWidgetNew.tsx`

- [ ] **Step 1: Riscrivere completamente il componente**

Sostituire l'intero contenuto del file con:

```typescript
import { BonusRoadmapData } from "../../types/dashboard";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { useConfettiCelebration } from "../../hooks/useConfettiCelebration";
import { formatCurrencyCompact } from "../../utils/format-currency";

interface BonusRoadmapWidgetNewProps {
  data: BonusRoadmapData;
}

export function BonusRoadmapWidgetNew({ data }: BonusRoadmapWidgetNewProps) {
  const { privacyEnabled, maskValue } = usePrivacy();

  const completedBonuses = data.steps.filter((s) => s.status === "completed").length;
  const now = new Date();
  const bonusCelebrationKey = `bonus-fireworks-${now.getFullYear()}-${completedBonuses}`;

  useConfettiCelebration({
    enabled: completedBonuses > 0,
    key: bonusCelebrationKey,
    variant: "fireworks",
    cooldownMs: 24 * 60 * 60 * 1000,
  });

  const fmt = formatCurrencyCompact;

  const totalSpecialBonuses = data.specialBonuses.reduce((sum, b) => sum + b.amount, 0);
  const totalProgressiveBonuses = data.steps
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.bonusAmount, 0);
  const baseCommissions = data.balance.totalCommissionsMatured - totalProgressiveBonuses - totalSpecialBonuses;
  const totalMaturato = data.balance.totalCommissionsMatured;

  // Months elapsed (approx) for advance label
  const monthsElapsed = now.getMonth() + 1;

  if (privacyEnabled) {
    return (
      <div style={{ background: "#fff", borderRadius: "16px", padding: "30px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#7f8c8d" }}>Dati provvigionali nascosti</div>
        <div style={{ fontSize: "13px", color: "#95a5a6", marginTop: "8px" }}>Disattiva Privacy per visualizzare</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>

      {/* BLOCCO 1 — Hero totale maturato */}
      <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", borderRadius: "12px", padding: "16px", marginBottom: "14px", color: "#fff" }}>
        <div style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>Provvigioni totali maturate {now.getFullYear()}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "32px", fontWeight: 900, letterSpacing: "-1px" }}>{maskValue(totalMaturato, "money")}</div>
            <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "4px" }}>
              base {fmt(Math.max(0, baseCommissions))} · bonus {fmt(totalProgressiveBonuses)}
              {totalSpecialBonuses > 0 && ` · speciali ${fmt(totalSpecialBonuses)}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase", fontWeight: 600 }}>Fatturato {now.getFullYear()}</div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{maskValue(data.currentYearRevenue, "money")}</div>
            <div style={{ fontSize: "11px", opacity: 0.7, marginTop: "2px" }}>Anticipo {fmt(data.balance.totalAdvancePaid)}</div>
          </div>
        </div>
      </div>

      {/* BLOCCO 2 — Milestone ladder bonus progressivi */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>🎁 Bonus progressivi (ogni {fmt(data.steps[0]?.threshold || 0)})</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "7px" }}>
          {data.steps.map((step, index) => {
            const isCompleted = step.status === "completed";
            const isActive = step.status === "active";
            const isLocked = step.status === "locked";
            const progressPct = isActive && data.steps[0]
              ? Math.min(100, Math.round(((data.currentYearRevenue - (index > 0 ? data.steps[index - 1].threshold : 0)) / (step.threshold - (index > 0 ? data.steps[index - 1].threshold : 0))) * 100))
              : 0;

            const borderColor = isCompleted ? "#27ae60" : isActive ? "#f57c00" : "#e0e0e0";
            const bg = isCompleted ? "#e8f5e9" : isActive ? "#fff8e1" : "#f5f5f5";
            const opacity = isLocked ? (index === data.steps.length - 1 ? 0.35 : 0.55) : 1;

            return (
              <div
                key={index}
                style={{ background: bg, border: `2px solid ${borderColor}`, borderRadius: "8px", padding: "9px", textAlign: "center", position: "relative", opacity }}
              >
                {(isCompleted || isActive) && (
                  <div style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", background: borderColor, color: "#fff", fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", whiteSpace: "nowrap" }}>
                    {isCompleted ? "✅ RAGGIUNTO" : "🔥 IN CORSO"}
                  </div>
                )}
                <div style={{ marginTop: isCompleted || isActive ? "6px" : "14px", fontSize: "10px", color: "#555", fontWeight: 600 }}>Bonus #{index + 1}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: isCompleted ? "#1b5e20" : isActive ? "#e65100" : "#bbb" }}>{step.label}</div>
                {isActive ? (
                  <>
                    <div style={{ fontSize: "11px", color: "#f57c00", fontWeight: 600 }}>mancano {fmt(data.missingToNextBonus)}</div>
                    <div style={{ background: "#e0e0e0", borderRadius: "3px", height: "4px", marginTop: "5px", overflow: "hidden" }}>
                      <div style={{ background: "#f57c00", width: `${progressPct}%`, height: "100%", borderRadius: "3px" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: "12px", color: isCompleted ? "#27ae60" : "#bbb", fontWeight: 700 }}>{step.bonusLabel}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOCCO 3 — Premi extra-budget */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>🏆 Premi extra-budget (oltre target annuale)</div>
        {!data.extraBudget.visible ? (
          <div style={{ background: "#f5f5f5", borderRadius: "8px", padding: "10px", color: "#888", fontSize: "12px", fontStyle: "italic" }}>
            Target annuale non ancora raggiunto — disponibile da {maskValue(data.extraBudget.nextStep, "money")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "7px" }}>
            {Array.from({ length: 4 }, (_, i) => {
              const tierAmount = (i + 1) * data.extraBudget.nextStep;
              const tierBonus = (i + 1) * (data.extraBudget.extraBonusesAmount / Math.max(1, data.extraBudget.extraBonuses));
              const achieved = i < data.extraBudget.extraBonuses;
              return (
                <div key={i} style={{ background: achieved ? "#e8f5e9" : "#f5f5f5", border: `2px solid ${achieved ? "#27ae60" : "#e0e0e0"}`, borderRadius: "8px", padding: "9px", textAlign: "center", opacity: achieved ? 1 : 0.6 }}>
                  <div style={{ fontSize: "10px", color: "#555", fontWeight: 600 }}>Tier {i + 1}</div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: achieved ? "#1b5e20" : "#bbb" }}>+{fmt(tierAmount)}</div>
                  <div style={{ fontSize: "11px", color: achieved ? "#27ae60" : "#bbb", fontWeight: 700 }}>+{fmt(tierBonus)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BLOCCO 4 — Premi speciali */}
      {data.specialBonuses.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>⭐ Premi speciali</div>
          {data.specialBonuses.map((bonus) => (
            <div key={bonus.id} style={{ display: "flex", alignItems: "center", background: "#fff8e1", borderRadius: "8px", padding: "10px 14px", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>🎁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#2c3e50", fontSize: "13px" }}>{bonus.title}</div>
                <div style={{ fontSize: "11px", color: "#888" }}>{new Date(bonus.receivedAt).toLocaleDateString("it-IT")}</div>
              </div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#e65100" }}>+{fmt(bonus.amount)}</div>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: "12px", color: "#1565c0", cursor: "pointer" }}>
            + Gestisci premi nel Profilo →
          </div>
        </div>
      )}

      {/* BLOCCO 5 — Anticipo vs Provvigioni */}
      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: "14px" }}>
        <div style={{ fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: "10px" }}>💵 Anticipo vs Provvigioni maturate</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
          <div style={{ background: "#f5f5f5", borderRadius: "8px", padding: "10px" }}>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>Anticipo ricevuto (gen–{new Date(0, monthsElapsed - 1).toLocaleString("it-IT", { month: "short" })})</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#2c3e50" }}>{maskValue(data.balance.totalAdvancePaid, "money")}</div>
            <div style={{ background: "#e0e0e0", borderRadius: "3px", height: "6px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ background: "#95a5a6", width: `${Math.min(100, Math.round((monthsElapsed / 12) * 100))}%`, height: "100%", borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "3px" }}>{monthsElapsed}/12 mesi</div>
          </div>
          <div style={{ background: "#e8f5e9", borderRadius: "8px", padding: "10px" }}>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>Provvigioni maturate</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#1b5e20" }}>{maskValue(totalMaturato, "money")}</div>
            <div style={{ background: "#c8e6c9", borderRadius: "3px", height: "6px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ background: "#27ae60", width: `${Math.min(100, Math.round((totalMaturato / Math.max(1, data.balance.totalAdvancePaid * 12 / monthsElapsed)) * 100))}%`, height: "100%", borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>vs anticipo annuale</div>
          </div>
        </div>
        <div style={{ background: data.balance.balanceStatus === "positive" ? "#e8f5e9" : "#fce4ec", border: `1px solid ${data.balance.balanceStatus === "positive" ? "#27ae60" : "#e91e63"}`, borderRadius: "8px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "2px" }}>Conguaglio stimato a dicembre</div>
            <div style={{ fontSize: "11px", color: "#aaa" }}>⚠️ Proiezione — dati aggiornati in tempo reale</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "22px", fontWeight: 900, color: data.balance.balanceStatus === "positive" ? "#1b5e20" : "#c62828" }}>
              {data.balance.balance >= 0 ? "+" : ""}{maskValue(data.balance.balance, "money")}
            </div>
            <div style={{ fontSize: "11px", color: data.balance.balanceStatus === "positive" ? "#27ae60" : "#e91e63", fontWeight: 600 }}>
              {data.balance.balanceStatus === "positive" ? "a tuo favore ✅" : "scoperto ⚠️"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificare type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore TypeScript.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/widgets/BonusRoadmapWidgetNew.tsx
git commit -m "feat(widget): redesign BonusRoadmapWidgetNew to 5-block vertical layout"
```

---

## Task 8: Cleanup Dashboard — rimuovere widget obsoleti

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Leggere il file Dashboard.tsx corrente per identificare esattamente le righe da modificare**

Aprire `archibald-web-app/frontend/src/pages/Dashboard.tsx`.

- [ ] **Step 2: Rimuovere gli import dei widget obsoleti**

Rimuovere queste 5 righe di import:
```typescript
import { KpiCardsWidget } from "../components/widgets/KpiCardsWidget";
import { ForecastWidgetNew } from "../components/widgets/ForecastWidgetNew";
import { ActionSuggestionWidgetNew } from "../components/widgets/ActionSuggestionWidgetNew";
import { BalanceWidget } from "../components/widgets/BalanceWidget";
import { ExtraBudgetWidget } from "../components/widgets/ExtraBudgetWidget";
```

- [ ] **Step 3: Rimuovere gli utilizzi dei widget nel JSX**

Rimuovere:
- `<KpiCardsWidget cards={dashboardData.kpiCards} />`
- `<ForecastWidgetNew data={dashboardData.forecast} />`
- `<ActionSuggestionWidgetNew data={dashboardData.actionSuggestion} />`
- `<BalanceWidget data={dashboardData.balance} />`
- `<ExtraBudgetWidget data={dashboardData.extraBudget} />`

Il `DashboardData` ora non ha più `balance` ed `extraBudget` al top-level — se il tipo locale del componente referenzia questi campi, aggiornarlo di conseguenza.

- [ ] **Step 4: Verificare type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): remove obsolete KPI/Forecast/ActionSuggestion/Balance/ExtraBudget widgets"
```

---

## Task 9: Service `bonuses.service.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/services/bonuses.service.ts`

- [ ] **Step 1: Creare il service**

```typescript
// bonuses.service.ts
import { fetchWithRetry } from '../api/fetch-with-retry';

type SpecialBonus = {
  id: number;
  userId: string;
  title: string;
  amount: number;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
};

type BonusCondition = {
  id: number;
  userId: string;
  title: string;
  rewardAmount: number;
  conditionType: 'budget' | 'manual';
  budgetThreshold: number | null;
  isAchieved: boolean;
  achievedAt: string | null;
  createdAt: string;
};

type CreateSpecialBonusParams = {
  title: string;
  amount: number;
  receivedAt: string;
  notes?: string;
};

type CreateBonusConditionParams = {
  title: string;
  rewardAmount: number;
  conditionType: 'budget' | 'manual';
  budgetThreshold?: number;
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('archibald_jwt');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function getSpecialBonuses(): Promise<SpecialBonus[]> {
  const res = await fetchWithRetry('/api/bonuses/special', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Errore caricamento premi speciali');
  const data = await res.json();
  return data.data as SpecialBonus[];
}

async function createSpecialBonus(params: CreateSpecialBonusParams): Promise<SpecialBonus> {
  const res = await fetchWithRetry('/api/bonuses/special', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Errore creazione premio speciale');
  const data = await res.json();
  return data.data as SpecialBonus;
}

async function deleteSpecialBonus(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/bonuses/special/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore eliminazione premio speciale');
}

async function getBonusConditions(): Promise<BonusCondition[]> {
  const res = await fetchWithRetry('/api/bonuses/conditions', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Errore caricamento condizioni obiettivo');
  const data = await res.json();
  return data.data as BonusCondition[];
}

async function createBonusCondition(params: CreateBonusConditionParams): Promise<BonusCondition> {
  const res = await fetchWithRetry('/api/bonuses/conditions', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Errore creazione condizione obiettivo');
  const data = await res.json();
  return data.data as BonusCondition;
}

async function achieveBonusCondition(id: number): Promise<BonusCondition> {
  const res = await fetchWithRetry(`/api/bonuses/conditions/${id}/achieve`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore aggiornamento condizione');
  const data = await res.json();
  return data.data as BonusCondition;
}

async function deleteBonusCondition(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/bonuses/conditions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore eliminazione condizione obiettivo');
}

export {
  getSpecialBonuses, createSpecialBonus, deleteSpecialBonus,
  getBonusConditions, createBonusCondition, achieveBonusCondition, deleteBonusCondition,
  type SpecialBonus, type BonusCondition, type CreateSpecialBonusParams, type CreateBonusConditionParams,
};
```

- [ ] **Step 2: Verificare che il tipo `fetchWithRetry` sia importato correttamente**

Cercare nel codebase come altri service importano `fetchWithRetry` per usare lo stesso path:
```bash
grep -r "fetchWithRetry" archibald-web-app/frontend/src/services --include="*.ts" -l
```
Adattare l'import se necessario.

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/services/bonuses.service.ts
git commit -m "feat(service): add bonuses.service.ts for special bonuses and conditions API"
```

---

## Task 10: Componente `BonusesTab` + tab "Premi" in ProfilePage

**Files:**
- Create: `archibald-web-app/frontend/src/components/BonusesTab.tsx`
- Modify: `archibald-web-app/frontend/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Creare `BonusesTab.tsx`**

```typescript
// BonusesTab.tsx
import { useState, useEffect } from "react";
import {
  getSpecialBonuses, createSpecialBonus, deleteSpecialBonus,
  getBonusConditions, createBonusCondition, achieveBonusCondition, deleteBonusCondition,
  type SpecialBonus, type BonusCondition,
} from "../services/bonuses.service";

export function BonusesTab() {
  const [specialBonuses, setSpecialBonuses] = useState<SpecialBonus[]>([]);
  const [conditions, setConditions] = useState<BonusCondition[]>([]);
  const [loadingSpecial, setLoadingSpecial] = useState(true);
  const [loadingConditions, setLoadingConditions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state — special bonus
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");
  const [addingSpecial, setAddingSpecial] = useState(false);

  // Form state — condition
  const [condTitle, setCondTitle] = useState("");
  const [condReward, setCondReward] = useState("");
  const [condType, setCondType] = useState<"manual" | "budget">("manual");
  const [condThreshold, setCondThreshold] = useState("");
  const [addingCondition, setAddingCondition] = useState(false);

  useEffect(() => {
    getSpecialBonuses()
      .then(setSpecialBonuses)
      .catch(() => setError("Errore caricamento premi speciali"))
      .finally(() => setLoadingSpecial(false));
    getBonusConditions()
      .then(setConditions)
      .catch(() => setError("Errore caricamento condizioni"))
      .finally(() => setLoadingConditions(false));
  }, []);

  async function handleAddSpecialBonus() {
    if (!newTitle || !newAmount || !newDate) return;
    setAddingSpecial(true);
    try {
      const bonus = await createSpecialBonus({ title: newTitle, amount: parseFloat(newAmount), receivedAt: newDate });
      setSpecialBonuses((prev) => [bonus, ...prev]);
      setNewTitle("");
      setNewAmount("");
      setNewDate("");
    } catch {
      setError("Errore aggiunta premio");
    } finally {
      setAddingSpecial(false);
    }
  }

  async function handleDeleteSpecialBonus(id: number) {
    try {
      await deleteSpecialBonus(id);
      setSpecialBonuses((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError("Errore eliminazione premio");
    }
  }

  async function handleAddCondition() {
    if (!condTitle || !condReward) return;
    if (condType === "budget" && !condThreshold) return;
    setAddingCondition(true);
    try {
      const cond = await createBonusCondition({
        title: condTitle,
        rewardAmount: parseFloat(condReward),
        conditionType: condType,
        budgetThreshold: condType === "budget" ? parseFloat(condThreshold) : undefined,
      });
      setConditions((prev) => [...prev, cond]);
      setCondTitle("");
      setCondReward("");
      setCondThreshold("");
      setCondType("manual");
    } catch {
      setError("Errore aggiunta condizione");
    } finally {
      setAddingCondition(false);
    }
  }

  async function handleAchieveCondition(id: number) {
    try {
      const updated = await achieveBonusCondition(id);
      setConditions((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      setError("Errore aggiornamento condizione");
    }
  }

  async function handleDeleteCondition(id: number) {
    try {
      await deleteBonusCondition(id);
      setConditions((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Errore eliminazione condizione");
    }
  }

  const inputStyle = { border: "1px solid #ddd", borderRadius: "6px", padding: "6px 10px", fontSize: "13px", outline: "none" };
  const btnStyle = { background: "#1565c0", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontWeight: 600 };
  const deleteBtnStyle = { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#e53935" };

  return (
    <div>
      {error && (
        <div style={{ background: "#fce4ec", color: "#c62828", padding: "10px", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* Sezione 1: Premi speciali */}
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>Premi speciali ricevuti</div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", background: "#f5f5f5", padding: "6px 10px", fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", gap: "8px" }}>
          <span>Descrizione</span><span style={{ textAlign: "right" }}>Importo</span><span style={{ textAlign: "right" }}>Data</span><span />
        </div>

        {loadingSpecial ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Caricamento...</div>
        ) : specialBonuses.length === 0 ? (
          <div style={{ padding: "12px 10px", color: "#aaa", fontSize: "13px", fontStyle: "italic" }}>Nessun premio speciale registrato</div>
        ) : (
          specialBonuses.map((bonus) => (
            <div key={bonus.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", alignItems: "center" }}>
              <span style={{ fontSize: "13px" }}>{bonus.title}</span>
              <span style={{ fontWeight: 700, color: "#e65100", textAlign: "right", whiteSpace: "nowrap" }}>€ {bonus.amount.toLocaleString("it-IT")}</span>
              <span style={{ color: "#888", textAlign: "right", fontSize: "12px" }}>{new Date(bonus.receivedAt).toLocaleDateString("it-IT")}</span>
              <button style={deleteBtnStyle} onClick={() => handleDeleteSpecialBonus(bonus.id)} title="Elimina">🗑</button>
            </div>
          ))
        )}

        {/* Riga aggiunta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", background: "#fafafa", alignItems: "center" }}>
          <input style={inputStyle} placeholder="Es. Premio fiera Bologna…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <input style={{ ...inputStyle, textAlign: "right" }} placeholder="€ 0" type="number" min="0" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          <input style={inputStyle} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button style={{ ...btnStyle, padding: "6px 8px" }} onClick={handleAddSpecialBonus} disabled={addingSpecial}>＋</button>
        </div>
      </div>

      {/* Sezione 2: Condizioni obiettivo */}
      <div style={{ fontWeight: 700, fontSize: "11px", color: "#888", textTransform: "uppercase", marginBottom: "8px" }}>Condizioni obiettivo</div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 40px", background: "#f5f5f5", padding: "6px 10px", fontSize: "11px", color: "#888", fontWeight: 700, textTransform: "uppercase", gap: "8px" }}>
          <span>Obiettivo</span><span style={{ textAlign: "center" }}>Tipo</span><span style={{ textAlign: "right" }}>Premio</span><span style={{ textAlign: "center" }}>Stato</span><span />
        </div>

        {loadingConditions ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>Caricamento...</div>
        ) : conditions.length === 0 ? (
          <div style={{ padding: "12px 10px", color: "#aaa", fontSize: "13px", fontStyle: "italic" }}>Nessuna condizione obiettivo</div>
        ) : (
          conditions.map((cond) => (
            <div key={cond.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 80px 40px", padding: "8px 10px", gap: "8px", borderTop: "1px solid #eee", alignItems: "center", background: cond.isAchieved ? "#f1f8e9" : "white" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{cond.title}</div>
                {cond.conditionType === "budget" && cond.budgetThreshold && (
                  <div style={{ fontSize: "11px", color: "#888" }}>Soglia: €{cond.budgetThreshold.toLocaleString("it-IT")}</div>
                )}
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: cond.conditionType === "budget" ? "#e3f2fd" : "#f3e5f5", color: cond.conditionType === "budget" ? "#1565c0" : "#7b1fa2" }}>
                  {cond.conditionType === "budget" ? "Auto" : "Manuale"}
                </span>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, color: "#27ae60" }}>+€{cond.rewardAmount.toLocaleString("it-IT")}</div>
              <div style={{ textAlign: "center" }}>
                {cond.isAchieved ? (
                  <span style={{ fontSize: "18px" }}>✅</span>
                ) : cond.conditionType === "manual" ? (
                  <button style={{ ...btnStyle, fontSize: "10px", padding: "3px 8px", background: "#4caf50" }} onClick={() => handleAchieveCondition(cond.id)}>Segna ✓</button>
                ) : (
                  <span style={{ fontSize: "11px", color: "#aaa" }}>Auto</span>
                )}
              </div>
              <button style={deleteBtnStyle} onClick={() => handleDeleteCondition(cond.id)} title="Elimina">🗑</button>
            </div>
          ))
        )}

        {/* Riga aggiunta condizione */}
        <div style={{ padding: "10px", borderTop: "1px solid #eee", background: "#fafafa" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px", gap: "8px", marginBottom: "6px" }}>
            <input style={inputStyle} placeholder="Titolo condizione…" value={condTitle} onChange={(e) => setCondTitle(e.target.value)} />
            <input style={{ ...inputStyle, textAlign: "right" }} placeholder="Premio €" type="number" min="0" value={condReward} onChange={(e) => setCondReward(e.target.value)} />
            <select style={inputStyle} value={condType} onChange={(e) => setCondType(e.target.value as "manual" | "budget")}>
              <option value="manual">Manuale</option>
              <option value="budget">Budget soglia</option>
            </select>
          </div>
          {condType === "budget" && (
            <div style={{ marginBottom: "6px" }}>
              <input style={{ ...inputStyle, width: "160px" }} placeholder="Soglia budget €" type="number" min="0" value={condThreshold} onChange={(e) => setCondThreshold(e.target.value)} />
            </div>
          )}
          <button style={btnStyle} onClick={handleAddCondition} disabled={addingCondition}>＋ Aggiungi condizione</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungere il tab "Premi" in `ProfilePage.tsx`**

Aggiungere l'import in testa al file:
```typescript
import { BonusesTab } from "../components/BonusesTab";
```

Aggiungere lo stato tab (aggiungere after existing `useState` declarations):
```typescript
const [activeTab, setActiveTab] = useState<"target" | "premi">("target");
```

Avvolgere il form target esistente in una struttura a tab. Trovare nel JSX il punto in cui inizia il form principale (di solito un `<div>` con il form). Sostituire con:

```typescript
{/* Tab bar */}
<div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0e0e0", marginBottom: "20px" }}>
  <button
    onClick={() => setActiveTab("target")}
    style={{ padding: "8px 18px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "target" ? 700 : 400, color: activeTab === "target" ? "#1565c0" : "#888", borderBottom: activeTab === "target" ? "3px solid #1565c0" : "3px solid transparent", marginBottom: "-2px" }}
  >
    🎯 Target
  </button>
  <button
    onClick={() => setActiveTab("premi")}
    style={{ padding: "8px 18px", border: "none", background: "none", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "premi" ? 700 : 400, color: activeTab === "premi" ? "#1565c0" : "#888", borderBottom: activeTab === "premi" ? "3px solid #1565c0" : "3px solid transparent", marginBottom: "-2px" }}
  >
    🏆 Premi
  </button>
</div>

{activeTab === "target" && (
  /* tutto il contenuto esistente del form target va qui */
  <> ... </>
)}

{activeTab === "premi" && <BonusesTab />}
```

- [ ] **Step 3: Verificare type-check e test**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/BonusesTab.tsx archibald-web-app/frontend/src/pages/ProfilePage.tsx
git commit -m "feat(profile): add Premi tab with special bonuses and conditions CRUD"
```

---

## Task 11: Verifica finale — tutti i test + build

- [ ] **Step 1: Eseguire tutti i test backend**

```bash
npm test --prefix archibald-web-app/backend
```
Expected: tutti i test passano (nessuna regressione).

- [ ] **Step 2: Eseguire tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Expected: tutti i test passano.

- [ ] **Step 3: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```
Expected: build completato senza errori.

- [ ] **Step 4: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: nessun errore TypeScript.

---

## Self-Review

**Spec coverage check:**

| Sezione spec | Task che la implementa |
|---|---|
| Sezione 1 — Rimozione widget Home | Task 8 |
| Sezione 2 — BonusRoadmapWidget 5 blocchi | Task 7 |
| Sezione 3 — Migration DB | Task 1 |
| Sezione 4 — Repositories | Task 2, 3 |
| Sezione 4 — Route `/api/bonuses` | Task 4 |
| Sezione 5 — Frontend Profile tab "Premi" | Task 9, 10 |
| Sezione 6 — `checkBudgetMilestones` | Task 5 |
| Sezione 7 — Privacy toggle | Task 7 (blocco locked in widget) |
| Types estesi `BonusRoadmapData` | Task 6 |

**Nota migrazione**: la spec scriveva `036` per errore — il piano usa correttamente `035` (l'ultima migrazione esistente è `034-customers-soft-delete.sql`).

**Nota privacy**: la spec accennava a `hideCommissions` come prop — il piano usa correttamente il pattern `usePrivacy()` hook già in uso nel componente esistente.
