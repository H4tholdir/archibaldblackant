# Multi-Address Data Layer, Sync & UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store multiple alternative addresses per customer in `agents.customer_addresses`, sync them from Archibald ERP automatically via a new `sync-customer-addresses` BullMQ operation, expose them via a CRUD REST API, and display/manage them in `CustomerCreateModal` (wizard step) and `CustomerCard` (read-only expansion).
**Architecture:** A new `agents.customer_addresses` table (FK to `agents.customers`) holds address rows per customer; a repository layer with full-replace upsert feeds both a scheduler-driven background sync (same pattern as `sync-order-articles`) and an on-demand refresh during interactive editing; the frontend gains a new `customer-addresses.ts` service and replaces the old delivery-field wizard step with an addresses management step.
**Tech Stack:** PostgreSQL, BullMQ, Express, React 19, Vitest, TypeScript

---

## Chunk 1: Database & Repository

### Task 1: Migration 027

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/027-customer-addresses.sql`

- [ ] **Step 1: Create migration file**

```sql
CREATE TABLE agents.customer_addresses (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  customer_profile TEXT NOT NULL,
  tipo             TEXT NOT NULL,
  nome             TEXT,
  via              TEXT,
  cap              TEXT,
  citta            TEXT,
  contea           TEXT,
  stato            TEXT,
  id_regione       TEXT,
  contra           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (customer_profile, user_id)
    REFERENCES agents.customers(customer_profile, user_id)
    ON DELETE CASCADE
);

CREATE INDEX ON agents.customer_addresses (user_id, customer_profile);

ALTER TABLE agents.customers
  ADD COLUMN addresses_synced_at TIMESTAMPTZ DEFAULT NULL;
```

- [ ] **Step 2: Apply migration**
The migration runs automatically on backend start via `runMigrations`. To apply manually:
```bash
npm run migrate --prefix archibald-web-app/backend
```
Or simply start the backend; the migration runner in `src/db/migrate.ts` detects and applies new files in filename-order.

- [ ] **Step 3: Commit**
```bash
git add archibald-web-app/backend/src/db/migrations/027-customer-addresses.sql
git commit -m "feat(db): add customer_addresses table and addresses_synced_at column (migration 027)"
```

---

### Task 2: Repository `customer-addresses.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/customer-addresses.ts`
- Test: `archibald-web-app/backend/src/db/repositories/customer-addresses.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/backend/src/db/repositories/customer-addresses.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getAddressesByCustomer,
  upsertAddressesForCustomer,
  getAddressById,
  getCustomersNeedingAddressSync,
  setAddressesSyncedAt,
  type AltAddress,
} from './customer-addresses';

const userId = 'user-1';
const customerProfile = 'CUST-001';

const altAddr1: AltAddress = {
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '80100',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

const altAddr2: AltAddress = {
  tipo: 'Ufficio',
  nome: 'HQ',
  via: 'Via Milano 5',
  cap: '20100',
  citta: 'Milano',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount: number }> = []): DbPool {
  let callIndex = 0;
  const mockQuery = vi.fn().mockImplementation(() => {
    const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(result);
  });
  const mockTx = { query: mockQuery };
  return {
    query: mockQuery,
    withTransaction: vi.fn().mockImplementation(async (fn) => fn(mockTx)),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

describe('getAddressesByCustomer', () => {
  it('returns mapped addresses for given user and customer', async () => {
    const row = {
      id: 1, user_id: userId, customer_profile: customerProfile,
      tipo: 'Consegna', nome: null, via: 'Via Roma 1',
      cap: '80100', citta: 'Napoli', contea: null, stato: null,
      id_regione: null, contra: null,
    };
    const pool = createMockPool([{ rows: [row], rowCount: 1 }]);

    const result = await getAddressesByCustomer(pool, userId, customerProfile);

    expect(result).toEqual([{
      id: 1,
      userId,
      customerProfile,
      tipo: 'Consegna',
      nome: null,
      via: 'Via Roma 1',
      cap: '80100',
      citta: 'Napoli',
      contea: null,
      stato: null,
      idRegione: null,
      contra: null,
    }]);
  });

  it('returns empty array when no addresses found', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);
    const result = await getAddressesByCustomer(pool, userId, customerProfile);
    expect(result).toEqual([]);
  });
});

describe('upsertAddressesForCustomer', () => {
  it('calls DELETE then INSERT for each address within a transaction', async () => {
    const pool = createMockPool([
      { rows: [], rowCount: 0 }, // DELETE
      { rows: [], rowCount: 1 }, // INSERT addr1
      { rows: [], rowCount: 1 }, // INSERT addr2
    ]);

    await upsertAddressesForCustomer(pool, userId, customerProfile, [altAddr1, altAddr2]);

    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const txQuery = (pool as any).query as ReturnType<typeof vi.fn>;
    expect(txQuery).toHaveBeenCalledTimes(3);
    expect(txQuery.mock.calls[0][0]).toContain('DELETE FROM agents.customer_addresses');
    expect(txQuery.mock.calls[1][0]).toContain('INSERT INTO agents.customer_addresses');
    expect(txQuery.mock.calls[2][0]).toContain('INSERT INTO agents.customer_addresses');
  });

  it('calls DELETE only (no INSERT) when addresses array is empty', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);

    await upsertAddressesForCustomer(pool, userId, customerProfile, []);

    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const txQuery = (pool as any).query as ReturnType<typeof vi.fn>;
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls[0][0]).toContain('DELETE FROM agents.customer_addresses');
  });
});

describe('getAddressById', () => {
  it('returns null when address not found', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);
    const result = await getAddressById(pool, userId, 999);
    expect(result).toBeNull();
  });

  it('returns mapped address when found', async () => {
    const row = {
      id: 42, user_id: userId, customer_profile: customerProfile,
      tipo: 'Fattura', nome: null, via: null, cap: null,
      citta: null, contea: null, stato: null, id_regione: null, contra: null,
    };
    const pool = createMockPool([{ rows: [row], rowCount: 1 }]);
    const result = await getAddressById(pool, userId, 42);
    expect(result).toEqual({
      id: 42, userId, customerProfile, tipo: 'Fattura',
      nome: null, via: null, cap: null, citta: null,
      contea: null, stato: null, idRegione: null, contra: null,
    });
  });
});

describe('getCustomersNeedingAddressSync', () => {
  it('returns customer_profile and name for customers with null addresses_synced_at', async () => {
    const pool = createMockPool([{
      rows: [
        { customer_profile: 'CUST-001', name: 'Aaa' },
        { customer_profile: 'CUST-002', name: 'Bbb' },
      ],
      rowCount: 2,
    }]);

    const result = await getCustomersNeedingAddressSync(pool, userId, 10);

    expect(result).toEqual([
      { customer_profile: 'CUST-001', name: 'Aaa' },
      { customer_profile: 'CUST-002', name: 'Bbb' },
    ]);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('addresses_synced_at IS NULL');
  });
});

describe('setAddressesSyncedAt', () => {
  it('updates addresses_synced_at to NOW() for given customer and user', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await setAddressesSyncedAt(pool, userId, customerProfile);
    const q = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(q).toContain('addresses_synced_at = NOW()');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix archibald-web-app/backend -- customer-addresses
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// archibald-web-app/backend/src/db/repositories/customer-addresses.ts
import type { DbPool } from '../pool';

type CustomerAddress = {
  id: number;
  userId: string;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

type AltAddress = {
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

type CustomerAddressRow = {
  id: number;
  user_id: string;
  customer_profile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  id_regione: string | null;
  contra: string | null;
};

function mapRowToCustomerAddress(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    userId: row.user_id,
    customerProfile: row.customer_profile,
    tipo: row.tipo,
    nome: row.nome,
    via: row.via,
    cap: row.cap,
    citta: row.citta,
    contea: row.contea,
    stato: row.stato,
    idRegione: row.id_regione,
    contra: row.contra,
  };
}

async function getAddressesByCustomer(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<CustomerAddress[]> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `SELECT id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
     FROM agents.customer_addresses
     WHERE user_id = $1 AND customer_profile = $2
     ORDER BY id ASC`,
    [userId, customerProfile],
  );
  return rows.map(mapRowToCustomerAddress);
}

async function upsertAddressesForCustomer(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  addresses: AltAddress[],
): Promise<void> {
  await pool.withTransaction(async (tx) => {
    await tx.query(
      'DELETE FROM agents.customer_addresses WHERE user_id = $1 AND customer_profile = $2',
      [userId, customerProfile],
    );
    for (const addr of addresses) {
      await tx.query(
        `INSERT INTO agents.customer_addresses
           (user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, customerProfile,
          addr.tipo, addr.nome, addr.via, addr.cap, addr.citta,
          addr.contea, addr.stato, addr.idRegione, addr.contra,
        ],
      );
    }
  });
}

async function getAddressById(
  pool: DbPool,
  userId: string,
  id: number,
): Promise<CustomerAddress | null> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `SELECT id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra
     FROM agents.customer_addresses
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? mapRowToCustomerAddress(rows[0]) : null;
}

async function getCustomersNeedingAddressSync(
  pool: DbPool,
  userId: string,
  limit: number,
): Promise<Array<{ customer_profile: string; name: string }>> {
  const { rows } = await pool.query<{ customer_profile: string; name: string }>(
    `SELECT customer_profile, name
     FROM agents.customers
     WHERE user_id = $1
       AND addresses_synced_at IS NULL
     ORDER BY name ASC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

async function setAddressesSyncedAt(
  pool: DbPool,
  userId: string,
  customerProfile: string,
): Promise<void> {
  await pool.query(
    'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE customer_profile = $1 AND user_id = $2',
    [customerProfile, userId],
  );
}

async function addAddress(
  pool: DbPool,
  userId: string,
  customerProfile: string,
  address: AltAddress,
): Promise<CustomerAddress> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `INSERT INTO agents.customer_addresses
       (user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
    [
      userId, customerProfile,
      address.tipo, address.nome, address.via, address.cap, address.citta,
      address.contea, address.stato, address.idRegione, address.contra,
    ],
  );
  return mapRowToCustomerAddress(rows[0]);
}

async function updateAddress(
  pool: DbPool,
  userId: string,
  id: number,
  address: AltAddress,
): Promise<CustomerAddress | null> {
  const { rows } = await pool.query<CustomerAddressRow>(
    `UPDATE agents.customer_addresses
     SET tipo = $3, nome = $4, via = $5, cap = $6, citta = $7,
         contea = $8, stato = $9, id_regione = $10, contra = $11,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, customer_profile, tipo, nome, via, cap, citta, contea, stato, id_regione, contra`,
    [
      id, userId,
      address.tipo, address.nome, address.via, address.cap, address.citta,
      address.contea, address.stato, address.idRegione, address.contra,
    ],
  );
  return rows[0] ? mapRowToCustomerAddress(rows[0]) : null;
}

async function deleteAddress(
  pool: DbPool,
  userId: string,
  id: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.customer_addresses WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getAddressesByCustomer,
  upsertAddressesForCustomer,
  getAddressById,
  getCustomersNeedingAddressSync,
  setAddressesSyncedAt,
  addAddress,
  updateAddress,
  deleteAddress,
  type CustomerAddress,
  type AltAddress,
  type CustomerAddressRow,
};
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix archibald-web-app/backend -- customer-addresses
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/backend/src/db/repositories/customer-addresses.ts archibald-web-app/backend/src/db/repositories/customer-addresses.spec.ts
git commit -m "feat(db): add customer-addresses repository with upsert, CRUD, and sync helpers"
```

---

## Chunk 2: API Routes & Sync Handler

### Task 3: CRUD API Router `customer-addresses.ts`

**Files:**
- Create: `archibald-web-app/backend/src/routes/customer-addresses.ts`
- Test: `archibald-web-app/backend/src/routes/customer-addresses.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/backend/src/routes/customer-addresses.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { DbPool } from '../db/pool';
import { createCustomerAddressesRouter } from './customer-addresses';

const userId = 'user-1';
const customerProfile = 'CUST-001';

const mockAddress = {
  id: 1,
  userId,
  customerProfile,
  tipo: 'Consegna',
  nome: null,
  via: 'Via Roma 1',
  cap: '80100',
  citta: 'Napoli',
  contea: null,
  stato: null,
  idRegione: null,
  contra: null,
};

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn().mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

function createApp(pool: DbPool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId, username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/customers/:customerProfile/addresses', createCustomerAddressesRouter(pool));
  return app;
}

describe('createCustomerAddressesRouter', () => {
  let pool: DbPool;

  beforeEach(() => {
    pool = createMockPool();
  });

  describe('GET /', () => {
    it('returns 200 with addresses array', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Consegna', nome: null, via: 'Via Roma 1', cap: '80100',
        citta: 'Napoli', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .get(`/api/customers/${customerProfile}/addresses`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([mockAddress]);
    });
  });

  describe('POST /', () => {
    it('returns 201 with created address when tipo is provided', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Ufficio', nome: null, via: 'Via X', cap: '10100',
        citta: 'Torino', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .post(`/api/customers/${customerProfile}/addresses`)
        .send({ tipo: 'Ufficio', via: 'Via X', cap: '10100', citta: 'Torino' });

      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('Ufficio');
    });

    it('returns 400 when tipo is missing', async () => {
      const res = await request(createApp(pool))
        .post(`/api/customers/${customerProfile}/addresses`)
        .send({ via: 'Via X' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:id', () => {
    it('returns 200 with updated address', async () => {
      const row = {
        id: 1, user_id: userId, customer_profile: customerProfile,
        tipo: 'Fattura', nome: null, via: 'Via Y', cap: '00100',
        citta: 'Roma', contea: null, stato: null, id_regione: null, contra: null,
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const res = await request(createApp(pool))
        .put(`/api/customers/${customerProfile}/addresses/1`)
        .send({ tipo: 'Fattura', via: 'Via Y', cap: '00100', citta: 'Roma' });

      expect(res.status).toBe(200);
      expect(res.body.tipo).toBe('Fattura');
    });

    it('returns 404 when address id not found for this user', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(createApp(pool))
        .put(`/api/customers/${customerProfile}/addresses/999`)
        .send({ tipo: 'Ufficio' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('returns 204 when address deleted successfully', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(createApp(pool))
        .delete(`/api/customers/${customerProfile}/addresses/1`);

      expect(res.status).toBe(204);
    });

    it('returns 404 when address not found for this user', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(createApp(pool))
        .delete(`/api/customers/${customerProfile}/addresses/999`);

      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix archibald-web-app/backend -- customer-addresses.spec
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// archibald-web-app/backend/src/routes/customer-addresses.ts
import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getAddressesByCustomer,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../db/repositories/customer-addresses';

const addressBodySchema = z.object({
  tipo: z.string().min(1, 'tipo obbligatorio'),
  nome: z.string().optional().nullable(),
  via: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  contea: z.string().optional().nullable(),
  stato: z.string().optional().nullable(),
  idRegione: z.string().optional().nullable(),
  contra: z.string().optional().nullable(),
});

function createCustomerAddressesRouter(pool: DbPool): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const addresses = await getAddressesByCustomer(pool, userId, customerProfile);
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore recupero indirizzi' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const parsed = addressBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }
      const address = await addAddress(pool, userId, customerProfile, {
        tipo: parsed.data.tipo,
        nome: parsed.data.nome ?? null,
        via: parsed.data.via ?? null,
        cap: parsed.data.cap ?? null,
        citta: parsed.data.citta ?? null,
        contea: parsed.data.contea ?? null,
        stato: parsed.data.stato ?? null,
        idRegione: parsed.data.idRegione ?? null,
        contra: parsed.data.contra ?? null,
      });
      res.status(201).json(address);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore creazione indirizzo' });
    }
  });

  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(req.params.id, 10);
      const parsed = addressBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }
      const updated = await updateAddress(pool, userId, id, {
        tipo: parsed.data.tipo,
        nome: parsed.data.nome ?? null,
        via: parsed.data.via ?? null,
        cap: parsed.data.cap ?? null,
        citta: parsed.data.citta ?? null,
        contea: parsed.data.contea ?? null,
        stato: parsed.data.stato ?? null,
        idRegione: parsed.data.idRegione ?? null,
        contra: parsed.data.contra ?? null,
      });
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Indirizzo non trovato' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore aggiornamento indirizzo' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(req.params.id, 10);
      const deleted = await deleteAddress(pool, userId, id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Indirizzo non trovato' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore eliminazione indirizzo' });
    }
  });

  return router;
}

export { createCustomerAddressesRouter };
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix archibald-web-app/backend -- customer-addresses.spec
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/backend/src/routes/customer-addresses.ts archibald-web-app/backend/src/routes/customer-addresses.spec.ts
git commit -m "feat(api): add CRUD router for customer addresses at /api/customers/:customerProfile/addresses"
```

---

### Task 4: Sync Handler `sync-customer-addresses.ts`

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import {
  handleSyncCustomerAddresses,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesData,
} from './sync-customer-addresses';

const userId = 'user-1';

const mockAltAddresses: AltAddress[] = [
  {
    tipo: 'Consegna',
    nome: null,
    via: 'Via Roma 1',
    cap: '80100',
    citta: 'Napoli',
    contea: null,
    stato: null,
    idRegione: null,
    contra: null,
  },
];

const data: SyncCustomerAddressesData = {
  customerProfile: 'CUST-001',
  customerName: 'Rossi Mario',
};

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn().mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) })),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

function createMockBot(addresses: AltAddress[] = mockAltAddresses): SyncCustomerAddressesBot {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    navigateToEditCustomerForm: vi.fn().mockResolvedValue(undefined),
    readAltAddresses: vi.fn().mockResolvedValue(addresses),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleSyncCustomerAddresses', () => {
  it('navigates to customer, reads addresses, upserts them, and sets synced_at', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    const result = await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(bot.initialize).toHaveBeenCalledOnce();
    expect(bot.navigateToEditCustomerForm).toHaveBeenCalledWith(data.customerName);
    expect(bot.readAltAddresses).toHaveBeenCalledOnce();
    expect(pool.withTransaction).toHaveBeenCalledOnce();
    const updateCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('addresses_synced_at = NOW()'),
    );
    expect(updateCall).toBeDefined();
    expect(result).toEqual({ addressesCount: mockAltAddresses.length });
  });

  it('calls bot.close() in the finally block even when readAltAddresses throws', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    (bot.readAltAddresses as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('scrape error'));
    const onProgress = vi.fn();

    await expect(
      handleSyncCustomerAddresses(pool, bot, data, userId, onProgress),
    ).rejects.toThrow('scrape error');

    expect(bot.close).toHaveBeenCalledOnce();
  });

  it('reports progress milestones', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(onProgress).toHaveBeenCalledWith(10, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(60, expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  it('returns addressesCount 0 when no addresses found', async () => {
    const pool = createMockPool();
    const bot = createMockBot([]);
    const onProgress = vi.fn();

    const result = await handleSyncCustomerAddresses(pool, bot, data, userId, onProgress);

    expect(result).toEqual({ addressesCount: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix archibald-web-app/backend -- sync-customer-addresses
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';

type SyncCustomerAddressesData = {
  customerProfile: string;
  customerName: string;
};

type SyncCustomerAddressesBot = {
  initialize: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;
  readAltAddresses: () => Promise<AltAddress[]>;
  close: () => Promise<void>;
};

type SyncCustomerAddressesResult = {
  addressesCount: number;
};

async function handleSyncCustomerAddresses(
  pool: DbPool,
  bot: SyncCustomerAddressesBot,
  data: SyncCustomerAddressesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<SyncCustomerAddressesResult> {
  onProgress(10, 'Navigazione al cliente');
  await bot.initialize();
  try {
    await bot.navigateToEditCustomerForm(data.customerName);
    const addresses = await bot.readAltAddresses();
    onProgress(60, 'Salvataggio indirizzi');
    await upsertAddressesForCustomer(pool, userId, data.customerProfile, addresses);
    await pool.query(
      'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE customer_profile = $1 AND user_id = $2',
      [data.customerProfile, userId],
    );
    onProgress(100, 'Indirizzi sincronizzati');
    return { addressesCount: addresses.length };
  } finally {
    await bot.close();
  }
}

function createSyncCustomerAddressesHandler(
  pool: DbPool,
  createBot: (userId: string) => SyncCustomerAddressesBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SyncCustomerAddressesData;
    const result = await handleSyncCustomerAddresses(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleSyncCustomerAddresses,
  createSyncCustomerAddressesHandler,
  type SyncCustomerAddressesData,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesResult,
};
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix archibald-web-app/backend -- sync-customer-addresses
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.ts archibald-web-app/backend/src/operations/handlers/sync-customer-addresses.spec.ts
git commit -m "feat(sync): add sync-customer-addresses handler with bot interface and upsert integration"
```

---

### Task 5: Register in `operation-types.ts` and `handlers/index.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-types.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/index.ts`

- [ ] **Step 1: Update `operation-types.ts`**

In `OPERATION_TYPES` array, after `'sync-tracking'`, append:
```typescript
'sync-customer-addresses',
```

In `OPERATION_PRIORITIES`, after `'sync-tracking': 17,`, add:
```typescript
'sync-customer-addresses': 18,
```

In `SCHEDULED_SYNCS` set, after `'sync-tracking',`, add:
```typescript
'sync-customer-addresses',
```

The file should now look like:
```typescript
const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'send-to-verona',
  'edit-order',
  'delete-order',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  'sync-order-states',
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-tracking',
  'sync-customer-addresses',
] as const;

// ...

const OPERATION_PRIORITIES: Record<OperationType, number> = {
  // ...existing entries...
  'sync-tracking': 17,
  'sync-customer-addresses': 18,
};

// ...

const SCHEDULED_SYNCS: ReadonlySet<OperationType> = new Set([
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-order-articles',
  'sync-tracking',
  'sync-customer-addresses',
]);
```

- [ ] **Step 2: Update `handlers/index.ts`**

Add export line after `createSyncTrackingHandler`:
```typescript
export { createSyncCustomerAddressesHandler, type SyncCustomerAddressesBot } from './sync-customer-addresses';
```

- [ ] **Step 3: Verify build passes**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success (TypeScript validates all `OperationType` usages including the new entry)

- [ ] **Step 4: Commit**
```bash
git add archibald-web-app/backend/src/operations/operation-types.ts archibald-web-app/backend/src/operations/handlers/index.ts
git commit -m "feat(ops): register sync-customer-addresses in operation-types and handler index"
```

---

## Chunk 3: Scheduler, Customer Sync Reset & Wiring

### Task 6: Sync Scheduler — add address sync

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add the following `describe('address sync auto-enqueue', ...)` block to `sync-scheduler.spec.ts`, alongside the existing `describe('article sync auto-enqueue', ...)` block:

```typescript
// In sync-scheduler.spec.ts — add new imports and describe block

// Update the existing import line to include the new exports:
import {
  createSyncScheduler,
  SAFETY_TIMEOUT_MS,
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  type SyncIntervals,
  type GetCustomersNeedingAddressSyncFn,
} from './sync-scheduler';

// Add this describe block after the 'article sync auto-enqueue' describe block:
describe('address sync auto-enqueue', () => {
  test('enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for customers needing address sync', async () => {
    const enqueue = createMockEnqueue();
    const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
      { customer_profile: 'CUST-001', name: 'Rossi Mario' },
      { customer_profile: 'CUST-002', name: 'Verdi Luca' },
    ]);
    const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

    scheduler.start(intervals);
    await vi.advanceTimersByTimeAsync(100);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

    await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

    expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
    expect(enqueue).toHaveBeenCalledWith('sync-customer-addresses', 'user-1', {
      customerProfile: 'CUST-001',
      customerName: 'Rossi Mario',
    });
    expect(enqueue).toHaveBeenCalledWith('sync-customer-addresses', 'user-1', {
      customerProfile: 'CUST-002',
      customerName: 'Verdi Luca',
    });

    scheduler.stop();
  });

  test('calls getCustomersNeedingAddressSync for each active agent', async () => {
    const enqueue = createMockEnqueue();
    const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
    const scheduler = createSyncScheduler(enqueue, () => ['user-1', 'user-2'], undefined, getCustomersNeedingAddressSync);

    scheduler.start(intervals);
    await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

    expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
    expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-2', ADDRESS_SYNC_BATCH_LIMIT);

    scheduler.stop();
  });

  test('does not enqueue address syncs when no customers need sync', async () => {
    const enqueue = createMockEnqueue();
    const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
    const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

    scheduler.start(intervals);
    await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

    scheduler.stop();
  });

  test('does not call getCustomersNeedingAddressSync when not provided', async () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

    scheduler.start(intervals);
    await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

    scheduler.stop();
  });

  test('swallows errors from getCustomersNeedingAddressSync gracefully', async () => {
    const enqueue = createMockEnqueue();
    const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockRejectedValue(new Error('db error'));
    const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

    scheduler.start(intervals);
    await expect(vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS)).resolves.not.toThrow();

    expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

    scheduler.stop();
  });

  test('stop() cancels pending address sync timeouts', async () => {
    const enqueue = createMockEnqueue();
    const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
      { customer_profile: 'CUST-001', name: 'Rossi' },
    ]);
    const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

    scheduler.start(intervals);
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    enqueue.mockClear();
    await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix archibald-web-app/backend -- sync-scheduler
```
Expected: FAIL — `ADDRESS_SYNC_BATCH_LIMIT` and `ADDRESS_SYNC_DELAY_MS` not exported, 4th param not accepted

- [ ] **Step 3: Update `sync-scheduler.ts`**

Add the type and new constant declarations near the existing constants (after line `const ARTICLE_SYNC_DELAY_MS = ...`):

```typescript
const ADDRESS_SYNC_BATCH_LIMIT = 10;
const ADDRESS_SYNC_DELAY_MS = 5 * 60 * 1000;

type GetCustomersNeedingAddressSyncFn = (
  userId: string,
  limit: number,
) => Promise<Array<{ customer_profile: string; name: string }>>;
```

Change the `createSyncScheduler` signature to accept a 4th optional parameter:

```typescript
function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => string[],
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
) {
```

Inside the `agentSyncMs` interval (the `setInterval` callback that loops `for (const userId of agentIds)`), after the existing article sync `if` block, add:

```typescript
          if (getCustomersNeedingAddressSync) {
            const agentUserId = userId;
            pendingTimeouts.push(setTimeout(() => {
              getCustomersNeedingAddressSync(agentUserId, ADDRESS_SYNC_BATCH_LIMIT)
                .then((customers) => {
                  for (const c of customers) {
                    enqueue('sync-customer-addresses', agentUserId, {
                      customerProfile: c.customer_profile,
                      customerName: c.name,
                    });
                  }
                })
                .catch((error) => {
                  logger.error('Failed to fetch customers needing address sync', { userId: agentUserId, error });
                });
            }, ADDRESS_SYNC_DELAY_MS));
          }
```

Update the export line to include new exports:

```typescript
export {
  createSyncScheduler,
  SAFETY_TIMEOUT_MS,
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  type SyncScheduler,
  type SyncIntervals,
  type EnqueueFn,
  type GetOrdersNeedingArticleSyncFn,
  type GetCustomersNeedingAddressSyncFn,
};
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix archibald-web-app/backend -- sync-scheduler
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "feat(scheduler): add address sync auto-enqueue after 5-minute delay per agent cycle"
```

---

### Task 7: `customer-sync.ts` — reset `addresses_synced_at` on customer data change

**Files:**
- Modify: `archibald-web-app/backend/src/sync/services/customer-sync.ts`

- [ ] **Step 1: Locate and update the UPDATE query**

In `customer-sync.ts`, in the `else if (existing.hash !== hash)` branch, find the existing UPDATE query that sets `hash=$30, last_sync=$31, updated_at=NOW()`. Add `addresses_synced_at = NULL` to the SET clause, before `hash`:

The current SET clause (lines 127-137 of customer-sync.ts) ends with:
```
            hash=$30, last_sync=$31, updated_at=NOW()
```

Change it to:
```
            hash=$30, last_sync=$31, updated_at=NOW(), addresses_synced_at = NULL
```

No new parameter is needed — `addresses_synced_at = NULL` is a literal NULL, not a parameterized value.

- [ ] **Step 2: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success

- [ ] **Step 3: Commit**
```bash
git add archibald-web-app/backend/src/sync/services/customer-sync.ts
git commit -m "feat(sync): reset addresses_synced_at to NULL when customer data hash changes"
```

---

### Task 8: `main.ts` — wire `getCustomersNeedingAddressSync`

**Files:**
- Modify: `archibald-web-app/backend/src/main.ts`

- [ ] **Step 1: Add import**

After the existing import `import { getOrdersNeedingArticleSync } from './db/repositories/orders';`, add:

```typescript
import { getCustomersNeedingAddressSync } from './db/repositories/customer-addresses';
```

- [ ] **Step 2: Update `createSyncScheduler` call**

Find the current call (line 226-230 of main.ts):
```typescript
  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => cachedAgentIds,
    (userId, limit) => getOrdersNeedingArticleSync(pool, userId, limit),
  );
```

Change to:
```typescript
  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => cachedAgentIds,
    (userId, limit) => getOrdersNeedingArticleSync(pool, userId, limit),
    (userId, limit) => getCustomersNeedingAddressSync(pool, userId, limit),
  );
```

- [ ] **Step 3: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success

- [ ] **Step 4: Register handler in `main.ts`**

In the `handlers` object (line ~442 of main.ts), after `'sync-order-articles': createSyncOrderArticlesHandler(...)`, add:

```typescript
    'sync-customer-addresses': createSyncCustomerAddressesHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      return {
        initialize: async () => bot.initialize(),
        navigateToEditCustomerForm: async (name) => bot.navigateToEditCustomerForm(name),
        readAltAddresses: async () => bot.readAltAddresses(),
        close: async () => bot.close(),
      };
    }),
```

Also add the import of `createSyncCustomerAddressesHandler` to the existing named import from `'./operations/handlers'`:
```typescript
  createSyncCustomerAddressesHandler,
```

- [ ] **Step 5: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success

- [ ] **Step 6: Commit**
```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(main): wire getCustomersNeedingAddressSync into scheduler and register handler"
```

---

### Task 9: `server.ts` — mount customer-addresses router and wire interactive deps

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Add import**

At the top of `server.ts`, add after the existing route imports:
```typescript
import { createCustomerAddressesRouter } from './routes/customer-addresses';
import {
  upsertAddressesForCustomer as upsertAddressesForCustomerRepo,
} from './db/repositories/customer-addresses';
```

- [ ] **Step 2: Mount the addresses router BEFORE `createCustomersRouter`**

Find the line:
```typescript
  app.use('/api/customers', authenticateJWT, createCustomersRouter({
```

BEFORE that line, add:
```typescript
  app.use('/api/customers/:customerProfile/addresses', authenticateJWT, createCustomerAddressesRouter(pool));
```

This prevents Express route shadowing (the more specific path must be mounted first).

- [ ] **Step 3: Add `upsertAddressesForCustomer` and `setAddressesSyncedAt` to `createCustomerInteractiveRouter` call**

Find the `createCustomerInteractiveRouter({` call (line ~401 of server.ts). Add the two new dependency closures inside the deps object, after the existing `resumeSyncs:` line:

```typescript
      upsertAddressesForCustomer: (userId, customerProfile, addresses) =>
        upsertAddressesForCustomerRepo(pool, userId, customerProfile, addresses),
      setAddressesSyncedAt: (userId, customerProfile) =>
        pool.query(
          'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE customer_profile = $1 AND user_id = $2',
          [customerProfile, userId],
        ).then(() => undefined),
```

- [ ] **Step 4: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success (TypeScript will flag missing fields on `CustomerInteractiveRouterDeps` until Task 11 adds them)

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/backend/src/server.ts
git commit -m "feat(server): mount customer-addresses router and inject address deps into interactive router"
```

---

## Chunk 4: Bot & Customer Interactive Route

### Task 10: `archibald-bot.ts` — add `readAltAddresses`, remove old `fillDeliveryAddress` call blocks

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts`

- [ ] **Step 1: Add import for `AltAddress` type**

At the top of `archibald-bot.ts`, add:
```typescript
import type { AltAddress } from '../db/repositories/customer-addresses';
```

- [ ] **Step 2: Add `readAltAddresses()` method**

After the existing `readEditFormFieldValues()` method (around line 12380), add:

```typescript
  async readAltAddresses(): Promise<AltAddress[]> {
    if (!this.page) throw new Error('Browser page is null');

    await this.openCustomerTab('Indirizzo alt');
    await this.waitForDevExpressIdle({ timeout: 5000, label: 'tab-indirizzo-alt-read' });

    const addresses = await this.page.evaluate(() => {
      const grid = document.querySelector('.dxgvControl_Aqua') as HTMLElement | null;
      if (!grid) return [];

      const rows = Array.from(grid.querySelectorAll('tr.dxgvDataRow_Aqua'));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        const cellText = (i: number) => cells[i]?.textContent?.trim() || null;
        return {
          tipo: cellText(0) ?? '',
          nome: cellText(1),
          via: cellText(2),
          cap: cellText(3),
          citta: cellText(4),
          contea: cellText(5),
          stato: cellText(6),
          idRegione: cellText(7),
          contra: cellText(8),
        };
      });
    }) as AltAddress[];

    return addresses;
  }
```

- [ ] **Step 3: Remove `fillDeliveryAddress` call blocks from `createCustomer`**

In the `createCustomer` method (around line 11791), find and remove this block entirely:

```typescript
    / Step 2: "Indirizzo alt." tab — fill delivery address (if present)
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

- [ ] **Step 4: Remove `fillDeliveryAddress` call block from `updateCustomer`**

In the `updateCustomer` method (around line 12176), find and remove this block entirely:

```typescript
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

- [ ] **Step 5: Remove `fillDeliveryAddress` call block from `completeCustomerCreation`**

In the `completeCustomerCreation` method (around line 12721), find and remove this block entirely:

```typescript
    / Step 2: "Indirizzo alt." tab — fill delivery address (if present)
    await this.emitProgress("customer.tab.indirizzo");
    if (customerData.deliveryStreet && customerData.deliveryPostalCode) {
      await this.fillDeliveryAddress(
        customerData.deliveryStreet,
        customerData.deliveryPostalCode,
        customerData.deliveryPostalCodeCity,
      );
    }
```

Note: Also remove the `await this.emitProgress("customer.tab.indirizzo");` line that preceded the removed block if it was only used for that purpose.

- [ ] **Step 6: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success (TypeScript will report errors for `deliveryStreet` accesses until Task 12 removes those fields from `CustomerFormData`)

- [ ] **Step 7: Commit**
```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "feat(bot): add readAltAddresses() method; remove old fillDeliveryAddress call blocks"
```

---

### Task 11: `customer-interactive.ts` — add address refresh in `start-edit`, update `saveSchema`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/customer-interactive.ts`

- [ ] **Step 1: Add `AltAddress` import**

At the top, after existing imports, add:
```typescript
import type { AltAddress } from '../db/repositories/customer-addresses';
```

- [ ] **Step 2: Extend `CustomerBotLike` interface**

In the `CustomerBotLike` type (line 10-18), add the new method after `readEditFormFieldValues`:
```typescript
  readAltAddresses: () => Promise<AltAddress[]>;
```

- [ ] **Step 3: Extend `CustomerInteractiveRouterDeps`**

In the `CustomerInteractiveRouterDeps` type (line 25-37), add after `resumeSyncs`:
```typescript
  upsertAddressesForCustomer: (userId: string, customerProfile: string, addresses: AltAddress[]) => Promise<void>;
  setAddressesSyncedAt: (userId: string, customerProfile: string) => Promise<void>;
```

- [ ] **Step 4: Update destructuring in `createCustomerInteractiveRouter`**

In the `createCustomerInteractiveRouter` function body, update the destructuring to include the new deps:
```typescript
  const {
    sessionManager, createBot, broadcast,
    upsertSingleCustomer, updateCustomerBotStatus,
    updateVatValidatedAt, getCustomerByProfile,
    pauseSyncs, resumeSyncs,
    upsertAddressesForCustomer, setAddressesSyncedAt,
    smartCustomerSync, getCustomerProgressMilestone,
  } = deps;
```

- [ ] **Step 5: Add address refresh in `start-edit` route**

In the `start-edit` route async IIFE, after the line `const archibaldFields = await bot.readEditFormFieldValues();` and before `sessionManager.updateState(sessionId, 'ready')`, add:

```typescript
          try {
            const altAddresses = await bot.readAltAddresses();
            await upsertAddressesForCustomer(userId, customer.customerProfile, altAddresses);
            await setAddressesSyncedAt(userId, customer.customerProfile);
          } catch (addressErr) {
            logger.warn('start-edit: address refresh failed (non-fatal)', { error: addressErr, userId });
          }
```

- [ ] **Step 6: Update `saveSchema` — remove delivery fields, add `addresses`**

Find the `saveSchema` definition and:
1. Remove these lines:
   ```typescript
   deliveryStreet: z.string().optional(),
   deliveryPostalCode: z.string().optional(),
   deliveryPostalCodeCity: z.string().optional(),
   deliveryPostalCodeCountry: z.string().optional(),
   ```
2. Keep `postalCodeCity: z.string().optional()` and `postalCodeCountry: z.string().optional()` (they handle main-address CAP disambiguation).
3. Add after the remaining fields:
   ```typescript
   addresses: z.array(z.object({
     tipo: z.string(),
     nome: z.string().optional(),
     via: z.string().optional(),
     cap: z.string().optional(),
     citta: z.string().optional(),
     contea: z.string().optional(),
     stato: z.string().optional(),
     idRegione: z.string().optional(),
     contra: z.string().optional(),
   })).optional().default([]),
   ```

- [ ] **Step 7: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success after Task 12 resolves `CustomerFormData` delivery field removals. If TypeScript reports errors about `deliveryStreet` on `CustomerFormData`, proceed to Task 12 first.

- [ ] **Step 8: Commit**
```bash
git add archibald-web-app/backend/src/routes/customer-interactive.ts
git commit -m "feat(interactive): add address refresh in start-edit route; update saveSchema with addresses array"
```

---

## Chunk 5: Types & Frontend

### Task 12: Backend types — `types.ts` and `create-customer.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/types.ts`
- Modify: `archibald-web-app/backend/src/operations/handlers/create-customer.ts`

- [ ] **Step 1: Update `backend/src/types.ts`**

Add a module-level `AddressEntry` type BEFORE the `CustomerFormData` interface:

```typescript
export type AddressEntry = {
  tipo: string;
  nome?: string;
  via?: string;
  cap?: string;
  citta?: string;
  contea?: string;
  stato?: string;
  idRegione?: string;
  contra?: string;
};
```

In the `CustomerFormData` interface:
1. Remove:
   ```typescript
   deliveryStreet?: string;
   deliveryPostalCode?: string;
   deliveryPostalCodeCity?: string;
   deliveryPostalCodeCountry?: string;
   ```
   (Remove the entire "Optional fields - Delivery address (tab "Indirizzo alt.")" comment block and its fields)
2. Keep `postalCodeCity` and `postalCodeCountry` (they are CAP disambiguation hints for the main address, not delivery-specific).
3. Add after the remaining optional fields:
   ```typescript
   addresses?: AddressEntry[];
   ```

The updated interface should look like:
```typescript
export interface CustomerFormData {
  // Required fields
  name: string;

  // Optional fields - Dettagli tab
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;

  // Optional fields - Dropdowns/Lookups
  deliveryMode?: "FedEx" | string;
  paymentTerms?: string;
  lineDiscount?: "N/A" | string;

  // Optional fields - CAP disambiguation hints (frontend → bot, not persisted)
  postalCodeCity?: string;
  postalCodeCountry?: string;

  // Alternative addresses (synced from Archibald "Indirizzo alt." tab)
  addresses?: AddressEntry[];
}
```

- [ ] **Step 2: Update `create-customer.ts` local type**

In `backend/src/operations/handlers/create-customer.ts`, find the local `CreateCustomerData` type and remove these four fields:
```typescript
  deliveryStreet?: string;
  deliveryPostalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  deliveryPostalCodeCity?: string;
  deliveryPostalCodeCountry?: string;
```

- [ ] **Step 3: Verify build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success

- [ ] **Step 4: Commit**
```bash
git add archibald-web-app/backend/src/types.ts archibald-web-app/backend/src/operations/handlers/create-customer.ts
git commit -m "feat(types): remove delivery fields from CustomerFormData and CreateCustomerData; add AddressEntry"
```

---

### Task 13: Frontend types — `customer-form-data.ts`, new `customer-address.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/types/customer-form-data.ts`
- Create: `archibald-web-app/frontend/src/types/customer-address.ts`

- [ ] **Step 1: Update `customer-form-data.ts`**

Replace the entire file content with:

```typescript
export type AddressEntry = {
  tipo: string;
  nome?: string;
  via?: string;
  cap?: string;
  citta?: string;
  contea?: string;
  stato?: string;
  idRegione?: string;
  contra?: string;
};

export type CustomerFormData = {
  name: string;
  deliveryMode: string;
  vatNumber: string;
  paymentTerms: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  postalCodeCity: string;
  postalCodeCountry: string;
  addresses?: AddressEntry[];
};
```

- [ ] **Step 2: Create `customer-address.ts`**

```typescript
// archibald-web-app/frontend/src/types/customer-address.ts
type CustomerAddress = {
  id: number;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

export type { CustomerAddress };
```

- [ ] **Step 3: Verify type-check**
```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: errors referencing `deliveryStreet` etc. in files not yet updated — these are fixed in Tasks 14-16

- [ ] **Step 4: Commit (after Tasks 14-16 are also done and type-check passes)**
Commit deferred to after frontend tasks resolve all errors. Proceed to Task 14 first.

---

### Task 14: Frontend service and `customers.service.ts` cleanup

**Files:**
- Create: `archibald-web-app/frontend/src/services/customer-addresses.ts`
- Modify: `archibald-web-app/frontend/src/services/customers.service.ts`
- Modify: `archibald-web-app/frontend/src/utils/vat-diff.spec.ts`

- [ ] **Step 1: Create `customer-addresses.ts` service**

```typescript
// archibald-web-app/frontend/src/services/customer-addresses.ts
import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
import { fetchWithRetry } from '../utils/fetch-with-retry';

async function getCustomerAddresses(customerProfile: string): Promise<CustomerAddress[]> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(customerProfile)}/addresses`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function addCustomerAddress(
  customerProfile: string,
  address: AddressEntry,
): Promise<CustomerAddress> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(customerProfile)}/addresses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateCustomerAddress(
  customerProfile: string,
  id: number,
  address: AddressEntry,
): Promise<CustomerAddress> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(customerProfile)}/addresses/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteCustomerAddress(customerProfile: string, id: number): Promise<void> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(customerProfile)}/addresses/${id}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export { getCustomerAddresses, addCustomerAddress, updateCustomerAddress, deleteCustomerAddress };
```

- [ ] **Step 2: Update `customers.service.ts` — remove delivery fields from 3 inline types**

In `createCustomer` (line ~107), remove from the parameter type:
```typescript
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
```

In `updateCustomer` (line ~140), remove from the parameter type:
```typescript
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
```

In `saveInteractiveCustomer` (line ~249), remove from the parameter type:
```typescript
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
```

- [ ] **Step 3: Update `vat-diff.spec.ts` — remove delivery fields from `baseForm`**

In the `baseForm` constant object (line 6-25), remove these 4 lines:
```typescript
  deliveryStreet: '',
  deliveryPostalCode: '',
  deliveryPostalCodeCity: '',
  deliveryPostalCodeCountry: '',
```

The `baseForm` `postalCodeCity` and `postalCodeCountry` fields stay — they remain in `CustomerFormData`.

- [ ] **Step 4: Verify type-check**
```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: remaining errors only in `CustomerCreateModal.tsx` (delivery step references) — fixed in Task 15

- [ ] **Step 5: Run frontend tests**
```bash
npm test --prefix archibald-web-app/frontend
```
Expected: `vat-diff.spec.ts` passes; `CustomerCreateModal` tests may fail due to type issues

- [ ] **Step 6: Commit (after Tasks 15-16 complete and type-check fully passes)**
Deferred to after Task 16.

---

### Task 15: Frontend `CustomerCreateModal.tsx` — replace delivery steps with addresses step

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

- [ ] **Step 1: Add imports**

At the top, add:
```typescript
import type { AddressEntry } from '../types/customer-form-data';
import { getCustomerAddresses, addCustomerAddress, deleteCustomerAddress } from '../services/customer-addresses';
import type { CustomerAddress } from '../types/customer-address';
```

- [ ] **Step 2: Remove delivery-field constants and update `INITIAL_FORM`**

Remove the `DELIVERY_ADDRESS_FIELDS` constant entirely:
```typescript
// DELETE THIS BLOCK:
const DELIVERY_ADDRESS_FIELDS: FieldDef[] = [
  { key: "deliveryStreet", ... },
  { key: "deliveryPostalCode", ... },
];
```

Remove `ALL_DISPLAY_FIELDS` constant (no longer needed since delivery fields are gone).

Update `INITIAL_FORM` to remove delivery fields and add `addresses`:
```typescript
const INITIAL_FORM: CustomerFormData = {
  name: "",
  deliveryMode: "FedEx",
  vatNumber: "",
  paymentTerms: "206",
  pec: "",
  sdi: "",
  street: "",
  postalCode: "",
  phone: "+39",
  mobile: "+39",
  email: "",
  url: "",
  postalCodeCity: "",
  postalCodeCountry: "",
  addresses: [],
};
```

- [ ] **Step 3: Update `customerToFormData`**

Remove delivery fields from the returned object:
```typescript
function customerToFormData(customer: Customer): CustomerFormData {
  return {
    name: customer.name || "",
    deliveryMode: customer.deliveryTerms || "FedEx",
    vatNumber: customer.vatNumber || "",
    paymentTerms: "206",
    pec: customer.pec || "",
    sdi: customer.sdi || "",
    street: customer.street || "",
    postalCode: customer.postalCode || "",
    phone: customer.phone
      ? customer.phone.startsWith("+39")
        ? customer.phone
        : `+39 ${customer.phone}`
      : "+39",
    mobile: customer.mobile
      ? customer.mobile.startsWith("+39")
        ? customer.mobile
        : `+39 ${customer.mobile}`
      : "+39",
    email: customer.email || "",
    url: customer.url || "",
    postalCodeCity: "",
    postalCodeCountry: "",
    addresses: [],
  };
}
```

- [ ] **Step 4: Update `StepType` union**

Replace `address-question` and `delivery-field` with `addresses`:
```typescript
type StepType =
  | { kind: "vat-input" }
  | { kind: "vat-processing" }
  | { kind: "vat-review" }
  | { kind: "field"; fieldIndex: number }
  | { kind: "addresses" }
  | {
      kind: "cap-disambiguation";
      targetField: "postalCode";
    }
  | { kind: "summary" }
  | { kind: "vat-edit-check" }
  | { kind: "vat-diff-review" };
```

- [ ] **Step 5: Remove `sameDeliveryAddress` state; add `addresses` state**

Remove:
```typescript
const [sameDeliveryAddress, setSameDeliveryAddress] = useState<boolean | null>(null);
```

Add:
```typescript
const [localAddresses, setLocalAddresses] = useState<AddressEntry[]>([]);
const [editingAddress, setEditingAddress] = useState<AddressEntry | null>(null);
const [showAddressForm, setShowAddressForm] = useState(false);
const [addressForm, setAddressForm] = useState<AddressEntry>({
  tipo: 'Consegna',
  via: '',
  cap: '',
  citta: '',
  nome: '',
});
```

- [ ] **Step 6: Update `totalSteps` and `currentStepNumber`**

Update `totalSteps`:
```typescript
const totalSteps = totalFieldsBefore + 1 + 1; // fields + addresses step + summary
```

Update `currentStepNumber`:
```typescript
case "addresses":
  return totalFieldsBefore + 1;
```

Remove `case "address-question"`, `case "delivery-field"` cases.

Update `cap-disambiguation` to only handle `postalCode` (remove `deliveryPostalCode` branch):
```typescript
case "cap-disambiguation":
  return FIELDS_BEFORE_ADDRESS_QUESTION.findIndex((f) => f.key === "postalCode") + 1;
```

- [ ] **Step 7: Update reset effect**

In the `useEffect(() => { if (isOpen) { ... }` reset block, replace:
```typescript
setSameDeliveryAddress(null);
```
with:
```typescript
setLocalAddresses([]);
setShowAddressForm(false);
setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
```

In edit mode, after `customerService.startEditInteractiveSession(...)`, load addresses:
```typescript
if (isEditMode && editCustomer) {
  getCustomerAddresses(editCustomer.customerProfile)
    .then((addrs) => {
      setLocalAddresses(addrs.map((a) => ({
        tipo: a.tipo,
        nome: a.nome ?? undefined,
        via: a.via ?? undefined,
        cap: a.cap ?? undefined,
        citta: a.citta ?? undefined,
        contea: a.contea ?? undefined,
        stato: a.stato ?? undefined,
        idRegione: a.idRegione ?? undefined,
        contra: a.contra ?? undefined,
      })));
    })
    .catch((err) => {
      console.error('[CustomerCreateModal] Failed to load addresses:', err);
    });
}
```

- [ ] **Step 8: Update step transition for last field**

Find the transition logic after the last `field` step (currently navigates to `address-question`). Change:
```typescript
const nextStep = () => setCurrentStep({ kind: "address-question" });
```
to:
```typescript
const nextStep = () => setCurrentStep({ kind: "addresses" });
```

- [ ] **Step 9: Update `cap-disambiguation` fallback**

In the `resolveCapAndAdvance` callback for `postalCode`, the `targetField` no longer includes `"deliveryPostalCode"`. Update the type annotation accordingly:
```typescript
resolveCapAndAdvance(
  formData[field.key],
  field.key as "postalCode",
  () => setCurrentStep({ kind: "addresses" }),
);
```

- [ ] **Step 10: Add `addresses` step rendering**

In the render section, add a case for `addresses` step. Find the rendering switch/conditional that renders `address-question` and `delivery-field` — replace both with the `addresses` step:

```tsx
{currentStep.kind === "addresses" && (
  <div>
    <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>
      Indirizzi alternativi
    </div>

    {localAddresses.length === 0 && !showAddressForm && (
      <div style={{ color: "#9e9e9e", marginBottom: "12px", fontSize: "14px" }}>
        Nessun indirizzo alternativo aggiunto
      </div>
    )}

    {localAddresses.map((addr, idx) => (
      <div
        key={idx}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          marginBottom: "8px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        <span>
          <strong>{addr.tipo}</strong>
          {addr.via ? ` — ${addr.via}` : ""}
          {addr.cap ? `, ${addr.cap}` : ""}
          {addr.citta ? ` ${addr.citta}` : ""}
        </span>
        <button
          onClick={() => {
            setLocalAddresses((prev) => prev.filter((_, i) => i !== idx));
          }}
          style={{
            padding: "4px 10px",
            fontSize: "13px",
            fontWeight: 600,
            backgroundColor: "#fff",
            color: "#f44336",
            border: "1px solid #f44336",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Elimina
        </button>
      </div>
    ))}

    {showAddressForm && (
      <div
        style={{
          padding: "12px",
          backgroundColor: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          marginBottom: "12px",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            Tipo *
          </label>
          <select
            value={addressForm.tipo}
            onChange={(e) => setAddressForm((f) => ({ ...f, tipo: e.target.value }))}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "14px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          >
            <option value="Consegna">Consegna</option>
            <option value="Ufficio">Ufficio</option>
            <option value="Fattura">Fattura</option>
            <option value="Indir. cons. alt.">Indir. cons. alt.</option>
          </select>
        </div>
        {(["via", "cap", "citta", "nome"] as const).map((field) => (
          <div key={field} style={{ marginBottom: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              {field === "via" ? "Via e civico" : field === "cap" ? "CAP" : field === "citta" ? "Città" : "Nome (opzionale)"}
            </label>
            <input
              type="text"
              value={(addressForm as Record<string, string | undefined>)[field] ?? ""}
              onChange={(e) =>
                setAddressForm((f) => ({ ...f, [field]: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => {
              if (!addressForm.tipo) return;
              setLocalAddresses((prev) => [...prev, { ...addressForm }]);
              setShowAddressForm(false);
              setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
            }}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Conferma
          </button>
          <button
            onClick={() => {
              setShowAddressForm(false);
              setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
            }}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#fff",
              color: "#757575",
              border: "1px solid #ccc",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
        </div>
      </div>
    )}

    {!showAddressForm && (
      <button
        onClick={() => setShowAddressForm(true)}
        style={{
          width: "100%",
          padding: "10px",
          fontSize: "14px",
          fontWeight: 600,
          backgroundColor: "#fff",
          color: "#1976d2",
          border: "2px dashed #1976d2",
          borderRadius: "8px",
          cursor: "pointer",
          marginBottom: "16px",
        }}
      >
        + Aggiungi indirizzo
      </button>
    )}

    <button
      onClick={() => {
        setFormData((f) => ({ ...f, addresses: localAddresses }));
        setCurrentStep({ kind: "summary" });
      }}
      style={{
        width: "100%",
        padding: "14px",
        fontSize: "16px",
        fontWeight: 700,
        backgroundColor: "#1976d2",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Avanti
    </button>
  </div>
)}
```

- [ ] **Step 11: Update summary step**

In the summary step rendering, find where `deliveryStreet` or delivery fields are displayed and replace with the addresses list:

```tsx
{formData.addresses && formData.addresses.length > 0 && (
  <div style={{ marginTop: "8px" }}>
    <div style={{ fontSize: "13px", fontWeight: 700, color: "#616161" }}>Indirizzi alternativi</div>
    {formData.addresses.map((addr, i) => (
      <div key={i} style={{ fontSize: "13px", color: "#424242" }}>
        {addr.tipo}{addr.via ? ` — ${addr.via}` : ""}{addr.cap ? `, ${addr.cap}` : ""}{addr.citta ? ` ${addr.citta}` : ""}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 12: Verify type-check**
```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: 0 errors

- [ ] **Step 13: Commit (Tasks 13, 14, 15 together)**
```bash
git add \
  archibald-web-app/frontend/src/types/customer-form-data.ts \
  archibald-web-app/frontend/src/types/customer-address.ts \
  archibald-web-app/frontend/src/services/customer-addresses.ts \
  archibald-web-app/frontend/src/services/customers.service.ts \
  archibald-web-app/frontend/src/utils/vat-diff.spec.ts \
  archibald-web-app/frontend/src/components/CustomerCreateModal.tsx
git commit -m "feat(frontend): replace delivery-address wizard steps with multi-address management step"
```

---

### Task 16: Frontend `CustomerCard.tsx` — add addresses section in expanded view

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCard.tsx`

- [ ] **Step 1: Add imports at the top**

```typescript
import type { CustomerAddress } from '../types/customer-address';
import { getCustomerAddresses } from '../services/customer-addresses';
```

- [ ] **Step 2: Add `altAddresses` state and effect in `CustomerCard` component**

Inside the `CustomerCard` function body, after the existing `useState` declarations, add:

```typescript
  const [altAddresses, setAltAddresses] = useState<CustomerAddress[]>([]);

  useEffect(() => {
    if (!expanded) return;
    getCustomerAddresses(customer.customerProfile)
      .then(setAltAddresses)
      .catch((err) => {
        console.error('[CustomerCard] Failed to load alt addresses:', err);
        setAltAddresses([]);
      });
  }, [expanded, customer.customerProfile]);
```

- [ ] **Step 3: Add addresses section in the expanded block**

Inside the `{expanded && (...)}` block, at the end (after the existing customer detail rows but before the closing `</div>`), add:

```tsx
            {/* Indirizzi alternativi */}
            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#616161",
                  marginBottom: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Indirizzi alternativi
              </div>
              {altAddresses.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#9e9e9e", fontStyle: "italic" }}>
                  Nessun indirizzo alternativo registrato
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      {(["Tipo", "Via", "CAP", "Città"] as const).map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "6px 8px",
                            borderBottom: "1px solid #e0e0e0",
                            color: "#757575",
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {altAddresses.map((addr) => (
                      <tr key={addr.id}>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{addr.tipo}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{addr.via ?? "—"}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{addr.cap ?? "—"}</td>
                        <td style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{addr.citta ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
```

- [ ] **Step 4: Verify type-check and tests**
```bash
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/frontend
```
Expected: 0 type errors, all tests pass

- [ ] **Step 5: Commit**
```bash
git add archibald-web-app/frontend/src/components/CustomerCard.tsx
git commit -m "feat(ui): show alternative addresses in CustomerCard expanded view"
```

---

### Task 17: Final type-check and full test suite

- [ ] **Step 1: Frontend type-check**
```bash
npm run type-check --prefix archibald-web-app/frontend
```
Expected: 0 errors

- [ ] **Step 2: Backend build**
```bash
npm run build --prefix archibald-web-app/backend
```
Expected: success

- [ ] **Step 3: Frontend tests**
```bash
npm test --prefix archibald-web-app/frontend
```
Expected: all pass

- [ ] **Step 4: Backend tests**
```bash
npm test --prefix archibald-web-app/backend
```
Expected: all pass

---

## Test Commands Reference

- Frontend tests: `npm test --prefix archibald-web-app/frontend`
- Backend tests: `npm test --prefix archibald-web-app/backend`
- Frontend type-check: `npm run type-check --prefix archibald-web-app/frontend`
- Backend build: `npm run build --prefix archibald-web-app/backend`
- Run specific backend test: `npm test --prefix archibald-web-app/backend -- <filename>`

## Conventions

- All tests use Vitest: `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- Backend repositories: first param is `DbPool`; `pool.query<RowType>(sql, params)` returns `{ rows, rowCount }`
- `pool.withTransaction(async (tx) => {...})` for transactions; `tx` has same `.query` signature
- Frontend uses `fetchWithRetry` from `../utils/fetch-with-retry`
- TypeScript strict mode, `import type` for type-only imports throughout
- Frontend inline styles `style={{}}` — no CSS modules
- `AltAddress` is the canonical shape without identity columns; `CustomerAddress` includes `id`, `userId`, `customerProfile`
- `AltAddress` is exported from the backend repository and re-used in `archibald-bot.ts`, `customer-interactive.ts`, and `sync-customer-addresses.ts`
- `AddressEntry` on the frontend is the equivalent of `AltAddress` on the backend — same fields, both nullable/optional
- Route mounting order in `server.ts`: `/api/customers/:customerProfile/addresses` MUST be mounted BEFORE `/api/customers` to avoid Express shadowing the parameterized prefix
