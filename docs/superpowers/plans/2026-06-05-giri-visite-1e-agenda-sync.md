# Giri Visite — Piano 1e: Fase 6 — Agenda Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando una tappa viene confermata, creare automaticamente un appuntamento in `agents.appointments`. La VisitStopCard espone un pulsante "📅 Conf." e il stato `to_call` serve per tappe che richiedono una telefonata prima.

**Architecture:** Singolo endpoint atomico `POST /sessions/:id/stops/:stopId/confirm-with-appointment` che aggiorna stop status='confirmed' e crea appuntamento. Fail-open: se createAppointment fallisce, la stop resta confermata e si logga l'errore. Frontend aggiunge prop opzionale `onConfirmWithAppointment` a VisitStopCard.

**Tech Stack:** Express, TypeScript strict, pg, Zod, React 19, Vitest, supertest, @testing-library/react

**Prerequisiti:** Piani 1a–1d completati e deployati.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/routes/visit-planning-router.ts` | Modifica | Aggiunge endpoint confirm-with-appointment |
| `backend/src/routes/visit-planning-router.spec.ts` | Modifica | Aggiunge test endpoint |
| `frontend/src/services/visit-planning.service.ts` | Modifica | Aggiunge confirmWithAppointment() |
| `frontend/src/components/visit-planning/VisitStopCard.tsx` | Modifica | Aggiunge pulsante Conf. |
| `frontend/src/components/visit-planning/VisitStopCard.spec.tsx` | Modifica | Aggiunge test pulsante |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Modifica | Gestisce handleConfirmWithAppointment |

---

## Task 1 — Backend: endpoint confirm-with-appointment

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.spec.ts`

- [ ] **Step 1.1: Leggi la firma di createAppointment**

```bash
grep -n "createAppointment\|export async function create\|AppointmentInput" \
  archibald-web-app/backend/src/db/repositories/appointments.ts | head -15
```

Usa la firma trovata nei passi successivi.

- [ ] **Step 1.2: Aggiungi import al router**

In cima a `visit-planning-router.ts`, dopo gli import esistenti:

```typescript
import { createAppointment } from '../db/repositories/appointments';
```

- [ ] **Step 1.3: Aggiungi endpoint PRIMA di `return router`**

```typescript
  // ── Conferma tappa + crea appuntamento agenda ─────────────────────────
  router.post('/sessions/:sessionId/stops/:stopId/confirm-with-appointment', async (req, res) => {
    try {
      const userId  = (req as AuthRequest).user!.userId;
      const stopId  = req.params.stopId  as VisitPlanningStopId;
      const sid     = req.params.sessionId as VisitPlanningSessionId;

      // Leggi la stop per avere displayName, stopDate, sourceId, estimatedArrival
      const stops = await listStops(pool, userId, sid);
      const stop  = stops.find(s => s.id === stopId);
      if (!stop) return res.status(404).json({ error: 'Stop not found' });

      // 1. Conferma la tappa
      const confirmedStop = await updateStop(pool, userId, stopId, { status: 'confirmed' });

      // 2. Crea appuntamento (fail-open: log se fallisce, non rollback)
      let appointment: { id: string; title: string } | null = null;
      try {
        const startAt = stop.estimatedArrival
          ?? `${stop.stopDate}T09:00:00.000Z`;
        const startDate = new Date(startAt);
        const endDate   = new Date(startDate.getTime() + stop.visitMinutes * 60000);

        const apt = await createAppointment(pool, {
          userId,
          title:           `Visita ${stop.displayName}`,
          customerErpId:   stop.sourceType === 'archibald' ? stop.sourceId : null,
          startAt:         startDate.toISOString(),
          endAt:           endDate.toISOString(),
          status:          'scheduled',
          description:     `Generato automaticamente da giro visite sessione ${sid}`,
        });
        appointment = { id: apt.id, title: apt.title };
      } catch (aptErr) {
        logger.error('createAppointment fail (non-blocking)', { aptErr });
      }

      res.status(201).json({ stop: confirmedStop, appointment });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      logger.error('confirmWithAppointment error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 1.4: Aggiungi test nel file spec**

Apri `visit-planning-router.spec.ts` e aggiungi in fondo:

```typescript
describe('POST /api/visit-planning/sessions/:sessionId/stops/:stopId/confirm-with-appointment', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app)
      .post('/api/visit-planning/sessions/sess-1/stops/stop-1/confirm-with-appointment')
      .send({});
    expect(res.status).toBe(401);
  });

  test('restituisce 201 con stop confermata e appointment', async () => {
    const STOP_ROW = {
      id: 'stop-uuid-1', session_id: 'sess-uuid-1', user_id: USER_ID,
      source_type: 'archibald', source_id: '55.374', display_name: 'Dr. Rossi',
      appointment_id: null, stop_date: '2026-06-06', sequence: 1,
      status: 'confirmed', locked: false,
      estimated_arrival: '2026-06-06T09:00:00Z', estimated_departure: null,
      visit_minutes: 30, travel_minutes_from_previous: null, distance_km_from_previous: null,
      score_total: null, score_breakdown_json: {}, recommendation_reasons: [], alerts: [],
      manual_note: null, skip_reason: null, visited_at: null,
      created_at: new Date(), updated_at: new Date(),
    };
    const APT_ROW = {
      id: 'apt-uuid-1', user_id: USER_ID, title: 'Visita Dr. Rossi',
      customer_erp_id: '55.374', start_at: new Date('2026-06-06T09:00:00Z'),
      end_at: new Date('2026-06-06T09:30:00Z'), status: 'scheduled',
      description: null, created_at: new Date(), updated_at: new Date(),
    };

    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [STOP_ROW], rowCount: 1 })   // listStops
        .mockResolvedValueOnce({ rows: [STOP_ROW], rowCount: 1 })   // updateStop
        .mockResolvedValueOnce({ rows: [APT_ROW], rowCount: 1 }),   // createAppointment
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as any;

    const deps = makeDeps([STOP_ROW]);
    (deps as any).pool = mockPool;
    const app  = createApp(deps);
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res  = await request(app)
      .post('/api/visit-planning/sessions/sess-uuid-1/stops/stop-uuid-1/confirm-with-appointment')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('stop');
    expect(res.body).toHaveProperty('appointment');
  });
});
```

- [ ] **Step 1.5: Esegui test backend**

```bash
cd archibald-web-app/backend
npx vitest run src/routes/visit-planning-router.spec.ts 2>&1 | tail -8
npm run build 2>&1 | tail -3
```

- [ ] **Step 1.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/backend/src/routes/visit-planning-router.spec.ts
git commit -m "feat(giri-visite): endpoint confirm-with-appointment — conferma tappa + crea appuntamento agenda"
```

---

## Task 2 — Frontend: service + VisitStopCard

**Files:**
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx`
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx`

- [ ] **Step 2.1: Aggiungi confirmWithAppointment al service**

Aggiungi in fondo a `visit-planning.service.ts`:

```typescript
export async function confirmWithAppointment(
  sessionId: string,
  stopId: string,
): Promise<{ stop: VisitPlanningStop; appointment: { id: string; title: string } | null }> {
  const res = await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/stops/${stopId}/confirm-with-appointment`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`confirmWithAppointment ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2.2: Aggiungi prop onConfirmWithAppointment a VisitStopCard**

In `VisitStopCard.tsx`, modifica il tipo Props:

```typescript
type Props = {
  stop:                       VisitPlanningStop;
  onStatusChange:             (stopId: string, status: StopStatus) => void;
  onNavigate:                 (stop: VisitPlanningStop) => void;
  onOpenBrief?:               (stop: VisitPlanningStop) => void;
  onConfirmWithAppointment?:  (stop: VisitPlanningStop) => void;
};
```

Modifica la destructuring:

```typescript
export function VisitStopCard({ stop, onStatusChange: _onStatusChange, onNavigate, onOpenBrief, onConfirmWithAppointment }: Props) {
```

Aggiungi il pulsante "📅 Conf." nella sezione azioni (div con i pulsanti), dopo il pulsante Naviga:

```tsx
          {onConfirmWithAppointment && stop.status !== 'confirmed' && stop.status !== 'visited' && stop.status !== 'removed' && (
            <button
              title="Conferma e aggiungi ad Agenda"
              onClick={() => onConfirmWithAppointment(stop)}
              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
            >📅</button>
          )}
```

- [ ] **Step 2.3: Aggiungi test VisitStopCard**

In `VisitStopCard.spec.tsx`, aggiungi in fondo al describe:

```typescript
  test('mostra pulsante Conf. se onConfirmWithAppointment fornito e stop non confermata', () => {
    const onConfirm = vi.fn();
    render(<VisitStopCard
      stop={makeStop()}
      onStatusChange={vi.fn()}
      onNavigate={vi.fn()}
      onConfirmWithAppointment={onConfirm}
    />);
    expect(screen.getByTitle('Conferma e aggiungi ad Agenda')).toBeInTheDocument();
  });

  test('non mostra pulsante Conf. se stop già visitata', () => {
    render(<VisitStopCard
      stop={makeStop({ status: 'visited' })}
      onStatusChange={vi.fn()}
      onNavigate={vi.fn()}
      onConfirmWithAppointment={vi.fn()}
    />);
    expect(screen.queryByTitle('Conferma e aggiungi ad Agenda')).toBeNull();
  });
```

- [ ] **Step 2.4: Esegui test frontend**

```bash
cd archibald-web-app/frontend
npx vitest run src/components/visit-planning/VisitStopCard.spec.tsx 2>&1 | tail -5
npm run type-check 2>&1 | tail -3
```

- [ ] **Step 2.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx
git commit -m "feat(giri-visite): VisitStopCard pulsante Conf. + confirmWithAppointment service"
```

---

## Task 3 — Frontend: integra in VisitPlanningSessionPage

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 3.1: Aggiungi handler e prop**

In `VisitPlanningSessionPage.tsx`, aggiungi import service:

```typescript
import { confirmWithAppointment } from '../services/visit-planning.service';
```

Aggiungi handler nel componente:

```typescript
  const handleConfirmWithAppointment = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    try {
      await confirmWithAppointment(sessionId, stop.id);
      load(); // ricarica la lista tappe
    } catch (err) {
      console.error('confirmWithAppointment error', err);
    }
  };
```

Nella mappa delle VisitStopCard, aggiungi la prop:

```tsx
            <VisitStopCard
              key={stop.id}
              stop={stop}
              onStatusChange={(id, status) => { vpService.updateStop(sessionId!, id, { status }).then(load); }}
              onNavigate={handleNavigate}
              onOpenBrief={handleOpenBrief}
              onConfirmWithAppointment={handleConfirmWithAppointment}
            />
```

- [ ] **Step 3.2: Type-check + test completi**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 3.3: Push**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): VisitPlanningSessionPage — gestisce conferma tappa con agenda sync"
git push origin master
```

---

## Checklist Gate Piano 1e

- [ ] `POST /sessions/:id/stops/:stopId/confirm-with-appointment` → 401 senza auth
- [ ] Con auth e stop valida → 201 con `{ stop, appointment }`
- [ ] Se createAppointment fallisce → risponde 201 con `appointment: null` (fail-open)
- [ ] VisitStopCard mostra 📅 per tappe non confermate/visitate
- [ ] Click 📅 → stop diventa 'confirmed' + appuntamento creato in Agenda
- [ ] Build + test passano
