# MFA Device Trust — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il "ricorda questo dispositivo" al flusso MFA, in modo che dopo il primo OTP su un device l'utente non venga mai più interrotto per 30 giorni — rimuovendo la friction quotidiana senza rinunciare alla sicurezza.

**Problema che risolve:** MFA abilitato = OTP ad ogni login (anche unlock con PIN). Insostenibile per uso quotidiano. Il device trust è lo standard industriale per questo problema (es. Google, GitHub, 1Password).

**Architecture:** Token crittografico casuale generato al primo OTP verificato, hashato e persistito in DB con scadenza 30 giorni. Alla login successiva il client lo invia: se valido, il flusso MFA viene saltato e il JWT viene emesso direttamente. Nessun impatto sul flusso senza MFA.

**Tech Stack:** PostgreSQL (nuova tabella), Node.js crypto (`randomBytes`/`createHash`), React 19. Nessuna nuova dipendenza.

**Context:** Il sistema MFA è già completamente implementato (backend + frontend). Questa feature si innesta sulle route esistenti `/api/auth/login` e `/api/auth/mfa-verify`.

---

## File Map

### Nuovi file
- `archibald-web-app/backend/src/db/migrations/049-mfa-trusted-devices.sql`
- `archibald-web-app/backend/src/db/repositories/mfa-trusted-devices.ts`

### File modificati
- `archibald-web-app/backend/src/routes/auth.ts` — login check + mfa-verify generate token
- `archibald-web-app/backend/src/server.ts` — wiring nuovi dep nel createAuthRouter
- `archibald-web-app/frontend/src/components/MfaVerifyStep.tsx` — checkbox "ricorda device"
- `archibald-web-app/frontend/src/api/auth.ts` — include trustToken in login payload

---

## Dettaglio tecnico

### Schema DB — `agents.mfa_trusted_devices`

```sql
CREATE TABLE agents.mfa_trusted_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  trust_token_hash TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);
CREATE INDEX idx_mfa_trusted_devices_user_device
  ON agents.mfa_trusted_devices (user_id, device_id)
  WHERE expires_at > NOW();
```

Un record per (user_id, device_id): quando se ne crea uno nuovo per lo stesso device, il vecchio viene rimpiazzato (UPSERT o DELETE + INSERT).

### Flusso completo

```
LOGIN normale (mfa_enabled=true):
  client → POST /login { username, password, deviceId, trustToken? }
  server: credenziali ok → controlla trustToken
    trustToken presente e valido? → JWT diretto (no OTP)
    trustToken assente/scaduto? → { status: 'mfa_required', mfaToken }

OTP VERIFY (primo accesso o token scaduto):
  client → POST /mfa-verify { mfaToken, code, rememberDevice?, deviceId? }
  server: OTP ok →
    rememberDevice=true? → genera rawToken (32 bytes hex), salva hash in DB
    risposta: { success: true, token: JWT, trustToken?: rawToken }

CLIENT dopo mfa-verify:
  se trustToken nella risposta → localStorage.setItem('archibald_mfa_trust', trustToken)

CLIENT al prossimo login:
  include trustToken: localStorage.getItem('archibald_mfa_trust') nella POST /login
```

### Sicurezza
- `rawToken = crypto.randomBytes(32).toString('hex')` (256 bit di entropia)
- In DB si salva solo `SHA-256(rawToken)` — mai il token in chiaro
- Scadenza 30 giorni, verificata server-side
- Se il device_id cambia (nuovo browser/device), il token non è più valido
- Revoca: `DELETE FROM mfa_trusted_devices WHERE user_id = $1` (es. cambio password)

---

## Task 1 — Migration: tabella `mfa_trusted_devices`

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/049-mfa-trusted-devices.sql`

- [ ] **Step 1: Creare la migration SQL**

```sql
-- Migration 049: MFA trusted devices (device trust per skip OTP)

CREATE TABLE IF NOT EXISTS agents.mfa_trusted_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  device_id        TEXT NOT NULL,
  trust_token_hash TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_lookup
  ON agents.mfa_trusted_devices (user_id, device_id, expires_at);
```

Verificare che il file sia in ordine rispetto alla numerazione (048 esiste in prod).

---

## Task 2 — Repository: `mfa-trusted-devices.ts`

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/mfa-trusted-devices.ts`

**Funzioni da implementare:**

```typescript
import type { DbPool } from '../pool';
import { randomBytes, createHash } from 'crypto';

// Genera raw token (da restituire al client) e salva l'hash in DB
// Fa UPSERT: se esiste già un record per (user_id, device_id), lo sostituisce
export async function createTrustToken(
  pool: DbPool,
  userId: string,
  deviceId: string,
): Promise<string> // raw token hex

// Verifica se il trust token è valido per (userId, deviceId)
// Confronta SHA-256(rawToken) con il DB, controlla expires_at > NOW()
// Ritorna true se valido, false altrimenti
export async function verifyTrustToken(
  pool: DbPool,
  userId: string,
  deviceId: string,
  rawToken: string,
): Promise<boolean>

// Revoca tutti i trusted device di un utente (es. cambio password, logout totale)
export async function revokeAllTrustTokens(
  pool: DbPool,
  userId: string,
): Promise<void>
```

**Implementazione dettagliata:**

`createTrustToken`:
1. `const raw = randomBytes(32).toString('hex')`
2. `const hash = createHash('sha256').update(raw).digest('hex')`
3. `DELETE FROM agents.mfa_trusted_devices WHERE user_id=$1 AND device_id=$2` (rimpiazza vecchio)
4. `INSERT INTO agents.mfa_trusted_devices (user_id, device_id, trust_token_hash) VALUES ($1,$2,$3)`
5. `return raw`

`verifyTrustToken`:
1. `const hash = createHash('sha256').update(rawToken).digest('hex')`
2. `SELECT id FROM agents.mfa_trusted_devices WHERE user_id=$1 AND device_id=$2 AND trust_token_hash=$3 AND expires_at > NOW()`
3. `return rows.length > 0`

**Testing (colocato in `mfa-trusted-devices.spec.ts`):**
- Integration test con pool reale (skip se no DB, come pattern esistente) — oppure unit test con pool mockato
- Verificare: createTrustToken → verifyTrustToken con stesso token → true
- Verificare: verifyTrustToken con token sbagliato → false
- Verificare: revokeAllTrustTokens → verifyTrustToken → false

---

## Task 3 — Backend login route: check trust token

**Files:**
- Modify: `archibald-web-app/backend/src/routes/auth.ts`

**Obiettivo:** nella POST /login, se `mfa_enabled=true` E il client manda un `trustToken` valido, emettere JWT direttamente senza richiedere OTP.

- [ ] **Step 1: Aggiungere `trustToken` allo `loginSchema`**

```typescript
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
  deviceName: z.string().optional(),
  trustToken: z.string().optional(),  // ← NUOVO
});
```

- [ ] **Step 2: Aggiungere `verifyTrustToken` ai deps di `AuthRouterDeps`**

```typescript
type AuthRouterDeps = {
  // ... esistenti ...
  verifyTrustToken?: (userId: string, deviceId: string, rawToken: string) => Promise<boolean>;
};
```

- [ ] **Step 3: Usare verifyTrustToken nel flusso login**

Subito prima del blocco `if (user.mfaEnabled) {`, aggiungere:

```typescript
if (user.mfaEnabled && parsed.data.trustToken && parsed.data.deviceId && deps.verifyTrustToken) {
  const trusted = await deps.verifyTrustToken(user.id, parsed.data.deviceId, parsed.data.trustToken);
  if (trusted) {
    const token = await generateJWT({
      userId: user.id,
      username: user.username,
      role: user.role as UserRole,
      deviceId: parsed.data.deviceId,
      modules: user.modules,
    });
    void audit(deps.pool, {
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.login_success',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { via: 'device_trust' },
    });
    return res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    });
  }
}
```

- [ ] **Step 4: Aggiungere test in `auth.spec.ts`**

Nuovo `describe('POST /api/auth/login — device trust')`:
- `user con mfaEnabled=true e trustToken valido riceve JWT direttamente`
- `user con mfaEnabled=true e trustToken non valido riceve mfa_required`
- `user con mfaEnabled=true senza trustToken riceve mfa_required`

---

## Task 4 — Backend mfa-verify route: generare trust token

**Files:**
- Modify: `archibald-web-app/backend/src/routes/auth.ts`

**Obiettivo:** nella POST /mfa-verify, se `rememberDevice=true` e il client manda `deviceId`, generare un trust token e includerlo nella risposta.

- [ ] **Step 1: Aggiungere `rememberDevice` e `deviceId` allo schema di mfa-verify**

```typescript
const parsed = z.object({
  mfaToken: z.string(),
  code: z.string().min(6).max(16),
  rememberDevice: z.boolean().optional(),  // ← NUOVO
  deviceId: z.string().optional(),          // ← NUOVO
}).safeParse(req.body);
```

- [ ] **Step 2: Aggiungere `createTrustToken` ai deps di `AuthRouterDeps`**

```typescript
createTrustToken?: (userId: string, deviceId: string) => Promise<string>;
```

- [ ] **Step 3: Generare il token se requested**

Alla fine del route handler di mfa-verify, prima di `res.json(...)`:

```typescript
let trustToken: string | undefined;
if (parsed.data.rememberDevice && parsed.data.deviceId && deps.createTrustToken) {
  trustToken = await deps.createTrustToken(user.id, parsed.data.deviceId);
}

res.json({
  success: true,
  token,
  user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
  ...(trustToken ? { trustToken } : {}),
});
```

- [ ] **Step 4: Aggiungere test in `auth.spec.ts`**

Nuovo `describe('POST /api/auth/mfa-verify — device trust')`:
- `con rememberDevice=true e deviceId: risposta include trustToken`
- `con rememberDevice=false: risposta NON include trustToken`
- `senza createTrustToken configurato: risposta NON include trustToken (graceful skip)`

---

## Task 5 — Backend wiring in `server.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/server.ts`

- [ ] **Step 1: Importare le funzioni dal repository**

```typescript
import { createTrustToken, verifyTrustToken, revokeAllTrustTokens } from './db/repositories/mfa-trusted-devices';
```

- [ ] **Step 2: Passare i dep al createAuthRouter**

Nel blocco `createAuthRouter({ ... })`, aggiungere:
```typescript
createTrustToken: (userId, deviceId) => createTrustToken(pool, userId, deviceId),
verifyTrustToken: (userId, deviceId, rawToken) => verifyTrustToken(pool, userId, deviceId, rawToken),
```

Nota: `revokeAllTrustTokens` verrà usato in futuro per logout totale / cambio password. Non serve nel wiring iniziale ma tenerlo pronto.

---

## Task 6 — Frontend: MfaVerifyStep con "ricorda device"

**Files:**
- Modify: `archibald-web-app/frontend/src/components/MfaVerifyStep.tsx`

- [ ] **Step 1: Aggiungere stato e checkbox**

```typescript
const [rememberDevice, setRememberDevice] = useState(false);
```

Form: aggiungere dopo il campo code, prima del bottone:
```tsx
<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
  <input
    type="checkbox"
    checked={rememberDevice}
    onChange={(e) => setRememberDevice(e.target.checked)}
  />
  Ricorda questo dispositivo per 30 giorni
</label>
```

- [ ] **Step 2: Inviare `rememberDevice` e `deviceId` nella request**

```typescript
const { getDeviceId } = await import('../utils/device-id');
const res = await fetch('/api/auth/mfa-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mfaToken,
    code,
    rememberDevice,
    deviceId: getDeviceId(),
  }),
});
```

- [ ] **Step 3: Salvare il trustToken se presente nella risposta**

```typescript
const data = await res.json();
if (data.success) {
  if (data.trustToken) {
    localStorage.setItem('archibald_mfa_trust', data.trustToken);
  }
  onSuccess(data.token, data.user);
}
```

---

## Task 7 — Frontend: includere trustToken nel login

**Files:**
- Modify: `archibald-web-app/frontend/src/api/auth.ts`

- [ ] **Step 1: Leggere trustToken dal localStorage e includerlo nel payload login**

```typescript
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const { getDeviceId, getDeviceName, getPlatform } = await import('../utils/device-id');

  const loginPayload = {
    ...credentials,
    deviceId: credentials.deviceId || getDeviceId(),
    platform: credentials.platform || getPlatform(),
    deviceName: credentials.deviceName || getDeviceName(),
    trustToken: localStorage.getItem('archibald_mfa_trust') ?? undefined,  // ← NUOVO
  };
  // ... resto invariato
}
```

- [ ] **Step 2: Aggiungere `trustToken` a `LoginRequest`**

```typescript
export interface LoginRequest {
  username: string;
  password: string;
  deviceId?: string;
  platform?: string;
  deviceName?: string;
  trustToken?: string;  // ← NUOVO
}
```

- [ ] **Step 3: Pulire il trustToken al logout**

In `useAuth.ts`, nel `logout()`, aggiungere:
```typescript
localStorage.removeItem('archibald_mfa_trust');
```

---

## Task 8 — Verifiche finali e deploy

- [ ] **Step 1: Build check backend** — `npm run build --prefix archibald-web-app/backend` senza errori TS
- [ ] **Step 2: Test suite completa backend** — `npm test --prefix archibald-web-app/backend` tutto verde
- [ ] **Step 3: Type check frontend** — `npm run type-check --prefix archibald-web-app/frontend` senza errori
- [ ] **Step 4: Commit + push** — CI/CD green, VPS healthy, migration 049 applicata
- [ ] **Step 5: Test manuale flusso completo**
  - Login con MFA abilitato → OTP → "Ricorda device" checkbox → JWT
  - Logout → Login nuovo → niente OTP → JWT diretto
  - Logout → Login da altro browser (no localStorage) → OTP richiesto

---

## Note implementative

**Perché non cookie `HttpOnly`:** l'app è una PWA con Service Worker, i cookie `HttpOnly` non sono accessibili dal SW. Il localStorage è già usato per JWT e credenziali — coerente col pattern esistente.

**Scadenza 30 giorni:** valore standard industry (GitHub usa 30 giorni, Google usa 90). Configurabile in futuro via variabile d'ambiente se necessario.

**Collision device_id:** il `deviceId` è generato da `utils/device-id.ts` e persistito in localStorage — praticamente unico per browser/installazione. Non serve un UUID v4 crittografico per questo scopo (non è un segreto).

**Invalidazione esplicita:** attualmente non c'è UI per "disconnetti tutti i device". Si può aggiungere in futuro in `AccessManagementPage` come azione admin o nel `ProfilePage` come "Revoca tutti i device fidati".
