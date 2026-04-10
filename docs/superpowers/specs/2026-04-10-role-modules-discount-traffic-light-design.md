# Design: Sistema Moduli per Ruolo + Semaforo Sconto

**Data:** 2026-04-10  
**Stato:** Approvato (rev. 2 — fix post code-review)  
**Obiettivo:** Infrastruttura modulare per funzionalità abilitate/disabilitate per ruolo e per utente, con primo modulo concreto: semaforo sconto durante la creazione ordine.

---

## 1. Contesto e motivazioni

La PWA Archibald sarà usata da utenti con ruoli diversi (`agent`, `admin`, `ufficio`, `concessionario`). Le funzionalità future verranno organizzate in **moduli** abilitabili/disabilitabili per ruolo o per singolo utente dall'interfaccia admin, senza deploy.

Il primo modulo concreto è il **Semaforo Sconto**: durante la creazione di un ordine, un banner colorato mostra lo stato dello sconto effettivo documento rispetto a soglie configurate (verde/giallo/rosso). Il banner è nascosto se sconto = 0%. Sarà attivo per la presentazione del 14 aprile 2026.

**Nota sul testo "in approvazione":** quando lo sconto supera il 25%, l'ordine viene bloccato a Verona per revisione dell'ufficio commerciale. Il testo "Limite sconto in approvazione" riflette questo workflow reale, non una funzionalità in-app.

---

## 2. Database — Migration 056

### 2a. Tabella `system.module_defaults`

```sql
CREATE TABLE IF NOT EXISTS system.module_defaults (
  module_name  TEXT    NOT NULL,
  role         TEXT    NOT NULL CHECK (role IN ('agent','admin','ufficio','concessionario')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (module_name, role)
);

-- Seed: semaforo sconto ON per tutti i ruoli
INSERT INTO system.module_defaults (module_name, role, enabled) VALUES
  ('discount-traffic-light', 'agent',          TRUE),
  ('discount-traffic-light', 'admin',          TRUE),
  ('discount-traffic-light', 'ufficio',        TRUE),
  ('discount-traffic-light', 'concessionario', TRUE)
ON CONFLICT DO NOTHING;
```

### 2b. Modifiche `agents.users`

```sql
-- Rinomina modules → modules_granted (semantica esplicita)
ALTER TABLE agents.users RENAME COLUMN modules TO modules_granted;

-- Nuova colonna per revoche esplicite per-utente
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_revoked JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Contatore versione per forzare logout al cambio moduli per-utente
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_version INT NOT NULL DEFAULT 0;
```

### 2c. Mapping aggiornamenti codice a cascata (colonna rinominata)

La rinomina `modules` → `modules_granted` richiede aggiornamenti su questi file:

| File | Riferimento da aggiornare |
|---|---|
| `backend/src/db/repositories/users.ts` | `USER_COLUMNS` (include `modules`), `UserRow.modules`, tipo `User.modules`, `row.modules ?? []` |
| `backend/src/routes/admin.ts` | `u.modules` (riga ~119), schema Zod `modules:`, `SET modules = $N` (riga ~191) |
| `backend/src/routes/auth.ts` | `modules: user.modules` (righe ~198, ~230, ~321, ~460) |
| `backend/src/auth-utils.ts` | Payload JWT — campo rimane `modules` (lista effettiva risolta), aggiungere `modules_version` |
| `backend/src/middleware/auth.ts` | Tipo `req.user` — aggiungere `modules_version: number` |
| Test: `auth.spec.ts`, `admin.spec.ts`, `server.spec.ts`, `parity-audit.spec.ts`, `response-shapes.spec.ts` | Tutti i mock/fixture che referenziano `modules` |

**Importante:** il campo JWT si chiama ancora `modules` (lista effettiva già risolta). Il campo DB rinominato è `modules_granted`. Questa distinzione deve essere tenuta chiara in ogni file.

**Nota deploy:** la migration rinomina una colonna su una tabella live. In PostgreSQL è un'operazione quasi istantanea (no table rewrite), ma tutte le query che usano il vecchio nome falliscono immediatamente. Il deploy deve essere atomico: migration + codice aggiornato in un unico rollout (già garantito dall'infrastruttura Docker del progetto).

### 2d. Script DOWN (rollback)

```sql
-- DOWN migration 056
DROP TABLE IF EXISTS system.module_defaults;
ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_revoked;
ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_version;
ALTER TABLE agents.users RENAME COLUMN modules_granted TO modules;
```

---

## 3. Backend

### 3a. Risoluzione moduli al login

Al login (e al rinnovo JWT), il backend calcola i **moduli effettivi** dell'utente:

```
effectiveModules =
  (moduleDefaults[user.role] UNION modules_granted)
  MINUS modules_revoked
```

La lista finale entra nel JWT come `modules: string[]` (campo già esistente). Si aggiunge `modules_version: number` al payload JWT.

Nuove funzioni nel repository users:

```typescript
// Calcola moduli effettivi dal DB
async function getEffectiveModules(
  pool: DbPool,
  userId: string,
  role: UserRole
): Promise<{ effectiveModules: string[]; modulesVersion: number }>

// Lettura veloce solo della versione (usata dal middleware)
async function getUserModulesVersion(
  pool: DbPool,
  userId: string
): Promise<number>
```

**Fallback:** se `system.module_defaults` è vuota per un ruolo (tabella vuota o ruolo non presente), i moduli effettivi sono solo quelli in `modules_granted`. Il sistema non crasha — l'utente ha semplicemente zero moduli da default.

### 3b. Middleware auth — verifica `modules_version`

**Contesto:** `modules_version` serve esclusivamente a forzare logout quando un admin modifica i moduli di un utente specifico. NON è un sistema di revoca token per furto/compromissione — quello è responsabilità del meccanismo JTI esistente (token blacklist). I due meccanismi sono complementari e indipendenti.

**Caching obbligatorio:** il check aggiunge una query DB per ogni richiesta autenticata. Per evitare il carico su un pool già condiviso con BullMQ, il middleware mantiene una **in-process cache** con TTL 30 secondi:

```typescript
// In middleware/auth.ts — cache modulo-livello (non per richiesta)
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
```

**Conseguenza pratica del TTL:** dopo che un admin modifica i moduli di un utente, la sessione viene invalidata entro al massimo 30 secondi dalla prossima richiesta dell'utente (non istantaneamente). Questo è accettabile per il caso d'uso.

**Check nel middleware:**

```typescript
const currentVersion = await getCachedModulesVersion(pool, req.user.userId);
if (currentVersion !== req.user.modules_version) {
  // Invalida cache entry immediatamente
  modulesVersionCache.delete(req.user.userId);
  return res.status(401).json({
    success: false,
    error: 'session_invalidated',
    reason: 'modules_changed'
  });
}
```

### 3c. Admin endpoint — aggiornamento moduli utente

`PATCH /api/admin/users/:id` aggiornato per accettare:

```typescript
{
  role?: UserRole;
  whitelisted?: boolean;
  modules_granted?: string[];   // aggiunta esplicita per-utente (ex "modules")
  modules_revoked?: string[];   // revoca esplicita per-utente (nuovo)
}
```

Quando `modules_granted` o `modules_revoked` sono presenti, il backend incrementa atomicamente `modules_version` e invalida la cache del middleware:

```sql
UPDATE agents.users
SET modules_granted = $1,
    modules_revoked = $2,
    modules_version = modules_version + 1
WHERE id = $3
RETURNING modules_version
```

Dopo l'UPDATE, il backend chiama `modulesVersionCache.delete(userId)` (o equivalente via export della cache) per garantire che il check middleware non usi valori stale.

### 3d. Nuovi endpoint module-defaults (admin)

```
GET  /api/admin/module-defaults
     → { defaults: Array<{ module_name, role, enabled }> }

PATCH /api/admin/module-defaults
      body: { module_name: string, role: UserRole, enabled: boolean }
      → aggiorna system.module_defaults
      → NON incrementa modules_version (si applica al prossimo login)
```

**Limitazione documentata:** la modifica dei default di ruolo si propaga solo al prossimo login degli utenti di quel ruolo (fino a 8 ore di ritardo se il JWT è ancora valido). Per forzare l'applicazione immediata su un utente specifico, l'admin deve usare l'override per-utente (`PATCH /api/admin/users/:id`) che incrementa `modules_version` e forza logout.

---

## 4. Tipi e JWT

### 4a. Frontend `api/auth.ts` — tipo `UserRole` e `User`

```typescript
// Aggiornare da:
export type UserRole = "agent" | "admin";

// A:
export type UserRole = "agent" | "admin" | "ufficio" | "concessionario";

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
  modules: string[];           // moduli effettivi (readonly, risolti dal backend al login)
  modules_version: number;
}
```

### 4b. Backend `auth-utils.ts` — payload JWT

```typescript
interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  deviceId?: string;
  isImpersonating?: boolean;
  realAdminId?: string;
  adminSessionId?: number;
  modules: string[];          // lista effettiva risolta (invariato nel nome)
  modules_version: number;    // nuovo
  jti: string;
  exp?: number;
}
```

---

## 5. Hook frontend — `useModules`

Nuovo hook `archibald-web-app/frontend/src/hooks/useModules.ts`.

Il hook non accetta argomenti — legge `user` dal contesto auth, coerentemente con gli altri hook del progetto (`useNotifications`, `useOrderNotes`, ecc.):

```typescript
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext'; // o equivalente

export function useModules() {
  const { user } = useContext(AuthContext);
  return {
    hasModule: (name: string): boolean =>
      user?.modules.includes(name) ?? false,
  };
}
```

Utilizzo nei componenti:

```typescript
const { hasModule } = useModules();
if (!hasModule('discount-traffic-light')) return null;
```

---

## 6. Componente `DiscountTrafficLight`

**File:** `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.tsx`

### Props

```typescript
interface DiscountTrafficLightProps {
  effectiveDiscountPercent: number;  // 0–100, già calcolato dal parent
}
```

### Comportamento

| Condizione | Colore | Testo | Sfondo / border |
|---|---|---|---|
| `=== 0` | — | **nascosto** (return null) | — |
| `> 0` e `≤ 20` | Verde `#22c55e` | "Limite sconto rispettato" | `#052e16` / `#166534` |
| `> 20` e `≤ 25` | Giallo `#fbbf24` | "Limite sconto critico" | `#422006` / `#92400e` |
| `> 25` | Rosso `#f87171` | "Limite sconto in approvazione" | `#450a0a` / `#991b1b` |

Le soglie sono inclusive al limite inferiore: `> 20` (non `≥ 20`), quindi 20,0% esatto = verde.

### Layout banner

```
┌──────────────────────────────────────────────────┐
│ ● Limite sconto rispettato          15,0%        │
│   Sconto effettivo documento: 15,0%              │
└──────────────────────────────────────────────────┘
```

- Pallino luminoso (`box-shadow: 0 0 6px <colore>`) a sinistra
- Testo principale bold + sottotitolo con percentuale
- Percentuale `toFixed(1) + '%'` in grassetto a destra, tabular-nums
- Inline style, dark theme coerente con OrderFormSimple, border-radius 6px
- Nessuna animazione di transizione (cambio colore istantaneo)

### Funzione pura `calculateEffectiveDiscount`

La logica di calcolo è estratta come funzione pura testabile separatamente:

**File:** `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.ts` (no JSX)

```typescript
interface OrderItemForDiscount {
  quantity: number;
  unitPrice: number;           // prezzo offerto dall'agente (può differire dal listino)
  originalListPrice?: number;  // prezzo di listino catalogo (se disponibile)
}

export function calculateEffectiveDiscount(
  items: OrderItemForDiscount[],
  globalDiscountPercent: number   // 0–100
): number {
  if (items.length === 0) return 0;

  const listTotal = items.reduce(
    (sum, item) => sum + item.quantity * (item.originalListPrice ?? item.unitPrice),
    0
  );

  if (listTotal === 0) return 0;

  // unitPrice è il prezzo offerto prima dello sconto globale.
  // Il globalDiscount si applica su unitPrice (non su originalListPrice).
  const netTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (1 - globalDiscountPercent / 100),
    0
  );

  return (1 - netTotal / listTotal) * 100;
}
```

**Semantica dei campi:**
- `unitPrice`: il prezzo che l'agente offre al cliente per quell'articolo. Può essere il listino o un prezzo trattato. Lo sconto globale si applica su questo valore.
- `originalListPrice`: il prezzo di listino del catalogo. Se non disponibile (articoli ghost o inserimento manuale), il fallback è `unitPrice` — in questo caso lo sconto globale è l'unico sconto rilevato e il contributo di quell'item al "delta sul listino" è zero.
- Il risultato è lo sconto percentuale effettivo del documento rispetto al listino catalogo.

**Il banner si inserisce** immediatamente dopo il campo `<input>` dello sconto globale in `OrderFormSimple.tsx`, condizionato a `hasModule('discount-traffic-light')`.

---

## 7. Pagina Admin — Sezione "Gestione Moduli"

**Posizione:** Nuova sezione nella pagina admin esistente, accessibile solo a `role === 'admin'`.

### Layout (Layout A)

**Parte 1 — Tabella default per ruolo**

Intestazione colonne: Modulo | Agent | Admin | Ufficio | Concessionario  
Ogni cella: toggle on/off. Click → `PATCH /api/admin/module-defaults`.

⚠️ **Limitazione operativa:** la modifica dei default di ruolo si applica solo al prossimo login degli utenti di quel ruolo (fino a 8 ore di ritardo). Per effetto immediato su un utente specifico, usare l'override per-utente nella Parte 2.

**Parte 2 — Override per utente**

Lista utenti con indicazione per ogni modulo:
- Default di ruolo → "Eredita default ✓" (grigio)
- Revoca esplicita → toggle off + pulsante "Ripristina"
- Grant esplicito (override rispetto a default OFF) → toggle on + pulsante "Ripristina"

Click su toggle utente → `PATCH /api/admin/users/:id` con `modules_granted`/`modules_revoked` → **incrementa `modules_version`** → sessione dell'utente invalidata entro 30 secondi dalla sua prossima richiesta.

### Nota UX — forced logout

L'utente vede la propria sessione invalidata silenziosamente: la prossima chiamata API ritorna `401 session_invalidated`, il frontend lo reindirizza al login. Non viene mostrata notifica proattiva (scope futuro).

---

## 8. Gestione errore `session_invalidated` nel frontend

Il check deve essere inserito **prima** del blocco generico 401 esistente in `fetchWithRetry.ts`. La struttura attuale del codice (semplificata) è:

```typescript
if (response.status === 401) {
  const data = await response.json();

  // [NUOVO — inserire QUI, prima del blocco generico]
  if (data.reason === 'modules_changed') {
    localStorage.removeItem('archibald_jwt');
    window.location.href = '/';
    return; // interrompe il retry loop
  }

  // Blocco esistente — CREDENTIALS_EXPIRED
  if (data.error === 'CREDENTIALS_EXPIRED') {
    // ... logica esistente invariata
  }

  // Blocco esistente — altri 401 generici
  localStorage.removeItem('archibald_jwt');
  window.location.href = '/login?reason=unauthorized';
}
```

**Nota retry:** il `return` nella gestione `modules_changed` è obbligatorio per interrompere il retry loop interno a `fetchWithRetry`. Senza di esso, `window.location.href` verrebbe impostato ma i retry successivi potrebbero continuare a girare fino al throw finale.

---

## 9. Test

### Unit — `calculateEffectiveDiscount` (funzione pura)
- Lista vuota → `0`
- Un item: `listPrice=100, unitPrice=100, globalDiscount=0` → `0%`
- Un item: `listPrice=100, unitPrice=80, globalDiscount=0` → `20%`
- Un item: `listPrice=100, unitPrice=100, globalDiscount=25` → `25%`
- Un item senza `originalListPrice` (ghost): `unitPrice=50, globalDiscount=10` → `10%` (listTotal = netTotal / (1-0.1), sconto = globalDiscount)
- Due item con `originalListPrice` diverso: verifica peso proporzionale

### Unit — `DiscountTrafficLight`
- `effectiveDiscountPercent === 0` → `null` (niente render)
- `0.1%` → banner verde, testo "Limite sconto rispettato"
- `20.0%` esatto → verde (soglia: `> 20` non include 20)
- `20.1%` → giallo, testo "Limite sconto critico"
- `25.0%` esatto → giallo
- `25.1%` → rosso, testo "Limite sconto in approvazione"

### Unit — `useModules`
- `user.modules` include il nome → `hasModule` → `true`
- `user.modules` non include il nome → `false`
- `user === null` (non autenticato) → `false`

### Integration — middleware `modules_version`
- JWT `modules_version=0`, DB `modules_version=1` → 401 `{ reason: 'modules_changed' }`
- JWT e DB con stessa versione → richiesta passa
- Dopo risposta 401, cache entry è stata invalidata

### Integration — admin endpoint `PATCH /api/admin/users/:id`
- Payload con `modules_revoked` → `modules_version` incrementato di 1 nel DB
- Risposta include la nuova `modules_version`

---

## 10. Scope escluso (da implementare in futuro)

- Notifica proattiva all'utente prima del logout forzato
- Configurazione soglie semaforo dall'UI admin (ora hardcoded: 20/25)
- Moduli aggiuntivi (il sistema è pronto: basta aggiungere seed in `module_defaults`)
- Visualizzazione "motivo logout" nella schermata di login
- Propagazione immediata del cambio default-ruolo senza re-login

---

## 11. Ordine di implementazione

1. **Migration 056** (DB) — `system.module_defaults`, rinomina colonna, nuovi campi
2. **Backend repository** — `getEffectiveModules`, `getUserModulesVersion`; aggiornare `UserRow` e tipo `User` del repo con nuovi campi
3. **Backend login/JWT** — calcola moduli effettivi al login, include `modules_version` nel JWT; aggiornare tutti i punti in `auth.ts` che costruiscono il token
4. **Backend middleware** — aggiungere cache in-process + check `modules_version`; aggiornare tipo `req.user`
5. **Backend admin endpoints** — `GET/PATCH /api/admin/module-defaults`; aggiornare `PATCH /api/admin/users/:id` per `modules_granted`/`modules_revoked` + increment versione
6. **Frontend tipi** — `UserRole` a 4 valori, `User` con `modules` + `modules_version`
7. **Frontend `useModules`** — hook senza argomenti che legge dal contesto
8. **Frontend `calculateEffectiveDiscount`** + **`DiscountTrafficLight`** + test
9. **Frontend integrazione in `OrderFormSimple`** — calcolo + banner condizionale a `hasModule`
10. **Frontend `fetchWithRetry`** — gestione `session_invalidated` prima del blocco 401 generico
11. **Frontend sezione "Gestione Moduli"** nella pagina admin
