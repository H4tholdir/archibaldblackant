# Giri Visite — Piano 1f: Fase 7 — Weekly Planner

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando si crea un giro con `horizon='week'`, generare automaticamente una distribuzione multi-giorno: clienti raggruppati per zona/città, assegnati ai 5 giorni lun-ven della settimana, ordinati per score.

**Architecture:** Nuovo service `visit-weekly-planner-service.ts` che usa `buildCandidates` per avere tutti i candidati, li raggruppa per città, ordina i cluster per score aggregato, e assegna ogni cluster a un giorno. Il router `POST /sessions/:id/generate` usa già `session.horizon` — basta aggiungere la branch `if (horizon === 'week')`.

**Tech Stack:** Express, TypeScript strict, pg, Vitest

**Prerequisiti:** Piano 1d completato e deployato.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/services/visit-weekly-planner-service.ts` | Crea | Logica distribuzione settimanale |
| `backend/src/services/visit-weekly-planner-service.spec.ts` | Crea | Test TDD |
| `backend/src/routes/visit-planning-router.ts` | Modifica | Usa weekly planner per horizon='week' |

---

## Task 1 — Service visit-weekly-planner-service

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-weekly-planner-service.ts`
- Create: `archibald-web-app/backend/src/services/visit-weekly-planner-service.spec.ts`

- [ ] **Step 1.1: Scrivi il test fallente**

```typescript
// visit-weekly-planner-service.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { groupCandidatesByCity, assignClustersToWeekDays } from './visit-weekly-planner-service';
import type { CustomerProfile } from '../db/repositories/visit-planning-types';

function makeProfile(id: string, city: string): CustomerProfile {
  return {
    sourceType: 'archibald', sourceId: id, displayName: `Cliente ${id}`,
    street: null, postalCode: null, city, province: null,
    phone: null, email: null, vatNumber: null,
    lat: null, lng: null, geoQuality: 'unknown',
    isDistributor: false, matchedSources: [],
  };
}

describe('groupCandidatesByCity', () => {
  test('raggruppa profili per città normalizzata', () => {
    const profiles = [
      { profile: makeProfile('1', 'Napoli'), score: 0.8 },
      { profile: makeProfile('2', 'napoli'), score: 0.6 }, // stessa città, case diverso
      { profile: makeProfile('3', 'Salerno'), score: 0.9 },
    ];
    const groups = groupCandidatesByCity(profiles);
    expect(groups.size).toBe(2); // NAPOLI e SALERNO
    expect(groups.get('NAPOLI')?.length).toBe(2);
    expect(groups.get('SALERNO')?.length).toBe(1);
  });
});

describe('assignClustersToWeekDays', () => {
  test('assegna i cluster ai 5 giorni lavorativi da startDate', () => {
    // startDate = lunedì
    const startDate = '2026-06-09'; // lunedì
    const clusters = new Map([
      ['NAPOLI',  [{ profile: makeProfile('1', 'Napoli'),  score: 0.8 }]],
      ['SALERNO', [{ profile: makeProfile('2', 'Salerno'), score: 0.7 }]],
      ['POTENZA', [{ profile: makeProfile('3', 'Potenza'), score: 0.6 }]],
    ]);
    const result = assignClustersToWeekDays(clusters, startDate);
    // 3 cluster → 3 giorni
    expect(result.size).toBe(3);
    expect(result.has('2026-06-09')).toBe(true); // lun
    expect(result.has('2026-06-10')).toBe(true); // mar
    expect(result.has('2026-06-11')).toBe(true); // mer
  });

  test('salta sabato e domenica', () => {
    const startDate = '2026-06-05'; // venerdì
    const clusters = new Map([
      ['NAPOLI',  [{ profile: makeProfile('1', 'Napoli'),  score: 0.8 }]],
      ['SALERNO', [{ profile: makeProfile('2', 'Salerno'), score: 0.7 }]],
    ]);
    const result = assignClustersToWeekDays(clusters, startDate);
    // venerdì poi lunedì (salta sab/dom)
    expect(result.has('2026-06-05')).toBe(true);
    expect(result.has('2026-06-09')).toBe(true); // lunedì successivo
    expect(result.has('2026-06-06')).toBe(false); // sabato
    expect(result.has('2026-06-07')).toBe(false); // domenica
  });
});
```

- [ ] **Step 1.2: Verifica fallisce**

```bash
cd archibald-web-app/backend
npx vitest run src/services/visit-weekly-planner-service.spec.ts 2>&1 | tail -3
```

- [ ] **Step 1.3: Implementa il service**

```typescript
// visit-weekly-planner-service.ts
import type { DbPool } from '../db/pool';
import type {
  VisitPlanningSessionId, VisitPlanningStop,
  VisitMode, CustomerProfile,
} from '../db/repositories/visit-planning-types';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import { buildCandidates } from './visit-generate-service';
import { nearestNeighborSort } from './visit-planner';

type ScoredProfile = { profile: CustomerProfile; score: number };

// Raggruppa candidati per città normalizzata (UPPERCASE TRIM)
export function groupCandidatesByCity(
  candidates: ScoredProfile[],
): Map<string, ScoredProfile[]> {
  const groups = new Map<string, ScoredProfile[]>();
  for (const c of candidates) {
    const cityKey = (c.profile.city ?? 'UNKNOWN').toUpperCase().trim();
    const existing = groups.get(cityKey) ?? [];
    existing.push(c);
    groups.set(cityKey, existing);
  }
  return groups;
}

// Calcola la prossima data lavorativa (lun-ven) da una data
function nextWorkDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  // 0=dom, 6=sab
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Assegna i cluster ai giorni lavorativi partendo da startDate
// I cluster sono ordinati per score aggregato (il migliore va al primo giorno)
export function assignClustersToWeekDays(
  clusters: Map<string, ScoredProfile[]>,
  startDate: string,
): Map<string, ScoredProfile[]> {
  // Ordina cluster per score aggregato discendente
  const sorted = [...clusters.entries()]
    .map(([city, profs]) => ({
      city,
      profs,
      totalScore: profs.reduce((sum, p) => sum + p.score, 0),
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const result = new Map<string, ScoredProfile[]>();
  let currentDate = new Date(startDate + 'T00:00:00Z');
  // startDate è già il primo giorno, salta solo sabato/domenica
  if (currentDate.getDay() === 0) currentDate = nextWorkDay(currentDate);
  else if (currentDate.getDay() === 6) currentDate = nextWorkDay(currentDate);

  for (const { profs } of sorted) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    result.set(dateStr, profs);
    currentDate = nextWorkDay(currentDate);
  }

  return result;
}

// Genera distribuzione settimanale: crea stop per ogni giorno
export async function generateWeeklyDistribution(
  pool: DbPool,
  userId: string,
  sessionId: VisitPlanningSessionId,
  mode: VisitMode,
  startDate: string,
  startLat: number | null,
  startLng: number | null,
): Promise<VisitPlanningStop[]> {
  const candidates = await buildCandidates(pool, userId, mode);
  if (candidates.length === 0) return [];

  const groups = groupCandidatesByCity(candidates);
  const dayAssignments = assignClustersToWeekDays(groups, startDate);

  const allStops: VisitPlanningStop[] = [];
  let globalSeq = 1;

  for (const [stopDate, dayCandidates] of dayAssignments) {
    // Ordina per nearest-neighbor per ogni giorno
    const sorted = nearestNeighborSort(
      dayCandidates.map(c => ({ profile: c.profile, score: c.score, locked: false })),
      { lat: startLat, lng: startLng },
    );

    for (const c of sorted.slice(0, 10)) { // max 10 clienti per giorno
      const stop = await createStop(pool, sessionId, userId, {
        sourceType: 'archibald',
        sourceId:   c.profile.sourceId,
        displayName: c.profile.displayName,
        stopDate,
        status:     'suggested',
        visitMinutes: 30,
        sequence:   globalSeq++,
        scoreTotal: c.score,
        recommendationReasons: [`Zona ${c.profile.city ?? '?'} — giorno ${stopDate}`],
      });
      allStops.push(stop);
    }
  }

  await updateSession(pool, userId, sessionId, {
    status:      'planned',
    generatedAt: new Date().toISOString(),
  });

  return allStops;
}
```

- [ ] **Step 1.4: Verifica test passano**

```bash
cd archibald-web-app/backend
npx vitest run src/services/visit-weekly-planner-service.spec.ts 2>&1 | tail -8
npm run build 2>&1 | tail -3
```

Atteso: 4 test passano.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-weekly-planner-service.ts \
        archibald-web-app/backend/src/services/visit-weekly-planner-service.spec.ts
git commit -m "feat(giri-visite): visit-weekly-planner-service — distribuzione clienti per zona/giorno"
```

---

## Task 2 — Route: usa weekly planner per horizon='week'

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

- [ ] **Step 2.1: Aggiungi import**

In cima a `visit-planning-router.ts`:

```typescript
import { generateWeeklyDistribution } from '../services/visit-weekly-planner-service';
```

- [ ] **Step 2.2: Modifica l'endpoint generate**

Nell'endpoint `POST /sessions/:sessionId/generate` già esistente, trova la riga:

```typescript
      const stops = await generateVisitRoute(
```

E sostituisci il blocco con:

```typescript
      const stops = session.horizon === 'week'
        ? await generateWeeklyDistribution(
            pool, userId, sid,
            session.mode, stopDate,
            startLat, startLng,
          )
        : await generateVisitRoute(
            pool, userId, sid,
            session.mode, session.horizon,
            startLat, startLng, stopDate,
          );
```

- [ ] **Step 2.3: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 2.4: Commit + push**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts
git commit -m "feat(giri-visite): genera distribuzione settimanale quando horizon='week'"
git push origin master
```

---

## Checklist Gate Piano 1f

- [ ] `POST /sessions/:id/generate` su sessione con `horizon='week'` → crea stop su più giorni lun-ven
- [ ] Stesso endpoint su `horizon='day'` → comportamento invariato
- [ ] Build + test passano
- [ ] Deploy CI/CD completato
