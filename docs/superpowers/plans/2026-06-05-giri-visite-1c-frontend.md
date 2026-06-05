# Giri Visite — Piano 1c: Frontend (Fasi 4+5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI mobile-first per il giro giornaliero: lista sessioni, sessione attiva con mappa Leaflet, scheda visita, banner arrivo, wizard creazione, widget Home, scheda cliente universale per sorgenti Arca/Archibald.

**Architecture:** Pattern React esistente — funzioni componente, hooks, stile inline `style={{}}`. Nessun Redux. Service layer per chiamate API via `fetchWithRetry`. Responsive 375px/768px/1280px con media query inline. Leaflet montato dopo mount via useEffect (SSR-safe). Test con Vitest + `@testing-library/react`.

**Tech Stack:** React 19, React Router, Leaflet + react-leaflet, TypeScript strict, Vitest, @testing-library/react

**Prerequisito:** Piano 1b completato (API `/api/visit-planning` disponibile).

**Gate finale:**
- `npm run type-check --prefix archibald-web-app/frontend` — 0 errori
- `npm test --prefix archibald-web-app/frontend` — tutti i test passano
- App apre `/giri` senza crash, lista sessioni vuota mostrata correttamente

---

## File da creare / modificare

| File | Operazione | Scopo |
|---|---|---|
| `frontend/src/types/visit-planning.ts` | Crea | Tutti i tipi frontend |
| `frontend/src/services/visit-planning.service.ts` | Crea | Chiamate API |
| `frontend/src/components/visit-planning/VisitStopCard.tsx` | Crea | Card tappa nella lista |
| `frontend/src/components/visit-planning/VisitStopCard.spec.tsx` | Crea | Test card |
| `frontend/src/components/visit-planning/VisitBriefPanel.tsx` | Crea | Scheda visita scroll unico |
| `frontend/src/components/visit-planning/VisitBriefPanel.spec.tsx` | Crea | Test scheda |
| `frontend/src/components/visit-planning/ArrivalBanner.tsx` | Crea | Banner "Sei arrivato?" |
| `frontend/src/components/visit-planning/ArrivalBanner.spec.tsx` | Crea | Test banner |
| `frontend/src/components/visit-planning/VisitMap.tsx` | Crea | Mappa Leaflet responsive |
| `frontend/src/components/visit-planning/VisitOutcomeButtons.tsx` | Crea | Pulsanti esito visita |
| `frontend/src/components/visit-planning/VisitPlanningWizard.tsx` | Crea | Wizard creazione giro |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Crea | Pagina sessione singola |
| `frontend/src/pages/VisitPlanningPage.tsx` | Crea | Lista sessioni |
| `frontend/src/components/HomeVisitWidget.tsx` | Crea | Widget "Giro di oggi" su Home |
| `frontend/src/components/HomeVisitWidget.spec.tsx` | Crea | Test widget |
| `frontend/src/AppRouter.tsx` | Modifica | Aggiunge route /giri e /giri/:id |
| `frontend/src/components/DashboardNav.tsx` | Modifica | Aggiunge voce "🗺️ Giri" |
| `frontend/src/pages/Dashboard.tsx` | Modifica | Inserisce HomeVisitWidget |

---

## Task 1 — Installa dipendenze e crea i tipi TypeScript

**Files:**
- Create: `archibald-web-app/frontend/src/types/visit-planning.ts`

- [ ] **Step 1.1: Installa leaflet e react-leaflet**

```bash
cd archibald-web-app/frontend
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

Verifica `package.json` aggiornato con `leaflet` e `react-leaflet`.

- [ ] **Step 1.2: Crea i tipi frontend**

```typescript
// src/types/visit-planning.ts

export type VisitHorizon  = 'day' | 'week';
export type VisitMode     = 'balanced' | 'profitability' | 'coverage' | 'constrained' | 'manual_assist';
export type VisitStatus   = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type StopStatus    = 'suggested' | 'to_call' | 'confirmed' | 'planned' | 'backup' | 'visited' | 'skipped' | 'removed';
export type CustomerSourceType = 'archibald' | 'arca';
export type GeoQuality    = 'unknown' | 'erp_unverified' | 'geocoded' | 'manually_confirmed' | 'failed';
export type VisitOutcome  = 'visited' | 'order_created' | 'no_order' | 'closed' | 'not_available' | 'phone_order' | 'rescheduled';

export type VisitPlanningSession = {
  id:                  string;
  userId:              string;
  title:               string;
  horizon:             VisitHorizon;
  mode:                VisitMode;
  status:              VisitStatus;
  startDate:           string;
  endDate:             string;
  startLocationLabel:  string | null;
  startLat:            number | null;
  startLng:            number | null;
  endLocationLabel:    string | null;
  endLat:              number | null;
  endLng:              number | null;
  constraintsJson:     Record<string, unknown>;
  metricsJson:         Record<string, unknown>;
  navigationStartedAt: string | null;
  activeStopId:        string | null;
  generatedAt:         string | null;
  createdAt:           string;
  updatedAt:           string;
};

export type VisitPlanningStop = {
  id:                        string;
  sessionId:                 string;
  userId:                    string;
  sourceType:                CustomerSourceType;
  sourceId:                  string;
  displayName:               string;
  appointmentId:             string | null;
  stopDate:                  string;
  sequence:                  number | null;
  status:                    StopStatus;
  locked:                    boolean;
  estimatedArrival:          string | null;
  estimatedDeparture:        string | null;
  visitMinutes:              number;
  travelMinutesFromPrevious: number | null;
  distanceKmFromPrevious:    number | null;
  scoreTotal:                number | null;
  scoreBreakdownJson:        Record<string, number>;
  recommendationReasons:     string[];
  alerts:                    string[];
  manualNote:                string | null;
  skipReason:                string | null;
  visitedAt:                 string | null;
  createdAt:                 string;
  updatedAt:                 string;
};

export type VisitBriefOrder = {
  docRef:           string;
  date:             string;
  amountImponibile: number;
  source:           'archibald' | 'fresis';
  items:            Array<{ code: string; description: string; qty: number }>;
};

export type VisitBriefPromotion = {
  id: string; name: string; tagline: string | null; validTo: string;
};

export type VisitBriefReminder = {
  id: number; note: string | null; dueAt: string;
};

export type VisitBrief = {
  sourceType:          CustomerSourceType;
  sourceId:            string;
  displayName:         string;
  street:              string | null;
  postalCode:          string | null;
  city:                string | null;
  phone:               string | null;
  email:               string | null;
  lat:                 number | null;
  lng:                 number | null;
  geoQuality:          GeoQuality;
  isDistributor:       boolean;
  matchedSources:      Array<{ type: CustomerSourceType; id: string; name: string }>;
  lastOrders:          VisitBriefOrder[];
  reorderCycleDays:    number | null;
  daysSinceLastOrder:  number | null;
  reorderProbability:  'high' | 'medium' | 'low' | 'unknown';
  suggestedCategories: string[];
  activePromotions:    VisitBriefPromotion[];
  openReminders:       VisitBriefReminder[];
};

export type CreateSessionInput = {
  title:            string;
  horizon:          VisitHorizon;
  mode:             VisitMode;
  startDate:        string;
  endDate:          string;
  startLocationLabel?: string | null;
  startLat?:        number | null;
  startLng?:        number | null;
  endLocationLabel?: string | null;
  endLat?:          number | null;
  endLng?:          number | null;
  constraintsJson?: Record<string, unknown>;
};

export const VISIT_MODE_LABELS: Record<VisitMode, string> = {
  balanced:      'Bilanciato',
  profitability: 'Redditività',
  coverage:      'Copertura',
  constrained:   'Vincolato',
  manual_assist: 'Manuale',
};

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  suggested: 'Suggerito',
  to_call:   'Da chiamare',
  confirmed: 'Confermato',
  planned:   'Pianificato',
  backup:    'Backup',
  visited:   'Visitato',
  skipped:   'Saltato',
  removed:   'Rimosso',
};

export const STOP_STATUS_COLORS: Record<StopStatus, string> = {
  suggested: '#94a3b8',
  to_call:   '#f59e0b',
  confirmed: '#2563eb',
  planned:   '#6366f1',
  backup:    '#64748b',
  visited:   '#16a34a',
  skipped:   '#ef4444',
  removed:   '#e5e7eb',
};

export const SOURCE_BADGE: Record<CustomerSourceType, string> = {
  archibald: 'A',
  arca:      'F',
};
```

- [ ] **Step 1.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Output atteso: 0 errori.

- [ ] **Step 1.4: Commit**

```bash
git add archibald-web-app/frontend/src/types/visit-planning.ts \
        archibald-web-app/frontend/package.json \
        archibald-web-app/frontend/package-lock.json
git commit -m "feat(giri-visite): tipi TypeScript frontend + installa leaflet/react-leaflet"
```

---

## Task 2 — Service API visit-planning

**Files:**
- Create: `archibald-web-app/frontend/src/services/visit-planning.service.ts`

- [ ] **Step 2.1: Crea il service**

```typescript
// src/services/visit-planning.service.ts
import { fetchWithRetry } from '../utils/fetch-with-retry';
import type {
  VisitPlanningSession, VisitPlanningStop, VisitBrief,
  CreateSessionInput, StopStatus, CustomerSourceType,
} from '../types/visit-planning';

const BASE = '/api/visit-planning';

export async function listSessions(params: {
  from: string; to: string; status?: string; horizon?: string;
}): Promise<VisitPlanningSession[]> {
  const q = new URLSearchParams(params as Record<string, string>);
  const res = await fetchWithRetry(`${BASE}/sessions?${q}`);
  if (!res.ok) throw new Error(`listSessions ${res.status}`);
  return res.json();
}

export async function createSession(input: CreateSessionInput): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}`);
  return res.json();
}

export async function getSession(sessionId: string): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`getSession ${res.status}`);
  return res.json();
}

export async function updateSession(
  sessionId: string, patch: Partial<VisitPlanningSession>,
): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateSession ${res.status}`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteSession ${res.status}`);
}

export async function listStops(sessionId: string): Promise<VisitPlanningStop[]> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops`);
  if (!res.ok) throw new Error(`listStops ${res.status}`);
  return res.json();
}

export async function addStop(
  sessionId: string,
  input: {
    sourceType: CustomerSourceType; sourceId: string; displayName: string;
    stopDate: string; status?: StopStatus; visitMinutes?: number;
  },
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`addStop ${res.status}`);
  return res.json();
}

export async function updateStop(
  sessionId: string, stopId: string, patch: Partial<VisitPlanningStop>,
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/${stopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateStop ${res.status}`);
  return res.json();
}

export async function markVisited(sessionId: string, stopId: string): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/${stopId}/mark-visited`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`markVisited ${res.status}`);
  return res.json();
}

export async function skipStop(sessionId: string, stopId: string, reason?: string): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/${stopId}/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (!res.ok) throw new Error(`skipStop ${res.status}`);
  return res.json();
}

export async function reorderStops(
  sessionId: string,
  order: Array<{ id: string; sequence: number }>,
): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error(`reorderStops ${res.status}`);
}

export async function notifyNavigationStarted(
  sessionId: string, stopId: string,
): Promise<void> {
  await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/stops/${stopId}/navigation-started`,
    { method: 'POST' },
  );
}

export async function getVisitBrief(
  sourceType: CustomerSourceType, sourceId: string,
): Promise<VisitBrief> {
  const res = await fetchWithRetry(`${BASE}/customers/${sourceType}/${encodeURIComponent(sourceId)}/visit-brief`);
  if (!res.ok) throw new Error(`getVisitBrief ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2.2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 2.3: Commit**

```bash
git add archibald-web-app/frontend/src/services/visit-planning.service.ts
git commit -m "feat(giri-visite): service API visit-planning con tutte le chiamate backend"
```

---

## Task 3 — VisitStopCard

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx`

- [ ] **Step 3.1: Scrivi il test fallente**

```tsx
// VisitStopCard.spec.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisitStopCard } from './VisitStopCard';
import type { VisitPlanningStop } from '../../types/visit-planning';

function makeStop(overrides: Partial<VisitPlanningStop> = {}): VisitPlanningStop {
  return {
    id: 'stop-1', sessionId: 'sess-1', userId: 'user-1',
    sourceType: 'archibald', sourceId: '55.374',
    displayName: 'Dr. Rossi Mario',
    appointmentId: null, stopDate: '2026-06-06', sequence: 1,
    status: 'suggested', locked: false,
    estimatedArrival: '2026-06-06T09:00:00Z',
    estimatedDeparture: null, visitMinutes: 30,
    travelMinutesFromPrevious: null, distanceKmFromPrevious: null,
    scoreTotal: 0.82, scoreBreakdownJson: {},
    recommendationReasons: ['Ultimo ordine 47 giorni fa', 'Alta probabilità riordino'],
    alerts: [],
    manualNote: null, skipReason: null, visitedAt: null,
    createdAt: '2026-06-05T10:00:00Z', updatedAt: '2026-06-05T10:00:00Z',
    ...overrides,
  };
}

describe('VisitStopCard', () => {
  test('mostra il nome del cliente', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('Dr. Rossi Mario')).toBeInTheDocument();
  });

  test('mostra badge sorgente archibald', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('mostra badge sorgente fresis per arca', () => {
    render(<VisitStopCard stop={makeStop({ sourceType: 'arca', sourceId: 'C00602' })} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  test('mostra orario stimato se estimatedArrival valorizzato', () => {
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  test('chiama onNavigate al click del pulsante naviga', () => {
    const onNavigate = vi.fn();
    render(<VisitStopCard stop={makeStop()} onStatusChange={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTitle('Naviga'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test('mostra alert visibile se alerts non vuoto', () => {
    const stop = makeStop({ alerts: ['⚠️ Cliente chiuso per patronale'] });
    render(<VisitStopCard stop={stop} onStatusChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText(/chiuso per patronale/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Esegui — verifica fallisce**

```bash
cd archibald-web-app/frontend
npm test -- --run src/components/visit-planning/VisitStopCard.spec.tsx 2>&1 | tail -3
```

- [ ] **Step 3.3: Implementa il componente**

```tsx
// VisitStopCard.tsx
import type { VisitPlanningStop, StopStatus } from '../../types/visit-planning';
import { STOP_STATUS_COLORS, SOURCE_BADGE } from '../../types/visit-planning';

type Props = {
  stop:           VisitPlanningStop;
  onStatusChange: (stopId: string, status: StopStatus) => void;
  onNavigate:     (stop: VisitPlanningStop) => void;
  onOpenBrief?:   (stop: VisitPlanningStop) => void;
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export function VisitStopCard({ stop, onStatusChange, onNavigate, onOpenBrief }: Props) {
  const statusColor = STOP_STATUS_COLORS[stop.status];
  const arrivalTime = formatTime(stop.estimatedArrival);
  const badge = SOURCE_BADGE[stop.sourceType];

  const cardBg =
    stop.status === 'visited'  ? '#f0fdf4' :
    stop.status === 'skipped'  ? '#fef2f2' :
    stop.status === 'to_call'  ? '#fffbeb' :
    stop.status === 'confirmed'? '#eff6ff' :
    stop.status === 'backup'   ? '#f8fafc' :
    '#ffffff';

  return (
    <div style={{
      background: cardBg,
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
      borderLeft: `4px solid ${statusColor}`,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {arrivalTime && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{arrivalTime}</span>
            )}
            {stop.sequence != null && (
              <span style={{
                background: statusColor, color: 'white',
                borderRadius: '50%', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{stop.sequence}</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stop.displayName}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px',
              borderRadius: 4, background: '#e0f2fe', color: '#0369a1',
            }}>{badge}</span>
            {stop.locked && <span style={{ fontSize: 10 }}>🔒</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {stop.travelMinutesFromPrevious != null && (
              <span>🚗 {stop.travelMinutesFromPrevious} min · </span>
            )}
            <span>{stop.visitMinutes} min visita</span>
          </div>
        </div>

        {/* Azioni */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            title="Naviga"
            onClick={() => onNavigate(stop)}
            style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
          >🧭</button>
          {onOpenBrief && (
            <button
              title="Scheda visita"
              onClick={() => onOpenBrief(stop)}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
            >👁</button>
          )}
        </div>
      </div>

      {/* Motivazioni */}
      {stop.recommendationReasons.length > 0 && (
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {stop.recommendationReasons.slice(0, 2).map((r, i) => (
            <span key={i} style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 10 }}>{r}</span>
          ))}
        </div>
      )}

      {/* Alert */}
      {stop.alerts.map((a, i) => (
        <div key={i} style={{
          fontSize: 11, color: '#92400e', background: '#fef3c7',
          borderRadius: 4, padding: '2px 6px', marginTop: 4,
        }}>{a}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3.4: Esegui — verifica passa**

```bash
npm test -- --run src/components/visit-planning/VisitStopCard.spec.tsx 2>&1 | tail -5
```

Output atteso: `✓ 6 tests passed`.

- [ ] **Step 3.5: Commit**

```bash
git add archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitStopCard.spec.tsx
git commit -m "feat(giri-visite): VisitStopCard con badge sorgente, orario, azioni, alert"
```

---

## Task 4 — ArrivalBanner

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/ArrivalBanner.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/ArrivalBanner.spec.tsx`

Il banner appare quando l'app torna in foreground ≥5 min dopo aver premuto "Naviga".

- [ ] **Step 4.1: Scrivi il test fallente**

```tsx
// ArrivalBanner.spec.tsx
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ArrivalBanner } from './ArrivalBanner';

describe('ArrivalBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('non si mostra se navigationStartedAt è null', () => {
    const { container } = render(
      <ArrivalBanner
        customerName="Dr. Rossi"
        navigationStartedAt={null}
        minMinutesBeforePrompt={5}
        onConfirm={vi.fn()} onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('non si mostra se trascorsi meno di minMinutesBeforePrompt minuti', () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min fa
    const { container } = render(
      <ArrivalBanner
        customerName="Dr. Rossi"
        navigationStartedAt={startedAt}
        minMinutesBeforePrompt={5}
        onConfirm={vi.fn()} onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('si mostra se trascorsi più di minMinutesBeforePrompt minuti', () => {
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // 6 min fa
    render(
      <ArrivalBanner
        customerName="Dr. Rossi"
        navigationStartedAt={startedAt}
        minMinutesBeforePrompt={5}
        onConfirm={vi.fn()} onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Dr\. Rossi/)).toBeInTheDocument();
    expect(screen.getByText(/Sei arrivato/i)).toBeInTheDocument();
  });

  test('chiama onConfirm al click "Segna visitato"', () => {
    const onConfirm = vi.fn();
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    render(
      <ArrivalBanner
        customerName="Dr. Rossi"
        navigationStartedAt={startedAt}
        minMinutesBeforePrompt={5}
        onConfirm={onConfirm} onDismiss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Segna visitato/i));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('chiama onDismiss al click "Non ancora"', () => {
    const onDismiss = vi.fn();
    const startedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    render(
      <ArrivalBanner
        customerName="Dr. Rossi"
        navigationStartedAt={startedAt}
        minMinutesBeforePrompt={5}
        onConfirm={vi.fn()} onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByText(/Non ancora/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/components/visit-planning/ArrivalBanner.spec.tsx 2>&1 | tail -3
```

- [ ] **Step 4.3: Implementa il componente**

```tsx
// ArrivalBanner.tsx
type Props = {
  customerName:           string;
  navigationStartedAt:    string | null;
  minMinutesBeforePrompt: number;
  onConfirm:              () => void;
  onDismiss:              () => void;
};

export function ArrivalBanner({ customerName, navigationStartedAt, minMinutesBeforePrompt, onConfirm, onDismiss }: Props) {
  if (!navigationStartedAt) return null;

  const elapsed = (Date.now() - new Date(navigationStartedAt).getTime()) / 60000;
  if (elapsed < minMinutesBeforePrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 1000,
      background: '#1e293b', color: 'white', borderRadius: 12,
      padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>
        📍 Sei arrivato da <em>{customerName}</em>?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, background: '#16a34a', color: 'white', border: 'none',
            borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >✓ Segna visitato</button>
        <button
          onClick={onDismiss}
          style={{
            flex: 1, background: '#374151', color: '#d1d5db', border: 'none',
            borderRadius: 8, padding: '8px 0', fontSize: 14, cursor: 'pointer',
          }}
        >Non ancora</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Esegui — verifica passa**

```bash
npm test -- --run src/components/visit-planning/ArrivalBanner.spec.tsx 2>&1 | tail -5
```

Output atteso: `✓ 5 tests passed`.

- [ ] **Step 4.5: Commit**

```bash
git add archibald-web-app/frontend/src/components/visit-planning/ArrivalBanner.tsx \
        archibald-web-app/frontend/src/components/visit-planning/ArrivalBanner.spec.tsx
git commit -m "feat(giri-visite): ArrivalBanner — banner contestuale arrivo a destinazione"
```

---

## Task 5 — VisitMap (Leaflet responsive)

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitMap.tsx`

La mappa non ha test automatici (Leaflet non funziona in JSDOM). Verifica manuale nel browser.

- [ ] **Step 5.1: Crea il componente**

```tsx
// VisitMap.tsx
import { useEffect, useRef } from 'react';
import type { VisitPlanningStop } from '../../types/visit-planning';
import { STOP_STATUS_COLORS } from '../../types/visit-planning';

type Props = {
  stops:        VisitPlanningStop[];
  height?:      number | string;
  onStopClick?: (stop: VisitPlanningStop) => void;
};

type StopWithCoords = VisitPlanningStop & { lat: number; lng: number };

// Centroidi approssimativi per clustering per città (fallback senza coordinate)
const CITY_CENTROIDS: Record<string, [number, number]> = {
  'NAPOLI': [40.8518, 14.2681], 'SALERNO': [40.6824, 14.7681],
  'POTENZA': [40.6416, 15.8069], 'AVELLINO': [40.9148, 14.7910],
  'CASERTA': [41.0733, 14.3331], 'BATTIPAGLIA': [40.6080, 14.9830],
  'CASTELLAMMARE DI STABIA': [40.7024, 14.4800],
  'MELFI': [40.9968, 15.6510], 'LAURIA': [40.0478, 15.8352],
};

export function VisitMap({ stops, height = 220, onStopClick }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);

  const stopsWithCoords = stops.filter((s): s is StopWithCoords => s.status !== 'removed');

  useEffect(() => {
    if (!mapRef.current) return;
    let L: typeof import('leaflet');

    async function init() {
      L = await import('leaflet');
      // Fix Leaflet default icon path con Vite
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }

      const map = L.map(mapRef.current!, { zoomControl: true });
      leafletRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const points: [number, number][] = [];

      stopsWithCoords.forEach((stop, i) => {
        // Coordinate: usa quelle della tappa se disponibili (dai dati del brief),
        // altrimenti centroide città
        const cityKey = (stop as VisitPlanningStop & { city?: string }).city?.toUpperCase() ?? '';
        const fallback = CITY_CENTROIDS[cityKey] ?? null;

        // Per ora usiamo fallback — le coordinate reali arrivano da visit-brief
        if (!fallback) return;

        const [lat, lng] = fallback;
        points.push([lat, lng]);

        const color = STOP_STATUS_COLORS[stop.status];
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)">${stop.sequence ?? i + 1}</div>`,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(`<b>${stop.displayName}</b><br>${stop.status}`);
        if (onStopClick) marker.on('click', () => onStopClick(stop));
      });

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 13 });
      } else {
        map.setView([40.85, 14.27], 8); // Campania default
      }

      // Disegna linea percorso tra i punti in sequenza
      if (points.length > 1) {
        L.polyline(points, { color: '#2563eb', weight: 2, opacity: 0.6, dashArray: '5,8' }).addTo(map);
      }
    }

    init().catch(console.error);

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.map(s => `${s.id}-${s.status}`).join(',')]);

  return (
    <>
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div
        ref={mapRef}
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
    </>
  );
}
```

- [ ] **Step 5.2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

Output atteso: 0 errori. Se errori su `@types/leaflet` → `npm install -D @types/leaflet --prefix archibald-web-app/frontend`.

- [ ] **Step 5.3: Commit**

```bash
git add archibald-web-app/frontend/src/components/visit-planning/VisitMap.tsx
git commit -m "feat(giri-visite): VisitMap — mappa Leaflet + OSM con pin numerati e percorso"
```

---

## Task 6 — VisitBriefPanel + VisitOutcomeButtons

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitOutcomeButtons.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.spec.tsx`

- [ ] **Step 6.1: Crea VisitOutcomeButtons**

```tsx
// VisitOutcomeButtons.tsx
import type { VisitOutcome } from '../../types/visit-planning';

type Props = { onOutcome: (outcome: VisitOutcome) => void };

const OUTCOMES: Array<{ outcome: VisitOutcome; label: string; bg: string; color: string }> = [
  { outcome: 'visited',       label: 'Visitato',       bg: '#dcfce7', color: '#166534' },
  { outcome: 'order_created', label: 'Ordine fatto',   bg: '#dbeafe', color: '#1e40af' },
  { outcome: 'no_order',      label: 'Nessun ordine',  bg: '#fef9c3', color: '#854d0e' },
  { outcome: 'closed',        label: 'Chiuso',         bg: '#fee2e2', color: '#991b1b' },
  { outcome: 'not_available', label: 'Non disponibile',bg: '#f3f4f6', color: '#374151' },
  { outcome: 'rescheduled',   label: 'Rinvia',         bg: '#ede9fe', color: '#5b21b6' },
];

export function VisitOutcomeButtons({ onOutcome }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {OUTCOMES.map(o => (
        <button
          key={o.outcome}
          onClick={() => onOutcome(o.outcome)}
          style={{
            background: o.bg, color: o.color, border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6.2: Scrivi il test fallente per VisitBriefPanel**

```tsx
// VisitBriefPanel.spec.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisitBriefPanel } from './VisitBriefPanel';
import type { VisitBrief } from '../../types/visit-planning';

function makeBrief(overrides: Partial<VisitBrief> = {}): VisitBrief {
  return {
    sourceType: 'archibald', sourceId: '55.374',
    displayName: 'Dr. Rossi Mario',
    street: 'Via Roma 1', postalCode: '80100', city: 'Napoli',
    phone: '081123456', email: null, lat: null, lng: null,
    geoQuality: 'unknown', isDistributor: false,
    matchedSources: [{ type: 'archibald', id: '55.374', name: 'Dr. Rossi' }],
    lastOrders: [
      { docRef: 'FT 854/2026', date: '2026-06-02', amountImponibile: 172.13, source: 'fresis', items: [{ code: '94003SC', description: 'Gommino DIA', qty: 1 }] },
    ],
    reorderCycleDays: 28,
    daysSinceLastOrder: 3,
    reorderProbability: 'high',
    suggestedCategories: ['Endodonzia', 'Ortodonzia'],
    activePromotions: [{ id: 'promo-1', name: 'Promo Giugno', tagline: 'Sconto 15%', validTo: '2026-06-30' }],
    openReminders: [],
    ...overrides,
  };
}

describe('VisitBriefPanel', () => {
  test('mostra il nome del cliente nell\'header', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText('Dr. Rossi Mario')).toBeInTheDocument();
  });

  test('sezione "Da proporre oggi" è in cima e visibile', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/Da proporre oggi/i)).toBeInTheDocument();
    expect(screen.getByText(/Endodonzia/)).toBeInTheDocument();
  });

  test('mostra la promozione attiva', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/Promo Giugno/)).toBeInTheDocument();
  });

  test('mostra ultimo ordine FT', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText(/FT 854\/2026/)).toBeInTheDocument();
  });

  test('mostra badge sorgente archibald [A]', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    expect(screen.getByText('[A]')).toBeInTheDocument();
  });

  test('mostra pulsante chiama se phone valorizzato', () => {
    render(<VisitBriefPanel brief={makeBrief()} onOutcome={vi.fn()} />);
    const callBtn = screen.getByTitle('Chiama');
    expect(callBtn).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.3: Esegui — verifica fallisce**

```bash
npm test -- --run src/components/visit-planning/VisitBriefPanel.spec.tsx 2>&1 | tail -3
```

- [ ] **Step 6.4: Implementa VisitBriefPanel**

```tsx
// VisitBriefPanel.tsx
import type { CSSProperties } from 'react';
import type { VisitBrief, VisitOutcome } from '../../types/visit-planning';
import { SOURCE_BADGE } from '../../types/visit-planning';
import { VisitOutcomeButtons } from './VisitOutcomeButtons';

type Props = {
  brief:     VisitBrief;
  onOutcome: (outcome: VisitOutcome) => void;
};

const SECTION_TITLE: CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  color: '#9ca3af', letterSpacing: '0.05em', marginBottom: 6,
};

const CARD: CSSProperties = {
  background: 'white', borderRadius: 8, padding: '10px 12px', marginBottom: 8,
  boxShadow: '0 1px 2px rgba(0,0,0,.05)',
};

export function VisitBriefPanel({ brief, onOutcome }: Props) {
  const hasSuggestions = brief.suggestedCategories.length > 0 || brief.activePromotions.length > 0;
  const primaryBadge = brief.matchedSources.length > 1 ? '[A+F]' : `[${SOURCE_BADGE[brief.sourceType]}]`;

  const buildNavUrl = () => {
    if (brief.lat && brief.lng) return `https://maps.google.com/maps?daddr=${brief.lat},${brief.lng}`;
    const addr = [brief.street, brief.postalCode, brief.city, 'Italy'].filter(Boolean).join(', ');
    return `https://maps.google.com/maps?daddr=${encodeURIComponent(addr)}`;
  };

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1e293b', color: 'white', padding: '14px 16px', borderRadius: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{brief.displayName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {brief.city}{brief.postalCode ? ` · ${brief.postalCode}` : ''} &nbsp;
              <span style={{ background: '#334155', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{primaryBadge}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {brief.phone && (
              <a href={`tel:${brief.phone}`} title="Chiama" style={{ background: '#2563eb', color: 'white', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', fontSize: 13 }}>📞</a>
            )}
            <a href={buildNavUrl()} target="_blank" rel="noopener noreferrer" style={{ background: '#16a34a', color: 'white', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', fontSize: 13 }}>🧭</a>
          </div>
        </div>
      </div>

      {/* ── Da proporre oggi ── */}
      {hasSuggestions && (
        <div style={{ ...CARD, borderLeft: '4px solid #2563eb', background: '#eff6ff' }}>
          <div style={{ ...SECTION_TITLE, color: '#1d4ed8' }}>🎯 Da proporre oggi</div>
          {brief.activePromotions.map(p => (
            <div key={p.id} style={{ fontSize: 13, color: '#1e40af', marginBottom: 3 }}>
              ↗ <b>{p.name}</b>{p.tagline ? ` — ${p.tagline}` : ''} <span style={{ fontSize: 11, color: '#16a34a' }}>scade {p.validTo.slice(0, 10)}</span>
            </div>
          ))}
          {brief.suggestedCategories.map(cat => (
            <div key={cat} style={{ fontSize: 13, color: '#0891b2', marginBottom: 2 }}>↗ {cat} <span style={{ fontSize: 11, color: '#6b7280' }}>(mai acquistato)</span></div>
          ))}
          {brief.reorderProbability === 'high' && (
            <div style={{ fontSize: 12, color: '#15803d', marginTop: 4, fontWeight: 600 }}>
              🔄 Probabilità riordino alta {brief.reorderCycleDays ? `(ciclo ~${brief.reorderCycleDays}gg)` : ''}
            </div>
          )}
        </div>
      )}

      {/* ── Ultimi ordini ── */}
      {brief.lastOrders.length > 0 && (
        <div style={CARD}>
          <div style={SECTION_TITLE}>📦 Ultimi ordini</div>
          {brief.lastOrders.map((o, i) => (
            <div key={i} style={{ borderBottom: i < brief.lastOrders.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: 6, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#0891b2', fontWeight: 600 }}>{o.docRef}</span>
                <span>€{o.amountImponibile.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {o.date.slice(0, 10)} · {o.source === 'fresis' ? 'Fresis' : 'Archibald'} ·{' '}
                {o.items.slice(0, 2).map(it => it.description).join(', ')}
                {o.items.length > 2 ? ` +${o.items.length - 2}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Reminder ── */}
      {brief.openReminders.length > 0 && (
        <div style={CARD}>
          <div style={SECTION_TITLE}>📌 Reminder aperti</div>
          {brief.openReminders.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: '#374151', marginBottom: 3 }}>
              {r.note ?? '—'} <span style={{ color: '#ef4444', fontSize: 11 }}>scade {r.dueAt.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Esito visita ── */}
      <div style={CARD}>
        <div style={SECTION_TITLE}>✅ Esito visita</div>
        <VisitOutcomeButtons onOutcome={onOutcome} />
      </div>

    </div>
  );
}
```

- [ ] **Step 6.5: Esegui — verifica passa**

```bash
npm test -- --run src/components/visit-planning/VisitBriefPanel.spec.tsx 2>&1 | tail -5
```

Output atteso: `✓ 6 tests passed`.

- [ ] **Step 6.6: Commit**

```bash
git add archibald-web-app/frontend/src/components/visit-planning/VisitOutcomeButtons.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitBriefPanel.spec.tsx
git commit -m "feat(giri-visite): VisitBriefPanel scroll unico + VisitOutcomeButtons"
```

---

## Task 7 — VisitPlanningSessionPage

**Files:**
- Create: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

Pagina sessione singola. Mostra mappa + lista tappe + ArrivalBanner. Responsive: mobile=lista+mappa collassabile; tablet/desktop=split view.

- [ ] **Step 7.1: Crea il componente**

```tsx
// VisitPlanningSessionPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { VisitPlanningSession, VisitPlanningStop, VisitBrief, VisitOutcome } from '../types/visit-planning';
import { VISIT_MODE_LABELS } from '../types/visit-planning';
import * as vpService from '../services/visit-planning.service';
import { VisitStopCard } from '../components/visit-planning/VisitStopCard';
import { VisitMap } from '../components/visit-planning/VisitMap';
import { ArrivalBanner } from '../components/visit-planning/ArrivalBanner';
import { VisitBriefPanel } from '../components/visit-planning/VisitBriefPanel';

export function VisitPlanningSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession]           = useState<VisitPlanningSession | null>(null);
  const [stops, setStops]               = useState<VisitPlanningStop[]>([]);
  const [brief, setBrief]               = useState<VisitBrief | null>(null);
  const [showBriefFor, setShowBriefFor] = useState<VisitPlanningStop | null>(null);
  const [showMap, setShowMap]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const isMobile   = window.innerWidth < 768;
  const isTablet   = window.innerWidth >= 768 && window.innerWidth < 1280;
  const isDesktop  = window.innerWidth >= 1280;

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const [s, st] = await Promise.all([
        vpService.getSession(sessionId),
        vpService.listStops(sessionId),
      ]);
      setSession(s);
      setStops(st.filter(s => s.status !== 'removed'));
    } catch {
      setError('Impossibile caricare il giro.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Visibilità ArrivalBanner: controlla al ritorno in foreground
  const [showArrival, setShowArrival] = useState(true);

  const handleNavigate = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    await vpService.notifyNavigationStarted(sessionId, stop.id);
    setSession(prev => prev ? { ...prev, navigationStartedAt: new Date().toISOString(), activeStopId: stop.id } : prev);
    const addr = [stop.displayName].join(', ');
    window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(addr)}`, '_blank');
  };

  const handleOpenBrief = async (stop: VisitPlanningStop) => {
    setShowBriefFor(stop);
    try {
      const b = await vpService.getVisitBrief(stop.sourceType, stop.sourceId);
      setBrief(b);
    } catch {
      setBrief(null);
    }
  };

  const handleOutcome = async (outcome: VisitOutcome) => {
    if (!sessionId || !showBriefFor) return;
    if (outcome === 'visited' || outcome === 'order_created') {
      await vpService.markVisited(sessionId, showBriefFor.id);
    } else if (outcome === 'rescheduled') {
      await vpService.skipStop(sessionId, showBriefFor.id, outcome);
    }
    setShowBriefFor(null);
    setBrief(null);
    load();
  };

  const activeStop = session?.activeStopId
    ? stops.find(s => s.id === session.activeStopId) ?? null
    : null;

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>Caricamento...</div>;
  if (error)   return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;
  if (!session) return null;

  const visibleStops = stops.filter(s => s.status !== 'removed');

  const listPanel = (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: isDesktop ? '0 8px 0 0' : 0 }}>
      {visibleStops.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Nessuna tappa nel giro.</div>
      ) : (
        visibleStops.map(stop => (
          <VisitStopCard
            key={stop.id}
            stop={stop}
            onStatusChange={(id, status) => vpService.updateStop(sessionId!, id, { status }).then(load)}
            onNavigate={handleNavigate}
            onOpenBrief={handleOpenBrief}
          />
        ))
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: isDesktop ? 1280 : undefined, margin: '0 auto', padding: isMobile ? '8px 12px' : '16px 24px' }}>

      {/* Header sessione */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{session.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {session.startDate} · {VISIT_MODE_LABELS[session.mode]} · {visibleStops.length} tappe
          </div>
        </div>
      </div>

      {/* Toggle mappa su mobile */}
      {isMobile && (
        <button
          onClick={() => setShowMap(v => !v)}
          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 14px', fontSize: 13, width: '100%', marginBottom: 10, cursor: 'pointer' }}
        >{showMap ? '🗺️ Nascondi mappa' : '🗺️ Mostra percorso'}</button>
      )}

      {/* Layout responsive */}
      {isDesktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 16 }}>
          {listPanel}
          <VisitMap stops={visibleStops} height={600} onStopClick={handleOpenBrief} />
          {showBriefFor && brief && (
            <div style={{ overflowY: 'auto' }}>
              <VisitBriefPanel brief={brief} onOutcome={handleOutcome} />
            </div>
          )}
        </div>
      ) : isTablet ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {listPanel}
          <VisitMap stops={visibleStops} height={400} onStopClick={handleOpenBrief} />
        </div>
      ) : (
        <>
          {showMap && <VisitMap stops={visibleStops} height={220} onStopClick={handleOpenBrief} />}
          {listPanel}
        </>
      )}

      {/* Drawer scheda visita su mobile/tablet */}
      {!isDesktop && showBriefFor && brief && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }} onClick={() => setShowBriefFor(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#f8fafc', borderRadius: '16px 16px 0 0', padding: 16, maxHeight: '80vh', overflowY: 'auto' }}
          >
            <VisitBriefPanel brief={brief} onOutcome={handleOutcome} />
          </div>
        </div>
      )}

      {/* Banner arrivo */}
      {showArrival && session.navigationStartedAt && activeStop && (
        <ArrivalBanner
          customerName={activeStop.displayName}
          navigationStartedAt={session.navigationStartedAt}
          minMinutesBeforePrompt={5}
          onConfirm={async () => {
            await vpService.markVisited(sessionId!, activeStop.id);
            setShowArrival(false);
            load();
          }}
          onDismiss={() => setShowArrival(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7.2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 7.3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): VisitPlanningSessionPage responsive con mappa, tappe, brief drawer, ArrivalBanner"
```

---

## Task 8 — VisitPlanningPage (lista sessioni) + VisitPlanningWizard

**Files:**
- Create: `archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitPlanningWizard.tsx`

- [ ] **Step 8.1: Crea VisitPlanningWizard**

```tsx
// VisitPlanningWizard.tsx
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { CreateSessionInput, VisitHorizon, VisitMode } from '../../types/visit-planning';
import { VISIT_MODE_LABELS } from '../../types/visit-planning';

type Props = {
  onSubmit: (input: CreateSessionInput) => Promise<void>;
  onCancel: () => void;
};

const HORIZONS: Array<{ value: VisitHorizon; label: string }> = [
  { value: 'day',  label: '📅 Singola giornata' },
  { value: 'week', label: '🗓️ Settimana' },
];

const MODES: VisitMode[] = ['balanced', 'profitability', 'coverage', 'constrained', 'manual_assist'];

export function VisitPlanningWizard({ onSubmit, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep]       = useState(0);
  const [horizon, setHorizon] = useState<VisitHorizon>('day');
  const [mode, setMode]       = useState<VisitMode>('balanced');
  const [startDate, setStartDate] = useState(today);
  const [title, setTitle]     = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = title.trim().length > 0 && startDate.length === 10;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        horizon,
        mode,
        startDate,
        endDate: horizon === 'day' ? startDate : (() => {
          const d = new Date(startDate);
          d.setDate(d.getDate() + 4); // +4 giorni per settimana (lun-ven)
          return d.toISOString().slice(0, 10);
        })(),
      });
    } finally {
      setLoading(false);
    }
  };

  const LABEL: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };
  const INPUT: CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' };
  const PILL = (active: boolean): CSSProperties => ({
    padding: '6px 16px', borderRadius: 20, border: active ? '2px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#eff6ff' : 'white', color: active ? '#1d4ed8' : '#374151',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 13,
  });

  const steps = [
    // Step 0: tipo giro
    <div key={0}>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>Che tipo di giro vuoi pianificare?</p>
      <div style={{ display: 'flex', gap: 10 }}>
        {HORIZONS.map(h => (
          <button key={h.value} style={PILL(horizon === h.value)} onClick={() => setHorizon(h.value)}>{h.label}</button>
        ))}
      </div>
    </div>,

    // Step 1: modalità
    <div key={1}>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>Modalità di ottimizzazione:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MODES.map(m => (
          <button key={m} style={PILL(mode === m)} onClick={() => setMode(m)}>{VISIT_MODE_LABELS[m]}</button>
        ))}
      </div>
    </div>,

    // Step 2: data e titolo
    <div key={2}>
      <label style={LABEL}>Data inizio *</label>
      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...INPUT, marginBottom: 12 }} />
      <label style={LABEL}>Nome del giro *</label>
      <input
        type="text" value={title} maxLength={100}
        placeholder={`Giro ${new Date(startDate).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' })}`}
        onChange={e => setTitle(e.target.value)}
        style={INPUT}
      />
    </div>,
  ];

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,.12)', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Nuovo giro visite</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? '#2563eb' : '#e5e7eb' }} />
        ))}
      </div>

      {steps[step]}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>Annulla</button>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>← Indietro</button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Avanti →</button>
        ) : (
          <button onClick={handleSubmit} disabled={!isValid || loading} style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: isValid ? '#2563eb' : '#e5e7eb', color: isValid ? 'white' : '#9ca3af', border: 'none', cursor: isValid ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 14 }}>
            {loading ? 'Creazione...' : '✓ Crea giro'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Crea VisitPlanningPage**

```tsx
// VisitPlanningPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisitPlanningSession } from '../types/visit-planning';
import { VISIT_MODE_LABELS } from '../types/visit-planning';
import * as vpService from '../services/visit-planning.service';
import { VisitPlanningWizard } from '../components/visit-planning/VisitPlanningWizard';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  draft:       { label: 'Bozza',       bg: '#f1f5f9', color: '#475569' },
  planned:     { label: 'Pianificato', bg: '#dbeafe', color: '#1e40af' },
  in_progress: { label: 'In corso',   bg: '#dcfce7', color: '#166534' },
  completed:   { label: 'Completato', bg: '#f0fdf4', color: '#15803d' },
  cancelled:   { label: 'Annullato',  bg: '#fee2e2', color: '#991b1b' },
};

export function VisitPlanningPage() {
  const navigate   = useNavigate();
  const [sessions, setSessions] = useState<VisitPlanningSession[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString().slice(0, 10);
  const monthAhead = new Date(Date.now() + 60 * 24 * 3600000).toISOString().slice(0, 10);

  useEffect(() => {
    vpService.listSessions({ from: monthAgo, to: monthAhead })
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (input: Parameters<typeof vpService.createSession>[0]) => {
    const session = await vpService.createSession(input);
    navigate(`/giri/${session.id}`);
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: isMobile ? '12px 16px' : '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🗺️ Giri Visite</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Pianifica e gestisci i tuoi giri clienti</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >+ Nuovo giro</button>
      </div>

      {showWizard && (
        <div style={{ marginBottom: 24 }}>
          <VisitPlanningWizard onSubmit={handleCreate} onCancel={() => setShowWizard(false)} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Caricamento...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Nessun giro pianificato</div>
          <div style={{ fontSize: 13 }}>Premi "+ Nuovo giro" per iniziare</div>
        </div>
      ) : (
        <div>
          {sessions.map(s => {
            const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft;
            const isToday = s.startDate === today;
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/giri/${s.id}`)}
                style={{
                  background: isToday ? '#eff6ff' : 'white',
                  border: isToday ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 10, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,.05)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {formatDate(s.startDate)} · {VISIT_MODE_LABELS[s.mode]}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>OGGI</span>}
                  <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10 }}>{badge.label}</span>
                  <span style={{ color: '#9ca3af' }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 8.4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitPlanningWizard.tsx
git commit -m "feat(giri-visite): VisitPlanningPage lista sessioni + VisitPlanningWizard 3 step"
```

---

## Task 9 — HomeVisitWidget

**Files:**
- Create: `archibald-web-app/frontend/src/components/HomeVisitWidget.tsx`
- Create: `archibald-web-app/frontend/src/components/HomeVisitWidget.spec.tsx`

- [ ] **Step 9.1: Scrivi il test fallente**

```tsx
// HomeVisitWidget.spec.tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeVisitWidget } from './HomeVisitWidget';
import type { VisitPlanningSession, VisitPlanningStop } from '../types/visit-planning';

vi.mock('../services/visit-planning.service', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  listStops:    vi.fn().mockResolvedValue([]),
}));

function makeSession(overrides: Partial<VisitPlanningSession> = {}): VisitPlanningSession {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: 'sess-1', userId: 'user-1', title: 'Giro Napoli',
    horizon: 'day', mode: 'balanced', status: 'planned',
    startDate: today, endDate: today,
    startLocationLabel: null, startLat: null, startLng: null,
    endLocationLabel: null, endLat: null, endLng: null,
    constraintsJson: {}, metricsJson: {},
    navigationStartedAt: null, activeStopId: null, generatedAt: null,
    createdAt: today, updatedAt: today,
    ...overrides,
  };
}

describe('HomeVisitWidget', () => {
  test('mostra messaggio "nessun giro oggi" se nessuna sessione', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={null} stops={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/nessun giro/i)).toBeInTheDocument();
  });

  test('mostra il titolo della sessione di oggi', () => {
    const session = makeSession();
    render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={session} stops={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText('Giro Napoli')).toBeInTheDocument();
  });

  test('mostra il numero di tappe', () => {
    const session = makeSession();
    const stops: VisitPlanningStop[] = [
      { id: 's1', sessionId: 'sess-1', userId: 'u1', sourceType: 'archibald', sourceId: '55.374',
        displayName: 'Dr. Rossi', appointmentId: null, stopDate: session.startDate, sequence: 1,
        status: 'confirmed', locked: false, estimatedArrival: null, estimatedDeparture: null,
        visitMinutes: 30, travelMinutesFromPrevious: null, distanceKmFromPrevious: null,
        scoreTotal: null, scoreBreakdownJson: {}, recommendationReasons: [], alerts: [],
        manualNote: null, skipReason: null, visitedAt: null,
        createdAt: '', updatedAt: '' },
    ];
    render(
      <MemoryRouter>
        <HomeVisitWidget todaySession={session} stops={stops} />
      </MemoryRouter>
    );
    expect(screen.getByText(/1 tappa/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9.2: Esegui — verifica fallisce**

```bash
npm test -- --run src/components/HomeVisitWidget.spec.tsx 2>&1 | tail -3
```

- [ ] **Step 9.3: Implementa il componente**

```tsx
// HomeVisitWidget.tsx
import { Link } from 'react-router-dom';
import type { VisitPlanningSession, VisitPlanningStop, StopStatus } from '../types/visit-planning';
import { STOP_STATUS_COLORS } from '../types/visit-planning';

type Props = {
  todaySession: VisitPlanningSession | null;
  stops:        VisitPlanningStop[];
};

const CONFIRMED: StopStatus[] = ['confirmed', 'planned', 'to_call'];

export function HomeVisitWidget({ todaySession, stops }: Props) {
  if (!todaySession) {
    return (
      <Link to="/giri" style={{ textDecoration: 'none' }}>
        <div style={{
          background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10,
          padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>🗺️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Nessun giro pianificato oggi</div>
            <div style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>Pianifica il tuo giro →</div>
          </div>
        </div>
      </Link>
    );
  }

  const activeStops = stops.filter(s => CONFIRMED.includes(s.status));
  const visitedCount = stops.filter(s => s.status === 'visited').length;
  const nextStop = activeStops[0] ?? null;

  return (
    <Link to={`/giri/${todaySession.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'white', border: '2px solid #2563eb', borderRadius: 10,
        padding: '12px 14px', marginBottom: 12,
        boxShadow: '0 2px 8px rgba(37,99,235,.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>🗺️ {todaySession.title}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {activeStops.length} {activeStops.length === 1 ? 'tappa' : 'tappe'} · {visitedCount} visitate
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>Apri →</span>
        </div>

        {nextStop && (
          <div style={{ background: '#eff6ff', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STOP_STATUS_COLORS[nextStop.status], flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Prossima:</span> {nextStop.displayName}
              {nextStop.estimatedArrival && (
                <span style={{ color: '#6b7280', marginLeft: 6 }}>
                  {new Date(nextStop.estimatedArrival).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 9.4: Esegui — verifica passa**

```bash
npm test -- --run src/components/HomeVisitWidget.spec.tsx 2>&1 | tail -5
```

Output atteso: `✓ 3 tests passed`.

- [ ] **Step 9.5: Commit**

```bash
git add archibald-web-app/frontend/src/components/HomeVisitWidget.tsx \
        archibald-web-app/frontend/src/components/HomeVisitWidget.spec.tsx
git commit -m "feat(giri-visite): HomeVisitWidget con sessione di oggi e prossima tappa"
```

---

## Task 10 — Routing, DashboardNav e Dashboard

**Files:**
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Modify: `archibald-web-app/frontend/src/components/DashboardNav.tsx`
- Modify: `archibald-web-app/frontend/src/pages/Dashboard.tsx`

- [ ] **Step 10.1: Aggiungi import e route in AppRouter.tsx**

Nella sezione import di `AppRouter.tsx`:

```typescript
import { VisitPlanningPage } from './pages/VisitPlanningPage';
import { VisitPlanningSessionPage } from './pages/VisitPlanningSessionPage';
```

Nella sezione `<Routes>` di `AppRouter.tsx`, dopo la route `/agenda`:

```tsx
<Route path="/giri" element={<VisitPlanningPage />} />
<Route path="/giri/:sessionId" element={<VisitPlanningSessionPage />} />
```

- [ ] **Step 10.2: Aggiungi voce "Giri" in DashboardNav.tsx**

Nel file `DashboardNav.tsx`, nell'array `links`, dopo `{ path: '/agenda', label: '📅 Agenda' }` aggiungi:

```typescript
{ path: '/giri', label: '🗺️ Giri' },
```

- [ ] **Step 10.3: Leggi Dashboard.tsx e individua il punto di inserimento**

```bash
head -80 archibald-web-app/frontend/src/pages/Dashboard.tsx
```

Cerca la prima occorrenza di `return (` nel componente principale — il widget va inserito come **primo figlio** del container principale, prima di qualsiasi KPI o widget esistente.

Poi aggiungi `HomeVisitWidget` come segue:

```tsx
// In Dashboard.tsx — aggiunge import:
import { HomeVisitWidget } from '../components/HomeVisitWidget';

// Aggiunge stato per sessione di oggi:
const [todaySession, setTodaySession] = useState<VisitPlanningSession | null>(null);
const [todayStops, setTodayStops]     = useState<VisitPlanningStop[]>([]);

// In useEffect, aggiunge fetch sessione oggi:
const today = new Date().toISOString().slice(0, 10);
vpService.listSessions({ from: today, to: today, status: 'planned' })
  .then(async sessions => {
    const active = sessions.find(s => s.status === 'planned' || s.status === 'in_progress') ?? sessions[0] ?? null;
    setTodaySession(active ?? null);
    if (active) {
      const stops = await vpService.listStops(active.id);
      setTodayStops(stops);
    }
  })
  .catch(() => {}); // widget opzionale, non blocca dashboard

// Nel JSX, prima della sezione KPI:
<HomeVisitWidget todaySession={todaySession} stops={todayStops} />
```

**Nota:** `Dashboard.tsx` è un file molto grande. Leggi prima le prime 80 righe per capire la struttura, poi inserisci il widget nella posizione corretta senza riscrivere il file.

- [ ] **Step 10.4: Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Output atteso: 0 errori.

- [ ] **Step 10.5: Test frontend completo**

```bash
npm test --prefix archibald-web-app/frontend 2>&1 | tail -10
```

Output atteso: tutti i test passano.

- [ ] **Step 10.6: Commit**

```bash
git add archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/src/components/DashboardNav.tsx \
        archibald-web-app/frontend/src/pages/Dashboard.tsx
git commit -m "feat(giri-visite): routing /giri + voce navbar + HomeVisitWidget in Dashboard"
```

---

## Task 11 — Estensione scheda cliente universale (Fase 5 / D12)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx`

La scheda cliente esistente si apre con `/customers/:erpId`. L'estensione aggiunge supporto per clienti con prefisso `arca:` e mostra storico FT/KT aggregato.

- [ ] **Step 11.1: Leggi CustomerProfilePage.tsx per trovare il punto di inserimento**

```bash
grep -n "lastOrders\|fresis\|FT\|storico\|history\|visit-brief" \
  archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx | head -20
wc -l archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
```

- [ ] **Step 11.2: Aggiungi sezione "Storico aggregato" e risoluzione sorgente**

Il pattern da applicare nel file:

```typescript
// 1. Importa il service e i tipi
import * as vpService from '../services/visit-planning.service';
import type { VisitBrief } from '../types/visit-planning';

// 2. Aggiungi stato
const [visitBrief, setVisitBrief] = useState<VisitBrief | null>(null);

// 3. Risolvi sorgente dall'erpId del param
const { erpId } = useParams<{ erpId: string }>();
const sourceType = erpId?.startsWith('arca:') ? 'arca' : 'archibald';
const sourceId   = erpId?.startsWith('arca:') ? erpId.slice(5) : erpId ?? '';

// 4. Carica brief in useEffect (opzionale, non bloccante)
useEffect(() => {
  if (!sourceId) return;
  vpService.getVisitBrief(sourceType, sourceId)
    .then(setVisitBrief)
    .catch(() => {}); // non blocca la scheda cliente
}, [sourceType, sourceId]);

// 5. Nel JSX, aggiunge sezione storico aggregato se visitBrief disponibile
{visitBrief && visitBrief.lastOrders.length > 0 && (
  <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📦 Storico ordini aggregato</div>
    {visitBrief.lastOrders.slice(0, 5).map((o, i) => (
      <div key={i} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 6, marginBottom: 6, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#0891b2', fontWeight: 600 }}>{o.docRef}</span>
          <span>€{o.amountImponibile.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {o.date.slice(0, 10)} · {o.source === 'fresis' ? 'Fresis' : 'Archibald'}
        </div>
      </div>
    ))}
    {visitBrief.matchedSources.length > 1 && (
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
        Fonti: {visitBrief.matchedSources.map(s => `${s.type === 'arca' ? '[F]' : '[A]'} ${s.name}`).join(', ')}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 11.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 11.4: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(giri-visite): estensione CustomerProfilePage con storico aggregato FT/KT e supporto sorgente arca"
```

---

## Checklist Gate Piano 1c completato

- [ ] `npm run type-check --prefix archibald-web-app/frontend` — 0 errori
- [ ] `npm test --prefix archibald-web-app/frontend` — tutti i test passano (inclusi i nuovi)
- [ ] `/giri` si apre senza crash, lista vuota mostra messaggio corretto
- [ ] `+ Nuovo giro` apre wizard 3 step, crea sessione, naviga a `/giri/:id`
- [ ] `/giri/:id` mostra lista tappe e mappa (anche vuote)
- [ ] Dashboard mostra `HomeVisitWidget` (nessun giro se nessuna sessione oggi)
- [ ] `DashboardNav` mostra voce "🗺️ Giri"
- [ ] Mobile 375px: nessun overflow orizzontale in `/giri` e `/giri/:id`
- [ ] `ArrivalBanner` non appare se `navigationStartedAt` è null
