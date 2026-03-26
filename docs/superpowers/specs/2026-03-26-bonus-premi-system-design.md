# Bonus & Premi System — Design Spec

## Goal

Sostituire i widget ridondanti della Home con un'unica sezione Provvigioni & Premi più chiara, aggiungere un sistema di premi speciali una tantum e condizioni obiettivo gestiti dall'agente dal proprio profilo, e connettere il tutto alla notifica `budget_milestone`.

## Architecture

Tre aree di cambiamento indipendenti ma collegate:

1. **Home page** — rimozione widget obsoleti + nuovo `BonusRoadmapWidget`
2. **Profile page** — nuovo tab "Premi" con CRUD su due nuove tabelle DB
3. **Notification scheduler** — nuovo check `checkBudgetMilestones` per condizioni `type='budget'`

## Tech Stack

React 19 + TypeScript strict (frontend), Express + pg pool (backend), PostgreSQL schema `agents.*`, Vitest (test).

---

## Sezione 1 — Rimozione widget Home

Dal file `frontend/src/pages/Dashboard.tsx` vengono **rimossi**:

- Le 4 summary card: Budget Attuale, Target Mensile, Provvigioni Maturate, Prossimo Bonus
- `CommissionsWidget` (e relativo import)
- `ForecastWidget` / `ForecastWidgetNew` (Previsione Fine Mese)
- `ActionSuggestionWidgetNew` (Cosa Conviene Fare Ora?)

**Non viene toccato**: `TargetVisualizationWidget` / `BudgetWidget` (il widget hero semicerchio con gauge, comparazioni anno precedente e vs obiettivo).

---

## Sezione 2 — `BonusRoadmapWidget` (nuovo componente)

**File**: `frontend/src/components/BonusRoadmapWidget.tsx`

Sostituisce in un solo componente tutto ciò che era nei widget rimossi. Struttura a 5 blocchi verticali:

### Blocco 1 — Hero totale maturato
Banner verde scuro con:
- Totale provvigioni = base + bonus progressivi + premi speciali
- Breakdown testuale sotto (es. "base €15.745 · bonus €5.000 · speciali €1.000")
- A destra: fatturato annuale + anticipo ricevuto (mesi × anticipo mensile)

### Blocco 2 — Milestone ladder bonus progressivi
Griglia 4 card orizzontali. Ogni card mostra: numero bonus, soglia (€75k, €150k…), premio (+€5.000). Tre stati:
- **✅ Raggiunto** — bordo verde, badge verde
- **🔥 In corso** — bordo arancione, badge arancione, mini progress bar con % corrente
- **Bloccato** — grigio, opacità degradante

### Blocco 3 — Premi extra-budget
Stato locked con descrizione tiers finché `currentBudget < yearlyTarget`. Quando sbloccato: stessa struttura a card della sezione 2 con i 4 tiers (€6k, €12k, €18k, €24k).

### Blocco 4 — Premi speciali
Lista compatta delle voci `agents.special_bonuses` dell'utente. Riga per ogni premio (icona, titolo, data, importo). Link "Gestisci nel Profilo →" in fondo.

### Blocco 5 — Anticipo vs Provvigioni
Due box affiancati (anticipo ricevuto / provvigioni maturate) con progress bar + box conguaglio stimato (totalCommissions - advanceReceivedSoFar).

### Props
```ts
type BonusRoadmapWidgetProps = {
  currentBudget: number;
  yearlyTarget: number;
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  currency: string;
  specialBonuses: Array<{ id: number; title: string; amount: number; receivedAt: string }>;
  hideCommissions?: boolean;
};
```

### Privacy mode
Quando `hideCommissions = true` il widget mostra il blocco locked identico all'attuale `CommissionsWidget` ("🔒 Dati provvigionali nascosti"). Il toggle `Attiva Privacy` in Dashboard già gestisce lo stato `hideCommissions` — basta passarlo al nuovo componente invece del vecchio.

---

## Sezione 3 — Database: due nuove tabelle

**Migration**: `backend/src/db/migrations/036-bonus-system.sql`

```sql
CREATE TABLE IF NOT EXISTS agents.special_bonuses (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  amount     DOUBLE PRECISION NOT NULL,
  received_at DATE NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_special_bonuses_user ON agents.special_bonuses(user_id);

CREATE TABLE IF NOT EXISTS agents.bonus_conditions (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  reward_amount    DOUBLE PRECISION NOT NULL,
  condition_type   TEXT NOT NULL CHECK (condition_type IN ('budget', 'manual')),
  budget_threshold DOUBLE PRECISION,   -- solo per condition_type = 'budget'
  is_achieved      BOOLEAN NOT NULL DEFAULT FALSE,
  achieved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_conditions_user ON agents.bonus_conditions(user_id);
```

---

## Sezione 4 — Backend: repositories e route

### Repositories
- `backend/src/db/repositories/special-bonuses.ts` — `getByUserId`, `insert`, `deleteById`
- `backend/src/db/repositories/bonus-conditions.ts` — `getByUserId`, `insert`, `markAchieved`, `deleteById`

Ogni funzione accetta `DbPool` come primo parametro (pattern esistente).

### Route
**File**: `backend/src/routes/bonuses.ts`
Registrata in `main.ts` come `app.use('/api/bonuses', createBonusesRouter(deps))`.

Endpoints:
```
GET    /api/bonuses/special              — lista premi speciali dell'utente autenticato
POST   /api/bonuses/special              — crea nuovo premio speciale
DELETE /api/bonuses/special/:id          — elimina (solo se user_id corrisponde)

GET    /api/bonuses/conditions           — lista condizioni dell'utente
POST   /api/bonuses/conditions           — crea nuova condizione
PATCH  /api/bonuses/conditions/:id/achieve — marca come raggiunta (solo type='manual'; type='budget' restituisce 400)
DELETE /api/bonuses/conditions/:id       — elimina
```

---

## Sezione 5 — Frontend: Profile tab "Premi"

**File modificato**: `frontend/src/pages/ProfilePage.tsx`
**Nuovo componente**: `frontend/src/components/BonusesTab.tsx`

Il tab "Premi" contiene due sezioni:

### Premi speciali ricevuti
Tabella con colonne: Descrizione / Importo / Data / Elimina.
Riga aggiuntiva con form inline per aggiungere nuova voce (title, amount, received_at).
Chiamate a `POST /api/bonuses/special` e `DELETE /api/bonuses/special/:id`.

### Condizioni obiettivo
Tabella con colonne: Obiettivo / Tipo (badge Auto/Manuale) / Premio / Stato.
- Tipo `manual` non ancora raggiunta → pulsante "Segna ✓" → `PATCH .../achieve`
- Tipo `budget` → valutazione automatica dallo scheduler, agente può solo creare/eliminare
- Form inline per aggiungere: title, reward_amount, tipo (select Manual / Budget soglia), budget_threshold (visibile solo se tipo = Budget)

### API service
`frontend/src/services/bonuses.service.ts` — funzioni `getSpecialBonuses`, `createSpecialBonus`, `deleteSpecialBonus`, `getBonusConditions`, `createBonusCondition`, `achieveBonusCondition`, `deleteBonusCondition`.

---

## Sezione 6 — `budget_milestone` notification

**File modificato**: `backend/src/sync/notification-scheduler.ts`

Aggiunta funzione `checkBudgetMilestones(pool, deps)`:

- Query: tutte le condizioni `type='budget'` con `is_achieved=false`
- Per ogni agente interessato: recupera `currentBudget` da `agents.order_records` — `SUM` di `total_amount::numeric` dove `total_amount NOT LIKE '-%'` e `EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`
- Se `currentBudget >= budget_threshold` → `markAchieved(pool, conditionId)` + `createNotification` con type `budget_milestone`, target `user`, userId dell'agente
- Dedup: la `markAchieved` setta `is_achieved=true`, quindi la condizione non viene mai processata due volte

Chiamata aggiunta al `setInterval` giornaliero in `createNotificationScheduler`.

---

## Sezione 7 — Privacy toggle

In `Dashboard.tsx` lo stato `hideCommissions` (già esistente, alimenta il toggle "Attiva Privacy") viene passato anche a `BonusRoadmapWidget`. Nessuna modifica alla logica del toggle — solo cambio del destinatario della prop.

---

## Testing

- Unit test `BonusRoadmapWidget` — rendering con hideCommissions=true, calcolo corretto totale, milestone states
- Unit test `checkBudgetMilestones` — mock pool, verifica createNotification chiamata quando soglia superata, non chiamata se già achieved
- Integration test route `/api/bonuses/special` — CRUD completo
- Integration test route `/api/bonuses/conditions` — CRUD + achieve endpoint

---

## Scope escluso

- `BudgetWidget` / `TargetVisualizationWidget` (hero semicerchio) — non modificati
- Modifica ai parametri di commissione (già gestiti in `/api/admin/users/:id/target`)
- Export CSV dei premi
