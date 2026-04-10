# Role Modules System + Discount Traffic Light — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un sistema di moduli per ruolo/utente con primo modulo concreto — semaforo sconto durante la creazione ordine.

**Architecture:** La tabella `system.module_defaults` definisce i moduli attivi per ruolo. Al login il backend calcola i moduli effettivi dell'utente e li inserisce nel JWT. Il middleware verifica `modules_version` (con cache in-process 30s) per forzare logout quando un admin modifica i moduli. Il frontend decodifica il JWT direttamente per leggere i moduli senza HTTP extra.

**Tech Stack:** PostgreSQL, Express/TypeScript, React 19 + Vite + TypeScript strict, Vitest + Testing Library, inline styles.

---

## File Map

**Creati:**
- `backend/src/db/migrations/056-role-modules-system.sql`
- `frontend/src/components/new-order-form/DiscountTrafficLight.ts` — funzione pura `calculateEffectiveDiscount`
- `frontend/src/components/new-order-form/DiscountTrafficLight.tsx` — componente banner
- `frontend/src/components/new-order-form/DiscountTrafficLight.spec.ts` — test funzione pura
- `frontend/src/components/new-order-form/DiscountTrafficLight.spec.tsx` — test componente
- `frontend/src/hooks/useModules.ts` — hook decodifica JWT modules
- `frontend/src/api/module-defaults.ts` — API client module-defaults
- `frontend/src/components/admin/AdminModulesSection.tsx` — sezione admin

**Modificati:**
- `backend/src/db/repositories/users.ts` — rinomina colonna + nuove funzioni
- `backend/src/auth-utils.ts` — `JWTPayload` + `modules_version`
- `backend/src/middleware/auth.ts` — cache + check `modules_version`
- `backend/src/routes/auth.ts` — login emette moduli effettivi + `modules_version`; `getMe` include `modules`
- `backend/src/routes/admin.ts` — nuovi endpoint module-defaults + PATCH users aggiornato
- `backend/src/server.ts` — nuove dipendenze admin router
- `frontend/src/api/auth.ts` — `UserRole` (4 ruoli) + `User.modules`
- `frontend/src/utils/fetch-with-retry.ts` — gestione `session_invalidated`
- `frontend/src/components/OrderFormSimple.tsx` — banner + calcolo sconto effettivo
- `frontend/src/pages/AdminPage.tsx` — sezione Gestione Moduli

---

## Task 1: Migration 056

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/056-role-modules-system.sql`

- [ ] **Step 1: Crea il file migration**

```sql
-- Migration 056: Role-based module system
-- UP

CREATE TABLE IF NOT EXISTS system.module_defaults (
  module_name  TEXT    NOT NULL,
  role         TEXT    NOT NULL CHECK (role IN ('agent','admin','ufficio','concessionario')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (module_name, role)
);

INSERT INTO system.module_defaults (module_name, role, enabled) VALUES
  ('discount-traffic-light', 'agent',          TRUE),
  ('discount-traffic-light', 'admin',          TRUE),
  ('discount-traffic-light', 'ufficio',        TRUE),
  ('discount-traffic-light', 'concessionario', TRUE)
ON CONFLICT DO NOTHING;

ALTER TABLE agents.users RENAME COLUMN modules TO modules_granted;

ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_revoked JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_version INT NOT NULL DEFAULT 0;

-- DOWN
-- ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_version;
-- ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_revoked;
-- ALTER TABLE agents.users RENAME COLUMN modules_granted TO modules;
-- DROP TABLE IF EXISTS system.module_defaults;
```

- [ ] **Step 2: Applica la migration localmente**

```bash
npm run migrate --prefix archibald-web-app/backend
```

Atteso: `Migration 056 applied successfully` (o simile output del runner).

- [ ] **Step 3: Verifica le colonne nel DB locale**

```bash
cd archibald-web-app && node -e "
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://archibald:archibald@localhost:5432/archibald' });
p.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='agents' AND table_name='users' ORDER BY column_name\").then(r => { console.log(r.rows.map(x=>x.column_name).join(', ')); p.end(); });
"
```

Atteso: l'output include `modules_granted`, `modules_revoked`, `modules_version`.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/056-role-modules-system.sql
git commit -m "feat(db): migration 056 — role modules system, modules_version"
```

---

## Task 2: Backend Repository — Nuove funzioni modules

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/users.ts`

- [ ] **Step 1: Aggiorna i tipi `UserRow` e `User`**

Sostituisci nel file:

```typescript
// UserRow: rinomina modules → modules_granted, aggiungi due nuovi campi
type UserRow = {
  // ... campi esistenti invariati ...
  modules_granted: string[] | null;   // era: modules
  modules_revoked: string[] | null;   // nuovo
  modules_version: number;            // nuovo
  mfa_enabled: boolean | null;
};

// User: rinomina modules → modulesGranted, aggiungi due nuovi campi
type User = {
  // ... campi esistenti invariati ...
  modulesGranted: string[];    // era: modules
  modulesRevoked: string[];    // nuovo
  modulesVersion: number;      // nuovo
  mfaEnabled: boolean;
};
```

- [ ] **Step 2: Aggiorna `USER_COLUMNS`**

```typescript
const USER_COLUMNS = `
  id, username, full_name, role, whitelisted, created_at,
  last_login_at, last_order_sync_at, last_customer_sync_at,
  monthly_target, yearly_target, currency, target_updated_at,
  commission_rate, bonus_amount, bonus_interval,
  extra_budget_interval, extra_budget_reward, monthly_advance,
  hide_commissions, modules_granted, modules_revoked, modules_version, mfa_enabled
`;
```

- [ ] **Step 3: Aggiorna `mapRowToUser`**

```typescript
function mapRowToUser(row: UserRow): User {
  return {
    // ... campi esistenti invariati ...
    modulesGranted: row.modules_granted ?? [],
    modulesRevoked: row.modules_revoked ?? [],
    modulesVersion: row.modules_version ?? 0,
    mfaEnabled: row.mfa_enabled ?? false,
  };
}
```

- [ ] **Step 4: Aggiungi il tipo `ModuleDefaultRow` e le due nuove funzioni**

Aggiungi in fondo al file, prima degli `export`:

```typescript
type ModuleDefaultRow = {
  module_name: string;
  role: UserRole;
  enabled: boolean;
};

async function getModuleDefaultsForRole(
  pool: DbPool,
  role: UserRole,
): Promise<string[]> {
  const result = await pool.query<ModuleDefaultRow>(
    `SELECT module_name FROM system.module_defaults WHERE role = $1 AND enabled = TRUE`,
    [role],
  );
  return result.rows.map((r) => r.module_name);
}

async function getEffectiveModules(
  pool: DbPool,
  userId: string,
  role: UserRole,
): Promise<{ effectiveModules: string[]; modulesVersion: number }> {
  const result = await pool.query<{
    modules_granted: string[] | null;
    modules_revoked: string[] | null;
    modules_version: number;
  }>(
    `SELECT modules_granted, modules_revoked, modules_version FROM agents.users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return { effectiveModules: [], modulesVersion: 0 };
  }

  const { modules_granted, modules_revoked, modules_version } = result.rows[0];
  const granted = modules_granted ?? [];
  const revoked = modules_revoked ?? [];
  const roleDefaults = await getModuleDefaultsForRole(pool, role);

  const effectiveModules = [
    ...roleDefaults.filter((m) => !revoked.includes(m)),
    ...granted.filter((m) => !revoked.includes(m) && !roleDefaults.includes(m)),
  ];

  return { effectiveModules, modulesVersion: modules_version ?? 0 };
}

async function getUserModulesVersion(
  pool: DbPool,
  userId: string,
): Promise<number> {
  const result = await pool.query<{ modules_version: number }>(
    `SELECT modules_version FROM agents.users WHERE id = $1`,
    [userId],
  );
  return result.rows[0]?.modules_version ?? 0;
}

async function updateUserModules(
  pool: DbPool,
  userId: string,
  modulesGranted: string[],
  modulesRevoked: string[],
): Promise<number> {
  const result = await pool.query<{ modules_version: number }>(
    `UPDATE agents.users
     SET modules_granted = $1, modules_revoked = $2, modules_version = modules_version + 1
     WHERE id = $3
     RETURNING modules_version`,
    [modulesGranted, modulesRevoked, userId],
  );
  return result.rows[0]?.modules_version ?? 0;
}
```

- [ ] **Step 5: Aggiorna gli `export`**

Aggiungi le nuove funzioni agli export esistenti:

```typescript
export {
  // ... export esistenti ...
  getModuleDefaultsForRole,
  getEffectiveModules,
  getUserModulesVersion,
  updateUserModules,
  // ... resto degli export ...
};
```

- [ ] **Step 6: Trova e correggi tutti i riferimenti a `user.modules` nel codebase backend**

Nei file che usano il tipo `User` dal repository, `user.modules` è ora `user.modulesGranted`. Cerca e aggiorna:

```bash
grep -rn "user\.modules\b\|u\.modules\b" archibald-web-app/backend/src --include="*.ts"
```

I risultati attesi sono in `auth.ts` e `admin.ts` — verranno aggiornati nei Task 3 e 5.

- [ ] **Step 7: Build per verificare che i tipi compilano**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Atteso: zero errori TypeScript (eventuali errori su `user.modules` in `auth.ts`/`admin.ts` sono attesi e verranno risolti nei task successivi).

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/users.ts
git commit -m "feat(backend): repository users — rename modules_granted, add getEffectiveModules/getUserModulesVersion"
```

---

## Task 3: Backend — Login emette moduli effettivi + `modules_version`

**Files:**
- Modify: `archibald-web-app/backend/src/auth-utils.ts`
- Modify: `archibald-web-app/backend/src/routes/auth.ts`

- [ ] **Step 1: Aggiorna `JWTPayload` in `auth-utils.ts`**

```typescript
export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  deviceId?: string;
  isImpersonating?: boolean;
  realAdminId?: string;
  adminSessionId?: number;
  modules: string[];          // moduli effettivi risolti (invariato nel nome)
  modules_version: number;    // NUOVO
  jti: string;
  exp?: number;
}
```

Aggiorna `verifyJWT` per estrarre `modules_version`:

```typescript
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: (payload.role as UserRole) || 'agent',
      deviceId: payload.deviceId as string | undefined,
      isImpersonating: payload.isImpersonating as boolean | undefined,
      realAdminId: payload.realAdminId as string | undefined,
      adminSessionId: payload.adminSessionId as number | undefined,
      modules: (payload.modules as string[]) || [],
      modules_version: (payload.modules_version as number) ?? 0,  // NUOVO
      jti: payload.jti as string,
      exp: payload.exp as number | undefined,
    };
  } catch (error) {
    logger.warn('JWT verification failed', { error });
    return null;
  }
}
```

- [ ] **Step 2: Aggiorna tutti i punti in `auth.ts` che chiamano `generateJWT`**

Cerca i punti con `grep -n "generateJWT" archibald-web-app/backend/src/routes/auth.ts`.

Per ogni chiamata a `generateJWT(...)`, aggiungi `modules_version` e cambia `modules: user.modules` → moduli effettivi. Esempio per il caso login standard (riga ~225):

```typescript
// Prima della chiamata generateJWT nel login standard:
const { effectiveModules, modulesVersion } = await deps.getEffectiveModules(user.id, user.role as UserRole);

const token = await generateJWT({
  userId: user.id,
  username: user.username,
  role: user.role as UserRole,
  deviceId: deviceId || undefined,
  modules: effectiveModules,       // era: user.modules (o user.modulesGranted)
  modules_version: modulesVersion, // NUOVO
});
```

Applica lo stesso pattern a TUTTI i punti dove viene generato un JWT in `auth.ts` (device trust, MFA verify, JWT refresh, impersonation). Cerca con:

```bash
grep -n "generateJWT\|modules:" archibald-web-app/backend/src/routes/auth.ts
```

- [ ] **Step 3: Aggiungi `getEffectiveModules` alle dipendenze del router auth**

In `auth.ts`, il tipo `AuthRouterDeps` deve esporre la funzione. Aggiungi il campo:

```typescript
type AuthRouterDeps = {
  // ... campi esistenti ...
  getEffectiveModules: (userId: string, role: UserRole) => Promise<{ effectiveModules: string[]; modulesVersion: number }>;
};
```

In `server.ts`, nella creazione del router auth, aggiungi:

```typescript
getEffectiveModules: (userId, role) => usersRepo.getEffectiveModules(pool, userId, role),
```

- [ ] **Step 4: Aggiorna `getMe` per includere `modules` nella risposta**

In `auth.ts`, nel handler `GET /me` (riga ~354):

```typescript
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
      // NUOVO — moduli effettivi dalla risposta getMe (per completezza)
      modules: req.user!.modules,
      modules_version: req.user!.modules_version,
    },
  },
});
```

- [ ] **Step 5: Build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -30
```

Atteso: errori solo sulle parti non ancora aggiornate (middleware, admin). Tutti gli errori legati a `modules_version` in `JWTPayload` devono essere risolti.

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/auth-utils.ts \
        archibald-web-app/backend/src/routes/auth.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): login emette moduli effettivi + modules_version nel JWT"
```

---

## Task 4: Backend Middleware — Cache + check `modules_version`

**Files:**
- Modify: `archibald-web-app/backend/src/middleware/auth.ts`

- [ ] **Step 1: Scrivi il test di integrazione** (da aggiungere ai test esistenti del middleware o a `auth.spec.ts`)

Nel file di test del middleware (o in `server.spec.ts`), aggiungi:

```typescript
describe('modules_version check', () => {
  test('restituisce 401 session_invalidated se modules_version nel DB è maggiore di quella nel JWT', async () => {
    // Arrange: crea un JWT con modules_version=0
    // Aggiorna il DB per impostare modules_version=1
    // Act: fai una richiesta autenticata con il JWT vecchio
    // Assert: risposta 401 con { error: 'session_invalidated', reason: 'modules_changed' }
  });

  test('passa se modules_version coincide', async () => {
    // JWT con modules_version=0, DB con modules_version=0 → richiesta passa
  });
});
```

- [ ] **Step 2: Aggiungi cache e check a `middleware/auth.ts`**

Aggiorna il file completo:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../auth-utils';
import { logger } from '../logger';
import type { UserRole } from '../db/repositories/users';
import type { DbPool } from '../db/pool';
import { updateLastActivity, getUserModulesVersion } from '../db/repositories/users';
import type { RedisClient } from '../db/redis-client';
import { isTokenRevoked } from '../db/redis-client';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: UserRole;
    deviceId?: string;
    isImpersonating?: boolean;
    realAdminId?: string;
    adminSessionId?: number;
    modules: string[];
    modules_version: number;   // NUOVO
    jti: string;
  };
}

// Cache in-process per evitare query DB ad ogni richiesta
const modulesVersionCache = new Map<string, { version: number; cachedAt: number }>();
const MODULES_VERSION_CACHE_TTL_MS = 30_000;

async function getCachedModulesVersion(pool: DbPool, userId: string): Promise<number> {
  const now = Date.now();
  const cached = modulesVersionCache.get(userId);
  if (cached && now - cached.cachedAt < MODULES_VERSION_CACHE_TTL_MS) {
    return cached.version;
  }
  const version = await getUserModulesVersion(pool, userId);
  modulesVersionCache.set(userId, { version, cachedAt: now });
  return version;
}

// Esposta per permettere invalidazione immediata dalla route admin
export function invalidateModulesVersionCache(userId: string): void {
  modulesVersionCache.delete(userId);
}

export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  // ... invariato ...
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  // ... invariato ...
}

function createAuthMiddleware(pool: DbPool, redis?: RedisClient) {
  return async function authenticateJWTWithActivity(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token non fornito' });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyJWT(token);

    if (!payload) {
      return res.status(401).json({ error: 'Token non valido o scaduto' });
    }

    if (payload && redis) {
      if (!payload.jti) {
        return res.status(401).json({ error: 'Token non valido: jti mancante' });
      }
      const revoked = await isTokenRevoked(redis, payload.jti);
      if (revoked) {
        return res.status(401).json({ error: 'Token revocato' });
      }
    } else if (payload && !redis && payload.jti) {
      logger.warn('JWT revocation check skipped: Redis not configured', { jti: payload.jti });
    }

    // Check modules_version per rilevare cambio moduli admin
    const currentVersion = await getCachedModulesVersion(pool, payload.userId);
    if (currentVersion !== payload.modules_version) {
      invalidateModulesVersionCache(payload.userId);
      return res.status(401).json({
        success: false,
        error: 'session_invalidated',
        reason: 'modules_changed',
      });
    }

    req.user = payload;
    updateLastActivity(pool, payload.userId).catch(() => {});
    next();
  };
}

export { createAuthMiddleware };
```

- [ ] **Step 3: Build e run test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -20
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/middleware/auth.ts
git commit -m "feat(backend): middleware — cache + check modules_version per forced logout"
```

---

## Task 5: Backend Admin — Nuovi endpoint module-defaults + PATCH users aggiornato

**Files:**
- Modify: `archibald-web-app/backend/src/routes/admin.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Aggiorna `AdminRouterDeps` in `admin.ts`**

Aggiungi i campi mancanti al tipo:

```typescript
type AdminRouterDeps = {
  // ... campi esistenti ...
  getModuleDefaults: () => Promise<Array<{ module_name: string; role: string; enabled: boolean }>>;
  updateModuleDefault: (module_name: string, role: string, enabled: boolean) => Promise<void>;
  updateUserModules: (userId: string, modulesGranted: string[], modulesRevoked: string[]) => Promise<number>;
  invalidateModulesVersionCache: (userId: string) => void;
};
```

- [ ] **Step 2: Aggiungi i due nuovi endpoint in `createAdminRouter`**

Subito dopo gli endpoint utenti esistenti, prima del router.delete, aggiungi:

```typescript
// GET /api/admin/module-defaults
router.get('/module-defaults', async (_req: AuthRequest, res) => {
  try {
    const defaults = await deps.getModuleDefaults();
    res.json({ success: true, defaults });
  } catch (error) {
    logger.error('Error fetching module defaults', { error });
    res.status(500).json({ success: false, error: 'Errore server' });
  }
});

// PATCH /api/admin/module-defaults
router.patch('/module-defaults', async (req: AuthRequest, res) => {
  try {
    const parsed = z.object({
      module_name: z.string().min(1),
      role: z.enum(['agent', 'admin', 'ufficio', 'concessionario']),
      enabled: z.boolean(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.data });
    }

    const { module_name, role, enabled } = parsed.data;
    await deps.updateModuleDefault(module_name, role, enabled);

    void audit(deps.pool, {
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'module_defaults.updated',
      ipAddress: req.ip,
      metadata: { module_name, role, enabled },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating module default', { error });
    res.status(500).json({ success: false, error: 'Errore server' });
  }
});
```

- [ ] **Step 3: Aggiorna `PATCH /users/:id` per usare `modules_granted`/`modules_revoked`**

Sostituisci lo schema Zod e la logica dell'endpoint esistente:

```typescript
router.patch('/users/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const parsed = z.object({
      role: z.enum(['agent', 'admin', 'ufficio', 'concessionario']).optional(),
      whitelisted: z.boolean().optional(),
      modules_granted: z.array(z.string()).optional(),
      modules_revoked: z.array(z.string()).optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues });
    }

    const changes = parsed.data;

    if (changes.role !== undefined && id === req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Non puoi modificare il tuo stesso ruolo' });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (changes.role !== undefined) { setClauses.push(`role = $${idx++}`); params.push(changes.role); }
    if (changes.whitelisted !== undefined) { setClauses.push(`whitelisted = $${idx++}`); params.push(changes.whitelisted); }

    if (setClauses.length === 0 && changes.modules_granted === undefined && changes.modules_revoked === undefined) {
      return res.status(400).json({ success: false, error: 'Nessun campo da aggiornare' });
    }

    if (setClauses.length > 0) {
      params.push(id);
      await deps.pool.query(`UPDATE agents.users SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);
    }

    // Aggiornamento moduli: atomico con incremento modules_version
    if (changes.modules_granted !== undefined || changes.modules_revoked !== undefined) {
      const user = await deps.getUserById(id);
      const newGranted = changes.modules_granted ?? user?.modulesGranted ?? [];
      const newRevoked = changes.modules_revoked ?? user?.modulesRevoked ?? [];
      await deps.updateUserModules(id, newGranted, newRevoked);
      deps.invalidateModulesVersionCache(id);
    }

    void audit(deps.pool, {
      actorId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'user.updated',
      targetType: 'user',
      targetId: id,
      ipAddress: req.ip,
      metadata: changes as Record<string, unknown>,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating user', { error });
    res.status(500).json({ success: false, error: 'Errore aggiornamento utente' });
  }
});
```

- [ ] **Step 4: Aggiungi le nuove funzioni repository al blocco di destrutturazione**

In cima a `createAdminRouter`, aggiorna la destrutturazione di `deps`:

```typescript
const {
  getAllUsers, getUserById, createUser, updateWhitelist, deleteUser,
  updateUserTarget, getUserTarget, generateJWT, createAdminSession, closeAdminSession,
  getAllJobs, retryJob, cancelJob, cleanupJobs, getRetentionConfig, importSubclients, importKometListino,
  getModuleDefaults, updateModuleDefault, updateUserModules, invalidateModulesVersionCache,
} = deps;
```

- [ ] **Step 5: Aggiorna `server.ts` — nuove dep per `createAdminRouter`**

Nel blocco `createAdminRouter({...})` in `server.ts`, aggiungi:

```typescript
getModuleDefaults: () =>
  deps.pool.query<{ module_name: string; role: string; enabled: boolean }>(
    'SELECT module_name, role, enabled FROM system.module_defaults ORDER BY module_name, role'
  ).then(r => r.rows),
updateModuleDefault: async (module_name: string, role: string, enabled: boolean) => {
  await deps.pool.query(
    `INSERT INTO system.module_defaults (module_name, role, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (module_name, role) DO UPDATE SET enabled = $3`,
    [module_name, role, enabled]
  );
},
updateUserModules: (userId, modulesGranted, modulesRevoked) =>
  usersRepo.updateUserModules(pool, userId, modulesGranted, modulesRevoked),
invalidateModulesVersionCache: (userId) =>
  authMiddleware.invalidateModulesVersionCache(userId),
```

Nota: importa `authMiddleware` da `../middleware/auth` nel `server.ts` se non già presente, oppure esporta `invalidateModulesVersionCache` da `middleware/auth.ts` e importala direttamente.

- [ ] **Step 6: Build completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | head -20
```

Atteso: zero errori TypeScript.

- [ ] **Step 7: Run test backend**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | tail -30
```

Atteso: tutti i test passano (eventuali test che usano `modules` nelle fixture vanno aggiornati con `modulesGranted`).

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/routes/admin.ts \
        archibald-web-app/backend/src/server.ts
git commit -m "feat(backend): admin — GET/PATCH module-defaults, PATCH users con modules_version"
```

---

## Task 6: Frontend — Tipi `UserRole` e `User`

**Files:**
- Modify: `archibald-web-app/frontend/src/api/auth.ts`

- [ ] **Step 1: Aggiorna `UserRole` e `User`**

```typescript
// Da:
export type UserRole = "agent" | "admin";

// A:
export type UserRole = "agent" | "admin" | "ufficio" | "concessionario";

// Aggiungi a interface User:
export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  whitelisted: boolean;
  lastLoginAt: number | null;
  mfaEnabled?: boolean;
  isImpersonating?: boolean;
  realAdminName?: string;
  modules?: string[];          // NUOVO — presenti se returnati da getMe
  modules_version?: number;   // NUOVO
}
```

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -20
```

Atteso: zero errori (se ci sono errori su `UserRole` in altri file frontend, aggiornali).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/api/auth.ts
git commit -m "feat(frontend): UserRole a 4 valori, User con modules opzionale"
```

---

## Task 7: Frontend — `calculateEffectiveDiscount` + `DiscountTrafficLight`

**Files:**
- Create: `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.ts`
- Create: `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.spec.ts`
- Create: `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.tsx`
- Create: `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.spec.tsx`

- [ ] **Step 1: Scrivi il test per `calculateEffectiveDiscount`**

```typescript
// DiscountTrafficLight.spec.ts
import { describe, test, expect } from 'vitest';
import { calculateEffectiveDiscount } from './DiscountTrafficLight';

describe('calculateEffectiveDiscount', () => {
  test('ritorna 0 se la lista è vuota', () => {
    expect(calculateEffectiveDiscount([], 0)).toBe(0);
  });

  test('ritorna 0 se listTotal è zero', () => {
    const items = [{ quantity: 1, unitPrice: 0, originalListPrice: 0 }];
    expect(calculateEffectiveDiscount(items, 0)).toBe(0);
  });

  test('ritorna 0 se non c\'è sconto', () => {
    const items = [{ quantity: 2, unitPrice: 100, originalListPrice: 100 }];
    expect(calculateEffectiveDiscount(items, 0)).toBe(0);
  });

  test('calcola sconto solo da originalListPrice vs unitPrice (senza globalDiscount)', () => {
    const items = [{ quantity: 1, unitPrice: 80, originalListPrice: 100 }];
    // listTotal=100, netTotal=80*1=80, discount=(1-80/100)*100=20
    expect(calculateEffectiveDiscount(items, 0)).toBeCloseTo(20);
  });

  test('calcola sconto da globalDiscount quando originalListPrice == unitPrice', () => {
    const items = [{ quantity: 1, unitPrice: 100, originalListPrice: 100 }];
    // listTotal=100, netTotal=100*(1-0.25)=75, discount=25
    expect(calculateEffectiveDiscount(items, 25)).toBeCloseTo(25);
  });

  test('calcola sconto composto: originalListPrice + globalDiscount', () => {
    const items = [{ quantity: 1, unitPrice: 80, originalListPrice: 100 }];
    // listTotal=100, netTotal=80*(1-0.10)=72, discount=(1-72/100)*100=28
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(28);
  });

  test('usa unitPrice come fallback se originalListPrice non disponibile (articolo ghost)', () => {
    const items = [{ quantity: 1, unitPrice: 50 }]; // nessun originalListPrice
    // listTotal=50, netTotal=50*(1-0.10)=45, discount=(1-45/50)*100=10
    expect(calculateEffectiveDiscount(items, 10)).toBeCloseTo(10);
  });

  test('media ponderata su più righe con unitPrice diversi', () => {
    const items = [
      { quantity: 1, unitPrice: 100, originalListPrice: 100 },
      { quantity: 2, unitPrice: 60,  originalListPrice: 100 },
    ];
    // listTotal=100+200=300, netTotal=(100*(1-0.05))+(60*2*(1-0.05))=95+114=209
    // discount=(1-209/300)*100≈30.33
    expect(calculateEffectiveDiscount(items, 5)).toBeCloseTo(30.33, 1);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- DiscountTrafficLight.spec.ts 2>&1 | tail -10
```

Atteso: FAIL con "Cannot find module".

- [ ] **Step 3: Implementa `calculateEffectiveDiscount` in `DiscountTrafficLight.ts`**

```typescript
// archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.ts

export interface OrderItemForDiscount {
  quantity: number;
  unitPrice: number;
  originalListPrice?: number;
}

export function calculateEffectiveDiscount(
  items: OrderItemForDiscount[],
  globalDiscountPercent: number,
): number {
  if (items.length === 0) return 0;

  const listTotal = items.reduce(
    (sum, item) => sum + item.quantity * (item.originalListPrice ?? item.unitPrice),
    0,
  );

  if (listTotal === 0) return 0;

  const netTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (1 - globalDiscountPercent / 100),
    0,
  );

  return (1 - netTotal / listTotal) * 100;
}
```

- [ ] **Step 4: Esegui il test — deve passare**

```bash
npm test --prefix archibald-web-app/frontend -- DiscountTrafficLight.spec.ts 2>&1 | tail -10
```

Atteso: PASS, 8 test verdi.

- [ ] **Step 5: Scrivi il test del componente**

```typescript
// DiscountTrafficLight.spec.tsx
// @ts-nocheck
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscountTrafficLight } from './DiscountTrafficLight';

describe('DiscountTrafficLight', () => {
  test('non renderizza nulla a sconto 0', () => {
    const { container } = render(<DiscountTrafficLight effectiveDiscountPercent={0} />);
    expect(container.firstChild).toBeNull();
  });

  test('verde per sconto 0.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={0.1} />);
    expect(screen.getByText('Limite sconto rispettato')).toBeInTheDocument();
    expect(screen.getByText(/0\.1%/)).toBeInTheDocument();
  });

  test('verde per sconto esattamente 20%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20} />);
    expect(screen.getByText('Limite sconto rispettato')).toBeInTheDocument();
  });

  test('giallo per sconto 20.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={20.1} />);
    expect(screen.getByText('Limite sconto critico')).toBeInTheDocument();
  });

  test('giallo per sconto esattamente 25%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25} />);
    expect(screen.getByText('Limite sconto critico')).toBeInTheDocument();
  });

  test('rosso per sconto 25.1%', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={25.1} />);
    expect(screen.getByText('Limite sconto in approvazione')).toBeInTheDocument();
  });

  test('mostra percentuale formattata a 1 decimale', () => {
    render(<DiscountTrafficLight effectiveDiscountPercent={22.567} />);
    expect(screen.getByText(/22\.6%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Esegui il test del componente — deve fallire**

```bash
npm test --prefix archibald-web-app/frontend -- DiscountTrafficLight.spec.tsx 2>&1 | tail -10
```

Atteso: FAIL.

- [ ] **Step 7: Implementa il componente `DiscountTrafficLight.tsx`**

```tsx
// archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.tsx

interface DiscountTrafficLightProps {
  effectiveDiscountPercent: number;
}

type TrafficLightState = {
  color: string;
  textColor: string;
  background: string;
  border: string;
  label: string;
};

function getState(pct: number): TrafficLightState | null {
  if (pct === 0) return null;
  if (pct <= 20) return {
    color: '#22c55e',
    textColor: '#22c55e',
    background: '#052e16',
    border: '#166534',
    label: 'Limite sconto rispettato',
  };
  if (pct <= 25) return {
    color: '#f59e0b',
    textColor: '#fbbf24',
    background: '#422006',
    border: '#92400e',
    label: 'Limite sconto critico',
  };
  return {
    color: '#dc2626',
    textColor: '#f87171',
    background: '#450a0a',
    border: '#991b1b',
    label: 'Limite sconto in approvazione',
  };
}

export function DiscountTrafficLight({ effectiveDiscountPercent }: DiscountTrafficLightProps) {
  const state = getState(effectiveDiscountPercent);
  if (!state) return null;

  const formatted = `${effectiveDiscountPercent.toFixed(1)}%`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        background: state.background,
        border: `1px solid ${state.border}`,
        borderRadius: '6px',
        padding: '0.55rem 0.8rem',
        marginTop: '0.5rem',
      }}
    >
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: state.color,
          boxShadow: `0 0 6px ${state.color}`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: state.textColor, fontWeight: 700, fontSize: '0.76rem', lineHeight: 1.2 }}>
          {state.label}
        </div>
        <div style={{ color: state.textColor, fontSize: '0.68rem', marginTop: '0.1rem', opacity: 0.85 }}>
          Sconto effettivo documento: {formatted}
        </div>
      </div>
      <div style={{ color: state.textColor, fontWeight: 800, fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Esegui entrambi i test — devono passare**

```bash
npm test --prefix archibald-web-app/frontend -- DiscountTrafficLight 2>&1 | tail -15
```

Atteso: PASS, tutti i test verdi.

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.ts \
        archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.spec.ts \
        archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.tsx \
        archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.spec.tsx
git commit -m "feat(frontend): calculateEffectiveDiscount + DiscountTrafficLight component"
```

---

## Task 8: Frontend — `useModules` hook + integrazione in `OrderFormSimple`

**Files:**
- Create: `archibald-web-app/frontend/src/hooks/useModules.ts`
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

- [ ] **Step 1: Crea `useModules.ts`**

Il hook decodifica il payload JWT da localStorage senza HTTP extra. Il JWT è un token HS256 (non cifrato) con payload base64url-encoded.

```typescript
// archibald-web-app/frontend/src/hooks/useModules.ts

function readModulesFromJWT(): string[] {
  try {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return [];
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return [];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.modules) ? payload.modules : [];
  } catch {
    return [];
  }
}

export function useModules() {
  const modules = readModulesFromJWT();
  return {
    hasModule: (name: string): boolean => modules.includes(name),
  };
}
```

- [ ] **Step 2: Aggiungi i import necessari in `OrderFormSimple.tsx`**

In cima al file, aggiungi agli import esistenti:

```typescript
import { useModules } from '../hooks/useModules';
import { calculateEffectiveDiscount } from './new-order-form/DiscountTrafficLight';
import { DiscountTrafficLight } from './new-order-form/DiscountTrafficLight';
```

- [ ] **Step 3: Chiama `useModules` nella funzione componente**

All'inizio del corpo della funzione `OrderFormSimple`, subito dopo gli altri hook:

```typescript
const { hasModule } = useModules();
```

- [ ] **Step 4: Calcola `effectiveDiscountPercent` nello scope del componente**

Subito prima del `return` del JSX (o dove sono già calcolati i totali), aggiungi:

```typescript
const globalDiscountPct = parseFloat(globalDiscountPercent.replace(',', '.')) || 0;
const effectiveDiscountPercent = calculateEffectiveDiscount(items, globalDiscountPct);
```

Nota: `globalDiscountPercent` è già uno state string nel componente.

- [ ] **Step 5: Inserisci il banner dopo l'input sconto globale**

Trova il blocco dell'input sconto (riga ~4596 nel file originale, immediatamente dopo `</input>` e `</div>` del label+input wrapper). Inserisci dopo il `</div>` che chiude il wrapper dell'input e PRIMA del commento `{/* Markup Panel */}`:

```tsx
{/* Discount Traffic Light — modulo condizionale */}
{hasModule('discount-traffic-light') && items.length > 0 && (
  <DiscountTrafficLight effectiveDiscountPercent={effectiveDiscountPercent} />
)}
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -20
```

Atteso: zero errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/hooks/useModules.ts \
        archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(frontend): useModules hook + DiscountTrafficLight in OrderFormSimple"
```

---

## Task 9: Frontend — `fetchWithRetry` gestisce `session_invalidated`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/fetch-with-retry.ts`

- [ ] **Step 1: Aggiungi la gestione `modules_changed` prima del blocco CREDENTIALS_EXPIRED**

Nel blocco `if (response.status === 401)` (riga ~76), inserisci il check PRIMA di `if (data.error === 'CREDENTIALS_EXPIRED')`:

```typescript
if (response.status === 401) {
  try {
    const clonedResponse = response.clone();
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const data = await clonedResponse.json();

      // NUOVO — session_invalidated per cambio moduli admin
      if (data.reason === 'modules_changed') {
        console.log('🔄 [FetchWithRetry] Moduli aggiornati — logout forzato');
        localStorage.removeItem('archibald_jwt');
        window.location.href = '/';
        return response; // interrompe il retry loop, mai raggiunto per via del redirect
      }

      // 3a. CREDENTIALS_EXPIRED (very rare with lazy-load backend)
      if (data.error === 'CREDENTIALS_EXPIRED') {
        // ... invariato ...
      }

      // 3b. Other 401 errors
      // ... invariato ...
    }
  } catch (parseError) {
    // ... invariato ...
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/utils/fetch-with-retry.ts
git commit -m "feat(frontend): fetchWithRetry gestisce session_invalidated (modules_changed)"
```

---

## Task 10: Frontend — Sezione Admin "Gestione Moduli"

**Files:**
- Create: `archibald-web-app/frontend/src/api/module-defaults.ts`
- Create: `archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx`
- Modify: `archibald-web-app/frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Crea il client API `module-defaults.ts`**

```typescript
// archibald-web-app/frontend/src/api/module-defaults.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';

export type UserRole = 'agent' | 'admin' | 'ufficio' | 'concessionario';

export type ModuleDefault = {
  module_name: string;
  role: UserRole;
  enabled: boolean;
};

export type ModuleUserOverride = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  modulesGranted: string[];
  modulesRevoked: string[];
};

export async function getModuleDefaults(): Promise<ModuleDefault[]> {
  const res = await fetchWithRetry('/api/admin/module-defaults');
  const data = await res.json();
  return data.defaults ?? [];
}

export async function updateModuleDefault(
  module_name: string,
  role: UserRole,
  enabled: boolean,
): Promise<void> {
  await fetchWithRetry('/api/admin/module-defaults', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module_name, role, enabled }),
  });
}

export async function updateUserModules(
  userId: string,
  modulesGranted: string[],
  modulesRevoked: string[],
): Promise<void> {
  await fetchWithRetry(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules_granted: modulesGranted, modules_revoked: modulesRevoked }),
  });
}
```

- [ ] **Step 2: Crea `AdminModulesSection.tsx`**

```tsx
// archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx
import { useState, useEffect } from 'react';
import type { ModuleDefault, ModuleUserOverride, UserRole } from '../../api/module-defaults';
import { getModuleDefaults, updateModuleDefault, updateUserModules } from '../../api/module-defaults';
import { fetchWithRetry } from '../../utils/fetch-with-retry';

const KNOWN_MODULES: Array<{ name: string; label: string; description: string }> = [
  {
    name: 'discount-traffic-light',
    label: '🚦 Semaforo Sconto',
    description: 'Mostra un banner colorato durante la creazione ordine con lo stato dello sconto effettivo documento.',
  },
];

const ALL_ROLES: UserRole[] = ['agent', 'admin', 'ufficio', 'concessionario'];
const ROLE_LABELS: Record<UserRole, string> = {
  agent: 'Agent',
  admin: 'Admin',
  ufficio: 'Ufficio',
  concessionario: 'Concessionario',
};

type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  modules: string[];
  modulesGranted?: string[];
  modulesRevoked?: string[];
};

export function AdminModulesSection() {
  const [defaults, setDefaults] = useState<ModuleDefault[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getModuleDefaults(),
      fetchWithRetry('/api/admin/users').then(r => r.json()),
    ]).then(([defs, usersData]) => {
      setDefaults(defs);
      setUsers(usersData.users ?? []);
      setLoading(false);
    });
  }, []);

  function isDefaultEnabled(moduleName: string, role: UserRole): boolean {
    return defaults.find(d => d.module_name === moduleName && d.role === role)?.enabled ?? false;
  }

  async function toggleRoleDefault(moduleName: string, role: UserRole, currentEnabled: boolean) {
    const key = `${moduleName}-${role}`;
    setSaving(key);
    await updateModuleDefault(moduleName, role, !currentEnabled);
    setDefaults(prev => prev.map(d =>
      d.module_name === moduleName && d.role === role ? { ...d, enabled: !currentEnabled } : d
    ));
    setSaving(null);
  }

  async function toggleUserOverride(
    user: AdminUser,
    moduleName: string,
    currentlyRevoked: boolean,
  ) {
    setSaving(`user-${user.id}-${moduleName}`);
    const granted = user.modulesGranted ?? [];
    const revoked = user.modulesRevoked ?? [];

    const newRevoked = currentlyRevoked
      ? revoked.filter(m => m !== moduleName)
      : [...revoked, moduleName];
    const newGranted = granted.filter(m => m !== moduleName);

    await updateUserModules(user.id, newGranted, newRevoked);
    setUsers(prev => prev.map(u =>
      u.id === user.id ? { ...u, modulesGranted: newGranted, modulesRevoked: newRevoked } : u
    ));
    setSaving(null);
  }

  if (loading) {
    return <div style={{ padding: '1rem', color: '#9ca3af' }}>Caricamento moduli...</div>;
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
        Gestione Moduli
      </h3>

      {KNOWN_MODULES.map(mod => (
        <div
          key={mod.name}
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '1rem',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', background: '#f3f4f6' }}>
            <div style={{ fontWeight: 700 }}>{mod.label}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>{mod.description}</div>
          </div>

          {/* Tabella ruoli */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Default per ruolo
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {ALL_ROLES.map(role => {
                const enabled = isDefaultEnabled(mod.name, role);
                const key = `${mod.name}-${role}`;
                return (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={saving === key}
                      onChange={() => toggleRoleDefault(mod.name, role, enabled)}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{ROLE_LABELS[role]}</span>
                    {enabled
                      ? <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>ON</span>
                      : <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>OFF</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.5rem' }}>
              ⚠️ Il cambio di default si applica al prossimo login degli utenti del ruolo (fino a 8h).
            </div>
          </div>

          {/* Override per utente */}
          <div style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Override per utente (cambio immediato → forza logout)
            </div>
            {users.map(user => {
              const revoked = user.modulesRevoked ?? [];
              const isRevoked = revoked.includes(mod.name);
              const roleDefault = isDefaultEnabled(mod.name, user.role);
              const savingKey = `user-${user.id}-${mod.name}`;
              return (
                <div
                  key={user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.4rem 0',
                    borderBottom: '1px solid #f3f4f6',
                    gap: '0.75rem',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>{user.fullName}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{ROLE_LABELS[user.role]}</span>
                  {!isRevoked ? (
                    <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                      {roleDefault ? 'Eredita default ✓' : 'Grant esplicito'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Revocato</span>
                  )}
                  <button
                    disabled={saving === savingKey}
                    onClick={() => toggleUserOverride(user, mod.name, isRevoked)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {saving === savingKey ? '...' : isRevoked ? 'Ripristina' : 'Revoca'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Integra `AdminModulesSection` in `AdminPage.tsx`**

Aggiungi l'import in cima:

```typescript
import { AdminModulesSection } from '../components/admin/AdminModulesSection';
```

Nel JSX di `AdminPage`, aggiungi la sezione in un punto appropriato della pagina (es. prima della sezione job o in fondo):

```tsx
{/* Sezione Gestione Moduli */}
<section style={{ marginTop: '2rem' }}>
  <AdminModulesSection />
</section>
```

- [ ] **Step 4: Type-check e build completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | head -20
npm run build --prefix archibald-web-app/backend 2>&1 | head -20
```

Atteso: zero errori in entrambi.

- [ ] **Step 5: Run test completi**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -20
npm test --prefix archibald-web-app/backend 2>&1 | tail -20
```

Atteso: tutti i test passano.

- [ ] **Step 6: Commit finale**

```bash
git add archibald-web-app/frontend/src/api/module-defaults.ts \
        archibald-web-app/frontend/src/components/admin/AdminModulesSection.tsx \
        archibald-web-app/frontend/src/pages/AdminPage.tsx
git commit -m "feat(frontend): AdminModulesSection — gestione moduli per ruolo e per utente"
```

---

## Self-Review checklist

- [x] **Migration 056** → Task 1
- [x] **Tabella `system.module_defaults` + seed** → Task 1
- [x] **Rinomina `modules` → `modules_granted` + nuovi campi** → Task 1 (DB) + Task 2 (tipi)
- [x] **DOWN script** → nel file SQL (commentato)
- [x] **`getEffectiveModules`, `getUserModulesVersion`, `updateUserModules`** → Task 2
- [x] **Login emette moduli effettivi + `modules_version` nel JWT** → Task 3
- [x] **`getMe` include `modules`** → Task 3
- [x] **Cache in-process 30s + check `modules_version` nel middleware** → Task 4
- [x] **`invalidateModulesVersionCache` esposta** → Task 4, usata in Task 5
- [x] **Endpoint `GET/PATCH /api/admin/module-defaults`** → Task 5
- [x] **`PATCH /api/admin/users/:id` aggiornato** → Task 5
- [x] **`UserRole` a 4 valori, `User.modules` nel frontend** → Task 6
- [x] **`calculateEffectiveDiscount` come funzione pura testata** → Task 7
- [x] **`DiscountTrafficLight` con 3 stati + nascosto a 0%** → Task 7
- [x] **`useModules` decodifica JWT senza HTTP** → Task 8
- [x] **Integrazione banner in `OrderFormSimple` con guard `hasModule`** → Task 8
- [x] **`fetchWithRetry` gestisce `modules_changed` prima del blocco 401 generico** → Task 9
- [x] **Admin UI tabella ruoli + override utente** → Task 10
- [x] **Audit log per cambio moduli** → Task 5 (usato `audit()`)
- [x] **TDD su ogni componente** → Task 2, 7
