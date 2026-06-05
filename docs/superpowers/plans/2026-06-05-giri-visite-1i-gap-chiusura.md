# Giri Visite — Piano 1i: Chiusura Gap al 100%

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i 4 gap rimanenti rispetto alla spec originale: clienti Arca-only nel generate, lock/unlock tappe, corsi/eventi Massironi, replanning e penalità saltati.

**Architecture:** (1) `buildCandidates` esteso per caricare anche sub_clients senza match Archibald — valore da `fresis_history.sub_client_codice`. (2) Lock button in VisitStopCard con PATCH. (3) Nuova tabella `system.course_events` + endpoint CRUD + suggerimento nel visit-brief. (4) Pulsante "Rigenera" in SessionPage + campo `skip_weight` nello score per clienti saltati frequentemente.

**Tech Stack:** Express, TypeScript strict, pg, Zod, React 19, Vitest

**Prerequisiti:** Piani 1a–1h completati e deployati.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/services/visit-generate-service.ts` | Modifica | Aggiunge Arca-only a buildCandidates |
| `backend/src/services/visit-generate-service.spec.ts` | Modifica | Aggiunge test Arca-only |
| `backend/src/db/migrations/109-course-events.sql` | Crea | Tabella system.course_events |
| `backend/src/db/repositories/course-events.ts` | Crea | CRUD course events |
| `backend/src/db/repositories/course-events.spec.ts` | Crea | Test TDD |
| `backend/src/services/visit-brief-service.ts` | Modifica | Aggiunge courseEvents nel brief |
| `backend/src/routes/visit-planning-router.ts` | Modifica | Endpoint CRUD course_events + replanning endpoint |
| `frontend/src/components/visit-planning/VisitStopCard.tsx` | Modifica | Pulsante 🔒 lock/unlock |
| `frontend/src/components/visit-planning/VisitStopCard.spec.tsx` | Modifica | Test lock button |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Modifica | Pulsante Rigenera + handler unlock |
| `frontend/src/services/visit-planning.service.ts` | Modifica | toggleLock(), regenerateRoute() |
| `frontend/src/components/visit-planning/VisitBriefPanel.tsx` | Modifica | Sezione corsi nel brief |
| `frontend/src/pages/CourseEventsPage.tsx` | Crea | UI gestione corsi/eventi |
| `frontend/src/AppRouter.tsx` | Modifica | Route /giri/corsi |

---

## Task 1 — Arca-only in buildCandidates

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.spec.ts`

- [ ] **Step 1.1: Aggiungi test Arca-only**

In `visit-generate-service.spec.ts`, aggiungi in fondo al describe('buildCandidates'):

```typescript
  test('include clienti Arca puri (senza match Archibald) con valore fresis', async () => {
    const arcaSubClient = {
      codice: 'C00999', ragione_sociale: 'Lab. Dentale Bianchi',
      localita: 'Salerno', prov: 'SA', indirizzo: 'Via Napoli 10', cap: '84100',
    };
    const fresisForArca = {
      sub_client_codice: 'C00999', localita: 'Salerno',
      n_docs: '3', valore: '1500.00', ultimo_doc: '2026-05-01T00:00:00Z',
      records: [{ archibaldOrderId: null, targetTotalWithVat: 1830 }],
    };

    let call = 0;
    const pool = {
      query: vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve({ rows: [] }); // archibald customers (empty)
        if (call === 2) return Promise.resolve({ rows: [] }); // fresis totals archibald
        if (call === 3) return Promise.resolve({ rows: [] }); // arch order totals
        if (call === 4) return Promise.resolve({ rows: [arcaSubClient] }); // arca sub_clients
        if (call === 5) return Promise.resolve({ rows: [fresisForArca] }); // fresis totals arca
        return Promise.resolve({ rows: [] });
      }),
    } as any;

    const result = await buildCandidates(pool, USER_ID, 'balanced');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].profile.sourceType).toBe('arca');
    expect(result[0].profile.sourceId).toBe('C00999');
  });
```

- [ ] **Step 1.2: Verifica fallisce**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/services/visit-generate-service.spec.ts 2>&1 | tail -5
```

- [ ] **Step 1.3: Estendi buildCandidates per Arca-only**

In `visit-generate-service.ts`, nella funzione `buildCandidates`, DOPO la query degli `archTotals` (query 3), aggiungi:

```typescript
  // Query 4: sub_clients Arca senza match Archibald (non distributor = Fresis)
  const { rows: arcaSubClients } = await pool.query(
    `SELECT sc.codice, sc.ragione_sociale, sc.localita, sc.prov,
            sc.indirizzo, sc.cap
     FROM shared.sub_clients sc
     WHERE NOT EXISTS (
       SELECT 1 FROM shared.sub_client_customer_matches m
       WHERE m.sub_client_codice = sc.codice
     )
     AND sc.localita IS NOT NULL AND sc.localita != ''`,
  );

  // Query 5: aggregazione fresis per sub_client_codice (solo Arca puri)
  const { rows: arcaFresisTotals } = await pool.query(
    `SELECT fh.sub_client_codice AS codice,
            ROUND((SUM(fh.target_total_with_vat) / 1.22)::numeric, 2) AS valore,
            COUNT(*)::text AS n_docs,
            MAX(fh.created_at) AS ultimo_doc,
            json_agg(json_build_object(
              'archibaldOrderId', fh.archibald_order_id,
              'targetTotalWithVat', fh.target_total_with_vat
            )) AS records
     FROM agents.fresis_history fh
     WHERE fh.user_id = $1
       AND fh.target_total_with_vat > 0
       AND NOT EXISTS (
         SELECT 1 FROM shared.sub_client_customer_matches m
         WHERE m.sub_client_codice = fh.sub_client_codice
       )
     GROUP BY fh.sub_client_codice`,
    [userId],
  );

  const arcaFresisMap = new Map(arcaFresisTotals.map(r => [r.codice as string, r]));
```

Poi, DOPO il blocco che calcola `profiled` per i clienti Archibald e PRIMA della deduplicazione, aggiungi il calcolo dei profili Arca:

```typescript
  // Calcola score per i clienti Arca puri
  const arcaValori: number[] = arcaSubClients
    .map(sc => {
      const fd = arcaFresisMap.get(sc.codice as string);
      if (!fd) return 0;
      const fresisRecords = Array.isArray(fd.records) ? fd.records as Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> : [];
      return calcValoreCliente(fresisRecords, []);
    })
    .filter(v => v > 0);

  const allValoriForNorm = [...filteredValori, ...arcaValori];

  const arcaProfiled: ScoredProfile[] = arcaSubClients
    .filter(sc => arcaFresisMap.has(sc.codice as string))
    .map(sc => {
      const fd = arcaFresisMap.get(sc.codice as string)!;
      const fresisRecords = Array.isArray(fd.records) ? fd.records as Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> : [];
      const valore = calcValoreCliente(fresisRecords, []);
      if (valore <= 0) return null;

      const lastStr = fd.ultimo_doc;
      const daysSinceLastOrder = lastStr
        ? Math.floor((Date.now() - new Date(lastStr as string).getTime()) / 86400000)
        : null;

      const nDocs = parseInt(fd.n_docs as string, 10);
      const avgCycleDays = (nDocs >= 3 && daysSinceLastOrder != null)
        ? Math.round(daysSinceLastOrder / nDocs * 1.2)
        : null;

      const riordino = calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays });
      const urgenza  = daysSinceLastOrder != null ? Math.min(daysSinceLastOrder / 180, 1) : 0.3;
      const valoreNorm = normalizePercentile(valore, allValoriForNorm);

      const breakdown = {
        valore: valoreNorm, riordino, urgenza,
        zona: 0.5, crossSell: 0, promozioni: 0,
        rischioClosure: 0, penalitaDati: 0.02, // piccola penalità: dati meno completi
      };

      const profile: CustomerProfile = {
        sourceType: 'arca', sourceId: sc.codice as string,
        displayName: sc.ragione_sociale as string,
        street: sc.indirizzo as string | null,
        postalCode: sc.cap as string | null,
        city: sc.localita as string,
        province: sc.prov as string | null,
        phone: null, email: null, vatNumber: null,
        lat: null, lng: null, geoQuality: 'unknown',
        isDistributor: false,
        matchedSources: [{ type: 'arca', id: sc.codice as string, name: sc.ragione_sociale as string }],
      };

      return {
        profile,
        score: calcScoreTotal(breakdown, mode),
        breakdown,
        daysSinceLastOrder,
        valore,
      };
    })
    .filter((p): p is ScoredProfile => p !== null);

  // Combina Archibald + Arca puri, poi deduplica
  const allProfiled = [...profiled, ...arcaProfiled];
  const deduped = deduplicateByStudio(allProfiled.map(p => p.profile));
  const dedupedIds = new Set(deduped.map(p => p.sourceId));
  return allProfiled
    .filter(p => dedupedIds.has(p.profile.sourceId))
    .sort((a, b) => b.score - a.score);
```

**ATTENZIONE**: Rimuovi il vecchio blocco `return profiled.filter(...).sort(...)` che era l'ultimo statement di `buildCandidates`.

- [ ] **Step 1.4: Verifica test passano**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/services/visit-generate-service.spec.ts 2>&1 | tail -8
npm run build 2>&1 | tail -3
```

Atteso: 4 test passano.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts \
        archibald-web-app/backend/src/services/visit-generate-service.spec.ts
git commit -m "feat(giri-visite): buildCandidates include clienti Arca-only (sub_clients senza match Archibald)"
```

---

## Task 2 — Lock/Unlock tappa: UI + endpoint

**Files:**
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx`
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 2.1: Aggiungi toggleLock al service**

In fondo a `visit-planning.service.ts`:

```typescript
export async function toggleStopLock(
  sessionId: string,
  stopId: string,
  locked: boolean,
): Promise<VisitPlanningStop> {
  return updateStop(sessionId, stopId, { locked });
}
```

- [ ] **Step 2.2: Aggiungi prop onToggleLock a VisitStopCard**

Modifica il tipo Props in `VisitStopCard.tsx`:

```typescript
type Props = {
  stop:                       VisitPlanningStop;
  onStatusChange:             (stopId: string, status: StopStatus) => void;
  onNavigate:                 (stop: VisitPlanningStop) => void;
  onOpenBrief?:               (stop: VisitPlanningStop) => void;
  onConfirmWithAppointment?:  (stop: VisitPlanningStop) => void;
  onToggleLock?:              (stop: VisitPlanningStop) => void;
};
```

Aggiorna la destructuring:

```typescript
export function VisitStopCard({ stop, onStatusChange: _onStatusChange, onNavigate, onOpenBrief, onConfirmWithAppointment, onToggleLock }: Props) {
```

Nel div delle azioni (dove c'è già il pulsante 🧭), sostituisci lo span statico `{stop.locked && <span>🔒</span>}` con un pulsante cliccabile. Trova la riga `{stop.locked && <span style={{ fontSize: 10 }}>🔒</span>}` nel componente e sostituiscila con:

```tsx
          {onToggleLock && (
            <button
              title={stop.locked ? 'Sblocca tappa' : 'Blocca tappa (priorità massima)'}
              onClick={() => onToggleLock(stop)}
              style={{
                background: stop.locked ? '#7c3aed' : '#f1f5f9',
                color: stop.locked ? 'white' : '#374151',
                border: 'none', borderRadius: 6,
                padding: '4px 8px', fontSize: 12, cursor: 'pointer',
              }}
            >{stop.locked ? '🔒' : '🔓'}</button>
          )}
```

- [ ] **Step 2.3: Aggiungi test**

In `VisitStopCard.spec.tsx`, aggiungi in fondo al describe:

```typescript
  test('mostra pulsante lock se onToggleLock fornito', () => {
    const onToggleLock = vi.fn();
    render(<VisitStopCard
      stop={makeStop()}
      onStatusChange={vi.fn()}
      onNavigate={vi.fn()}
      onToggleLock={onToggleLock}
    />);
    // Stop non locked → pulsante 🔓
    const btn = screen.getByTitle('Blocca tappa (priorità massima)');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  test('mostra pulsante 🔒 se stop locked', () => {
    render(<VisitStopCard
      stop={makeStop({ locked: true })}
      onStatusChange={vi.fn()}
      onNavigate={vi.fn()}
      onToggleLock={vi.fn()}
    />);
    expect(screen.getByTitle('Sblocca tappa')).toBeInTheDocument();
  });
```

- [ ] **Step 2.4: Esegui test**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend
npx vitest run src/components/visit-planning/VisitStopCard.spec.tsx 2>&1 | tail -5
```

Atteso: 10 test passano (8 precedenti + 2 nuovi).

- [ ] **Step 2.5: Integra in VisitPlanningSessionPage**

Aggiungi import del service (già importato come `* as vpService`):

```typescript
import { toggleStopLock } from '../services/visit-planning.service';
```

Aggiungi handler nel componente:

```typescript
  const handleToggleLock = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    await toggleStopLock(sessionId, stop.id, !stop.locked);
    load();
  };
```

Aggiungi la prop nelle VisitStopCard:

```tsx
              onToggleLock={handleToggleLock}
```

- [ ] **Step 2.6: Type-check + test + commit**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx \
        archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): lock/unlock tappa — pulsante 🔒/🔓 in VisitStopCard"
```

---

## Task 3 — Replanning (Rigenera giro)

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 3.1: Aggiungi endpoint POST /sessions/:id/regenerate nel router**

PRIMA di `return router`, aggiungi:

```typescript
  // ── Rigenera giro: elimina stop non-locked, re-genera ─────────────────
  router.post('/sessions/:sessionId/regenerate', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const sid    = req.params.sessionId as VisitPlanningSessionId;

      const session = await getSession(pool, userId, sid);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      // 1. Elimina tutte le stop non-locked (soft delete: status='removed')
      await pool.query(
        `UPDATE agents.visit_planning_stops
         SET status = 'removed', updated_at = NOW()
         WHERE session_id = $1 AND user_id = $2 AND locked = FALSE`,
        [sid, userId],
      );

      // 2. Leggi start point e stop date dalla sessione
      let startLat = session.startLat;
      let startLng = session.startLng;
      if (startLat == null || startLng == null) {
        const { rows: userRows } = await pool.query(
          'SELECT home_lat, home_lng FROM agents.users WHERE id = $1', [userId],
        );
        if (userRows[0]) {
          startLat = userRows[0].home_lat != null ? parseFloat(userRows[0].home_lat as string) : null;
          startLng = userRows[0].home_lng != null ? parseFloat(userRows[0].home_lng as string) : null;
        }
      }

      const stopDate = session.startDate;

      // 3. Rigenera (usa stesso endpoint generate logic)
      const stops = session.horizon === 'week'
        ? await generateWeeklyDistribution(pool, userId, sid, session.mode, stopDate, startLat, startLng)
        : await generateVisitRoute(pool, userId, sid, session.mode, session.horizon, startLat, startLng, stopDate);

      res.status(201).json({ regenerated: stops.length, stops });
    } catch (err) {
      logger.error('regenerate error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 3.2: Aggiungi regenerateRoute al service frontend**

In fondo a `visit-planning.service.ts`:

```typescript
export async function regenerateRoute(
  sessionId: string,
): Promise<{ regenerated: number; stops: VisitPlanningStop[] }> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/regenerate`, { method: 'POST' });
  if (!res.ok) throw new Error(`regenerateRoute ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3.3: Aggiungi pulsante "Rigenera" in VisitPlanningSessionPage**

Importa:

```typescript
import { regenerateRoute } from '../services/visit-planning.service';
```

Aggiungi stato e handler:

```typescript
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    if (!sessionId) return;
    if (!confirm('Vuoi rigenerare il giro? Le tappe non bloccate verranno sostituite.')) return;
    setRegenerating(true);
    try {
      await regenerateRoute(sessionId);
      load();
    } catch (err) {
      console.error('regenerate error', err);
    } finally {
      setRegenerating(false);
    }
  };
```

Nel JSX dell'header sessione (dove c'è il titolo), aggiungi il pulsante Rigenera accanto al tasto ← back:

```tsx
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          title="Rigenera giro (mantiene tappe bloccate)"
          style={{
            marginLeft: 'auto', background: regenerating ? '#e5e7eb' : '#eff6ff',
            color: regenerating ? '#9ca3af' : '#2563eb',
            border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer',
          }}
        >{regenerating ? '⏳' : '🔄 Rigenera'}</button>
```

- [ ] **Step 3.4: Build backend + type-check frontend + commit**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): endpoint POST /sessions/:id/regenerate + pulsante Rigenera in SessionPage"
```

---

## Task 4 — Penalità saltati: urgenza incrementale

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`

La spec originale richiedeva che i clienti saltati frequentemente abbiano un'urgenza maggiore nei giri successivi. Implementiamo tramite `customer_visit_logs`: se il cliente ha stop con status='skipped' negli ultimi 90 giorni, aggiungiamo un bonus urgenza.

- [ ] **Step 4.1: Aggiungi query skip history in buildCandidates**

In `visit-generate-service.ts`, nella funzione `buildCandidates`, DOPO le 3 query esistenti (customers, fresis, arch), aggiungi:

```typescript
  // Query skip history: clienti saltati di recente ottengono urgenza bonus
  const { rows: skipHistory } = await pool.query(
    `SELECT source_id, COUNT(*) AS times_skipped
     FROM agents.visit_planning_stops vps
     JOIN agents.visit_planning_sessions vss ON vss.id = vps.session_id
     WHERE vss.user_id = $1
       AND vps.status = 'skipped'
       AND vps.updated_at >= NOW() - INTERVAL '90 days'
       AND vps.source_type = 'archibald'
     GROUP BY source_id`,
    [userId],
  );
  // Mappa: erp_id → numero di volte saltato negli ultimi 90gg
  const skipMap = new Map(skipHistory.map(r => [r.source_id as string, Number(r.times_skipped)]));
```

Poi nel calcolo del breakdown per ogni cliente Archibald, aggiungi il bonus urgenza:

```typescript
    // Bonus urgenza per clienti saltati: ogni skip recente +0.15 (max 1.0)
    const skipBonus = Math.min((skipMap.get(s.erpId) ?? 0) * 0.15, 0.45);
    const urgenzaConBonus = Math.min(urgenza + skipBonus, 1.0);

    const breakdown = {
      valore: valoreNorm, riordino: s.riordino, urgenza: urgenzaConBonus, // ← usa urgenzaConBonus
      zona: 0.5, crossSell: 0, promozioni: 0,
      rischioClosure: 0, penalitaDati: s.penalitaDati,
    };
```

Fai lo stesso per i profili Arca (usa `skipMap` se il sub_client ha un codice corrispondente, ma per Arca-only il map è per source_type='arca' — la query attuale filtra solo archibald. Per semplicità, estendi la query skip per includere anche arca):

Modifica la query skipHistory per includere entrambe le sorgenti:

```typescript
  const { rows: skipHistory } = await pool.query(
    `SELECT source_type, source_id, COUNT(*) AS times_skipped
     FROM agents.visit_planning_stops vps
     JOIN agents.visit_planning_sessions vss ON vss.id = vps.session_id
     WHERE vss.user_id = $1
       AND vps.status = 'skipped'
       AND vps.updated_at >= NOW() - INTERVAL '90 days'
     GROUP BY source_type, source_id`,
    [userId],
  );
  // Mappa: "type:id" → count
  const skipMap = new Map(
    skipHistory.map(r => [`${r.source_type}:${r.source_id}`, Number(r.times_skipped)])
  );
```

E usa `skipMap.get('archibald:' + s.erpId)` e `skipMap.get('arca:' + sc.codice)` rispettivamente.

- [ ] **Step 4.2: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 4.3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts
git commit -m "feat(giri-visite): penalità saltati — urgenza incrementale per clienti skippati di recente"
```

---

## Task 5 — Corsi/eventi Massironi: migrazione + repository

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/109-course-events.sql`
- Create: `archibald-web-app/backend/src/db/repositories/course-events.ts`
- Create: `archibald-web-app/backend/src/db/repositories/course-events.spec.ts`

- [ ] **Step 5.1: Crea la migrazione**

Crea `archibald-web-app/backend/src/db/migrations/109-course-events.sql`:

```sql
-- Migration 109: Corsi/eventi formativi per suggerimenti giro visite
-- Usati per il caso "Massironi a Castellammare: se prendi X€ di frese, corso gratis"

BEGIN;

CREATE TABLE IF NOT EXISTS system.course_events (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,                          -- "Corso Massironi — Implantologia"
  instructor    TEXT,                                   -- "Massironi"
  city          TEXT NOT NULL,                          -- "Castellammare di Stabia"
  provincia     TEXT,                                   -- "NA"
  event_date    DATE NOT NULL,                          -- data evento
  cost_eur      NUMERIC(10,2),                          -- costo iscrizione €500
  product_categories TEXT[] NOT NULL DEFAULT '{}',      -- ['Frese carburo', 'Implantologia']
  threshold_eur NUMERIC(10,2),                          -- spesa soglia per regalo corso: €1500
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_events_city_date
  ON system.course_events (city, event_date)
  WHERE is_active = TRUE;

COMMIT;
```

- [ ] **Step 5.2: Applica la migrazione in produzione**

```bash
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald" \
  < /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/db/migrations/109-course-events.sql
```

Atteso: `CREATE TABLE`, `CREATE INDEX`, `COMMIT`.

- [ ] **Step 5.3: Crea il test del repository**

Crea `archibald-web-app/backend/src/db/repositories/course-events.spec.ts`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import { listUpcomingCourseEventsForCity, createCourseEvent, deleteCourseEvent } from './course-events';

describe('listUpcomingCourseEventsForCity', () => {
  test('restituisce corsi per città e data futura', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 1, title: 'Corso Massironi', instructor: 'Massironi',
      city: 'Castellammare di Stabia', provincia: 'NA',
      event_date: '2026-07-15', cost_eur: '500.00',
      product_categories: ['Frese carburo'], threshold_eur: '1500.00',
      notes: null,
    }] }) } as any;
    const result = await listUpcomingCourseEventsForCity(pool, 'Castellammare di Stabia', 60);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Corso Massironi');
    expect(result[0].thresholdEur).toBe(1500);
  });

  test('restituisce array vuoto se nessun corso', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await listUpcomingCourseEventsForCity(pool, 'Milano', 60);
    expect(result).toHaveLength(0);
  });
});

describe('createCourseEvent', () => {
  test('chiama INSERT e ritorna evento creato', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      id: 1, title: 'Nuovo corso', instructor: null, city: 'Napoli', provincia: 'NA',
      event_date: '2026-08-01', cost_eur: '300.00', product_categories: [],
      threshold_eur: null, notes: null, is_active: true,
    }] }) } as any;
    const result = await createCourseEvent(pool, {
      title: 'Nuovo corso', city: 'Napoli', eventDate: '2026-08-01',
      costEur: 300, productCategories: [], isActive: true,
    });
    expect(result.title).toBe('Nuovo corso');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5.4: Verifica test falliscono**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/db/repositories/course-events.spec.ts 2>&1 | tail -3
```

- [ ] **Step 5.5: Implementa il repository**

Crea `archibald-web-app/backend/src/db/repositories/course-events.ts`:

```typescript
import type { DbPool } from '../pool';

export type CourseEvent = {
  id:                 number;
  title:              string;
  instructor:         string | null;
  city:               string;
  provincia:          string | null;
  eventDate:          string; // YYYY-MM-DD
  costEur:            number | null;
  productCategories:  string[];
  thresholdEur:       number | null;
  notes:              string | null;
  isActive:           boolean;
};

export type CreateCourseEventInput = {
  title:              string;
  instructor?:        string | null;
  city:               string;
  provincia?:         string | null;
  eventDate:          string;
  costEur?:           number | null;
  productCategories:  string[];
  thresholdEur?:      number | null;
  notes?:             string | null;
  isActive:           boolean;
};

function rowToEvent(r: Record<string, unknown>): CourseEvent {
  return {
    id:                r.id as number,
    title:             r.title as string,
    instructor:        r.instructor as string | null,
    city:              r.city as string,
    provincia:         r.provincia as string | null,
    eventDate:         typeof r.event_date === 'string' ? r.event_date : (r.event_date as Date).toISOString().slice(0, 10),
    costEur:           r.cost_eur != null ? parseFloat(r.cost_eur as string) : null,
    productCategories: (r.product_categories as string[]) ?? [],
    thresholdEur:      r.threshold_eur != null ? parseFloat(r.threshold_eur as string) : null,
    notes:             r.notes as string | null,
    isActive:          r.is_active as boolean,
  };
}

// Corsi attivi per una città entro i prossimi N giorni
export async function listUpcomingCourseEventsForCity(
  pool: DbPool,
  city: string,
  daysAhead: number,
): Promise<CourseEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM system.course_events
     WHERE is_active = TRUE
       AND UPPER(TRIM(city)) = UPPER(TRIM($1))
       AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2::integer
     ORDER BY event_date`,
    [city, daysAhead],
  );
  return rows.map(rowToEvent);
}

export async function listAllCourseEvents(pool: DbPool): Promise<CourseEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM system.course_events ORDER BY event_date DESC LIMIT 200`,
  );
  return rows.map(rowToEvent);
}

export async function createCourseEvent(
  pool: DbPool,
  input: CreateCourseEventInput,
): Promise<CourseEvent> {
  const { rows } = await pool.query(
    `INSERT INTO system.course_events
       (title, instructor, city, provincia, event_date, cost_eur,
        product_categories, threshold_eur, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [input.title, input.instructor ?? null, input.city, input.provincia ?? null,
     input.eventDate, input.costEur ?? null,
     input.productCategories, input.thresholdEur ?? null,
     input.notes ?? null, input.isActive],
  );
  if (!rows[0]) throw new Error('Failed to create course event');
  return rowToEvent(rows[0]);
}

export async function deleteCourseEvent(pool: DbPool, id: number): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM system.course_events WHERE id = $1',
    [id],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Course event not found');
}
```

- [ ] **Step 5.6: Verifica test passano**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/db/repositories/course-events.spec.ts 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

- [ ] **Step 5.7: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/db/migrations/109-course-events.sql \
        archibald-web-app/backend/src/db/repositories/course-events.ts \
        archibald-web-app/backend/src/db/repositories/course-events.spec.ts
git commit -m "feat(giri-visite): migrazione 109 course_events + repository CRUD"
```

---

## Task 6 — Corsi in visit-brief + endpoint CRUD + UI

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-brief-service.ts`
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Create: `archibald-web-app/frontend/src/pages/CourseEventsPage.tsx`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx`

- [ ] **Step 6.1: Aggiungi corsi nel VisitBriefResult**

In `visit-brief-service.ts`, aggiorna il tipo `VisitBriefResult`:

```typescript
export type CourseEventBrief = {
  id:           number;
  title:        string;
  instructor:   string | null;
  eventDate:    string;
  costEur:      number | null;
  thresholdEur: number | null;
  productCategories: string[];
};

export type VisitBriefResult = {
  lastOrders:          VisitBriefOrder[];
  reorderCycleDays:    number | null;
  daysSinceLastOrder:  number | null;
  reorderProbability:  'high' | 'medium' | 'low' | 'unknown';
  suggestedCategories: string[];
  activePromotions:    Array<{ id: string; name: string; tagline: string | null; validTo: string }>;
  openReminders:       Array<{ id: number; note: string | null; dueAt: string }>;
  upcomingCourses:     CourseEventBrief[];  // ← nuovo campo
};
```

- [ ] **Step 6.2: Aggiungi import e query corsi in buildVisitBrief**

In cima a `visit-brief-service.ts`:

```typescript
import { listUpcomingCourseEventsForCity } from '../db/repositories/course-events';
```

Alla fine di `buildVisitBrief`, prima del `return`, aggiungi:

```typescript
  // 7. Corsi/eventi nelle prossime 8 settimane per la città del cliente
  let upcomingCourses: CourseEventBrief[] = [];
  if (sourceType === 'archibald') {
    // Leggi la città del cliente dalla prima query (già in scope)
    // Per semplicità, la city viene dal profile che buildVisitBrief non ha direttamente.
    // Usiamo una query aggiuntiva per la città.
    const { rows: cityRows } = await pool.query(
      'SELECT city FROM agents.customers WHERE user_id = $1 AND erp_id = $2 AND deleted_at IS NULL',
      [userId, sourceId],
    );
    const city = cityRows[0]?.city as string | null;
    if (city) {
      try {
        const courses = await listUpcomingCourseEventsForCity(pool, city, 56); // 8 settimane
        upcomingCourses = courses.map(c => ({
          id: c.id, title: c.title, instructor: c.instructor,
          eventDate: c.eventDate, costEur: c.costEur,
          thresholdEur: c.thresholdEur, productCategories: c.productCategories,
        }));
      } catch {
        // fail-silent
      }
    }
  }

  return {
    lastOrders: orders.slice(0, 10),
    reorderCycleDays,
    daysSinceLastOrder,
    reorderProbability,
    suggestedCategories: await getSuggestedCategories(pool, userId, sourceType, sourceId),
    activePromotions,
    openReminders,
    upcomingCourses, // ← aggiunto
  };
```

**Nota**: se nel return `suggestedCategories` è già chiamato come `await getSuggestedCategories(...)`, aggiungi solo `upcomingCourses` al return object. Non duplicare la chiamata.

- [ ] **Step 6.3: Aggiungi endpoint CRUD corsi nel router**

In `visit-planning-router.ts`, aggiungi import:

```typescript
import {
  listAllCourseEvents, createCourseEvent, deleteCourseEvent,
} from '../db/repositories/course-events';
```

Aggiungi endpoint PRIMA di `return router`:

```typescript
  // ── Corsi/eventi formativi ─────────────────────────────────────────────
  const CourseEventSchema = z.object({
    title:             z.string().min(1).max(200),
    instructor:        z.string().max(100).nullable().default(null),
    city:              z.string().min(1).max(100),
    provincia:         z.string().max(5).nullable().default(null),
    eventDate:         z.string().date(),
    costEur:           z.number().positive().nullable().default(null),
    productCategories: z.array(z.string()).default([]),
    thresholdEur:      z.number().positive().nullable().default(null),
    notes:             z.string().max(500).nullable().default(null),
    isActive:          z.boolean().default(true),
  });

  router.get('/courses', async (_req, res) => {
    try {
      const courses = await listAllCourseEvents(pool);
      res.json(courses);
    } catch (err) {
      logger.error('listAllCourseEvents error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/courses', async (req, res) => {
    const parsed = CourseEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const course = await createCourseEvent(pool, parsed.data);
      res.status(201).json(course);
    } catch (err) {
      logger.error('createCourseEvent error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/courses/:id', async (req, res) => {
    try {
      await deleteCourseEvent(pool, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      logger.error('deleteCourseEvent error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 6.4: Aggiorna tipo VisitBrief nel frontend**

In `archibald-web-app/frontend/src/types/visit-planning.ts`, aggiungi dopo `VisitBriefReminder`:

```typescript
export type VisitBriefCourse = {
  id:               number;
  title:            string;
  instructor:       string | null;
  eventDate:        string;
  costEur:          number | null;
  thresholdEur:     number | null;
  productCategories: string[];
};
```

E nel tipo `VisitBrief`, aggiungi il campo:

```typescript
  upcomingCourses: VisitBriefCourse[];
```

- [ ] **Step 6.5: Aggiorna VisitBriefPanel per mostrare corsi**

In `VisitBriefPanel.tsx`, aggiungi import del tipo:

```typescript
import type { VisitBrief, VisitOutcome, VisitBriefCourse } from '../../types/visit-planning';
```

Nel JSX, aggiungi sezione corsi DOPO la sezione promozioni/suggerimenti, dentro il blocco `hasSuggestions` o come sezione separata PRIMA della sezione "Esito visita":

```tsx
      {/* ── Corsi/eventi formativi ── */}
      {brief.upcomingCourses?.length > 0 && (
        <div style={{ ...CARD, borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
          <div style={{ ...SECTION_TITLE, color: '#b45309' }}>🎓 Corsi in arrivo</div>
          {brief.upcomingCourses.map(c => (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                📅 {c.eventDate.slice(0, 10)} — <b>{c.title}</b>
                {c.instructor ? ` (${c.instructor})` : ''}
              </div>
              {c.costEur != null && (
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Costo: €{c.costEur.toFixed(0)}
                  {c.thresholdEur != null && (
                    <span style={{ color: '#16a34a', marginLeft: 6 }}>
                      — 🎁 Gratis con acquisto ≥€{c.thresholdEur.toFixed(0)}
                    </span>
                  )}
                </div>
              )}
              {c.productCategories.length > 0 && (
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  Prodotti: {c.productCategories.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 6.6: Aggiungi API corsi al service frontend + CourseEventsPage**

In `visit-planning.service.ts`:

```typescript
export type CourseEvent = {
  id: number; title: string; instructor: string | null;
  city: string; provincia: string | null; eventDate: string;
  costEur: number | null; productCategories: string[];
  thresholdEur: number | null; notes: string | null; isActive: boolean;
};

export async function listCourseEvents(): Promise<CourseEvent[]> {
  const res = await fetchWithRetry(`${BASE}/courses`);
  if (!res.ok) throw new Error(`listCourseEvents ${res.status}`);
  return res.json();
}

export async function createCourseEventFE(input: Omit<CourseEvent, 'id'>): Promise<CourseEvent> {
  const res = await fetchWithRetry(`${BASE}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createCourseEvent ${res.status}`);
  return res.json();
}

export async function deleteCourseEventFE(id: number): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/courses/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteCourseEvent ${res.status}`);
}
```

Crea `archibald-web-app/frontend/src/pages/CourseEventsPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listCourseEvents, createCourseEventFE, deleteCourseEventFE, type CourseEvent,
} from '../services/visit-planning.service';

const MONTHS = ['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

export function CourseEventsPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', instructor: '', city: '', provincia: '',
    eventDate: new Date().toISOString().slice(0,10),
    costEur: '', productCategories: '', thresholdEur: '', notes: '', isActive: true,
  });

  const load = () => {
    setLoading(true);
    listCourseEvents()
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCourseEventFE({
        title: form.title, instructor: form.instructor || null,
        city: form.city, provincia: form.provincia || null,
        eventDate: form.eventDate,
        costEur: form.costEur ? parseFloat(form.costEur) : null,
        productCategories: form.productCategories ? form.productCategories.split(',').map(s => s.trim()).filter(Boolean) : [],
        thresholdEur: form.thresholdEur ? parseFloat(form.thresholdEur) : null,
        notes: form.notes || null, isActive: true,
      });
      setShowForm(false);
      setForm({ title:'', instructor:'', city:'', provincia:'', eventDate: new Date().toISOString().slice(0,10), costEur:'', productCategories:'', thresholdEur:'', notes:'', isActive: true });
      load();
    } catch (err) { alert('Errore: ' + (err instanceof Error ? err.message : String(err))); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo corso?')) return;
    try { await deleteCourseEventFE(id); load(); }
    catch (err) { alert('Errore: ' + (err instanceof Error ? err.message : String(err))); }
  };

  const INPUT = { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' } as const;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎓 Corsi & Eventi</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Caricamento...</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>{courses.length} eventi totali</div>
            <button onClick={() => setShowForm(v => !v)}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
              + Aggiungi
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input placeholder="Titolo *" required value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} style={INPUT} />
                <input placeholder="Formatore" value={form.instructor} onChange={e => setForm(f => ({...f, instructor: e.target.value}))} style={INPUT} />
                <input placeholder="Città *" required value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} style={INPUT} />
                <input placeholder="Provincia (es. NA)" value={form.provincia} onChange={e => setForm(f => ({...f, provincia: e.target.value}))} style={INPUT} />
                <input type="date" required value={form.eventDate} onChange={e => setForm(f => ({...f, eventDate: e.target.value}))} style={INPUT} />
                <input placeholder="Costo €" type="number" min="0" value={form.costEur} onChange={e => setForm(f => ({...f, costEur: e.target.value}))} style={INPUT} />
                <input placeholder="Categorie prodotti (virgola)" value={form.productCategories} onChange={e => setForm(f => ({...f, productCategories: e.target.value}))} style={INPUT} />
                <input placeholder="Soglia acquisto per corso gratis €" type="number" min="0" value={form.thresholdEur} onChange={e => setForm(f => ({...f, thresholdEur: e.target.value}))} style={INPUT} />
              </div>
              <input placeholder="Note" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} style={{...INPUT, marginBottom: 10}} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Salva</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
              </div>
            </form>
          )}

          {courses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
              Nessun corso. Aggiungi i prossimi eventi formativi per ricevere suggerimenti durante le visite.
            </div>
          ) : (
            courses.map(c => (
              <div key={c.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>📅 {c.eventDate.slice(0,10)} — {c.title}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      {c.city}{c.provincia ? ` (${c.provincia})` : ''}
                      {c.instructor ? ` · Formatore: ${c.instructor}` : ''}
                    </div>
                    {c.costEur != null && (
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                        💶 €{c.costEur}
                        {c.thresholdEur != null && <span style={{ color: '#16a34a' }}> — 🎁 gratis con ≥€{c.thresholdEur} di acquisto</span>}
                      </div>
                    )}
                    {c.productCategories.length > 0 && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Categorie: {c.productCategories.join(', ')}</div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(c.id)}
                    style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
                    Elimina
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6.7: Aggiungi route /giri/corsi + link**

In `AppRouter.tsx`, aggiungi import e route (PRIMA di `/giri/:sessionId`):

```typescript
import { CourseEventsPage } from './pages/CourseEventsPage';
```

```tsx
<Route path="/giri/corsi" element={<CourseEventsPage />} />
```

In `VisitPlanningPage.tsx`, accanto al link feste patronali esistente, aggiungi:

```tsx
        <a href="/giri/corsi" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', marginLeft: 16 }}>
          🎓 Gestisci corsi →
        </a>
```

- [ ] **Step 6.8: Build + type-check + test + commit + push**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

```bash
cd /Users/hatholdir/Downloads/Archibald
git add \
  archibald-web-app/backend/src/services/visit-brief-service.ts \
  archibald-web-app/backend/src/routes/visit-planning-router.ts \
  archibald-web-app/frontend/src/types/visit-planning.ts \
  archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.tsx \
  archibald-web-app/frontend/src/services/visit-planning.service.ts \
  archibald-web-app/frontend/src/pages/CourseEventsPage.tsx \
  archibald-web-app/frontend/src/AppRouter.tsx \
  archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx
git commit -m "feat(giri-visite): corsi/eventi Massironi — tabella 109, repository, visit-brief, UI CourseEventsPage"
git push origin master
```

---

## Checklist Gate Piano 1i completato

- [ ] `buildCandidates` include clienti Arca-only con valore fresis
- [ ] Sessione generata include stop con `sourceType='arca'`
- [ ] VisitStopCard mostra 🔒/🔓 cliccabili, click toglia/imposta locked
- [ ] `POST /sessions/:id/regenerate` → stop non-locked eliminate + nuove stop generate
- [ ] Pulsante "Rigenera" in SessionPage funzionante
- [ ] Clienti saltati di recente appaiono con urgenza maggiore nella sessione successiva
- [ ] `system.course_events` tabella esistente in produzione
- [ ] Visit-brief include `upcomingCourses` per città del cliente
- [ ] VisitBriefPanel mostra sezione 🎓 corsi se presenti
- [ ] `/giri/corsi` pagina accessibile, form aggiungi/elimina funzionanti
- [ ] Build + test passano su backend e frontend
