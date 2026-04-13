# Promotion Advisor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'admin di caricare promozioni Komet (PDF + metadati) e mostrare banner informativi agli agenti nel form ordine quando inseriscono articoli che rientrano in una promozione attiva.

**Architecture:** Una tabella `system.promotions` con trigger rules JSONB (exact/contains). Il backend espone REST CRUD + upload/serve PDF. Il frontend legge le promo attive all'apertura del form e mostra banner quando un articolo nel carrello matcha una trigger rule. Il sistema è puramente informativo: non modifica prezzi né articoli.

**Tech Stack:** PostgreSQL JSONB, Express + multer (file upload), React 19 + Vitest, TypeScript strict, inline styles.

**Spec:** `docs/superpowers/specs/2026-04-13-promotion-advisor-design.md`

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `backend/src/db/migrations/059-promotions.sql` | CREATE | Schema tabella system.promotions |
| `backend/src/db/repositories/promotions.repository.ts` | CREATE | CRUD DB + tipi PromotionRow |
| `backend/src/db/repositories/promotions.repository.spec.ts` | CREATE | Unit test repository (integrazione DB) |
| `backend/src/routes/promotions.router.ts` | CREATE | Router REST CRUD + PDF upload/serve/delete |
| `backend/src/routes/promotions.router.spec.ts` | CREATE | Integration test router supertest |
| `backend/src/server.ts` | MODIFY | Registra promotions router |
| `backend/docker-compose.yml` (radice progetto) | MODIFY | Volume mount uploads/promotions |
| `frontend/src/types/promotion.ts` | CREATE | Tipi Promotion, TriggerRule |
| `frontend/src/api/promotions.api.ts` | CREATE | Fetch /api/promotions/active e CRUD admin |
| `frontend/src/hooks/usePromotions.ts` | CREATE | Hook fetch + cache + matchesTrigger |
| `frontend/src/hooks/usePromotions.spec.ts` | CREATE | Test hook + matchesTrigger |
| `frontend/src/components/new-order-form/PromotionAdvisor.tsx` | CREATE | Banner mobile (inline) + desktop (sidebar) |
| `frontend/src/components/new-order-form/PromotionAdvisor.spec.tsx` | CREATE | Test rendering + dismiss |
| `frontend/src/components/OrderFormSimple.tsx` | MODIFY | Integra PromotionAdvisor (grid wrapper + hook) |
| `frontend/src/components/admin/PromotionsAdminSection.tsx` | CREATE | Lista promo + form creazione/modifica + PDF upload |
| `frontend/src/components/admin/PromotionsAdminSection.spec.tsx` | CREATE | Test form + validazione |
| `frontend/src/components/admin/AdminModulesSection.tsx` | MODIFY | Aggiunge modulo 'promotion-advisor' a KNOWN_MODULES |
| `frontend/src/pages/AdminPage.tsx` | MODIFY | Aggiunge sezione PromotionsAdminSection |

---

## Task 1: Migration SQL 059

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/059-promotions.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- 059-promotions.sql
CREATE TABLE system.promotions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  tagline        TEXT,
  valid_from     DATE        NOT NULL,
  valid_to       DATE        NOT NULL,
  pdf_key        TEXT,
  trigger_rules  JSONB       NOT NULL DEFAULT '[]',
  selling_points TEXT[]      NOT NULL DEFAULT '{}',
  promo_price    NUMERIC(10,2),
  list_price     NUMERIC(10,2),
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Applica la migration in locale**

```bash
npm run build --prefix archibald-web-app/backend && \
node -e "
const { runMigrations } = require('./archibald-web-app/backend/dist/db/migrate');
const { createPool } = require('./archibald-web-app/backend/dist/db/pool');
const pool = createPool();
runMigrations(pool).then(() => { console.log('done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected output: `Migration 059-promotions.sql applied` (o `already applied` se rieseguita)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/059-promotions.sql
git commit -m "feat(promotions): add system.promotions migration 059"
```

---

## Task 2: Promotions Repository

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/promotions.repository.ts`
- Create: `archibald-web-app/backend/src/db/repositories/promotions.repository.spec.ts`

- [ ] **Step 1: Crea il tipo e le funzioni repository**

```typescript
// archibald-web-app/backend/src/db/repositories/promotions.repository.ts
import type { DbPool } from '../pool'

export type TriggerRule =
  | { type: 'exact'; value: string }
  | { type: 'contains'; value: string }

export type PromotionRow = {
  id: string
  name: string
  tagline: string | null
  valid_from: string
  valid_to: string
  pdf_key: string | null
  trigger_rules: TriggerRule[]
  selling_points: string[]
  promo_price: string | null
  list_price: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const SELECT_COLS = `
  id, name, tagline,
  valid_from::text, valid_to::text,
  pdf_key, trigger_rules, selling_points,
  promo_price::text, list_price::text,
  is_active, created_at::text, updated_at::text
`

export async function getAllPromotions(pool: DbPool): Promise<PromotionRow[]> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions ORDER BY created_at DESC`
  )
  return res.rows
}

export async function getActivePromotions(pool: DbPool): Promise<PromotionRow[]> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions
     WHERE is_active = true
       AND valid_from <= CURRENT_DATE
       AND valid_to   >= CURRENT_DATE
     ORDER BY created_at DESC`
  )
  return res.rows
}

export async function getPromotionById(pool: DbPool, id: string): Promise<PromotionRow | null> {
  const res = await pool.query<PromotionRow>(
    `SELECT ${SELECT_COLS} FROM system.promotions WHERE id = $1`,
    [id]
  )
  return res.rows[0] ?? null
}

export type CreatePromotionInput = {
  name: string
  tagline?: string | null
  validFrom: string
  validTo: string
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice?: number | null
  listPrice?: number | null
  isActive?: boolean
}

export async function createPromotion(
  pool: DbPool,
  input: CreatePromotionInput
): Promise<PromotionRow> {
  const res = await pool.query<PromotionRow>(
    `INSERT INTO system.promotions
       (name, tagline, valid_from, valid_to, trigger_rules, selling_points,
        promo_price, list_price, is_active)
     VALUES ($1, $2, $3::date, $4::date, $5::jsonb, $6::text[], $7, $8, $9)
     RETURNING ${SELECT_COLS}`,
    [
      input.name,
      input.tagline ?? null,
      input.validFrom,
      input.validTo,
      JSON.stringify(input.triggerRules),
      input.sellingPoints,
      input.promoPrice ?? null,
      input.listPrice ?? null,
      input.isActive ?? true,
    ]
  )
  return res.rows[0]
}

export type UpdatePromotionInput = {
  name?: string
  tagline?: string | null
  validFrom?: string
  validTo?: string
  triggerRules?: TriggerRule[]
  sellingPoints?: string[]
  promoPrice?: number | null
  listPrice?: number | null
  isActive?: boolean
  pdfKey?: string | null
}

export async function updatePromotion(
  pool: DbPool,
  id: string,
  input: UpdatePromotionInput
): Promise<PromotionRow | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1

  if (input.name        !== undefined) { sets.push(`name = $${i++}`);                   values.push(input.name) }
  if (input.tagline     !== undefined) { sets.push(`tagline = $${i++}`);                 values.push(input.tagline ?? null) }
  if (input.validFrom   !== undefined) { sets.push(`valid_from = $${i++}::date`);        values.push(input.validFrom) }
  if (input.validTo     !== undefined) { sets.push(`valid_to = $${i++}::date`);          values.push(input.validTo) }
  if (input.triggerRules !== undefined){ sets.push(`trigger_rules = $${i++}::jsonb`);    values.push(JSON.stringify(input.triggerRules)) }
  if (input.sellingPoints !== undefined){ sets.push(`selling_points = $${i++}::text[]`); values.push(input.sellingPoints) }
  if (input.promoPrice  !== undefined) { sets.push(`promo_price = $${i++}`);             values.push(input.promoPrice ?? null) }
  if (input.listPrice   !== undefined) { sets.push(`list_price = $${i++}`);              values.push(input.listPrice ?? null) }
  if (input.isActive    !== undefined) { sets.push(`is_active = $${i++}`);               values.push(input.isActive) }
  if (input.pdfKey      !== undefined) { sets.push(`pdf_key = $${i++}`);                 values.push(input.pdfKey ?? null) }

  if (sets.length === 0) return getPromotionById(pool, id)

  sets.push(`updated_at = now()`)
  values.push(id)

  const res = await pool.query<PromotionRow>(
    `UPDATE system.promotions SET ${sets.join(', ')}
     WHERE id = $${i}
     RETURNING ${SELECT_COLS}`,
    values
  )
  return res.rows[0] ?? null
}

export async function deletePromotion(
  pool: DbPool,
  id: string
): Promise<{ pdfKey: string | null } | null> {
  const res = await pool.query<{ pdf_key: string | null }>(
    `DELETE FROM system.promotions WHERE id = $1 RETURNING pdf_key`,
    [id]
  )
  if (res.rows.length === 0) return null
  return { pdfKey: res.rows[0].pdf_key ?? null }
}
```

- [ ] **Step 2: Scrivi i test integration del repository**

```typescript
// archibald-web-app/backend/src/db/repositories/promotions.repository.spec.ts
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createPool } from '../pool'
import type { DbPool } from '../pool'
import {
  createPromotion, getAllPromotions, getActivePromotions,
  getPromotionById, updatePromotion, deletePromotion,
} from './promotions.repository'

let pool: DbPool
const createdIds: string[] = []

beforeAll(() => { pool = createPool() })
afterAll(async () => { await pool.end() })
afterEach(async () => {
  if (createdIds.length > 0) {
    await pool.query(
      `DELETE FROM system.promotions WHERE id = ANY($1::uuid[])`,
      [createdIds]
    )
    createdIds.length = 0
  }
})

const baseInput = {
  name: 'Test Promo',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  triggerRules: [{ type: 'exact' as const, value: 'CERC.314.014' }],
  sellingPoints: ['Punto A', 'Punto B'],
}

describe('createPromotion', () => {
  test('inserisce e ritorna la promo con tutti i campi', async () => {
    const row = await createPromotion(pool, { ...baseInput, promoPrice: 1390, listPrice: 2343 })
    createdIds.push(row.id)
    expect(row).toMatchObject({
      name: 'Test Promo',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }],
      selling_points: ['Punto A', 'Punto B'],
      promo_price: '1390.00',
      list_price: '2343.00',
      is_active: true,
    })
  })
})

describe('getActivePromotions', () => {
  test('ritorna solo promo con date che includono oggi e is_active=true', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const active = await createPromotion(pool, { ...baseInput, name: 'Active', validFrom: yesterday, validTo: tomorrow })
    const expired = await createPromotion(pool, { ...baseInput, name: 'Expired', validFrom: '2020-01-01', validTo: '2020-12-31' })
    const inactive = await createPromotion(pool, { ...baseInput, name: 'Inactive', validFrom: yesterday, validTo: tomorrow, isActive: false })
    createdIds.push(active.id, expired.id, inactive.id)

    const rows = await getActivePromotions(pool)
    const ids = rows.map(r => r.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(expired.id)
    expect(ids).not.toContain(inactive.id)
  })
})

describe('updatePromotion', () => {
  test('aggiorna solo i campi forniti', async () => {
    const row = await createPromotion(pool, baseInput)
    createdIds.push(row.id)
    const updated = await updatePromotion(pool, row.id, { name: 'Renamed', isActive: false })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.is_active).toBe(false)
    expect(updated?.valid_from).toBe('2026-01-01') // invariato
  })
})

describe('deletePromotion', () => {
  test('elimina la promo e ritorna pdf_key', async () => {
    const row = await createPromotion(pool, baseInput)
    const result = await deletePromotion(pool, row.id)
    expect(result).toEqual({ pdfKey: null })
    expect(await getPromotionById(pool, row.id)).toBeNull()
  })

  test('ritorna null se la promo non esiste', async () => {
    const result = await deletePromotion(pool, '00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Esegui i test integration (richiedono DB locale attivo)**

```bash
npm test --prefix archibald-web-app/backend -- promotions.repository
```

Expected: tutti i test PASS

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/promotions.repository.ts \
        archibald-web-app/backend/src/db/repositories/promotions.repository.spec.ts
git commit -m "feat(promotions): add promotions repository with CRUD"
```

---

## Task 3: Promotions Router + registrazione

**Files:**
- Create: `archibald-web-app/backend/src/routes/promotions.router.ts`
- Create: `archibald-web-app/backend/src/routes/promotions.router.spec.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Controlla se multer è già installato**

```bash
grep '"multer"' archibald-web-app/backend/package.json
```

Se non presente, installalo:
```bash
npm install multer @types/multer --prefix archibald-web-app/backend
```

- [ ] **Step 2: Crea il router**

```typescript
// archibald-web-app/backend/src/routes/promotions.router.ts
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import type { DbPool } from '../db/pool'
import type { Request, Response } from 'express'
import {
  getAllPromotions, getActivePromotions, getPromotionById,
  createPromotion, updatePromotion, deletePromotion,
} from '../db/repositories/promotions.repository'

export type PromotionsRouterDeps = {
  pool: DbPool
  uploadDir: string
}

function requireAdmin(req: Request, res: Response, next: import('express').NextFunction): void {
  const user = (req as any).user
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' })
    return
  }
  next()
}

export function createPromotionsRouter({ pool, uploadDir }: PromotionsRouterDeps): Router {
  const router = Router()

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  })
  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true)
      else cb(new Error('Solo file PDF'))
    },
  })

  // GET /api/promotions/active — tutti gli agenti autenticati
  router.get('/active', async (_req, res) => {
    try {
      const rows = await getActivePromotions(pool)
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // GET /api/promotions — solo admin
  router.get('/', requireAdmin, async (_req, res) => {
    try {
      const rows = await getAllPromotions(pool)
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // POST /api/promotions — solo admin
  router.post('/', requireAdmin, async (req, res) => {
    const { name, tagline, validFrom, validTo, triggerRules, sellingPoints, promoPrice, listPrice, isActive } = req.body
    if (!name || !validFrom || !validTo || !Array.isArray(triggerRules) || !Array.isArray(sellingPoints)) {
      res.status(400).json({ error: 'name, validFrom, validTo, triggerRules, sellingPoints sono obbligatori' })
      return
    }
    try {
      const row = await createPromotion(pool, { name, tagline, validFrom, validTo, triggerRules, sellingPoints, promoPrice, listPrice, isActive })
      res.status(201).json(row)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // PATCH /api/promotions/:id — solo admin
  router.patch('/:id', requireAdmin, async (req, res) => {
    try {
      const row = await updatePromotion(pool, req.params.id, req.body)
      if (!row) { res.status(404).json({ error: 'Not found' }); return }
      res.json(row)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // DELETE /api/promotions/:id — solo admin
  router.delete('/:id', requireAdmin, async (req, res) => {
    try {
      const result = await deletePromotion(pool, req.params.id)
      if (!result) { res.status(404).json({ error: 'Not found' }); return }
      if (result.pdfKey) {
        const filePath = path.join(uploadDir, result.pdfKey)
        await fs.unlink(filePath).catch(() => { /* ignora se già assente */ })
      }
      res.status(204).end()
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // POST /api/promotions/:id/pdf — solo admin
  router.post('/:id/pdf', requireAdmin, upload.single('pdf'), async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'File PDF mancante' }); return }
    try {
      // Recupera promo per cancellare eventuale PDF precedente
      const existing = await getPromotionById(pool, req.params.id)
      if (!existing) {
        await fs.unlink(req.file.path).catch(() => {})
        res.status(404).json({ error: 'Not found' })
        return
      }
      if (existing.pdf_key) {
        await fs.unlink(path.join(uploadDir, existing.pdf_key)).catch(() => {})
      }
      const row = await updatePromotion(pool, req.params.id, { pdfKey: req.file.filename })
      res.json(row)
    } catch (e) {
      await fs.unlink(req.file.path).catch(() => {})
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // GET /api/promotions/:id/pdf — tutti gli agenti autenticati
  router.get('/:id/pdf', async (req, res) => {
    try {
      const promo = await getPromotionById(pool, req.params.id)
      if (!promo?.pdf_key) { res.status(404).json({ error: 'PDF non disponibile' }); return }
      const filePath = path.join(uploadDir, promo.pdf_key)
      res.setHeader('Content-Type', 'application/pdf')
      res.sendFile(filePath, err => {
        if (err) res.status(404).json({ error: 'File non trovato' })
      })
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
```

- [ ] **Step 3: Scrivi i test del router**

```typescript
// archibald-web-app/backend/src/routes/promotions.router.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import path from 'path'
import os from 'os'
import { createPromotionsRouter, type PromotionsRouterDeps } from './promotions.router'

const mockPromo = {
  id: 'uuid-1', name: 'Rocky Promo', tagline: null,
  valid_from: '2026-04-01', valid_to: '2026-06-30',
  pdf_key: null, trigger_rules: [], selling_points: [],
  promo_price: null, list_price: null, is_active: true,
  created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

function makeApp(role: 'admin' | 'agent' = 'admin') {
  const deps: PromotionsRouterDeps = {
    pool: {
      query: vi.fn(),
    } as any,
    uploadDir: os.tmpdir(),
  }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { userId: 'u1', username: 'u1', role }
    next()
  })
  app.use('/api/promotions', createPromotionsRouter(deps))
  return { app, deps }
}

describe('GET /api/promotions/active', () => {
  test('accessibile agli agenti (non-admin)', async () => {
    const { app, deps } = makeApp('agent')
    ;(deps.pool.query as any).mockResolvedValue({ rows: [mockPromo] })
    const res = await request(app).get('/api/promotions/active')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([mockPromo])
  })
})

describe('POST /api/promotions', () => {
  test('crea una promo (admin)', async () => {
    const { app, deps } = makeApp('admin')
    ;(deps.pool.query as any).mockResolvedValue({ rows: [mockPromo] })
    const res = await request(app).post('/api/promotions').send({
      name: 'Rocky Promo',
      validFrom: '2026-04-01',
      validTo: '2026-06-30',
      triggerRules: [{ type: 'exact', value: 'CERC.314.014' }],
      sellingPoints: ['87% più veloce'],
    })
    expect(res.status).toBe(201)
  })

  test('rifiuta gli agent (non-admin)', async () => {
    const { app } = makeApp('agent')
    const res = await request(app).post('/api/promotions').send({
      name: 'X', validFrom: '2026-01-01', validTo: '2026-12-31',
      triggerRules: [], sellingPoints: [],
    })
    expect(res.status).toBe(403)
  })

  test('400 se mancano campi obbligatori', async () => {
    const { app } = makeApp('admin')
    const res = await request(app).post('/api/promotions').send({ name: 'Incompleta' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/promotions/:id', () => {
  test('404 se la promo non esiste', async () => {
    const { app, deps } = makeApp('admin')
    ;(deps.pool.query as any).mockResolvedValue({ rows: [] })
    const res = await request(app).delete('/api/promotions/non-existente')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/backend -- promotions.router
```

Expected: tutti i test PASS

- [ ] **Step 5: Registra il router in `server.ts`**

Apri `archibald-web-app/backend/src/server.ts`. Cerca il blocco dove vengono registrati gli altri router (es. `app.use('/api/customers', authenticate, createCustomersRouter(...))`).

Aggiungi dopo gli import esistenti:
```typescript
import { createPromotionsRouter } from './routes/promotions.router'
import path from 'path' // se non già presente
import { promises as fs } from 'fs' // se non già presente
```

Nel corpo del server, prima della registrazione dei router, aggiungi la creazione della directory:
```typescript
const PROMOTIONS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'promotions')
await fs.mkdir(PROMOTIONS_UPLOAD_DIR, { recursive: true })
```

Poi registra il router:
```typescript
app.use('/api/promotions', authenticate, createPromotionsRouter({
  pool,
  uploadDir: PROMOTIONS_UPLOAD_DIR,
}))
```

- [ ] **Step 6: Verifica build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build senza errori TypeScript

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/promotions.router.ts \
        archibald-web-app/backend/src/routes/promotions.router.spec.ts \
        archibald-web-app/backend/src/server.ts \
        archibald-web-app/backend/package.json \
        archibald-web-app/backend/package-lock.json
git commit -m "feat(promotions): add promotions REST router with PDF upload"
```

---

## Task 4: Frontend — Tipi + matchesTrigger + API

**Files:**
- Create: `archibald-web-app/frontend/src/types/promotion.ts`
- Create: `archibald-web-app/frontend/src/api/promotions.api.ts`

- [ ] **Step 1: Crea i tipi**

```typescript
// archibald-web-app/frontend/src/types/promotion.ts
export type TriggerRule =
  | { type: 'exact'; value: string }
  | { type: 'contains'; value: string }

export type Promotion = {
  id: string
  name: string
  tagline: string | null
  valid_from: string
  valid_to: string
  pdf_key: string | null
  trigger_rules: TriggerRule[]
  selling_points: string[]
  promo_price: string | null
  list_price: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreatePromotionPayload = {
  name: string
  tagline?: string | null
  validFrom: string
  validTo: string
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice?: number | null
  listPrice?: number | null
  isActive?: boolean
}

export type UpdatePromotionPayload = Partial<CreatePromotionPayload>

export function matchesTrigger(articleId: string, rules: TriggerRule[]): boolean {
  return rules.some(rule =>
    rule.type === 'exact'
      ? articleId === rule.value
      : articleId.includes(rule.value)
  )
}

export function calcSavings(promo: Promotion): { savings: number; savingsPct: number } | null {
  const p = promo.promo_price ? parseFloat(promo.promo_price) : null
  const l = promo.list_price ? parseFloat(promo.list_price) : null
  if (p === null || l === null || l === 0) return null
  const savings = l - p
  const savingsPct = Math.round((savings / l) * 100)
  return { savings, savingsPct }
}
```

- [ ] **Step 2: Crea il modulo API**

```typescript
// archibald-web-app/frontend/src/api/promotions.api.ts
import { fetchWithRetry } from './fetch-utils'
import type { Promotion, CreatePromotionPayload, UpdatePromotionPayload } from '../types/promotion'

export async function fetchActivePromotions(): Promise<Promotion[]> {
  const res = await fetchWithRetry('/api/promotions/active')
  if (!res.ok) throw new Error('Failed to fetch active promotions')
  return res.json() as Promise<Promotion[]>
}

export async function fetchAllPromotions(): Promise<Promotion[]> {
  const res = await fetchWithRetry('/api/promotions')
  if (!res.ok) throw new Error('Failed to fetch promotions')
  return res.json() as Promise<Promotion[]>
}

export async function createPromotion(payload: CreatePromotionPayload): Promise<Promotion> {
  const res = await fetchWithRetry('/api/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create promotion')
  return res.json() as Promise<Promotion>
}

export async function updatePromotion(id: string, payload: UpdatePromotionPayload): Promise<Promotion> {
  const res = await fetchWithRetry(`/api/promotions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update promotion')
  return res.json() as Promise<Promotion>
}

export async function deletePromotion(id: string): Promise<void> {
  const res = await fetchWithRetry(`/api/promotions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete promotion')
}

export async function uploadPromotionPdf(id: string, file: File): Promise<Promotion> {
  const form = new FormData()
  form.append('pdf', file)
  const res = await fetch(`/api/promotions/${id}/pdf`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to upload PDF')
  return res.json() as Promise<Promotion>
}

export function getPromotionPdfUrl(id: string): string {
  return `/api/promotions/${id}/pdf`
}
```

**Nota:** Se `fetchWithRetry` non accetta `RequestInit` come secondo parametro, adatta la firma. Cerca il file reale in `src/api/` per verificare la signature.

- [ ] **Step 3: Verifica type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/types/promotion.ts \
        archibald-web-app/frontend/src/api/promotions.api.ts
git commit -m "feat(promotions): add frontend types, matchesTrigger, and API module"
```

---

## Task 5: `usePromotions` hook

**Files:**
- Create: `archibald-web-app/frontend/src/hooks/usePromotions.ts`
- Create: `archibald-web-app/frontend/src/hooks/usePromotions.spec.ts`

- [ ] **Step 1: Scrivi il test prima dell'implementazione**

```typescript
// archibald-web-app/frontend/src/hooks/usePromotions.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePromotions, invalidatePromotionsCache } from './usePromotions'
import * as api from '../api/promotions.api'
import type { Promotion } from '../types/promotion'

vi.mock('../api/promotions.api')

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Test Promo', tagline: null,
  valid_from: '2026-01-01', valid_to: '2026-12-31',
  pdf_key: null,
  trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }],
  selling_points: ['Punto A'],
  promo_price: '1390.00', list_price: '2343.00',
  is_active: true, created_at: '', updated_at: '',
  ...overrides,
})

describe('usePromotions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePromotionsCache() // resetta la cache module-level tra i test
  })

  test('carica le promo attive al mount', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([makePromo()])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activePromotions).toHaveLength(1)
  })

  test('triggeredFor ritorna le promo che matchano gli articoli', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([
      makePromo({ trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }] }),
      makePromo({ id: 'p2', trigger_rules: [{ type: 'contains', value: '.104.' }] }),
    ])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const matchingIds = result.current.triggeredFor(['CERC.314.014', 'H100.104.012']).map(p => p.id)
    expect(matchingIds).toContain('p1')
    expect(matchingIds).toContain('p2')
  })

  test('triggeredFor non include promo senza match', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([
      makePromo({ trigger_rules: [{ type: 'exact', value: 'WK-900LT.000' }] }),
    ])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.triggeredFor(['CERC.314.014'])).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- usePromotions
```

Expected: FAIL con `Cannot find module './usePromotions'`

- [ ] **Step 3: Implementa il hook**

```typescript
// archibald-web-app/frontend/src/hooks/usePromotions.ts
import { useState, useEffect, useCallback } from 'react'
import { fetchActivePromotions } from '../api/promotions.api'
import { matchesTrigger } from '../types/promotion'
import type { Promotion } from '../types/promotion'

// Cache in memoria per la sessione: non rifetcha se già caricato
let cache: Promotion[] | null = null

export function usePromotions() {
  const [activePromotions, setActivePromotions] = useState<Promotion[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    if (cache !== null) return
    fetchActivePromotions()
      .then(data => {
        cache = data
        setActivePromotions(data)
      })
      .catch(() => { /* silenzioso: le promo non sono bloccanti */ })
      .finally(() => setLoading(false))
  }, [])

  const triggeredFor = useCallback(
    (articleIds: string[]): Promotion[] =>
      activePromotions.filter(promo =>
        articleIds.some(id => matchesTrigger(id, promo.trigger_rules))
      ),
    [activePromotions]
  )

  return { activePromotions, loading, triggeredFor }
}

/** Invalida la cache (usato da PromotionsAdminSection dopo modifiche) */
export function invalidatePromotionsCache(): void {
  cache = null
}
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/frontend -- usePromotions
```

Expected: tutti i test PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/hooks/usePromotions.ts \
        archibald-web-app/frontend/src/hooks/usePromotions.spec.ts
git commit -m "feat(promotions): add usePromotions hook with in-memory cache"
```

---

## Task 6: `PromotionAdvisor` component

**Files:**
- Create: `archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.tsx`
- Create: `archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.spec.tsx`

- [ ] **Step 1: Scrivi i test**

```typescript
// archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.spec.tsx
import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromotionAdvisor } from './PromotionAdvisor'
import type { Promotion } from '../../types/promotion'

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Rocky Promo', tagline: 'Il duo definitivo',
  valid_from: '2026-04-01', valid_to: '2026-06-30',
  pdf_key: 'abc.pdf', trigger_rules: [], selling_points: ['87% più veloce', '+74% taglio'],
  promo_price: '1390.00', list_price: '2343.00',
  is_active: true, created_at: '', updated_at: '',
  ...overrides,
})

describe('PromotionAdvisor', () => {
  test('mostra nome e selling points', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    expect(screen.getByText('Rocky Promo')).toBeDefined()
    expect(screen.getByText('87% più veloce')).toBeDefined()
    expect(screen.getByText('+74% taglio')).toBeDefined()
  })

  test('mostra risparmio calcolato se prezzo presente', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    // 2343 - 1390 = 953, 41%
    expect(screen.getByText(/953/)).toBeDefined()
    expect(screen.getByText(/41%/)).toBeDefined()
  })

  test('non mostra risparmio se promo_price o list_price mancanti', () => {
    render(<PromotionAdvisor promotions={[makePromo({ promo_price: null })]} isMobile={true} />)
    expect(screen.queryByText(/risparmio/i)).toBeNull()
  })

  test('dismiss rimuove il banner', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    expect(screen.getByText('Rocky Promo')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /chiudi/i }))
    expect(screen.queryByText('Rocky Promo')).toBeNull()
  })

  test('mostra più banner se ci sono più promo', () => {
    const promos = [
      makePromo({ id: 'p1', name: 'Promo Uno' }),
      makePromo({ id: 'p2', name: 'Promo Due' }),
    ]
    render(<PromotionAdvisor promotions={promos} isMobile={true} />)
    expect(screen.getByText('Promo Uno')).toBeDefined()
    expect(screen.getByText('Promo Due')).toBeDefined()
  })

  test('non renderizza nulla se tutte le promo sono state chiuse', () => {
    const { container } = render(
      <PromotionAdvisor promotions={[makePromo()]} isMobile={true} />
    )
    fireEvent.click(screen.getByRole('button', { name: /chiudi/i }))
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- PromotionAdvisor.spec
```

Expected: FAIL con `Cannot find module './PromotionAdvisor'`

- [ ] **Step 3: Implementa il componente**

```typescript
// archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.tsx
import { useState } from 'react'
import type { Promotion } from '../../types/promotion'
import { calcSavings } from '../../types/promotion'
import { getPromotionPdfUrl } from '../../api/promotions.api'

type Props = {
  promotions: Promotion[]
  isMobile: boolean
}

const COLORS = [
  { border: '#f59e0b', bg: 'linear-gradient(135deg,#fff7ed,#fef3c7)', text: '#92400e', btn: '#f59e0b', btnText: '#fff' },
  { border: '#38bdf8', bg: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', text: '#075985', btn: '#38bdf8', btnText: '#fff' },
  { border: '#a78bfa', bg: 'linear-gradient(135deg,#faf5ff,#ede9fe)', text: '#6b21a8', btn: '#a78bfa', btnText: '#fff' },
]

function PromoBanner({ promo, color, onDismiss }: {
  promo: Promotion
  color: typeof COLORS[number]
  onDismiss: () => void
}) {
  const savings = calcSavings(promo)
  const pdfUrl = promo.pdf_key ? getPromotionPdfUrl(promo.id) : null

  return (
    <div style={{
      background: color.bg,
      border: `1.5px solid ${color.border}`,
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🏷️</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 700, color: color.text, fontSize: 13 }}>{promo.name}</div>
            <button
              aria-label="Chiudi"
              onClick={onDismiss}
              style={{ background: 'none', border: 'none', color: color.text, cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 8, opacity: 0.7 }}
            >✕</button>
          </div>
          {promo.tagline && (
            <div style={{ color: color.text, fontSize: 11, marginTop: 2, fontStyle: 'italic', opacity: 0.8 }}>
              {promo.tagline}
            </div>
          )}
          {promo.selling_points.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {promo.selling_points.map((pt, i) => (
                <div key={i} style={{ color: color.text, fontSize: 11 }}>• {pt}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {promo.promo_price && (
              <div style={{ background: color.btn, borderRadius: 6, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: color.btnText, fontWeight: 700, fontSize: 12 }}>
                  {parseFloat(promo.promo_price).toLocaleString('it-IT')}€
                </span>
                {promo.list_price && (
                  <span style={{ color: color.btnText, fontSize: 10, textDecoration: 'line-through', opacity: 0.75 }}>
                    {parseFloat(promo.list_price).toLocaleString('it-IT')}€
                  </span>
                )}
              </div>
            )}
            {savings && (
              <span style={{ color: color.text, fontSize: 11, fontWeight: 600 }}>
                risparmio {savings.savings.toLocaleString('it-IT')}€ ({savings.savingsPct}%)
              </span>
            )}
            {pdfUrl && (
              <button
                onClick={() => window.open(pdfUrl, '_blank')}
                style={{
                  background: 'transparent', border: `1px solid ${color.border}`,
                  color: color.text, borderRadius: 6, padding: '3px 10px',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                📄 Vedi PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PromotionAdvisor({ promotions, isMobile }: Props) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const visible = promotions.filter(p => !dismissedIds.has(p.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) =>
    setDismissedIds(prev => new Set([...prev, id]))

  if (isMobile) {
    return (
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        {visible.map((promo, i) => (
          <PromoBanner
            key={promo.id}
            promo={promo}
            color={COLORS[i % COLORS.length]}
            onDismiss={() => dismiss(promo.id)}
          />
        ))}
      </div>
    )
  }

  // Desktop: sidebar panel — il contenuto viene renderizzato dal componente padre
  // in una colonna separata (vedere OrderFormSimple integrazione)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map((promo, i) => (
        <PromoBanner
          key={promo.id}
          promo={promo}
          color={COLORS[i % COLORS.length]}
          onDismiss={() => dismiss(promo.id)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Esegui i test — devono passare**

```bash
npm test --prefix archibald-web-app/frontend -- PromotionAdvisor.spec
```

Expected: tutti i test PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.tsx \
        archibald-web-app/frontend/src/components/new-order-form/PromotionAdvisor.spec.tsx
git commit -m "feat(promotions): add PromotionAdvisor banner component"
```

---

## Task 7: Integra `PromotionAdvisor` in `OrderFormSimple.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Aggiungi gli import in cima al file**

Cerca il blocco degli import in `OrderFormSimple.tsx`. Aggiungi dopo gli altri import di componenti:

```typescript
import { PromotionAdvisor } from './new-order-form/PromotionAdvisor'
import { usePromotions } from '../hooks/usePromotions'
```

- [ ] **Step 2: Aggiungi il hook e la computed list nei hook del componente**

Cerca la sezione dove sono dichiarati gli altri hook (`useModules`, `useCallback`, ecc.) e aggiungi:

```typescript
const { triggeredFor } = usePromotions()

const triggeredPromotions = useMemo(
  () => triggeredFor(items.map(item => item.id)),
  [items, triggeredFor]
)
```

- [ ] **Step 3: Integra il componente nel render**

Cerca questa riga nel file (circa riga 4689):
```typescript
{hasModule('discount-traffic-light') && items.length > 0 && (
```

Immediatamente **prima** di quella riga, aggiungi:

```tsx
{/* Promotion Advisor — mobile: inline sotto lista articoli */}
{hasModule('promotion-advisor') && isMobile && triggeredPromotions.length > 0 && (
  <PromotionAdvisor promotions={triggeredPromotions} isMobile={true} />
)}
```

Poi cerca il punto dove è renderizzata la lista articoli (`<OrderItemsList` o il div contenitore della lista articoli + ricerca prodotto). Questo blocco deve essere wrappato in una grid che aggiunge la sidebar su desktop quando ci sono promo attive.

Trova la riga di apertura del div che contiene sia la ricerca prodotto che la lista articoli. Sostituisci il `<div ...>` di apertura con:

```tsx
<div style={{
  display: !isMobile && hasModule('promotion-advisor') && triggeredPromotions.length > 0
    ? 'grid' : 'block',
  gridTemplateColumns: '1fr 260px',
  gap: 16,
  alignItems: 'start',
}}>
  {/* contenuto esistente invariato */}
  {/* Promotion Advisor — desktop: sidebar a destra */}
  {!isMobile && hasModule('promotion-advisor') && triggeredPromotions.length > 0 && (
    <PromotionAdvisor promotions={triggeredPromotions} isMobile={false} />
  )}
</div>
```

**Nota:** se trovare la sezione esatta della lista articoli è ambiguo (il file è 4500+ righe), usa una strategia più semplice: posiziona il `PromotionAdvisor` desktop inline nello stesso punto del mobile (subito prima del DiscountTrafficLight), con stile `position: relative` e card ampia su desktop. È funzionalmente equivalente.

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(promotions): integrate PromotionAdvisor into order form"
```

---

## Task 8: `PromotionsAdminSection`

**Files:**
- Create: `archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.tsx`
- Create: `archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.spec.tsx`

- [ ] **Step 1: Scrivi i test**

```typescript
// archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.spec.tsx
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PromotionsAdminSection } from './PromotionsAdminSection'
import * as api from '../../api/promotions.api'
import type { Promotion } from '../../types/promotion'

vi.mock('../../api/promotions.api')

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Rocky Promo', tagline: null,
  valid_from: '2026-04-18', valid_to: '2026-05-31',
  pdf_key: null, trigger_rules: [], selling_points: [],
  promo_price: null, list_price: null, is_active: true,
  created_at: '2026-04-13T00:00:00Z', updated_at: '2026-04-13T00:00:00Z',
  ...overrides,
})

describe('PromotionsAdminSection', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('mostra la lista promozioni dopo il caricamento', async () => {
    vi.mocked(api.fetchAllPromotions).mockResolvedValue([makePromo()])
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.getByText('Rocky Promo')).toBeDefined())
  })

  test('apre il form vuoto al click su "Nuova promozione"', async () => {
    vi.mocked(api.fetchAllPromotions).mockResolvedValue([])
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.queryByText(/caricamento/i)).toBeNull())
    fireEvent.click(screen.getByText(/nuova promozione/i))
    expect(screen.getByLabelText(/nome promozione/i)).toBeDefined()
  })

  test('salva una nuova promo e ricarica la lista', async () => {
    const newPromo = makePromo({ id: 'p2', name: 'Nuova Promo' })
    vi.mocked(api.fetchAllPromotions).mockResolvedValue([])
    vi.mocked(api.createPromotion).mockResolvedValue(newPromo)
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.queryByText(/caricamento/i)).toBeNull())

    fireEvent.click(screen.getByText(/nuova promozione/i))
    fireEvent.change(screen.getByLabelText(/nome promozione/i), { target: { value: 'Nuova Promo' } })
    fireEvent.change(screen.getByLabelText(/valida dal/i), { target: { value: '2026-04-18' } })
    fireEvent.change(screen.getByLabelText(/valida fino al/i), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByText(/salva/i))

    await waitFor(() => expect(api.createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Nuova Promo',
      validFrom: '2026-04-18',
      validTo: '2026-05-31',
    })))
  })
})
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- PromotionsAdminSection.spec
```

Expected: FAIL con `Cannot find module`

- [ ] **Step 3: Implementa il componente**

```typescript
// archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.tsx
import { useState, useEffect } from 'react'
import type { Promotion, TriggerRule, CreatePromotionPayload } from '../../types/promotion'
import { calcSavings } from '../../types/promotion'
import {
  fetchAllPromotions, createPromotion, updatePromotion,
  deletePromotion, uploadPromotionPdf, getPromotionPdfUrl,
} from '../../api/promotions.api'
import { invalidatePromotionsCache } from '../../hooks/usePromotions'

type FormState = {
  name: string
  tagline: string
  validFrom: string
  validTo: string
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice: string
  listPrice: string
  isActive: boolean
  pendingPdfFile: File | null
}

const EMPTY_FORM: FormState = {
  name: '', tagline: '', validFrom: '', validTo: '',
  triggerRules: [], sellingPoints: [],
  promoPrice: '', listPrice: '', isActive: true, pendingPdfFile: null,
}

function promoToForm(p: Promotion): FormState {
  return {
    name: p.name, tagline: p.tagline ?? '',
    validFrom: p.valid_from, validTo: p.valid_to,
    triggerRules: p.trigger_rules, sellingPoints: p.selling_points,
    promoPrice: p.promo_price ?? '', listPrice: p.list_price ?? '',
    isActive: p.is_active, pendingPdfFile: null,
  }
}

function isActive(p: Promotion): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return p.is_active && p.valid_from <= today && p.valid_to >= today
}

export function PromotionsAdminSection() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null) // null = nuovo
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newTriggerExact, setNewTriggerExact] = useState('')
  const [newTriggerContains, setNewTriggerContains] = useState('')
  const [newSellingPoint, setNewSellingPoint] = useState('')

  useEffect(() => { void reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchAllPromotions()
      setPromotions(data)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Promotion) {
    setEditingId(p.id)
    setForm(promoToForm(p))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.name || !form.validFrom || !form.validTo) return
    setSaving(true)
    try {
      const payload: CreatePromotionPayload = {
        name: form.name,
        tagline: form.tagline || null,
        validFrom: form.validFrom,
        validTo: form.validTo,
        triggerRules: form.triggerRules,
        sellingPoints: form.sellingPoints,
        promoPrice: form.promoPrice ? parseFloat(form.promoPrice) : null,
        listPrice: form.listPrice ? parseFloat(form.listPrice) : null,
        isActive: form.isActive,
      }
      let saved: Promotion
      if (editingId) {
        saved = await updatePromotion(editingId, payload)
      } else {
        saved = await createPromotion(payload)
      }
      if (form.pendingPdfFile) {
        await uploadPromotionPdf(saved.id, form.pendingPdfFile)
      }
      invalidatePromotionsCache()
      await reload()
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await deletePromotion(id)
    invalidatePromotionsCache()
    setConfirmDeleteId(null)
    await reload()
  }

  function addExactTrigger() {
    const v = newTriggerExact.trim()
    if (!v) return
    setForm(f => ({ ...f, triggerRules: [...f.triggerRules, { type: 'exact', value: v }] }))
    setNewTriggerExact('')
  }

  function addContainsTrigger() {
    const v = newTriggerContains.trim()
    if (!v) return
    setForm(f => ({ ...f, triggerRules: [...f.triggerRules, { type: 'contains', value: v }] }))
    setNewTriggerContains('')
  }

  function removeTrigger(i: number) {
    setForm(f => ({ ...f, triggerRules: f.triggerRules.filter((_, idx) => idx !== i) }))
  }

  function addSellingPoint() {
    const v = newSellingPoint.trim()
    if (!v) return
    setForm(f => ({ ...f, sellingPoints: [...f.sellingPoints, v] }))
    setNewSellingPoint('')
  }

  function removeSellingPoint(i: number) {
    setForm(f => ({ ...f, sellingPoints: f.sellingPoints.filter((_, idx) => idx !== i) }))
  }

  // calcola risparmio live nel form
  const livePromoPrice = form.promoPrice ? parseFloat(form.promoPrice) : null
  const liveListPrice = form.listPrice ? parseFloat(form.listPrice) : null
  const liveSavings = livePromoPrice && liveListPrice && liveListPrice > 0
    ? { savings: liveListPrice - livePromoPrice, pct: Math.round(((liveListPrice - livePromoPrice) / liveListPrice) * 100) }
    : null

  if (loading) return (
    <section className="admin-section">
      <div style={{ color: '#64748b', fontSize: 14 }}>Caricamento promozioni...</div>
    </section>
  )

  return (
    <section className="admin-section">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>🏷️ Gestione Promozioni</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            Le promozioni attive appaiono nel form ordine quando l'agente inserisce un articolo corrispondente.
          </p>
        </div>
        <button
          onClick={openNew}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
        >
          + Nuova promozione
        </button>
      </div>

      {/* Lista */}
      {promotions.length === 0 && !showForm && (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Nessuna promozione. Clicca "+ Nuova promozione" per aggiungerne una.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: showForm ? 20 : 0 }}>
        {promotions.map(p => {
          const active = isActive(p)
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: active ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${active ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 8, opacity: active ? 1 : 0.6,
              }}
            >
              <div style={{ width: 8, height: 8, background: active ? '#22c55e' : '#94a3b8', borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{p.name}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  {p.valid_from} – {p.valid_to}
                  {p.trigger_rules.length > 0 && ` · ${p.trigger_rules.length} trigger`}
                  {p.promo_price && ` · ${parseFloat(p.promo_price).toLocaleString('it-IT')}€`}
                  {!active && !p.is_active && ' · Disattivata'}
                  {!active && p.is_active && p.valid_to < new Date().toISOString().slice(0, 10) && ' · Scaduta'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.pdf_key && (
                  <button
                    onClick={() => window.open(getPromotionPdfUrl(p.id), '_blank')}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                  >📄</button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                >✏️ Modifica</button>
                {confirmDeleteId === p.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#ef4444' }}>Sicuro?</span>
                    <button onClick={() => handleDelete(p.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Sì</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(p.id)} style={{ background: '#fff', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: 14 }}>
            {editingId ? '✏️ Modifica promozione' : '+ Nuova promozione'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="promo-name" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Nome promozione *</label>
              <input
                id="promo-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-tagline" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Tagline</label>
              <input
                id="promo-tagline"
                value={form.tagline}
                onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-from" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Valida dal *</label>
              <input
                id="promo-from"
                type="date"
                value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-to" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Valida fino al *</label>
              <input
                id="promo-to"
                type="date"
                value={form.validTo}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* PDF upload */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>PDF Promozione</div>
            <div style={{ background: '#fff', border: '2px dashed #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
              {form.pendingPdfFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📄</span>
                  <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{form.pendingPdfFile.name}</span>
                  <button onClick={() => setForm(f => ({ ...f, pendingPdfFile: null }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>Rimuovi</button>
                </div>
              ) : (
                <label style={{ cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                  📎 Clicca per caricare un PDF (max 20MB)
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) setForm(f => ({ ...f, pendingPdfFile: file }))
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Trigger rules */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Articoli trigger</div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {form.triggerRules.map((rule, i) => (
                  <span
                    key={i}
                    style={{
                      background: rule.type === 'exact' ? '#dbeafe' : '#fef3c7',
                      color: rule.type === 'exact' ? '#1d4ed8' : '#92400e',
                      borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {rule.type === 'contains' ? `contiene: ${rule.value}` : rule.value}
                    <button onClick={() => removeTrigger(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0, fontSize: 11 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newTriggerExact}
                  onChange={e => setNewTriggerExact(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addExactTrigger()}
                  placeholder="Codice esatto (es. CERC.314.014)"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addExactTrigger} style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Esatto</button>
                <input
                  value={newTriggerContains}
                  onChange={e => setNewTriggerContains(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addContainsTrigger()}
                  placeholder="Contiene (es. .104.)"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addContainsTrigger} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Contiene</button>
              </div>
            </div>
          </div>

          {/* Selling points */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Punti di forza</div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {form.sellingPoints.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>{pt}</div>
                    <button onClick={() => removeSellingPoint(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newSellingPoint}
                  onChange={e => setNewSellingPoint(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSellingPoint()}
                  placeholder="Es. Fino all'87% più veloce"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addSellingPoint} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Aggiungi</button>
              </div>
            </div>
          </div>

          {/* Prezzi */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Prezzo (opzionale)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label htmlFor="promo-price" style={{ fontSize: 11, color: '#64748b' }}>Prezzo promozione (€)</label>
                <input
                  id="promo-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.promoPrice}
                  onChange={e => setForm(f => ({ ...f, promoPrice: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginTop: 3, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="list-price" style={{ fontSize: 11, color: '#64748b' }}>Prezzo di listino (€)</label>
                <input
                  id="list-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.listPrice}
                  onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginTop: 3, boxSizing: 'border-box' }}
                />
              </div>
            </div>
            {liveSavings && (
              <div style={{ marginTop: 6, background: '#f0fdf4', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#166534' }}>
                ✓ Risparmio: <strong>{liveSavings.savings.toLocaleString('it-IT')}€ ({liveSavings.pct}%)</strong> — verrà mostrato nel banner
              </div>
            )}
          </div>

          {/* Toggle attiva */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input
              id="promo-active"
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="promo-active" style={{ fontSize: 12, color: '#1e293b' }}>Promozione attiva</label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={closeForm} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.validFrom || !form.validTo}
              style={{
                background: saving ? '#94a3b8' : '#22c55e', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
              }}
            >
              {saving ? 'Salvataggio...' : 'Salva promozione'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- PromotionsAdminSection.spec
```

Expected: tutti i test PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.tsx \
        archibald-web-app/frontend/src/components/admin/PromotionsAdminSection.spec.tsx
git commit -m "feat(promotions): add PromotionsAdminSection admin panel"
```

---

## Task 9: Wire up AdminPage + AdminModulesSection

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/AdminPage.tsx`
- Modify: `archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx`

- [ ] **Step 1: Aggiungi il modulo in AdminModulesSection**

Apri `archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx`.
Trova l'array `KNOWN_MODULES` e aggiungi:

```typescript
const KNOWN_MODULES: Array<{ name: string; label: string; description: string }> = [
  {
    name: 'discount-traffic-light',
    label: '🚦 Semaforo Sconto',
    description: 'Mostra un banner colorato durante la creazione ordine con lo stato dello sconto effettivo documento.',
  },
  {
    name: 'promotion-advisor',
    label: '🏷️ Promotion Advisor',
    description: 'Mostra banner con promozioni Komet attive nel form ordine quando l\'agente inserisce un articolo corrispondente.',
  },
]
```

- [ ] **Step 2: Aggiungi PromotionsAdminSection in AdminPage**

Apri `archibald-web-app/frontend/src/pages/AdminPage.tsx`. Aggiungi l'import:

```typescript
import { PromotionsAdminSection } from '../components/admin/PromotionsAdminSection'
```

Nel JSX, aggiungi la sezione dopo quella del Semaforo Sconto o delle Catalog Operations (scegli una posizione logica nella pagina):

```tsx
<PromotionsAdminSection />
```

- [ ] **Step 3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore

- [ ] **Step 4: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build senza errori

- [ ] **Step 5: Esegui tutti i test**

```bash
npm test --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
```

Expected: tutti i test PASS

- [ ] **Step 6: Commit finale**

```bash
git add archibald-web-app/frontend/src/pages/AdminPage.tsx \
        archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx
git commit -m "feat(promotions): wire up PromotionsAdminSection and register module"
```

---

## Checklist finale pre-deploy

- [ ] Migration 059 applicata in produzione via VPS:
  ```bash
  ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
    "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
     exec -T backend node -e \"require('./dist/db/migrate').runMigrations(require('./dist/db/pool').createPool())\""
  ```
- [ ] Directory `uploads/promotions/` creata nel container backend (avviene automaticamente all'avvio)
- [ ] Modulo `promotion-advisor` abilitato per il ruolo `agent` in AdminPage → Gestione Moduli
- [ ] Test E2E manuale: crea una promo con trigger `CERC.314.014`, carica PDF, apri form ordine, aggiungi CERC.314.014, verifica che il banner appaia
