# Design: Sistema Moduli per Ruolo + Semaforo Sconto

**Data:** 2026-04-10  
**Stato:** Approvato  
**Obiettivo:** Infrastruttura modulare per funzionalità abilitate/disabilitate per ruolo e per utente, con primo modulo concreto: semaforo sconto durante la creazione ordine.

---

## 1. Contesto e motivazioni

La PWA Archibald sarà usata da utenti con ruoli diversi (`agent`, `admin`, `ufficio`, `concessionario`). Le funzionalità future verranno organizzate in **moduli** abilitabili/disabilitabili per ruolo o per singolo utente dall'interfaccia admin, senza deploy.

Il primo modulo concreto è il **Semaforo Sconto**: durante la creazione di un ordine, un banner colorato mostra lo stato dello sconto effettivo documento rispetto a soglie configurate (verde/giallo/rosso). Sarà attivo per la presentazione del 14 aprile 2026.

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

-- Contatore versione per forzare logout al cambio moduli
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_version INT NOT NULL DEFAULT 0;
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

Nuova funzione nel repository users:

```typescript
async function getEffectiveModules(
  pool: DbPool,
  userId: string,
  role: UserRole
): Promise<string[]>
```

### 3b. Middleware auth — verifica `modules_version`

Ad ogni richiesta autenticata, dopo la validazione JWT, si esegue:

```typescript
const { modules_version } = await getUserModulesVersion(pool, req.user.userId);
if (modules_version !== req.user.modules_version) {
  return res.status(401).json({
    success: false,
    error: 'session_invalidated',
    reason: 'modules_changed'
  });
}
```

Query: `SELECT modules_version FROM agents.users WHERE id = $1` — PK lookup, ~1ms.

### 3c. Admin endpoint — aggiornamento moduli utente

`PATCH /api/admin/users/:id` aggiornato per accettare:

```typescript
{
  modules_granted?: string[];   // aggiunta esplicita per-utente
  modules_revoked?: string[];   // revoca esplicita per-utente
}
```

Quando uno dei due campi è presente, il backend incrementa atomicamente `modules_version`:

```sql
UPDATE agents.users
SET modules_granted = $1,
    modules_revoked = $2,
    modules_version = modules_version + 1
WHERE id = $3
```

### 3d. Nuovi endpoint module-defaults (admin)

```
GET  /api/admin/module-defaults
     → { defaults: Array<{ module_name, role, enabled }> }

PATCH /api/admin/module-defaults
      body: { module_name: string, role: UserRole, enabled: boolean }
      → aggiorna system.module_defaults; NON incrementa modules_version
        (i default di ruolo si propagano al prossimo login)
```

Il cambio dei default di ruolo non forza logout immediato — si applica al prossimo login. Solo la modifica per-utente (`modules_granted`/`modules_revoked`) forza logout.

---

## 4. Tipi e JWT

### 4a. Frontend `api/auth.ts` — tipo `User`

```typescript
export interface User {
  // campi esistenti...
  modules: string[];           // moduli effettivi (readonly, risolti dal backend)
  modules_version: number;     // per confronto locale opzionale
}
```

### 4b. Backend `auth-utils.ts` — payload JWT

```typescript
interface JWTPayload {
  // campi esistenti...
  modules: string[];
  modules_version: number;
}
```

---

## 5. Hook frontend — `useModules`

Nuovo hook `archibald-web-app/frontend/src/hooks/useModules.ts`:

```typescript
export function useModules(user: User | null) {
  return {
    hasModule: (name: string): boolean =>
      user?.modules.includes(name) ?? false,
  };
}
```

Utilizzo nei componenti:

```typescript
const { hasModule } = useModules(user);
if (!hasModule('discount-traffic-light')) return null;
```

---

## 6. Componente `DiscountTrafficLight`

**File:** `archibald-web-app/frontend/src/components/new-order-form/DiscountTrafficLight.tsx`

### Props

```typescript
interface DiscountTrafficLightProps {
  effectiveDiscountPercent: number;  // 0–100
}
```

### Comportamento

| Condizione | Colore | Testo | Sfondo border |
|---|---|---|---|
| `=== 0` | — | **nascosto** (return null) | — |
| `> 0` e `≤ 20` | Verde `#22c55e` | "Limite sconto rispettato" | `#052e16` / `#166534` |
| `> 20` e `≤ 25` | Giallo `#fbbf24` | "Limite sconto critico" | `#422006` / `#92400e` |
| `> 25` | Rosso `#f87171` | "Limite sconto in approvazione" | `#450a0a` / `#991b1b` |

### Layout banner (Opzione B scelta)

```
┌──────────────────────────────────────────────────┐
│ ● Limite sconto rispettato          15,0%        │
│   Sconto effettivo documento: 15,0%              │
└──────────────────────────────────────────────────┘
```

- Pallino luminoso (`box-shadow` colorato) a sinistra
- Testo principale in grassetto + sottotitolo percentuale
- Percentuale formattata (`toFixed(1) + '%'`) a destra in grassetto
- Inline style, dark theme, border-radius 6px
- Transizione colore non animata (cambia istantaneamente)

### Calcolo `effectiveDiscountPercent` in `OrderFormSimple`

```typescript
const listTotal = items.reduce(
  (sum, item) => sum + item.quantity * (item.originalListPrice ?? item.unitPrice), 0
);
const netTotal = items.reduce(
  (sum, item) => sum + item.quantity * item.unitPrice * (1 - globalDiscountPct / 100), 0
);
const effectiveDiscountPercent = listTotal > 0
  ? (1 - netTotal / listTotal) * 100
  : 0;
```

Il banner si inserisce subito dopo il campo `<input>` dello sconto globale in `OrderFormSimple.tsx`.

---

## 7. Pagina Admin — Sezione "Gestione Moduli"

**Posizione:** Nuova sezione nella pagina admin esistente, accessibile solo a `role === 'admin'`.

### Layout (Layout A scelto)

**Parte 1 — Tabella default per ruolo**

Intestazione colonne: Modulo | Agent | Admin | Ufficio | Concessionario  
Ogni cella: toggle on/off. Click → `PATCH /api/admin/module-defaults`.  
Cambio di default non forza logout utenti esistenti (si applica al prossimo login).

**Parte 2 — Override per utente**

Lista utenti con indicazione per ognuno:
- Se il modulo segue il default del ruolo → "Eredita default ✓" (grigio)
- Se ha una revoca esplicita → toggle off + pulsante "Ripristina"
- Se ha un grant esplicito (override rispetto a default OFF) → toggle on + pulsante "Ripristina"

Click su toggle utente → `PATCH /api/admin/users/:id` con `modules_granted`/`modules_revoked` → **incrementa `modules_version`** → forza logout immediato dell'utente alla prossima richiesta.

### Nota UX — forced logout

L'utente il cui modulo viene modificato vedrà la propria sessione invalidata silenziosamente: la prossima chiamata API ritorna `401 session_invalidated`, il frontend lo reindirizza al login. Non viene mostrata una notifica proattiva.

---

## 8. Gestione errore `session_invalidated` nel frontend

Il `fetchWithRetry` (o il wrapper globale delle chiamate API) deve riconoscere il nuovo codice errore:

```typescript
if (response.status === 401) {
  const body = await response.json();
  if (body.reason === 'modules_changed') {
    // Forza logout pulito
    localStorage.removeItem('archibald_jwt');
    window.location.href = '/';
    return;
  }
}
```

---

## 9. Test

### Unit — `DiscountTrafficLight`
- `effectiveDiscountPercent === 0` → render null
- `1%` → banner verde, testo "Limite sconto rispettato"
- `20%` esatto → verde (soglia inclusiva)
- `20.1%` → giallo
- `25%` esatto → giallo
- `25.1%` → rosso

### Unit — `useModules`
- `user.modules` include il nome → `hasModule` ritorna `true`
- `user === null` → `hasModule` ritorna `false`

### Unit — calcolo `effectiveDiscountPercent`
- Tutti gli item senza sconto → 0%
- Un item con listPrice=100, unitPrice=80, globalDiscount=0 → 20%
- Un item con listPrice=100, unitPrice=100, globalDiscount=25 → 25%

### Integration — middleware modules_version
- JWT con `modules_version=0`, DB con `modules_version=1` → 401 `session_invalidated`
- JWT e DB con stessa versione → richiesta passa

### Integration — admin endpoint
- `PATCH /api/admin/users/:id` con `modules_revoked` → `modules_version` incrementato di 1

---

## 10. Scope escluso (da implementare in futuro)

- Notifica proattiva all'utente prima del logout forzato
- Configurazione soglie semaforo dall'UI admin (ora hardcoded: 20/25)
- Moduli aggiuntivi (il sistema è pronto, basta aggiungere seed in `module_defaults`)
- Visualizzazione "motivo logout" nella schermata di login

---

## 11. Ordine di implementazione suggerito

1. Migration 056 (DB)
2. Backend: repository `getEffectiveModules` + `getUserModulesVersion`
3. Backend: aggiornamento login/JWT (modules effettivi + modules_version)
4. Backend: middleware verifica modules_version
5. Backend: admin endpoints module-defaults + aggiornamento PATCH users
6. Frontend: tipo `User` aggiornato + `useModules` hook
7. Frontend: `DiscountTrafficLight` component + test
8. Frontend: integrazione in `OrderFormSimple`
9. Frontend: gestione errore `session_invalidated` in fetchWithRetry
10. Frontend: sezione "Gestione Moduli" nella pagina admin
