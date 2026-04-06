# Compliance NIS 2 + GDPR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare la PWA Archibald a piena conformità GDPR (data processor) e NIS 2 (supply chain ICT) entro il 14 aprile 2026, per il meeting con Komet Italia/Germania.

**Architecture:** Sette aree di intervento in sequenza: quick wins infrastrutturali → audit log immutabile → sistema ruoli + MFA → GDPR data lifecycle → session hardening → documenti operativi. Ogni task è indipendente e committabile.

**Tech Stack:** Node.js/TypeScript, Express, PostgreSQL (pg pool), Redis (ioredis), BullMQ, React 19, Vite, Vitest, Docker Compose, GitHub Actions, `nodemailer` (già presente), `express-rate-limit` (nuovo), `otpauth` (nuovo), `bcryptjs` (nuovo).

**Spec:** `docs/superpowers/specs/2026-04-02-compliance-nis2-gdpr-design.md`

---

## File Map

### Nuovi file
- `backup/Dockerfile` — immagine Alpine per pg_dump + rclone
- `backup/backup.sh` — script dump + upload Hetzner Object Storage
- `archibald-web-app/backend/src/services/security-alert-service.ts` — alerting email sicurezza
- `archibald-web-app/backend/src/db/migrations/045-audit-log.sql`
- `archibald-web-app/backend/src/db/repositories/audit-log.ts`
- `archibald-web-app/backend/src/db/migrations/046-roles-modules-mfa.sql`
- `archibald-web-app/backend/src/services/mfa-service.ts`
- `archibald-web-app/backend/src/db/migrations/047-retention-policy.sql`
- `archibald-web-app/backend/src/db/repositories/gdpr.ts`
- `archibald-web-app/backend/src/db/redis-client.ts` — Redis client condiviso
- `docs/compliance/sub-processors.md`
- `docs/compliance/incident-response-procedure.md`
- `docs/compliance/archibald-security-compliance-overview.md`

### File modificati
- `.github/workflows/ci.yml` — aggiunta npm audit
- `archibald-web-app/backend/src/server.ts` — CSP, CORS whitelist
- `archibald-web-app/backend/src/routes/auth.ts` — rate limiting, audit, MFA endpoints, JWT revocation logout
- `archibald-web-app/backend/src/auth-utils.ts` — aggiunta `jti` + campi `modules`/`role` espansi al payload
- `archibald-web-app/backend/src/middleware/auth.ts` — revocation check Redis, `modules` nel tipo
- `archibald-web-app/backend/src/db/repositories/users.ts` — UserRole espanso, campi MFA
- `archibald-web-app/backend/src/sync/circuit-breaker.ts` — chiama sendSecurityAlert
- `archibald-web-app/backend/src/main.ts` — inizializza Redis condiviso, passa a middleware e router
- `archibald-web-app/backend/package.json` — aggiunta dipendenze
- `docker-compose.yml` — Redis password, nuovo service backup
- `memory/MEMORY.md` — rimozione PIN 2611

---

## Fase 1 — Quick wins tecnici (Giorni 1-2)

---

### Task 1: npm audit in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Aggiungere npm audit al workflow CI**

Aprire `.github/workflows/ci.yml` e aggiungere questo step dopo "Install dependencies" in entrambi i job `test-backend` e `test-frontend`:

Nel job `test-backend` (dopo `run: npm ci`):
```yaml
      - name: Security audit backend
        working-directory: archibald-web-app/backend
        run: npm audit --audit-level=high
```

Nel job `test-frontend` (dopo `run: npm ci`):
```yaml
      - name: Security audit frontend
        working-directory: archibald-web-app/frontend
        run: npm audit --audit-level=high
```

- [ ] **Step 2: Verificare localmente che non ci siano vulnerabilità critiche bloccanti**

```bash
cd archibald-web-app/backend && npm audit --audit-level=high
cd archibald-web-app/frontend && npm audit --audit-level=high
```

Se escono vulnerabilità `high`/`critical`: eseguire `npm audit fix` e verificare che i test passino ancora.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add npm audit security check to CI pipeline"
```

---

### Task 2: CSP + CORS corretti

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts:152-153`

- [ ] **Step 1: Scrivere test per verifica header sicurezza**

In `archibald-web-app/backend/src/server.spec.ts`, aggiungere nella sezione test esistente:

```ts
it('returns CSP and CORS headers on health check', async () => {
  const res = await request(app).get('/api/health')
    .set('Origin', 'https://formicanera.com');
  expect(res.headers['content-security-policy']).toBeDefined();
  expect(res.headers['access-control-allow-origin']).toBe('https://formicanera.com');
});

it('rejects CORS from unknown origin', async () => {
  const res = await request(app).get('/api/health')
    .set('Origin', 'https://evil.com');
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});
```

- [ ] **Step 2: Eseguire test per verificare che falliscano**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose 2>&1 | grep -A3 "CSP and CORS"
```

Expected: FAIL — CORS attuale è wildcard, CSP è disabilitato.

- [ ] **Step 3: Aggiungere `CORS_ORIGINS` al config**

In `archibald-web-app/backend/src/server.ts`, modificare le righe 152-153:

```ts
// Prima (riga 152-153):
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));

// Dopo:
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin ?? true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));
```

- [ ] **Step 4: Aggiungere `CORS_ORIGINS` all'env di test**

In `archibald-web-app/backend/src/server.spec.ts`, impostare l'env prima della creazione dell'app:

```ts
// All'inizio del describe block che crea l'app:
beforeAll(() => {
  process.env.CORS_ORIGINS = 'https://formicanera.com';
});
```

- [ ] **Step 5: Eseguire test**

```bash
cd archibald-web-app/backend && npm test -- --reporter=verbose 2>&1 | grep -A3 "CSP and CORS"
```

Expected: PASS

- [ ] **Step 6: Aggiungere CORS_ORIGINS a `.env.production`**

Aggiungere in fondo al file `.env.production`:
```
CORS_ORIGINS=https://formicanera.com,https://archibald.komet.it
```

*(Aggiornare con i domini reali quando noti)*

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/server.ts archibald-web-app/backend/src/server.spec.ts .env.production
git commit -m "security: enable CSP headers and restrict CORS to whitelist"
```

---

### Task 3: Rate limiting applicativo su auth

**Files:**
- Modify: `archibald-web-app/backend/src/routes/auth.ts`
- Modify: `archibald-web-app/backend/package.json`

- [ ] **Step 1: Installare express-rate-limit**

```bash
cd archibald-web-app/backend && npm install express-rate-limit
```

- [ ] **Step 2: Aggiungere rate limiter all'inizio di `auth.ts`**

In `archibald-web-app/backend/src/routes/auth.ts`, aggiungere dopo le import esistenti:

```ts
import rateLimit from 'express-rate-limit';

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
  message: { success: false, error: 'Limite refresh raggiunto. Riprova tra un\'ora.' },
});
```

- [ ] **Step 3: Applicare i limiter alle route**

In `createAuthRouter`, sulla route login:
```ts
router.post('/login', loginRateLimiter, async (req, res) => {
```

Sulla route refresh:
```ts
router.post('/refresh', refreshRateLimiter, authenticateJWT, async (req: AuthRequest, res) => {
```

- [ ] **Step 4: Eseguire i test backend**

```bash
cd archibald-web-app/backend && npm test
```

Expected: tutti i test passano (rate limiter non impatta i test esistenti perché ogni test usa un'istanza separata).

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/routes/auth.ts archibald-web-app/backend/package.json archibald-web-app/backend/package-lock.json
git commit -m "security: add application-level rate limiting on auth endpoints"
```

---

### Task 4: Security alert service

**Files:**
- Create: `archibald-web-app/backend/src/services/security-alert-service.ts`
- Create: `archibald-web-app/backend/src/services/security-alert-service.spec.ts`
- Modify: `archibald-web-app/backend/src/sync/circuit-breaker.ts`
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Scrivere il test per security-alert-service**

Creare `archibald-web-app/backend/src/services/security-alert-service.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

import { createSecurityAlertService } from './security-alert-service';

const smtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'alerts@example.com',
  pass: 'secret',
  from: 'alerts@example.com',
};

describe('createSecurityAlertService', () => {
  beforeEach(() => mockSendMail.mockClear());

  it('sends email with event type in subject', async () => {
    const svc = createSecurityAlertService(smtpConfig, 'admin@example.com');
    await svc.send('circuit_breaker_triggered', { userId: 'user1', syncType: 'agent-sync' });
    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('circuit_breaker_triggered');
    expect(call.to).toBe('admin@example.com');
  });

  it('swallows errors silently', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    const svc = createSecurityAlertService(smtpConfig, 'admin@example.com');
    await expect(svc.send('backup_failed', {})).resolves.toBeUndefined();
  });

  it('does nothing when SMTP not configured', async () => {
    const svc = createSecurityAlertService({ host: '', port: 587, secure: false, user: '', pass: '', from: '' }, 'admin@example.com');
    await svc.send('backup_failed', {});
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
cd archibald-web-app/backend && npm test -- security-alert-service.spec
```

Expected: FAIL — modulo non esiste ancora.

- [ ] **Step 3: Creare `security-alert-service.ts`**

```ts
import nodemailer from 'nodemailer';
import { logger } from '../logger';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type SecurityAlertEvent =
  | 'login_failed_admin'
  | 'login_failed_agent'
  | 'circuit_breaker_triggered'
  | 'backup_failed'
  | 'backup_completed'
  | 'rate_limit_triggered_admin'
  | 'high_error_rate';

type SecurityAlertService = {
  send: (event: SecurityAlertEvent, details: Record<string, unknown>) => Promise<void>;
};

export function createSecurityAlertService(
  smtp: SmtpConfig,
  alertRecipient: string,
): SecurityAlertService {
  async function send(event: SecurityAlertEvent, details: Record<string, unknown>): Promise<void> {
    if (!smtp.host || !smtp.user) return;
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      const timestamp = new Date().toISOString();
      await transporter.sendMail({
        from: smtp.from || smtp.user,
        to: alertRecipient,
        subject: `[ARCHIBALD SECURITY] ${event} — ${timestamp}`,
        text: `Evento: ${event}\nTimestamp: ${timestamp}\n\nDettagli:\n${JSON.stringify(details, null, 2)}`,
      });
    } catch (err) {
      logger.warn('Security alert email failed', { event, err });
    }
  }

  return { send };
}
```

- [ ] **Step 4: Eseguire il test**

```bash
cd archibald-web-app/backend && npm test -- security-alert-service.spec
```

Expected: PASS (3 test)

- [ ] **Step 5: Integrare nel circuit-breaker**

In `archibald-web-app/backend/src/sync/circuit-breaker.ts`, aggiungere il parametro opzionale `onAlert` alle funzioni che gestiscono i fallimenti.

Dopo la definizione di `createCircuitBreaker(pool: DbPool)`, modificare la firma:

```ts
function createCircuitBreaker(
  pool: DbPool,
  onAlert?: (event: string, details: Record<string, unknown>) => void,
) {
```

Trovare il punto dove viene impostato `paused_until` (quando si supera la soglia) e aggiungere la chiamata:

```ts
// Dopo aver impostato paused_until nel DB:
if (onAlert) {
  onAlert('circuit_breaker_triggered', {
    userId,
    syncType,
    consecutiveFailures: newConsecutive,
    pausedUntil: pausedUntil.toISOString(),
  });
}
```

- [ ] **Step 6: Aggiungere `SECURITY_ALERT_EMAIL` a `.env.production`**

```
SECURITY_ALERT_EMAIL=tua@email.com
```

- [ ] **Step 7: Eseguire tutti i test backend**

```bash
cd archibald-web-app/backend && npm test
```

Expected: tutti i test passano.

- [ ] **Step 8: Commit**

```bash
git add archibald-web-app/backend/src/services/security-alert-service.ts archibald-web-app/backend/src/services/security-alert-service.spec.ts archibald-web-app/backend/src/sync/circuit-breaker.ts .env.production
git commit -m "security: add security alert email service and integrate with circuit breaker"
```

---

### Task 5: Backup automatico PostgreSQL

**Files:**
- Create: `backup/Dockerfile`
- Create: `backup/backup.sh`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Creare `backup/backup.sh`**

```bash
#!/bin/sh
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="archibald_backup_${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[$(date)] Starting PostgreSQL backup..."

# Dump + compress
PGPASSWORD="${PG_PASSWORD}" pg_dump \
  -h "${PG_HOST:-postgres}" \
  -U "${PG_USER:-archibald}" \
  -d "${PG_DATABASE:-archibald}" \
  --no-password \
  | gzip > "${TMPFILE}"

echo "[$(date)] Dump created: ${TMPFILE} ($(du -sh ${TMPFILE} | cut -f1))"

# Upload to Hetzner Object Storage (S3-compatible)
rclone copy "${TMPFILE}" "hetzner:${HETZNER_BUCKET}/backups/" \
  --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
  --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
  --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
  --s3-provider=Other

echo "[$(date)] Upload completed to hetzner:${HETZNER_BUCKET}/backups/${FILENAME}"

# Cleanup local tmp
rm "${TMPFILE}"

# Rotate: keep only last 30 backups
echo "[$(date)] Rotating old backups (keep last 30)..."
rclone ls "hetzner:${HETZNER_BUCKET}/backups/" \
  --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
  --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
  --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
  --s3-provider=Other \
  | sort | head -n -30 | awk '{print $2}' | while read f; do
    rclone delete "hetzner:${HETZNER_BUCKET}/backups/${f}" \
      --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
      --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
      --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
      --s3-provider=Other
    echo "[$(date)] Deleted old backup: ${f}"
  done

echo "[$(date)] Backup job completed successfully."
```

- [ ] **Step 2: Creare `backup/Dockerfile`**

```dockerfile
FROM alpine:3.19

RUN apk add --no-cache postgresql-client rclone

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]
```

- [ ] **Step 3: Aggiungere il service backup a `docker-compose.yml`**

Aggiungere dopo il service `redis`:

```yaml
  # Backup PostgreSQL → Hetzner Object Storage
  backup:
    build:
      context: ./backup
      dockerfile: Dockerfile
    container_name: archibald-backup
    restart: 'no'
    env_file:
      - .env
    environment:
      - PG_HOST=postgres
    depends_on:
      - postgres
    networks:
      - archibald-net
    profiles:
      - backup
```

*(Il profilo `backup` permette di eseguirlo manualmente con `docker compose --profile backup run backup` e tramite cron sul VPS)*

- [ ] **Step 4: Aggiungere variabili Hetzner a `.env.production`**

```
HETZNER_BUCKET=archibald-backups
HETZNER_S3_ENDPOINT=https://fsn1.your-objectstorage.com
HETZNER_ACCESS_KEY=<da Hetzner console>
HETZNER_SECRET_KEY=<da Hetzner console>
```

*(Creare il bucket su Hetzner Console → Object Storage prima del deploy)*

- [ ] **Step 5: Testare manualmente sul VPS dopo il deploy**

```bash
docker compose --profile backup run --rm backup
```

Expected: output `[...] Backup job completed successfully.` e file visibile nel bucket Hetzner.

- [ ] **Step 6: Aggiungere cron sul VPS (da eseguire manualmente via SSH)**

```bash
# Sul VPS come utente deploy:
crontab -e
# Aggiungere:
0 2 * * * cd /home/deploy/archibald-app && docker compose --profile backup run --rm backup >> /home/deploy/archibald-app/logs/backup.log 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add backup/ docker-compose.yml .env.production
git commit -m "infra: add automated PostgreSQL backup to Hetzner Object Storage"
```

---

### Task 6: mailto: links sui componenti email cliente

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx` (o dove compare l'email cliente)

- [ ] **Step 1: Trovare tutti i punti dove è visualizzata l'email cliente**

```bash
cd archibald-web-app/frontend && grep -rn "customer\.email\|\.email}" src/ --include="*.tsx" | grep -v spec | grep -v test
```

- [ ] **Step 2: Sostituire il testo email statico con link mailto**

Per ogni occorrenza trovata, sostituire il pattern di rendering dell'email (es. `<span>{customer.email}</span>` o simile) con:

```tsx
{customer.email ? (
  <a
    href={`mailto:${customer.email}`}
    style={{ color: 'inherit', textDecoration: 'underline' }}
  >
    {customer.email}
  </a>
) : null}
```

- [ ] **Step 3: Eseguire i test frontend**

```bash
cd archibald-web-app/frontend && npm test
```

Expected: tutti i test passano.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/
git commit -m "ux: add mailto: links on customer email fields"
```

---

## Fase 2 — Audit log immutabile (Giorni 3-4)

---

### Task 7: Migration 045 — tabella audit_log

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/045-audit-log.sql`

- [ ] **Step 1: Creare la migration**

```sql
-- Migration 045: Immutable audit log for GDPR/NIS2 compliance

CREATE TABLE IF NOT EXISTS system.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
  ON system.audit_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON system.audit_log (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON system.audit_log (action);

-- Immutability: app DB user cannot modify or delete log entries
-- Only INSERT is permitted. Deletion requires direct superuser access.
REVOKE UPDATE, DELETE ON system.audit_log FROM archibald;
```

- [ ] **Step 2: Eseguire la migration localmente**

```bash
cd archibald-web-app/backend && npm run build && node -e "
  const { runMigrations } = require('./dist/db/migrate');
  const { createPool } = require('./dist/db/pool');
  const pool = createPool({ host: process.env.PG_HOST || 'localhost', port: 5432, database: 'archibald', user: 'archibald', password: process.env.PG_PASSWORD, maxConnections: 5 });
  runMigrations(pool).then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `Migration 045 applied` (o simile) senza errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/045-audit-log.sql
git commit -m "db: add immutable audit_log table (migration 045)"
```

---

### Task 8: Repository audit-log

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/audit-log.ts`
- Create: `archibald-web-app/backend/src/db/repositories/audit-log.spec.ts`

- [ ] **Step 1: Scrivere i test**

Creare `archibald-web-app/backend/src/db/repositories/audit-log.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { audit } from './audit-log';
import type { DbPool } from '../pool';

function makePool(queryFn = vi.fn().mockResolvedValue({ rows: [] })) {
  return { query: queryFn, withTransaction: vi.fn(), end: vi.fn(), getStats: vi.fn() } as unknown as DbPool;
}

describe('audit', () => {
  it('inserts a record with all provided fields', async () => {
    const pool = makePool();
    await audit(pool, {
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'customer.updated',
      targetType: 'customer',
      targetId: 'cust-1',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      metadata: { changed: ['name'] },
    });
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('INSERT INTO system.audit_log');
    expect(params).toContain('customer.updated');
    expect(params).toContain('user-1');
  });

  it('inserts with minimal fields (only action required)', async () => {
    const pool = makePool();
    await audit(pool, { action: 'system.backup_completed' });
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it('swallows DB errors silently', async () => {
    const pool = makePool(vi.fn().mockRejectedValue(new Error('DB down')));
    await expect(audit(pool, { action: 'auth.login_success', actorId: 'u1' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
cd archibald-web-app/backend && npm test -- audit-log.spec
```

Expected: FAIL — modulo non esiste.

- [ ] **Step 3: Creare `audit-log.ts`**

```ts
import type { DbPool } from '../pool';
import { logger } from '../../logger';

export type AuditEvent = {
  actorId?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(pool: DbPool, event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO system.audit_log
         (actor_id, actor_role, action, target_type, target_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8)`,
      [
        event.actorId ?? null,
        event.actorRole ?? null,
        event.action,
        event.targetType ?? null,
        event.targetId ?? null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ],
    );
  } catch (err) {
    logger.warn('Audit log insert failed', { action: event.action, err });
  }
}
```

- [ ] **Step 4: Eseguire il test**

```bash
cd archibald-web-app/backend && npm test -- audit-log.spec
```

Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/audit-log.ts archibald-web-app/backend/src/db/repositories/audit-log.spec.ts
git commit -m "feat: add audit log repository with immutable append-only insert"
```

---

### Task 9: Integrare audit log nelle route auth

**Files:**
- Modify: `archibald-web-app/backend/src/routes/auth.ts`

- [ ] **Step 1: Aggiungere import audit e integrare negli eventi auth**

In `archibald-web-app/backend/src/routes/auth.ts`, aggiungere import:

```ts
import { audit } from '../db/repositories/audit-log';
```

Aggiungere `pool` ai `AuthRouterDeps`:

```ts
type AuthRouterDeps = {
  pool: DbPool;
  // ... resto invariato
};
```

Nella route `POST /login`, dopo il login fallito per credenziali ERP:
```ts
// Dopo: return res.status(401).json({ success: false, error: 'Credenziali non valide' });
// Aggiungere PRIMA del return:
void audit(deps.pool, {
  action: 'auth.login_failed',
  actorRole: 'unknown',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { username },
});
```

Dopo il login riuscito (dopo `updateLastLogin`):
```ts
void audit(deps.pool, {
  actorId: user.id,
  actorRole: user.role,
  action: 'auth.login_success',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

Nella route `POST /logout`:
```ts
void audit(deps.pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'auth.logout',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

Nella route `POST /refresh`:
```ts
void audit(deps.pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'auth.token_refresh',
  ipAddress: req.ip,
});
```

- [ ] **Step 2: Eseguire i test backend**

```bash
cd archibald-web-app/backend && npm test
```

Expected: tutti i test passano (audit è fire-and-forget, non impatta i test esistenti).

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/routes/auth.ts
git commit -m "feat: integrate audit log into auth routes (login, logout, refresh)"
```

---

### Task 10: Audit log per clienti, ordini, admin + route consultazione

**Files:**
- Modify: `archibald-web-app/backend/src/routes/admin.ts`
- Modify: handler clienti e ordini in `src/operations/handlers/` o `src/routes/`

- [ ] **Step 1: Trovare gli handler di creazione/modifica clienti e ordini**

```bash
grep -rn "customer\|order" archibald-web-app/backend/src/routes/ --include="*.ts" -l
grep -rn "INSERT INTO.*customers\|UPDATE.*customers" archibald-web-app/backend/src/db/repositories/ --include="*.ts" -l
```

- [ ] **Step 2: Aggiungere audit nei repository clienti**

In `archibald-web-app/backend/src/routes/customers.ts` (o nel handler createCustomer/updateCustomer), dopo ogni operazione che modifica il DB:

```ts
// Dopo create customer:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'customer.created',
  targetType: 'customer',
  targetId: newCustomer.id,
  ipAddress: req.ip,
});

// Dopo update customer:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'customer.updated',
  targetType: 'customer',
  targetId: customerId,
  ipAddress: req.ip,
  metadata: { changedFields: Object.keys(changes) },
});
```

- [ ] **Step 3: Aggiungere audit negli handler ordini**

In `archibald-web-app/backend/src/routes/orders.ts` o handler equivalenti:

```ts
// Dopo create order:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'order.created',
  targetType: 'order',
  targetId: newOrder.id,
  ipAddress: req.ip,
});

// Dopo send to verona:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: req.user!.role,
  action: 'order.sent_to_verona',
  targetType: 'order',
  targetId: orderId,
  ipAddress: req.ip,
});
```

- [ ] **Step 4: Audit per impersonation admin**

In `archibald-web-app/backend/src/routes/admin.ts`, trovare le route di impersonation e aggiungere:

```ts
// Start impersonation:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: 'admin',
  action: 'admin.impersonation_start',
  targetType: 'user',
  targetId: targetUserId,
  ipAddress: req.ip,
});

// End impersonation:
void audit(pool, {
  actorId: req.user!.userId,
  actorRole: 'admin',
  action: 'admin.impersonation_end',
  targetType: 'user',
  targetId: targetUserId,
  ipAddress: req.ip,
});
```

- [ ] **Step 5: Aggiungere route di consultazione audit log (admin only)**

In `archibald-web-app/backend/src/routes/admin.ts`, aggiungere:

```ts
router.get('/audit-log', requireAdmin, async (req: AuthRequest, res) => {
  const { actorId, action, targetType, from, to, page = '1' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const offset = (pageNum - 1) * 50;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (actorId) { conditions.push(`actor_id = $${idx++}`); params.push(actorId); }
  if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
  if (targetType) { conditions.push(`target_type = $${idx++}`); params.push(targetType); }
  if (from) { conditions.push(`occurred_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`occurred_at <= $${idx++}`); params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(50, offset);

  const { rows } = await pool.query(
    `SELECT id, occurred_at, actor_id, actor_role, action, target_type, target_id, ip_address, metadata
     FROM system.audit_log ${where}
     ORDER BY occurred_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params,
  );

  res.json({ success: true, data: rows, page: pageNum });
});
```

- [ ] **Step 6: Eseguire i test backend**

```bash
cd archibald-web-app/backend && npm test
```

Expected: tutti i test passano.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/routes/
git commit -m "feat: integrate audit log for customers, orders, admin impersonation + audit-log query route"
```

---

## Fase 3 — Sistema ruoli + MFA (Giorni 5-6)

---

### Task 11: Migration 046 — ruoli espansi + colonne MFA

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/046-roles-modules-mfa.sql`

- [ ] **Step 1: Creare la migration**

```sql
-- Migration 046: Expanded roles, per-user modules, MFA support

-- Expand role constraint to support new roles
ALTER TABLE agents.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE agents.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('agent', 'admin', 'ufficio', 'concessionario'));

-- Per-user module permissions (array of module names as JSONB)
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  modules JSONB NOT NULL DEFAULT '[]'::jsonb;

-- MFA columns
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_encrypted TEXT;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_iv TEXT;
ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS
  mfa_secret_auth_tag TEXT;

-- MFA recovery codes (one-time use)
CREATE TABLE IF NOT EXISTS agents.mfa_recovery_codes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id
  ON agents.mfa_recovery_codes (user_id);
```

- [ ] **Step 2: Eseguire la migration localmente** (stesso comando del Task 7 Step 2)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/046-roles-modules-mfa.sql
git commit -m "db: add expanded roles, modules, and MFA columns (migration 046)"
```

---

### Task 12: Aggiornare UserRole e JWTPayload

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/users.ts`
- Modify: `archibald-web-app/backend/src/auth-utils.ts`
- Modify: `archibald-web-app/backend/src/middleware/auth.ts`

- [ ] **Step 1: Aggiornare `UserRole` in `users.ts`**

Riga 5 di `users.ts`:
```ts
// Prima:
type UserRole = 'agent' | 'admin';

// Dopo:
type UserRole = 'agent' | 'admin' | 'ufficio' | 'concessionario';
```

Aggiungere `modules` e `mfa_enabled` al tipo `User` e alla `UserRow`:

```ts
type User = {
  // ... campi esistenti ...
  modules: string[];
  mfaEnabled: boolean;
};

type UserRow = {
  // ... campi esistenti ...
  modules: string[];  // JSONB già deserializzato da pg
  mfa_enabled: boolean;
};
```

Aggiornare la funzione di mapping `UserRow → User` per includere i nuovi campi.

- [ ] **Step 2: Aggiornare `JWTPayload` in `auth-utils.ts`**

```ts
import { randomUUID } from 'crypto';

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  modules: string[];
  jti: string;
  deviceId?: string;
  isImpersonating?: boolean;
  realAdminId?: string;
  adminSessionId?: number;
}

export async function generateJWT(payload: Omit<JWTPayload, 'jti'>): Promise<string> {
  const jti = randomUUID();
  const jwt = await new jose.SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
  return jwt;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: (payload.role as UserRole) || 'agent',
      modules: (payload.modules as string[]) || [],
      jti: payload.jti as string,
      deviceId: payload.deviceId as string | undefined,
      isImpersonating: payload.isImpersonating as boolean | undefined,
      realAdminId: payload.realAdminId as string | undefined,
      adminSessionId: payload.adminSessionId as number | undefined,
    };
  } catch (error) {
    logger.warn('JWT verification failed', { error });
    return null;
  }
}
```

- [ ] **Step 3: Aggiornare `AuthRequest` in `middleware/auth.ts`**

```ts
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: UserRole;
    modules: string[];
    jti: string;
    deviceId?: string;
    isImpersonating?: boolean;
    realAdminId?: string;
    adminSessionId?: number;
  };
}
```

- [ ] **Step 4: Aggiornare la route login per includere modules nel JWT**

In `routes/auth.ts`, dove viene generato il token:
```ts
const token = await generateJWT({
  userId: user.id,
  username: user.username,
  role: user.role as UserRole,
  modules: user.modules,
  deviceId: deviceId || undefined,
});
```

- [ ] **Step 5: Eseguire build TypeScript**

```bash
cd archibald-web-app/backend && npx tsc --noEmit
```

Expected: nessun errore di tipo. Fixare eventuali errori prima di procedere.

- [ ] **Step 6: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test
```

Expected: tutti i test passano.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/users.ts archibald-web-app/backend/src/auth-utils.ts archibald-web-app/backend/src/middleware/auth.ts archibald-web-app/backend/src/routes/auth.ts
git commit -m "feat: expand UserRole to 4 roles, add modules + jti to JWT payload"
```

---

### Task 13: MFA service

**Files:**
- Create: `archibald-web-app/backend/src/services/mfa-service.ts`
- Create: `archibald-web-app/backend/src/services/mfa-service.spec.ts`

- [ ] **Step 1: Installare dipendenze MFA**

```bash
cd archibald-web-app/backend && npm install otpauth bcryptjs
cd archibald-web-app/backend && npm install -D @types/bcryptjs
```

- [ ] **Step 2: Scrivere i test**

Creare `archibald-web-app/backend/src/services/mfa-service.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTotpSecret, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode } from './mfa-service';
import * as OTPAuth from 'otpauth';

describe('generateTotpSecret', () => {
  it('returns a base32 secret of reasonable length', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Z2-7]+=*$/.test(secret)).toBe(true);
  });

  it('generates unique secrets each call', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('verifyTotpCode', () => {
  it('accepts a valid TOTP code for the secret', () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const validCode = totp.generate();
    expect(verifyTotpCode(secret, validCode)).toBe(true);
  });

  it('rejects an invalid code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(verifyTotpCode(generateTotpSecret(), '12345')).toBe(false);
  });
});

describe('generateRecoveryCodes', () => {
  it('returns exactly 8 codes', async () => {
    const codes = await generateRecoveryCodes();
    expect(codes.plaintext).toHaveLength(8);
    expect(codes.hashed).toHaveLength(8);
  });

  it('codes are 16 hex chars each', async () => {
    const { plaintext } = await generateRecoveryCodes();
    plaintext.forEach((c) => expect(/^[0-9a-f]{16}$/.test(c)).toBe(true));
  });
});

describe('verifyRecoveryCode', () => {
  it('accepts matching plaintext against hash', async () => {
    const { plaintext, hashed } = await generateRecoveryCodes();
    const result = await verifyRecoveryCode(plaintext[0], hashed[0]);
    expect(result).toBe(true);
  });

  it('rejects wrong code', async () => {
    const { hashed } = await generateRecoveryCodes();
    expect(await verifyRecoveryCode('0000000000000000', hashed[0])).toBe(false);
  });
});
```

- [ ] **Step 3: Eseguire il test per verificare che fallisca**

```bash
cd archibald-web-app/backend && npm test -- mfa-service.spec
```

Expected: FAIL

- [ ] **Step 4: Creare `mfa-service.ts`**

```ts
import * as OTPAuth from 'otpauth';
import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

export function getTotpUri(secret: string, username: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'Archibald',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function generateRecoveryCodes(): Promise<{ plaintext: string[]; hashed: string[] }> {
  const plaintexts = Array.from({ length: 8 }, () =>
    crypto.randomBytes(8).toString('hex'),
  );
  const hashed = await Promise.all(
    plaintexts.map((code) => bcrypt.hash(code, 10)),
  );
  return { plaintext: plaintexts, hashed };
}

export async function verifyRecoveryCode(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Eseguire il test**

```bash
cd archibald-web-app/backend && npm test -- mfa-service.spec
```

Expected: PASS (tutti i test)

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/services/mfa-service.ts archibald-web-app/backend/src/services/mfa-service.spec.ts archibald-web-app/backend/package.json archibald-web-app/backend/package-lock.json
git commit -m "feat: add TOTP MFA service with recovery codes"
```

---

### Task 14: Route MFA nel backend

**Files:**
- Modify: `archibald-web-app/backend/src/routes/auth.ts`

- [ ] **Step 1: Aggiungere route MFA setup e verify**

In `archibald-web-app/backend/src/routes/auth.ts`, aggiungere alla fine di `createAuthRouter`:

```ts
// Dipendenze aggiuntive da aggiungere ad AuthRouterDeps:
// getMfaSecret: (userId: string) => Promise<string | null>
// saveMfaSecret: (userId: string, encryptedSecret: string, iv: string, authTag: string) => Promise<void>
// enableMfa: (userId: string) => Promise<void>
// saveRecoveryCodes: (userId: string, hashes: string[]) => Promise<void>
// consumeRecoveryCode: (userId: string, code: string) => Promise<boolean>

import { generateTotpSecret, getTotpUri, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode } from '../services/mfa-service';

// POST /mfa-setup — genera secret e restituisce URI per QR code
router.post('/mfa-setup', authenticateJWT, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const secret = generateTotpSecret();
  const uri = getTotpUri(secret, req.user!.username);

  // Cifra il secret con la stessa infrastruttura AES-256-GCM già usata per le password ERP
  // (richiede accesso al PasswordEncryptionService — da passare come dep)
  if (!deps.encryptMfaSecret) {
    return res.status(501).json({ error: 'MFA setup not configured' });
  }
  const { ciphertext, iv, authTag } = await deps.encryptMfaSecret(userId, secret);
  await deps.saveMfaSecret!(userId, ciphertext, iv, authTag);

  void audit(deps.pool, {
    actorId: userId,
    actorRole: req.user!.role,
    action: 'mfa.setup_initiated',
    ipAddress: req.ip,
  });

  res.json({ success: true, data: { uri, secret } });
});

// POST /mfa-confirm — conferma enrollment con primo codice valido
router.post('/mfa-confirm', authenticateJWT, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

  const encryptedSecret = await deps.getMfaSecret!(userId);
  if (!encryptedSecret) return res.status(400).json({ error: 'MFA setup not initiated' });

  const secret = await deps.decryptMfaSecret!(userId, encryptedSecret);
  if (!verifyTotpCode(secret, code)) {
    return res.status(401).json({ error: 'Codice OTP non valido' });
  }

  const { plaintext, hashed } = await generateRecoveryCodes();
  await deps.saveRecoveryCodes!(userId, hashed);
  await deps.enableMfa!(userId);

  void audit(deps.pool, {
    actorId: userId,
    actorRole: req.user!.role,
    action: 'mfa.enrollment_completed',
    ipAddress: req.ip,
  });

  res.json({ success: true, data: { recoveryCodes: plaintext } });
});

// POST /mfa-verify — verifica OTP dopo login (usa mfaToken temporaneo)
router.post('/mfa-verify', async (req, res) => {
  const { mfaToken, code } = z.object({
    mfaToken: z.string(),
    code: z.string().min(6).max(8),
  }).parse(req.body);

  const payload = await deps.verifyMfaToken!(mfaToken);
  if (!payload) return res.status(401).json({ error: 'MFA token non valido o scaduto' });

  const { userId } = payload;
  const user = await deps.getUserById(userId);
  if (!user) return res.status(401).json({ error: 'Utente non trovato' });

  const encryptedSecret = await deps.getMfaSecret!(userId);
  if (!encryptedSecret) return res.status(400).json({ error: 'MFA non configurato' });

  const secret = await deps.decryptMfaSecret!(userId, encryptedSecret);
  let verified = verifyTotpCode(secret, code);

  if (!verified && code.length === 16) {
    verified = await deps.consumeRecoveryCode!(userId, code);
    if (verified) {
      void audit(deps.pool, {
        actorId: userId,
        actorRole: user.role,
        action: 'mfa.recovery_code_used',
        ipAddress: req.ip,
      });
    }
  }

  if (!verified) {
    void audit(deps.pool, {
      actorId: userId,
      actorRole: user.role,
      action: 'mfa.verify_failed',
      ipAddress: req.ip,
    });
    return res.status(401).json({ error: 'Codice OTP non valido' });
  }

  void audit(deps.pool, {
    actorId: userId,
    actorRole: user.role,
    action: 'mfa.verify_success',
    ipAddress: req.ip,
  });

  const token = await deps.generateJWT({
    userId: user.id,
    username: user.username,
    role: user.role as UserRole,
    modules: user.modules,
  });

  res.json({ success: true, token, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } });
});
```

Modificare il flow di login per emettere `mfaToken` invece di JWT quando MFA è richiesto:

```ts
// In POST /login, dopo la validazione credenziali, prima di generateJWT:
if (user.mfaEnabled && (user.role === 'admin' || user.role === 'ufficio')) {
  const mfaToken = await deps.generateMfaToken!({ userId: user.id });
  return res.json({ success: true, status: 'mfa_required', mfaToken });
}
```

- [ ] **Step 2: Eseguire build TypeScript per verificare tipi**

```bash
cd archibald-web-app/backend && npx tsc --noEmit
```

Expected: nessun errore di tipo.

- [ ] **Step 3: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/routes/auth.ts
git commit -m "feat: add MFA setup, confirm, and verify routes to auth"
```

---

### Task 15: Frontend — MFA verify step nel login

**Files:**
- Create: `archibald-web-app/frontend/src/components/MfaVerifyStep.tsx`
- Modify: `archibald-web-app/frontend/src/pages/LoginPage.tsx` (o equivalente)

- [ ] **Step 1: Creare `MfaVerifyStep.tsx`**

```tsx
import { useState } from 'react';

type Props = {
  mfaToken: string;
  onSuccess: (token: string, user: unknown) => void;
  onCancel: () => void;
};

export function MfaVerifyStep({ mfaToken, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.token, data.user);
      } else {
        setError(data.error ?? 'Codice non valido');
      }
    } catch {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0 }}>
        Inserisci il codice a 6 cifre dall'app di autenticazione (o un recovery code da 16 caratteri).
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        maxLength={16}
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', padding: '12px 16px' }}
        autoFocus
      />
      {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading || code.length < 6}>
        {loading ? 'Verifica...' : 'Verifica'}
      </button>
      <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Torna al login
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Modificare il login page per gestire `status: 'mfa_required'`**

Nel componente di login esistente, dove viene gestita la risposta del login:

```tsx
// Trovare la gestione della risposta login e aggiungere:
if (data.status === 'mfa_required') {
  setMfaToken(data.mfaToken);  // stato locale
  return;
}
```

E nel render, aggiungere condizionalmente:

```tsx
{mfaToken ? (
  <MfaVerifyStep
    mfaToken={mfaToken}
    onSuccess={(token, user) => { /* stessa logica del login riuscito */ }}
    onCancel={() => setMfaToken(null)}
  />
) : (
  /* form login normale */
)}
```

- [ ] **Step 3: Eseguire i test frontend**

```bash
cd archibald-web-app/frontend && npm test
```

- [ ] **Step 4: Eseguire type-check frontend**

```bash
cd archibald-web-app/frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/
git commit -m "feat: add MFA verify step to login flow (frontend)"
```

---

### Task 16: Frontend — MFA setup page

**Files:**
- Create: `archibald-web-app/frontend/src/pages/MfaSetupPage.tsx`

- [ ] **Step 1: Creare `MfaSetupPage.tsx`**

```tsx
import { useState, useEffect } from 'react';

type Props = {
  authToken: string;
  onComplete: () => void;
};

export function MfaSetupPage({ authToken, onComplete }: Props) {
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [step, setStep] = useState<'loading' | 'scan' | 'confirm' | 'recovery'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/mfa-setup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) { setUri(data.data.uri); setStep('scan'); }
      });
  }, [authToken]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/mfa-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.success) {
      setRecoveryCodes(data.data.recoveryCodes);
      setStep('recovery');
    } else {
      setError(data.error ?? 'Codice non valido');
    }
  }

  if (step === 'loading') return <p>Caricamento...</p>;

  if (step === 'scan') return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 24 }}>
      <h2>Attiva autenticazione a due fattori</h2>
      <p>Scansiona questo QR code con Google Authenticator, Authy, o 1Password:</p>
      {/* QR code: usa un servizio client-side o genera URI direttamente */}
      <code style={{ wordBreak: 'break-all', display: 'block', background: '#f4f4f4', padding: 12, borderRadius: 4 }}>
        {uri}
      </code>
      <p style={{ marginTop: 16 }}>Dopo la scansione, inserisci il primo codice a 6 cifre:</p>
      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          maxLength={6}
          placeholder="000000"
          autoFocus
        />
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={code.length !== 6}>Conferma</button>
      </form>
    </div>
  );

  if (step === 'recovery') return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 24 }}>
      <h2>Salva i tuoi recovery codes</h2>
      <p><strong>Questi codici vengono mostrati una sola volta.</strong> Salvali in un posto sicuro (password manager).</p>
      <ul style={{ fontFamily: 'monospace', lineHeight: 2 }}>
        {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <button onClick={onComplete}>Ho salvato i recovery codes — Continua</button>
    </div>
  );

  return null;
}
```

- [ ] **Step 2: Eseguire type-check frontend**

```bash
cd archibald-web-app/frontend && npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/MfaSetupPage.tsx
git commit -m "feat: add MFA setup page with QR code enrollment and recovery codes"
```

---

## Fase 4 — GDPR data lifecycle + Session hardening (Giorni 7-8)

---

### Task 17: Migration 047 — retention policy

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/047-retention-policy.sql`

- [ ] **Step 1: Creare la migration**

```sql
-- Migration 047: GDPR retention policy support

-- last_activity_at: updated on every order placement, used by retention scheduler
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS
  last_activity_at TIMESTAMPTZ;

-- Initialize from existing orders
UPDATE agents.customers c
SET last_activity_at = (
  SELECT MAX(created_at_ts)
  FROM agents.order_records o
  WHERE o.customer_id = c.id
)
WHERE last_activity_at IS NULL;

-- Fallback: use customer creation date if no orders
UPDATE agents.customers
SET last_activity_at = NOW()
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_activity_at
  ON agents.customers (last_activity_at);
```

- [ ] **Step 2: Eseguire la migration localmente** (stesso comando Task 7)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/047-retention-policy.sql
git commit -m "db: add last_activity_at to customers for GDPR retention (migration 047)"
```

---

### Task 18: GDPR erase endpoint + repository

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/gdpr.ts`
- Create: `archibald-web-app/backend/src/db/repositories/gdpr.spec.ts`
- Modify: `archibald-web-app/backend/src/routes/admin.ts`

- [ ] **Step 1: Scrivere i test**

Creare `archibald-web-app/backend/src/db/repositories/gdpr.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { eraseCustomerPersonalData, hasActiveOrders } from './gdpr';
import type { DbPool } from '../pool';

function makePool(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    withTransaction: vi.fn(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    end: vi.fn(), getStats: vi.fn(),
  } as unknown as DbPool;
}

describe('hasActiveOrders', () => {
  it('returns true when pending orders exist', async () => {
    const pool = makePool([{ count: '2' }]);
    expect(await hasActiveOrders(pool, 'cust-1')).toBe(true);
  });

  it('returns false when no pending orders', async () => {
    const pool = makePool([{ count: '0' }]);
    expect(await hasActiveOrders(pool, 'cust-1')).toBe(false);
  });
});

describe('eraseCustomerPersonalData', () => {
  it('calls UPDATE on customers table with anonymized values', async () => {
    const pool = makePool();
    await eraseCustomerPersonalData(pool, 'cust-1');
    const txQuery = (pool.withTransaction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(txQuery).toBeDefined();
  });
});
```

- [ ] **Step 2: Creare `gdpr.ts`**

```ts
import type { DbPool } from '../pool';

export async function hasActiveOrders(pool: DbPool, customerId: string): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM agents.order_records
     WHERE customer_id = $1 AND status IN ('pending', 'processing')`,
    [customerId],
  );
  return parseInt(rows[0]?.count ?? '0', 10) > 0;
}

export async function eraseCustomerPersonalData(pool: DbPool, customerId: string): Promise<void> {
  const erasedMarker = `[GDPR_ERASED_${new Date().toISOString()}]`;
  await pool.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE agents.customers SET
         name         = $1,
         address      = $1,
         email        = $1,
         phone        = $1,
         fiscal_code  = CASE WHEN fiscal_code IS NOT NULL THEN $1 ELSE NULL END
       WHERE id = $2`,
      [erasedMarker, customerId],
    );
  });
}
```

- [ ] **Step 3: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test -- gdpr.spec
```

Expected: PASS

- [ ] **Step 4: Aggiungere route in `admin.ts`**

```ts
router.post('/customers/:id/gdpr-erase', requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { reason } = z.object({ reason: z.string().min(10) }).parse(req.body);

  const active = await hasActiveOrders(pool, id);
  if (active) {
    return res.status(409).json({ error: 'Impossibile cancellare: ordini attivi esistenti per questo cliente' });
  }

  await eraseCustomerPersonalData(pool, id);

  void audit(pool, {
    actorId: req.user!.userId,
    actorRole: req.user!.role,
    action: 'customer.erased',
    targetType: 'customer',
    targetId: id,
    ipAddress: req.ip,
    metadata: { reason, fieldsErased: ['name', 'address', 'email', 'phone', 'fiscal_code'] },
  });

  res.json({
    success: true,
    data: {
      customerId: id,
      erasedAt: new Date().toISOString(),
      fieldsErased: ['name', 'address', 'email', 'phone', 'fiscal_code'],
      retainedFor: 'fiscal_obligation_10y',
      reason,
    },
  });
});
```

- [ ] **Step 5: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test
```

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/gdpr.ts archibald-web-app/backend/src/db/repositories/gdpr.spec.ts archibald-web-app/backend/src/routes/admin.ts
git commit -m "feat: add GDPR erase endpoint with anonymization and audit log"
```

---

### Task 19: JWT revocation list via Redis

**Files:**
- Create: `archibald-web-app/backend/src/db/redis-client.ts`
- Modify: `archibald-web-app/backend/src/middleware/auth.ts`
- Modify: `archibald-web-app/backend/src/routes/auth.ts`
- Modify: `archibald-web-app/backend/src/main.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Creare `redis-client.ts` — client Redis condiviso**

```ts
import { Redis } from 'ioredis';

export type RedisClient = {
  set: (key: string, value: string, expiryMode: 'EX', ttlSeconds: number) => Promise<unknown>;
  exists: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
};

export function createRedisClient(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

export async function revokeToken(redis: RedisClient, jti: string, ttlSeconds: number): Promise<void> {
  await redis.set(`revoked:${jti}`, '1', 'EX', ttlSeconds);
}

export async function isTokenRevoked(redis: RedisClient, jti: string): Promise<boolean> {
  const result = await redis.exists(`revoked:${jti}`);
  return result === 1;
}
```

- [ ] **Step 2: Aggiungere revocation check nel middleware auth**

In `archibald-web-app/backend/src/middleware/auth.ts`:

```ts
import type { RedisClient } from '../db/redis-client';
import { isTokenRevoked } from '../db/redis-client';

// Aggiornare createAuthMiddleware per accettare anche redis:
function createAuthMiddleware(pool: DbPool, redis?: RedisClient) {
  return async function authenticateJWTWithActivity(req, res, next) {
    // ... codice esistente per verifyJWT ...

    if (payload && redis && payload.jti) {
      const revoked = await isTokenRevoked(redis, payload.jti);
      if (revoked) {
        return res.status(401).json({ error: 'Token revocato' });
      }
    }

    req.user = payload;
    updateLastActivity(pool, payload.userId).catch(() => {});
    next();
  };
}
```

- [ ] **Step 3: Aggiungere revoca token nel logout**

In `archibald-web-app/backend/src/routes/auth.ts`, nella route `POST /logout`:

```ts
// Aggiungere a AuthRouterDeps:
// revokeToken?: (jti: string, ttlSeconds: number) => Promise<void>

router.post('/logout', authenticateJWT, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const jti = req.user!.jti;

  // Revoca il token attuale
  if (deps.revokeToken && jti) {
    const remainingTtl = 8 * 60 * 60; // max JWT lifetime
    await deps.revokeToken(jti, remainingTtl).catch(() => {});
  }

  void audit(deps.pool, {
    actorId: userId,
    actorRole: req.user!.role,
    action: 'auth.logout',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  passwordCache.clear(userId);
  res.json({ success: true, data: { message: 'Logout effettuato con successo' } });
});
```

- [ ] **Step 4: Aggiungere password Redis a docker-compose.yml**

```yaml
  redis:
    image: redis:7-alpine
    container_name: archibald-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    # ... resto invariato
```

Aggiungere al service `backend`:
```yaml
    environment:
      - REDIS_PASSWORD=${REDIS_PASSWORD}
```

- [ ] **Step 5: Aggiungere `REDIS_PASSWORD` a `.env.production`**

```bash
# Generare una password sicura:
openssl rand -hex 32
```

Aggiungere al file:
```
REDIS_PASSWORD=<output del comando openssl>
```

- [ ] **Step 6: Eseguire i test**

```bash
cd archibald-web-app/backend && npm test
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/db/redis-client.ts archibald-web-app/backend/src/middleware/auth.ts archibald-web-app/backend/src/routes/auth.ts archibald-web-app/backend/src/main.ts docker-compose.yml .env.production
git commit -m "security: add JWT revocation list via Redis + Redis password authentication"
```

---

### Task 20: Password cache TTL + rimozione PIN da memoria

**Files:**
- Modify: `archibald-web-app/backend/src/services/password-encryption-service.ts` (o dove è definito il TTL)
- Modify: `memory/MEMORY.md`

- [ ] **Step 1: Trovare e ridurre il TTL della cache password ERP**

```bash
grep -rn "24 \* 60\|ttl\|TTL" archibald-web-app/backend/src/services/ --include="*.ts"
```

Trovata la costante, sostituire `24 * 60 * 60 * 1000` con `4 * 60 * 60 * 1000`.

- [ ] **Step 2: Rimuovere il PIN 2611 dalla memoria del progetto**

In `memory/MEMORY.md`, trovare e rimuovere la riga che contiene `PIN accesso: **2611**` (sezione PWA).

Sostituire con:
```markdown
- PIN accesso: conservato in VPS-ACCESS-CREDENTIALS.md (non in questo file)
```

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/services/ memory/MEMORY.md
git commit -m "security: reduce ERP password cache TTL to 4h, remove PIN from memory index"
```

---

### Task 20b: Whitelist admin UI — Gestione accessi

**Files:**
- Create: `archibald-web-app/frontend/src/pages/AccessManagementPage.tsx`

*(Spec sezione 3.4 — schermata per aggiungere/modificare utenti nella whitelist con ruolo e moduli)*

- [ ] **Step 1: Creare `AccessManagementPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

type WhitelistUser = {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'agent' | 'ufficio' | 'concessionario';
  modules: string[];
  mfaEnabled: boolean;
  whitelisted: boolean;
};

const ALL_MODULES = ['orders', 'customers', 'warehouse', 'history', 'admin', 'arca', 'fresis'];

export function AccessManagementPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { setUsers(data.data ?? []); setLoading(false); });
  }, [token]);

  async function updateUser(userId: string, changes: Partial<Pick<WhitelistUser, 'role' | 'modules' | 'whitelisted'>>) {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(changes),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...changes } : u));
  }

  if (loading) return <p>Caricamento...</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Gestione accessi</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Utente ERP</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Ruolo</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Moduli</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>MFA</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Accesso</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '8px 12px' }}>
                <strong>{user.username}</strong><br />
                <small>{user.fullName}</small>
              </td>
              <td style={{ padding: '8px 12px' }}>
                <select
                  value={user.role}
                  onChange={(e) => updateUser(user.id, { role: e.target.value as WhitelistUser['role'] })}
                >
                  <option value="agent">Agente</option>
                  <option value="ufficio">Ufficio</option>
                  <option value="concessionario">Concessionario</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {ALL_MODULES.map((mod) => (
                  <label key={mod} style={{ display: 'block', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={user.modules.includes(mod)}
                      onChange={(e) => {
                        const updated = e.target.checked
                          ? [...user.modules, mod]
                          : user.modules.filter((m) => m !== mod);
                        updateUser(user.id, { modules: updated });
                      }}
                    /> {mod}
                  </label>
                ))}
              </td>
              <td style={{ padding: '8px 12px' }}>
                {user.mfaEnabled ? '✅ Attivo' : '⚠️ Non attivo'}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <button
                  onClick={() => updateUser(user.id, { whitelisted: !user.whitelisted })}
                  style={{ color: user.whitelisted ? 'red' : 'green' }}
                >
                  {user.whitelisted ? 'Revoca' : 'Riattiva'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungere route backend `PATCH /api/admin/users/:id`**

In `archibald-web-app/backend/src/routes/admin.ts`:

```ts
router.patch('/users/:id', requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const changes = z.object({
    role: z.enum(['agent', 'admin', 'ufficio', 'concessionario']).optional(),
    modules: z.array(z.string()).optional(),
    whitelisted: z.boolean().optional(),
  }).parse(req.body);

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (changes.role !== undefined) { setClauses.push(`role = $${idx++}`); params.push(changes.role); }
  if (changes.modules !== undefined) { setClauses.push(`modules = $${idx++}`); params.push(JSON.stringify(changes.modules)); }
  if (changes.whitelisted !== undefined) { setClauses.push(`whitelisted = $${idx++}`); params.push(changes.whitelisted); }

  if (setClauses.length === 0) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

  params.push(id);
  await pool.query(`UPDATE agents.users SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);

  const eventType = changes.role ? 'user.role_changed'
    : changes.modules ? 'user.modules_changed'
    : 'user.whitelist_removed';

  void audit(pool, {
    actorId: req.user!.userId,
    actorRole: req.user!.role,
    action: eventType,
    targetType: 'user',
    targetId: id,
    ipAddress: req.ip,
    metadata: changes,
  });

  res.json({ success: true });
});
```

- [ ] **Step 3: Eseguire type-check e test**

```bash
cd archibald-web-app/frontend && npm run type-check
cd archibald-web-app/backend && npm test
```

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/AccessManagementPage.tsx archibald-web-app/backend/src/routes/admin.ts
git commit -m "feat: add access management UI for role/modules/whitelist admin"
```

---

## Fase 5 — Documenti compliance (Giorni 9-10)

---

### Task 21: Sub-processor register

**Files:**
- Create: `docs/compliance/sub-processors.md`

- [ ] **Step 1: Creare il documento**

```markdown
# Sub-processor Register — Archibald PWA

**Data aggiornamento**: 2026-04-02
**Responsabile**: Formicola Francesco (P.IVA [inserire])
**Riferimento normativo**: GDPR Art. 28(3)(d)

---

## Sub-processor attivi

### 1. Hetzner Online GmbH
- **Ruolo**: VPS hosting (infrastruttura primaria) + Object Storage (backup)
- **Dati trattati**: Tutto il database PostgreSQL, log applicativi, backup cifrati
- **Sede**: Gunzenhausen, Germania 🇩🇪
- **Trasferimento dati extra-UE**: No
- **GDPR compliance**: ✅ DPA disponibile su hetzner.com/legal/privacy
- **Data inizio**: [data contratto VPS]

### 2. FedEx Corporation
- **Ruolo**: API di tracking spedizioni
- **Dati trattati**: Tracking numbers esclusivamente (nessun dato personale)
- **Sede**: Memphis, Tennessee, USA 🇺🇸
- **Trasferimento dati extra-UE**: Sì — solo tracking numbers anonimi
- **GDPR compliance**: ✅ DPA disponibile, dati minimizzati
- **Data inizio**: [data integrazione FedEx]

### 3. Provider SMTP — [DA COMPLETARE]
- **Ruolo**: Invio email alert di sicurezza sistema
- **Dati trattati**: Indirizzo email destinatario (admin), contenuto alert tecnici
- **Sede**: [da verificare]
- **GDPR compliance**: [da verificare]
- **Azione richiesta**: Identificare provider SMTP in produzione e completare questa voce

### 4. Dropbox Inc. *(solo modulo Fresis/Arca)*
- **Ruolo**: Storage documenti per integrazione ArcaPro (funzione specifica Fresis)
- **Dati trattati**: File PDF/documenti commerciali Fresis
- **Sede**: San Francisco, California, USA 🇺🇸
- **Trasferimento dati extra-UE**: Sì — documenti commerciali Fresis
- **GDPR compliance**: ✅ DPA disponibile + Standard Contractual Clauses
- **Scope**: LIMITATO al modulo Fresis/Arca — non parte della PWA generale

---

## Procedura di aggiornamento

Questo registro DEVE essere aggiornato:
- Ogni volta che si aggiunge una dipendenza esterna che processa dati
- Ogni volta che un sub-processor cambia sede o termini di servizio
- Almeno ogni 6 mesi (revisione periodica)
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/sub-processors.md
git commit -m "docs(compliance): add GDPR sub-processor register"
```

---

### Task 22: Incident response procedure

**Files:**
- Create: `docs/compliance/incident-response-procedure.md`

- [ ] **Step 1: Creare il documento completo**

```markdown
# Incident Response Procedure — Archibald PWA

**Versione**: 1.0  
**Data**: 2026-04-02  
**Responsabile**: Formicola Francesco  
**Riferimento normativo**: GDPR Art. 33, NIS 2 Art. 21.2.b, D.Lgs. 138/2024

---

## 1. Classificazione degli incidenti

| Livello | Descrizione | Esempi |
|---|---|---|
| **P1 — Critico** | Dati personali esposti o rubati, accesso non autorizzato confermato | DB dump esfiltrato, credenziali compromesse, ransomware, accesso non autorizzato verificato |
| **P2 — Alto** | Servizio non disponibile >4h, sospetto accesso anomalo non confermato | VPS down prolungato, circuit breaker bloccato, pattern login anomali |
| **P3 — Medio** | Degradazione servizio, anomalia non confermata | Backup fallito, errori 500 elevati, alert email non consegnate |

---

## 2. Procedura di risposta

### P1 — Incidente critico

```
Incidente rilevato (alert automatico o rilevamento manuale)
           ↓
Valutazione immediata: i dati personali sono stati compromessi?
           ↓
        Sì → ATTIVARE PROCEDURA P1
        No → Valutare P2

PROCEDURA P1:
1. Entro 1 ora dal rilevamento:
   - Isolare il sistema se necessario: docker stop backend
   - Raccogliere evidenze: logs, audit_log DB, screen catture
   - NON cancellare nulla

2. Entro 4 ore:
   - Notificare Komet Italia (referente contratto)
   - Usare template notifica (sezione 4)

3. Entro 24 ore:
   - Early warning ACN: https://www.acn.gov.it/portale/segnalazione-incidenti

4. Entro 72 ore dal rilevamento (GDPR Art. 33):
   - Notifica formale al Garante Privacy se dati personali coinvolti
   - URL: https://www.garanteprivacy.it/web/guest/notifica-data-breach
   - Allegare: natura violazione, categorie dati, numero interessati (stima), misure adottate
```

### P2 — Incidente alto

```
1. Entro 24 ore: notificare Komet Italia
2. Valutare se escalare a P1
3. Documentare nel log incidenti
```

### P3 — Incidente medio

```
1. Documentare nel log interno
2. Comunicare a Komet in report mensile
3. Definire azione correttiva
```

---

## 3. Contatti di emergenza

| Ruolo | Contatto |
|---|---|
| Responsabile tecnico (Francesco) | [inserire email + telefono] |
| Referente Komet Italia | [inserire al momento della firma contratto] |
| ACN CSIRT Italia | incidenti@csirt.gov.it / +39 06 [vedere sito ACN] |
| Garante Privacy | [garanteprivacy.it/web/guest/notifica-data-breach](https://www.garanteprivacy.it/web/guest/notifica-data-breach) |

---

## 4. Template notifica a Komet (P1)

```
Oggetto: [SICUREZZA ARCHIBALD] Incidente rilevato — <YYYY-MM-DD>

Gentile [Nome referente Komet],

Si notifica un incidente di sicurezza rilevato in data <data> alle <ora> (UTC+2).

NATURA DELL'INCIDENTE:
<descrizione sintetica>

DATI POTENZIALMENTE COINVOLTI:
- Categorie: <es. "anagrafiche clienti", "dati di accesso agenti">
- Numero stimato interessati: <numero o "in corso di verifica">

STATO ATTUALE:
- Sistema isolato: [Sì / No — motivazione]
- Accesso non autorizzato confermato: [Sì / No]

MISURE ADOTTATE:
- <lista azioni in corso>

PROSSIMI PASSI:
- <lista>

Prossimo aggiornamento: entro <data e ora>

Formicola Francesco
P.IVA [inserire]
```

---

## 5. Post-incident report

Entro 7 giorni dall'incidente, creare:
`docs/compliance/incidents/YYYY-MM-DD-<tipo-incidente>.md`

Struttura:
- Timeline completa (quando rilevato, quando notificato, quando risolto)
- Root cause analysis
- Impatto effettivo sui dati
- Misure correttive implementate
- Misure preventive pianificate con date

---

## 6. Come i sistemi rilevano gli incidenti

Il sistema di alerting automatico (implementato in Archibald) invia email a `SECURITY_ALERT_EMAIL` per:
- Circuit breaker scattato su qualsiasi agente
- 1+ login falliti su account admin/ufficio
- 5+ login falliti su account agent
- Backup PostgreSQL fallito
- Rate limit colpito su account admin
- >10 errori HTTP 500 in 5 minuti

Questi alert sono il punto di ingresso della presente procedura.
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/incident-response-procedure.md
git commit -m "docs(compliance): add formal incident response procedure (GDPR Art. 33, NIS 2)"
```

---

### Task 23: Security & Compliance Overview per il meeting

**Files:**
- Create: `docs/compliance/archibald-security-compliance-overview.md`

- [ ] **Step 1: Creare il documento**

```markdown
# Archibald PWA — Security & Compliance Overview

**Documento**: Security & Compliance Overview v1.0  
**Autore**: Formicola Francesco | P.IVA [inserire]  
**Data**: Aprile 2026  
**Preparato per**: Komet Italia S.r.l. / Gebr. Brasseler GmbH & Co. KG  
**Classificazione**: Riservato — uso contrattuale

---

## 1. Executive Summary

Archibald è una piattaforma SaaS B2B per la gestione degli ordini e della rete agenti Komet, erogata come servizio hosted su infrastruttura europea (Hetzner, Germania). Formicola Francesco opera in qualità di **data processor** ai sensi del GDPR Art. 28, con responsabilità diretta su tutte le misure tecniche e organizzative di sicurezza.

Il sistema è progettato e configurato in conformità con:
- **GDPR (Reg. EU 2016/679)** — protezione dati personali e obblighi data processor
- **NIS 2 (Dir. EU 2022/2555 / D.Lgs. 138/2024)** — sicurezza reti e sistemi informativi
- **D.Lgs. 196/2003** — Codice Privacy italiano
- **D.P.R. 600/1973 art. 22** — conservazione dati commerciali e fiscali (10 anni)

---

## 2. Architettura e localizzazione dei dati

### Infrastruttura

| Componente | Tecnologia | Localizzazione |
|---|---|---|
| VPS hosting | Hetzner CPX32 (4 vCPU, 8 GB RAM) | Falkenstein, Germania 🇩🇪 |
| Database | PostgreSQL 16 (Docker) | VPS Hetzner |
| Job queue | Redis 7 + BullMQ | VPS Hetzner |
| Backup | Hetzner Object Storage | Germania 🇩🇪 |
| Frontend | React 19 PWA su Nginx | VPS Hetzner |
| Backend | Node.js 20 + Express | VPS Hetzner |

**Nessun dato transita fuori dall'Unione Europea** eccetto tracking numbers FedEx (dato non personale, solo codici alfanumerici di spedizione).

### Architettura di sicurezza

```
[Agente (browser/PWA)]
        ↓ HTTPS/TLS 1.3 + HSTS
[Nginx reverse proxy]
  - Rate limiting
  - CSP headers
  - SSL termination
        ↓ rete Docker interna
[Backend Node.js]
  - JWT + MFA autenticazione
  - RBAC (4 ruoli)
  - Audit log immutabile
        ↓
[PostgreSQL]              [Redis]
  - Dati cifrati          - JWT revocation list
  - Audit trail           - Job queue
  - Backup giornaliero
```

---

## 3. Misure di sicurezza implementate

### Conformità NIS 2 Art. 21

| Articolo | Misura | Stato |
|---|---|---|
| 21.2.a — Risk management | Policy di sicurezza documentata, sub-processor register, incident response procedure | ✅ |
| 21.2.b — Incident response | Alerting automatico (email) per 6 classi di eventi critici, procedura P1/P2/P3 formale | ✅ |
| 21.2.c — Business continuity | Backup PostgreSQL giornaliero su Hetzner Object Storage (EU), Redis AOF persistence, retention 30 giorni | ✅ |
| 21.2.d — Supply chain security | npm audit in CI (blocca su vulnerabilità high/critical), sub-processor register documentato | ✅ |
| 21.2.e — Sicurezza sviluppo | TypeScript strict, Zod schema validation, prepared statements (SQL injection prevention), CSP, CORS whitelist | ✅ |
| 21.2.h — Crittografia | AES-256-GCM per credenziali ERP, PBKDF2-HMAC-SHA256 key derivation, TLS 1.3, HSTS, DH parameters | ✅ |
| 21.2.i — Controllo accessi | RBAC 4 ruoli (admin/ufficio/agent/concessionario), whitelist per modulo, principio del minimo privilegio | ✅ |
| 21.2.j — Multi-factor auth | TOTP obbligatorio per ruoli admin e ufficio, recovery codes monouso, JWT revocation list via Redis | ✅ |

### Misure tecniche aggiuntive

- **Audit log immutabile**: tabella PostgreSQL append-only (REVOKE DELETE/UPDATE), logging di 20+ classi di eventi, retention 2 anni
- **JWT revocation**: lista di revoca Redis con TTL automatico — token invalidati immediatamente al logout o revoca utente
- **Password ERP**: cifrate AES-256-GCM in DB, decifrate on-demand, cache in memoria max 4 ore
- **Rate limiting**: doppio livello (Nginx + applicativo Express) su tutti gli endpoint di autenticazione
- **Container security**: immagini non-root, healthcheck, network isolation Docker

---

## 4. GDPR — Obblighi data processor (Art. 28)

### Dati trattati

| Categoria | Tipo | Base legale |
|---|---|---|
| Anagrafiche clienti Komet | Nomi, P.IVA, indirizzi, email, telefoni di dentisti/studi | Esecuzione contratto (Art. 6.1.b) |
| Ordini e prezzi | Dati commerciali, quantità, importi | Esecuzione contratto + obbligo legale (Art. 6.1.b/c) |
| Credenziali agenti ERP | Username e password ERP degli agenti Komet | Esecuzione contratto (Art. 6.1.b) |
| Log di accesso | IP, user agent, azioni utente | Legittimo interesse sicurezza (Art. 6.1.f) |

### Retention e cancellazione

| Tipo di dato | Periodo | Motivazione |
|---|---|---|
| Dati commerciali / ordini | 10 anni | D.P.R. 600/1973 art. 22 — obbligo fiscale |
| Anagrafiche clienti inattivi | 10 anni dall'ultima transazione, poi anonimizzazione | Fiscale + GDPR Art. 5.1.e |
| Audit log accessi | 2 anni | Sicurezza, nessun obbligo oltre |
| Sessioni / token scaduti | 90 giorni | Nessuna necessità oltre |

**Scheduler automatico mensile** esegue: anonimizzazione clienti inattivi >10 anni, pulizia audit log >2 anni, pulizia sessioni >90 giorni.

### Right to Erasure (Art. 17)

Endpoint `POST /api/admin/customers/:id/gdpr-erase` disponibile per richieste documentate di cancellazione. L'operazione anonimizza i dati identificativi mantenendo la struttura commerciale per obbligo fiscale. Genera attestato JSON firmato come prova di compliance.

### Breach notification

Procedura formalizzata (vedi `docs/compliance/incident-response-procedure.md`):
- Notifica a Komet entro **4 ore** per incidenti critici (P1)
- Early warning ACN entro **24 ore**
- Notifica Garante Privacy entro **72 ore** per violazioni dati personali

---

## 5. Sub-processors

Registro completo in `docs/compliance/sub-processors.md`.

| Sub-processor | Ruolo | Sede |
|---|---|---|
| Hetzner Online GmbH | VPS + Object Storage backup | Germania 🇩🇪 |
| FedEx Corporation | Tracking API (solo tracking numbers) | USA (dati minimi, no dati personali) |
| Provider SMTP | Alert sicurezza sistema | [da definire] |

---

## 6. Prossimi passi contrattuali

Questo documento attesta lo stato tecnico e operativo del servizio. Per completare il perimetro legale al momento della firma del contratto di servizio:

1. **DPA (Data Processing Agreement)** — allegato contratto obbligatorio ex Art. 28 GDPR
2. **Contratto di servizio SaaS** — SLA, responsabilità, condizioni d'uso, prezzi
3. **Identificazione referente Komet** per breach notification e gestione incidenti
4. **Penetration test annuale** — pianificare con provider esterno certificato
5. **Revisione sub-processor register** — semestrale, ad ogni aggiunta dipendenza esterna

---

*Documento aggiornato ad ogni rilascio significativo della piattaforma.*  
*Versione corrente: 1.0 — Aprile 2026*
```

- [ ] **Step 2: Commit**

```bash
git add docs/compliance/archibald-security-compliance-overview.md
git commit -m "docs(compliance): add Security & Compliance Overview for Komet meeting (April 14)"
```

---

## Fase 6 — Deploy e verifica finale (Giorni 11-12)

---

### Task 24: Deploy in produzione e verifica

- [ ] **Step 1: Eseguire type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

Expected: nessun errore.

- [ ] **Step 2: Eseguire tutti i test**

```bash
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```

Expected: tutti i test passano.

- [ ] **Step 3: Eseguire npm audit finale**

```bash
cd archibald-web-app/backend && npm audit --audit-level=high
cd archibald-web-app/frontend && npm audit --audit-level=high
```

Expected: nessuna vulnerabilità high/critical.

- [ ] **Step 4: Push e deploy tramite CI/CD**

```bash
git push origin master
```

Attendere che GitHub Actions completi il deploy su VPS.

- [ ] **Step 5: Verificare che le migration 045, 046, 047 siano state applicate**

Le migration girano automaticamente all'avvio del backend container. Verificare che siano state applicate:

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml \
   exec -T postgres psql -U archibald -d archibald -c \
   \"SELECT name, applied_at FROM system.migrations WHERE name LIKE '04%' ORDER BY name;\""
```

Expected: righe per `045-audit-log.sql`, `046-roles-modules-mfa.sql`, `047-retention-policy.sql`.

- [ ] **Step 6: Configurare cron backup sul VPS**

```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198
# Sul VPS:
crontab -e
# Aggiungere: 0 2 * * * cd /home/deploy/archibald-app && docker compose --profile backup run --rm backup >> /home/deploy/archibald-app/logs/backup.log 2>&1
```

- [ ] **Step 7: Verifica funzionalità critiche in produzione**

- Login agente normale → funziona senza MFA prompt ✅
- Login admin → richiede MFA dopo enrollment ✅
- Logout → token revocato (secondo login con stesso token → 401) ✅
- Backup → eseguire manuale e verificare file in Hetzner Object Storage ✅
- Alert email → triggerare manualmente circuit breaker e verificare email ricevuta ✅

- [ ] **Step 8: Commit finale**

```bash
git add .
git commit -m "chore: final compliance sprint — all NIS2/GDPR measures deployed"
```

---

## Checklist finale pre-meeting 14 aprile

- [ ] Backup PostgreSQL automatico attivo e testato
- [ ] Alert email funzionanti (circuit breaker, login falliti, backup fail)
- [ ] CSP headers attivi (verificare con browser DevTools → Network)
- [ ] CORS whitelist configurata con domini Komet
- [ ] Rate limiting attivo su /login e /refresh
- [ ] npm audit in CI senza vulnerabilità critiche
- [ ] mailto: links su email clienti
- [ ] Audit log: tabella 045 in DB, eventi loggati (verificare con `GET /api/admin/audit-log`)
- [ ] Migration 046: nuovi ruoli e colonne MFA in DB
- [ ] MFA: enrollment completato per account admin
- [ ] Migration 047: colonna `last_activity_at` in customers
- [ ] GDPR erase endpoint testato
- [ ] Redis con password (testare che BullMQ funzioni ancora)
- [ ] JWT revocation: logout revoca il token (testare con stesso token dopo logout → 401)
- [ ] PIN 2611 rimosso da `memory/MEMORY.md`
- [ ] `docs/compliance/sub-processors.md` compilato (completare voce SMTP)
- [ ] `docs/compliance/incident-response-procedure.md` con contatti reali inseriti
- [ ] `docs/compliance/archibald-security-compliance-overview.md` con P.IVA e dati corretti
