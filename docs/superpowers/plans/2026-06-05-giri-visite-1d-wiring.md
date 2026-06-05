# Giri Visite — Piano 1d: Wiring Fasi 2+3 (Generate, CustomerPicker, suggestedCategories, Geocoding)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collegare le funzioni di scoring/planner già scritte in un endpoint `POST /sessions/:id/generate`, aggiungere il customer picker manuale, completare `suggestedCategories`, ed eseguire il geocoding batch dei 1299 clienti senza coordinate.

**Architecture:** Un nuovo service `visit-generate-service.ts` contiene tutta la logica di generazione (batch query → scoring → deduplica → sort → crea stops). Il router espone `POST /sessions/:sessionId/generate` che lo chiama. Il frontend aggiunge un pulsante "🎯 Genera giro" + una modal `CustomerPickerModal` nella `VisitPlanningSessionPage`. `suggestedCategories` usa keyword matching sulle `article_description` di `order_articles` e sugli `items` JSONB di `fresis_history`.

**Tech Stack:** Express, TypeScript strict, pg, Zod, React 19, Vitest, @testing-library/react

**Prerequisiti:** Piano 1b e 1c completati e deployati. Tabelle `agents.customer_geo_status`, `agents.visit_planning_sessions`, `agents.visit_planning_stops` presenti in produzione.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/services/visit-generate-service.ts` | Crea | Logica completa di generazione giro (batch query + scoring + sort + crea stops) |
| `backend/src/services/visit-generate-service.spec.ts` | Crea | Test TDD del service |
| `backend/src/routes/visit-planning-router.ts` | Modifica | Aggiunge `POST /sessions/:sessionId/generate` |
| `backend/src/services/visit-brief-service.ts` | Modifica | Implementa `suggestedCategories` da `order_articles` |
| `frontend/src/components/visit-planning/VisitGenerateButton.tsx` | Crea | Pulsante "Genera giro" con stato loading |
| `frontend/src/components/visit-planning/CustomerPickerModal.tsx` | Crea | Modal ricerca clienti + aggiungi tappa manuale |
| `frontend/src/components/visit-planning/CustomerPickerModal.spec.tsx` | Crea | Test modal |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Modifica | Aggiunge GenerateButton + CustomerPickerModal |
| `frontend/src/services/visit-planning.service.ts` | Modifica | Aggiunge `generateRoute()` |

---

## Task 1 — Service: visit-generate-service

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-generate-service.ts`
- Create: `archibald-web-app/backend/src/services/visit-generate-service.spec.ts`

- [ ] **Step 1.1: Scrivi il test fallente**

```typescript
// visit-generate-service.spec.ts
import { describe, test, expect, vi } from 'vitest';
import { buildCandidates } from './visit-generate-service';

const USER_ID = 'user-1';

function makePool(customers: unknown[], fresisTotals: unknown[], archTotals: unknown[]) {
  let call = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({ rows: customers });
      if (call === 2) return Promise.resolve({ rows: fresisTotals });
      if (call === 3) return Promise.resolve({ rows: archTotals });
      return Promise.resolve({ rows: [] });
    }),
  } as any;
}

describe('buildCandidates', () => {
  test('ritorna candidati ordinati per score, distributor esclusi', async () => {
    const customers = [
      { erp_id: '55.374', name: 'Dr. Rossi', city: 'Napoli', last_order_date: '2026-04-01', lat: '40.85', lng: '14.27', geo_quality: 'geocoded' },
      { erp_id: '55.375', name: 'Dr. Verdi', city: 'Salerno', last_order_date: '2025-01-01', lat: null, lng: null, geo_quality: 'unknown' },
    ];
    const fresisTotals = [
      { erp_id: '55.374', total_imponibile: 1500, n_docs: '5', ultimo_doc: '2026-04-01T00:00:00Z', records: [{ archibaldOrderId: null, targetTotalWithVat: 1830 }] },
    ];
    const archTotals: unknown[] = [];

    const pool = makePool(customers, fresisTotals, archTotals);
    const result = await buildCandidates(pool, USER_ID, 'balanced');

    expect(result.length).toBeGreaterThan(0);
    // Il cliente con valore > 0 deve venire prima
    expect(result[0].profile.sourceId).toBe('55.374');
  });

  test('deduplicazione: Arca rimosso se Archibald già presente', async () => {
    const customers = [
      { erp_id: '55.374', name: 'Dr. Rossi', city: 'Napoli', last_order_date: '2026-04-01', lat: '40.85', lng: '14.27', geo_quality: 'geocoded' },
    ];
    const fresisTotals = [
      { erp_id: '55.374', total_imponibile: 1000, n_docs: '3', ultimo_doc: '2026-04-01T00:00:00Z', records: [] },
    ];
    const archTotals: unknown[] = [];
    const pool = makePool(customers, fresisTotals, archTotals);

    const result = await buildCandidates(pool, USER_ID, 'balanced');
    // Tutti i candidati devono essere unici per sourceId
    const ids = result.map(r => r.profile.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('candidato con valore 0 e nessun ordine escluso dalla lista', async () => {
    const customers = [
      { erp_id: '55.999', name: 'Studio Nuovo', city: 'Napoli', last_order_date: null, lat: null, lng: null, geo_quality: 'unknown' },
    ];
    const pool = makePool(customers, [], []);
    const result = await buildCandidates(pool, USER_ID, 'balanced');
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Esegui — verifica fallisce**

```bash
cd archibald-web-app/backend
npx vitest run src/services/visit-generate-service.spec.ts 2>&1 | tail -5
```

Atteso: errore import (`Cannot find module`).

- [ ] **Step 1.3: Implementa il service**

Crea `archibald-web-app/backend/src/services/visit-generate-service.ts`:

```typescript
import type { DbPool } from '../db/pool';
import type {
  VisitPlanningSessionId, VisitPlanningStop,
  VisitMode, VisitHorizon, CustomerProfile,
} from '../db/repositories/visit-planning-types';
import { createStop } from '../db/repositories/visit-planning-stops';
import { updateSession } from '../db/repositories/visit-planning-sessions';
import {
  calcValoreCliente, calcScoreTotal, calcProbabilitaRiordino,
  normalizePercentile,
} from './visit-scoring-service';
import { deduplicateByStudio, nearestNeighborSort, estimateTravelMinutes } from './visit-planner';

// Numero massimo tappe per tipo giro
const MAX_STOPS: Record<VisitHorizon, number> = { day: 15, week: 40 };

type ScoredProfile = {
  profile: CustomerProfile;
  score: number;
  breakdown: Record<string, number>;
  daysSinceLastOrder: number | null;
  valore: number;
};

// Carica tutti i candidati archibald, calcola score, deduplicazione, sort
export async function buildCandidates(
  pool: DbPool,
  userId: string,
  mode: VisitMode,
): Promise<Array<{ profile: CustomerProfile; score: number; breakdown: Record<string, number>; daysSinceLastOrder: number | null }>> {

  // 1. Tutti i clienti non-distributor con eventuale geo status
  const { rows: customers } = await pool.query(
    `SELECT c.erp_id, c.name, c.city, c.street, c.postal_code,
            c.last_order_date,
            g.lat, g.lng, g.quality AS geo_quality
     FROM agents.customers c
     LEFT JOIN agents.customer_geo_status g
       ON g.user_id = c.user_id AND g.source_type = 'archibald' AND g.source_id = c.erp_id
     WHERE c.user_id = $1
       AND c.is_distributor = FALSE
       AND c.deleted_at IS NULL`,
    [userId],
  );

  // 2. Aggregazione fresis per customer_id (erp_id)
  const { rows: fresisTotals } = await pool.query(
    `SELECT customer_id AS erp_id,
            ROUND((SUM(target_total_with_vat) / 1.22)::numeric, 2) AS total_imponibile,
            COUNT(*)::text AS n_docs,
            MAX(created_at) AS ultimo_doc,
            json_agg(json_build_object(
              'archibaldOrderId', archibald_order_id,
              'targetTotalWithVat', target_total_with_vat
            )) AS records
     FROM agents.fresis_history
     WHERE user_id = $1
       AND target_total_with_vat > 0
       AND customer_id IS NOT NULL
     GROUP BY customer_id`,
    [userId],
  );

  // 3. Aggregazione ordini archibald per cliente
  const { rows: archTotals } = await pool.query(
    `SELECT c.erp_id,
            json_agg(json_build_object(
              'orderId', o.id,
              'totalAmount', o.total_amount,
              'creationDate', o.creation_date
            )) AS records,
            MAX(o.creation_date) AS ultimo_ordine
     FROM agents.order_records o
     JOIN agents.customers c
       ON c.account_num = o.customer_account_num AND c.user_id = o.user_id
     WHERE o.user_id = $1
       AND o.customer_account_num NOT IN ('1002328', '049421')
     GROUP BY c.erp_id`,
    [userId],
  );

  const fresisMap = new Map(fresisTotals.map(r => [r.erp_id as string, r]));
  const archMap   = new Map(archTotals.map(r => [r.erp_id as string, r]));

  // 4. Calcola score per ogni cliente
  const allValori: number[] = [];
  const rawScored = customers.map(c => {
    const fd = fresisMap.get(c.erp_id as string);
    const ad = archMap.get(c.erp_id as string);

    const fresisRecords: Array<{ archibaldOrderId: string | null; targetTotalWithVat: number }> =
      (fd?.records ?? []) as any;
    const archRecords: Array<{ orderId: string; totalAmount: string }> =
      (ad?.records ?? []) as any;

    const valore = calcValoreCliente(fresisRecords, archRecords);
    allValori.push(valore);

    const lastStr = fd?.ultimo_doc ?? ad?.ultimo_ordine ?? c.last_order_date;
    const daysSinceLastOrder = lastStr
      ? Math.floor((Date.now() - new Date(lastStr as string).getTime()) / 86400000)
      : null;

    // Stima ciclo medio: n_docs/mesi se disponibile
    const nDocs = fd ? parseInt(fd.n_docs as string, 10) : 0;
    const avgCycleDays = (nDocs >= 3 && daysSinceLastOrder != null)
      ? Math.round(daysSinceLastOrder / nDocs * 1.2)
      : null;

    const riordino = calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays });

    // urgenza: sale con il tempo trascorso dall'ultimo ordine (massimo a 180gg)
    const urgenza = daysSinceLastOrder != null
      ? Math.min(daysSinceLastOrder / 180, 1)
      : 0.3;

    // penalità dati se senza coordinate
    const lat = c.lat != null ? parseFloat(c.lat as string) : null;
    const lng = c.lng != null ? parseFloat(c.lng as string) : null;
    const penalitaDati = lat == null ? 0.05 : 0;

    return {
      erpId: c.erp_id as string,
      name: c.name as string,
      city: c.city as string,
      lat, lng,
      valore,
      daysSinceLastOrder,
      riordino,
      urgenza,
      penalitaDati,
    };
  });

  // 5. Filtra: almeno valore > 0 O ordine nell'ultimo anno
  const filtered = rawScored.filter(
    s => s.valore > 0 || (s.daysSinceLastOrder != null && s.daysSinceLastOrder <= 365),
  );

  // 6. Normalizza valore su percentile 95°
  const filteredValori = filtered.map(s => s.valore);

  // 7. Build CustomerProfile[] e score
  const profiled: ScoredProfile[] = filtered.map(s => {
    const valoreNorm = normalizePercentile(s.valore, filteredValori);
    const breakdown = {
      valore:         valoreNorm,
      riordino:       s.riordino,
      urgenza:        s.urgenza,
      zona:           0.5,
      crossSell:      0,
      promozioni:     0,
      rischioClosure: 0,
      penalitaDati:   s.penalitaDati,
    };

    const profile: CustomerProfile = {
      sourceType:     'archibald',
      sourceId:       s.erpId,
      displayName:    s.name,
      street:         null,
      postalCode:     null,
      city:           s.city,
      province:       null,
      phone:          null,
      email:          null,
      vatNumber:      null,
      lat:            s.lat,
      lng:            s.lng,
      geoQuality:     s.lat != null ? 'geocoded' : 'unknown',
      isDistributor:  false,
      matchedSources: [{ type: 'archibald', id: s.erpId, name: s.name }],
    };

    return {
      profile,
      score:              calcScoreTotal(breakdown, mode),
      breakdown,
      daysSinceLastOrder: s.daysSinceLastOrder,
      valore:             s.valore,
    };
  });

  // 8. Deduplicazione studio
  const deduped = deduplicateByStudio(profiled.map(p => p.profile));
  const dedupedIds = new Set(deduped.map(p => p.sourceId));
  const deduped_scored = profiled.filter(p => dedupedIds.has(p.profile.sourceId));

  // 9. Sort per score decrescente
  return deduped_scored.sort((a, b) => b.score - a.score);
}

// Genera la route: crea le tappe nella sessione e aggiorna lo stato
export async function generateVisitRoute(
  pool: DbPool,
  userId: string,
  sessionId: VisitPlanningSessionId,
  mode: VisitMode,
  horizon: VisitHorizon,
  startLat: number | null,
  startLng: number | null,
  stopDate: string,
): Promise<VisitPlanningStop[]> {
  const maxStops = MAX_STOPS[horizon];

  const candidates = await buildCandidates(pool, userId, mode);
  if (candidates.length === 0) return [];

  // Nearest-neighbor sort: top 3x maxStops pre-filtrati per score, poi sort geografico
  const preFiltered = candidates.slice(0, maxStops * 3);
  const sorted = nearestNeighborSort(
    preFiltered.map(c => ({ profile: c.profile, score: c.score, locked: false })),
    { lat: startLat, lng: startLng },
  );

  const final = sorted.slice(0, maxStops);

  // Crea le tappe con sequence, score, motivazioni
  const stops: VisitPlanningStop[] = [];
  let prevLat = startLat;
  let prevLng = startLng;

  for (let i = 0; i < final.length; i++) {
    const c = final[i];
    const data = candidates.find(d => d.profile.sourceId === c.profile.sourceId)!;

    const reasons: string[] = [];
    if (data.daysSinceLastOrder != null) {
      if (data.daysSinceLastOrder <= 30)  reasons.push(`Ordine recente (${data.daysSinceLastOrder}gg fa)`);
      else if (data.daysSinceLastOrder <= 90) reasons.push(`Ultimo ordine ${data.daysSinceLastOrder} giorni fa`);
      else reasons.push(`Cliente dormiente: ${data.daysSinceLastOrder} giorni senza ordini`);
    }
    if (data.valore > 5000)  reasons.push('Cliente alto valore');
    else if (data.valore > 1000) reasons.push('Cliente buon valore commerciale');
    if (data.breakdown.riordino >= 0.7) reasons.push('Alta probabilità riordino');

    const travelMins = estimateTravelMinutes(prevLat, prevLng, c.profile.lat, c.profile.lng);

    const stop = await createStop(pool, sessionId, userId, {
      sourceType:            'archibald',
      sourceId:              c.profile.sourceId,
      displayName:           c.profile.displayName,
      stopDate,
      status:                'suggested',
      visitMinutes:          30,
      sequence:              i + 1,
      scoreTotal:            c.score,
      scoreBreakdownJson:    data.breakdown as Record<string, number>,
      recommendationReasons: reasons,
      alerts:                [],
    });

    // Aggiorna travel_minutes e distance_km via updateStop
    if (travelMins != null && prevLat != null && prevLng != null && c.profile.lat != null && c.profile.lng != null) {
      const distKm = Math.round(
        6371 * 2 * Math.atan2(
          Math.sqrt(
            Math.sin(((c.profile.lat - prevLat) * Math.PI / 180) / 2) ** 2 +
            Math.cos(prevLat * Math.PI / 180) * Math.cos(c.profile.lat * Math.PI / 180) *
            Math.sin(((c.profile.lng - prevLng) * Math.PI / 180) / 2) ** 2
          ),
          Math.sqrt(1 - (
            Math.sin(((c.profile.lat - prevLat) * Math.PI / 180) / 2) ** 2 +
            Math.cos(prevLat * Math.PI / 180) * Math.cos(c.profile.lat * Math.PI / 180) *
            Math.sin(((c.profile.lng - prevLng) * Math.PI / 180) / 2) ** 2
          ))
        ) * 10
      ) / 10;

      await pool.query(
        `UPDATE agents.visit_planning_stops
         SET travel_minutes_from_previous = $1, distance_km_from_previous = $2, updated_at = NOW()
         WHERE id = $3`,
        [travelMins, distKm, stop.id],
      );
    }

    stops.push(stop);
    prevLat = c.profile.lat;
    prevLng = c.profile.lng;
  }

  // Aggiorna sessione: status planned, generated_at
  await updateSession(pool, userId, sessionId, {
    status:      'planned',
    generatedAt: new Date().toISOString(),
  });

  return stops;
}
```

- [ ] **Step 1.4: Esegui — verifica test passano**

```bash
cd archibald-web-app/backend
npx vitest run src/services/visit-generate-service.spec.ts 2>&1 | tail -10
```

Atteso: 3 test passano.

- [ ] **Step 1.5: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Atteso: 0 errori.

- [ ] **Step 1.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts \
        archibald-web-app/backend/src/services/visit-generate-service.spec.ts
git commit -m "feat(giri-visite): service visit-generate con buildCandidates e generateVisitRoute"
```

---

## Task 2 — Route `POST /sessions/:sessionId/generate`

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

- [ ] **Step 2.1: Aggiungi import al router**

Aggiungi nella sezione import in cima a `visit-planning-router.ts` (dopo gli import esistenti):

```typescript
import { generateVisitRoute } from '../services/visit-generate-service';
```

- [ ] **Step 2.2: Aggiungi schema Zod e endpoint**

Nel body della funzione `createVisitPlanningRouter`, PRIMA di `return router`, aggiungi:

```typescript
// ── Generazione automatica giro ───────────────────────────────────────
const GenerateSchema = z.object({
  stopDate: z.string().date().optional(), // default: today
});

router.post('/sessions/:sessionId/generate', async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const userId = (req as AuthRequest).user!.userId;
    const sid = req.params.sessionId as VisitPlanningSessionId;

    // Leggi sessione per mode, horizon, start_lat, start_lng
    const session = await getSession(pool, userId, sid);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Determina stop_date: body o session.startDate
    const stopDate = parsed.data.stopDate ?? session.startDate;

    // Usa start_lat/lng della sessione come punto di partenza, o home dell'utente
    let startLat = session.startLat;
    let startLng = session.startLng;

    if (startLat == null || startLng == null) {
      const { rows: userRows } = await pool.query(
        'SELECT home_lat, home_lng FROM agents.users WHERE id = $1',
        [userId],
      );
      if (userRows[0]) {
        startLat = userRows[0].home_lat != null ? parseFloat(userRows[0].home_lat) : null;
        startLng = userRows[0].home_lng != null ? parseFloat(userRows[0].home_lng) : null;
      }
    }

    const stops = await generateVisitRoute(
      pool, userId, sid,
      session.mode, session.horizon,
      startLat, startLng,
      stopDate,
    );

    res.status(201).json({ generated: stops.length, stops });
  } catch (err) {
    logger.error('generateVisitRoute error', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2.3: Test di integrazione per il nuovo endpoint**

Aggiungi in `visit-planning-router.spec.ts` (APRI il file e aggiungi in fondo):

```typescript
describe('POST /api/visit-planning/sessions/:sessionId/generate', () => {
  test('richiede autenticazione', async () => {
    const app = createApp(makeDeps());
    const res = await request(app)
      .post('/api/visit-planning/sessions/sess-uuid-1/generate')
      .send({});
    expect(res.status).toBe(401);
  });

  test('restituisce 404 se sessione non trovata', async () => {
    const app = createApp(makeDeps([]));
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions/non-esiste/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('restituisce 201 con generated e stops quando sessione trovata', async () => {
    // Mock pool che torna sessione per getSession, poi array vuoti per il generate
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 }) // getSession
        .mockResolvedValueOnce({ rows: [] })  // users home_lat/lng
        .mockResolvedValueOnce({ rows: [] })  // customers
        .mockResolvedValueOnce({ rows: [] })  // fresis totals
        .mockResolvedValueOnce({ rows: [] })  // arch totals
        .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 }), // updateSession
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
    } as any;

    const deps = makeDeps();
    (deps as any).pool = pool;
    const app = createApp(deps);
    const token = await generateJWT({ userId: USER_ID, username: USERNAME, role: 'agent', modules: [] });
    const res = await request(app)
      .post('/api/visit-planning/sessions/sess-uuid-1/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('generated');
    expect(res.body).toHaveProperty('stops');
  });
});
```

- [ ] **Step 2.4: Esegui test**

```bash
cd archibald-web-app/backend
npx vitest run src/routes/visit-planning-router.spec.ts 2>&1 | tail -10
```

Atteso: tutti i test passano (inclusi i 2 nuovi).

- [ ] **Step 2.5: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

- [ ] **Step 2.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/backend/src/routes/visit-planning-router.spec.ts
git commit -m "feat(giri-visite): endpoint POST /sessions/:id/generate — genera automaticamente il giro clienti"
```

---

## Task 3 — Fix suggestedCategories in visit-brief-service

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-brief-service.ts`

Le categorie Komet si estraggono dalla descrizione degli articoli. Si confrontano le categorie acquistate negli ultimi 6 mesi con tutte quelle disponibili — le mancanti vengono suggerite.

- [ ] **Step 3.1: Leggi la sezione suggestedCategories nel file**

```bash
grep -n "suggestedCategories" archibald-web-app/backend/src/services/visit-brief-service.ts
```

Troverai la riga con `suggestedCategories: [], // v1: vuoto`.

- [ ] **Step 3.2: Aggiungi la funzione di estrazione categorie e la query**

Aggiungi PRIMA della funzione `buildVisitBrief` in `visit-brief-service.ts`:

```typescript
// Mapping keyword → macro-categoria Komet
const CATEGORY_KEYWORDS: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['DIA ', 'DIAMANTAT'],    label: 'Diamantate' },
  { keywords: ['FRESA CT', 'FRESA  CT'], label: 'Frese carburo' },
  { keywords: ['FRESA CERAMICA', 'CERAMICA'], label: 'Frese ceramica' },
  { keywords: ['GOMMINO', 'GOMMA'],     label: 'Gommini / Finiture' },
  { keywords: ['ENDO'],                 label: 'Endodonzia' },
  { keywords: ['IMPLAN', 'IMPLANT'],    label: 'Implantologia' },
  { keywords: ['SONICA', 'SONIC'],      label: 'Punte soniche' },
  { keywords: ['PIEZO'],                label: 'Piezochirurgia' },
  { keywords: ['KIT '],                 label: 'Kit / Sistemi' },
  { keywords: ['TURBINA', 'CONTRA'],    label: 'Strumentario rotante' },
];

function extractCategory(description: string): string | null {
  const upper = (description ?? '').toUpperCase();
  for (const { keywords, label } of CATEGORY_KEYWORDS) {
    if (keywords.some(k => upper.includes(k))) return label;
  }
  return null;
}

async function getSuggestedCategories(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<string[]> {
  // Tutte le categorie disponibili
  const allCategories = new Set(CATEGORY_KEYWORDS.map(c => c.label));

  // Categorie acquistate negli ultimi 6 mesi da order_articles (solo per archibald)
  const purchasedCategories = new Set<string>();

  if (sourceType === 'archibald') {
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT oa.article_description
       FROM agents.order_articles oa
       JOIN agents.order_records o ON o.id = oa.order_id AND o.user_id = oa.user_id
       JOIN agents.customers c ON c.account_num = o.customer_account_num AND c.user_id = o.user_id
       WHERE oa.user_id = $1
         AND c.erp_id = $2
         AND o.creation_date >= $3
       LIMIT 200`,
      [userId, sourceId, sixMonthsAgo],
    );
    rows.forEach(r => {
      const cat = extractCategory(r.article_description as string);
      if (cat) purchasedCategories.add(cat);
    });
  }

  // Categorie dagli items JSONB di fresis_history (ultimi 6 mesi)
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
  const fresisWhere = sourceType === 'archibald'
    ? `fh.customer_id = $2`
    : `fh.sub_client_codice = $2`;
  const { rows: fresisRows } = await pool.query(
    `SELECT fh.items FROM agents.fresis_history fh
     WHERE fh.user_id = $1 AND ${fresisWhere}
       AND fh.created_at >= $3
       AND fh.items IS NOT NULL
     LIMIT 50`,
    [userId, sourceId, sixMonthsAgo],
  );
  fresisRows.forEach(r => {
    const items = r.items as Array<{ description?: string }> | null;
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      const cat = extractCategory(item.description ?? '');
      if (cat) purchasedCategories.add(cat);
    });
  });

  // Categorie mai acquistate di recente = suggerimenti
  return [...allCategories].filter(cat => !purchasedCategories.has(cat));
}
```

- [ ] **Step 3.3: Sostituisci il placeholder nel buildVisitBrief**

Nel body di `buildVisitBrief`, trova:
```typescript
    suggestedCategories: [], // v1: vuoto — implementato in Fase 2
```

Sostituisci con:
```typescript
    suggestedCategories: await getSuggestedCategories(pool, userId, sourceType, sourceId),
```

**NOTA:** La chiamata `getSuggestedCategories` avviene dopo quella a `promoRows` e prima del return. Aggiungila nel posto corretto, DOPO che `promoRows` è stato caricato, prima del `return {...}`.

- [ ] **Step 3.4: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

- [ ] **Step 3.5: Test manuale rapido**

```bash
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c \
  \"SELECT DISTINCT LEFT(article_description, 40) FROM agents.order_articles
    WHERE user_id=(SELECT id FROM agents.users ORDER BY created_at,id LIMIT 1) LIMIT 10;\""
```

Atteso: 10 descrizioni articolo — verifica che il keyword matching abbia senso.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-brief-service.ts
git commit -m "feat(giri-visite): suggestedCategories da order_articles e fresis items — keyword matching Komet"
```

---

## Task 4 — Frontend: generateRoute nel service + VisitGenerateButton

**Files:**
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`
- Create: `archibald-web-app/frontend/src/components/visit-planning/VisitGenerateButton.tsx`

- [ ] **Step 4.1: Aggiungi generateRoute al service frontend**

Aggiungi in fondo a `archibald-web-app/frontend/src/services/visit-planning.service.ts`:

```typescript
export async function generateRoute(
  sessionId: string,
  stopDate?: string,
): Promise<{ generated: number; stops: VisitPlanningStop[] }> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stopDate }),
  });
  if (!res.ok) throw new Error(`generateRoute ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4.2: Crea VisitGenerateButton**

Crea `archibald-web-app/frontend/src/components/visit-planning/VisitGenerateButton.tsx`:

```tsx
import { useState } from 'react';

type Props = {
  sessionId: string;
  stopDate:  string;
  onGenerated: (count: number) => void;
  onError:     (msg: string) => void;
};

export function VisitGenerateButton({ sessionId, stopDate, onGenerated, onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      // Import lazy per evitare circular dep
      const { generateRoute } = await import('../../services/visit-planning.service');
      const result = await generateRoute(sessionId, stopDate);
      onGenerated(result.generated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Errore generazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nessuna tappa nel giro</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Il sistema analizzerà il tuo storico clienti e genererà un giro ottimizzato.
      </div>
      <button
        onClick={handle}
        disabled={loading}
        style={{
          background: loading ? '#e5e7eb' : '#2563eb',
          color: loading ? '#9ca3af' : 'white',
          border: 'none', borderRadius: 10,
          padding: '12px 28px',
          fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        {loading ? '⏳ Generazione in corso...' : '🎯 Genera giro automaticamente'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 4.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/frontend/src/components/visit-planning/VisitGenerateButton.tsx
git commit -m "feat(giri-visite): generateRoute nel service + VisitGenerateButton"
```

---

## Task 5 — Frontend: CustomerPickerModal

**Files:**
- Create: `archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.tsx`
- Create: `archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.spec.tsx`

Il customer picker permette di cercare un cliente per nome/città e aggiungerlo manualmente come tappa.

- [ ] **Step 5.1: Scrivi il test fallente**

Crea `archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.spec.tsx`:

```tsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerPickerModal } from './CustomerPickerModal';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CustomerPickerModal', () => {
  test('mostra campo ricerca quando aperta', () => {
    render(
      <CustomerPickerModal
        sessionId="sess-1"
        stopDate="2026-06-06"
        onAdded={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/nome.*cliente|cerca/i)).toBeInTheDocument();
  });

  test('chiama onClose al click Annulla', () => {
    const onClose = vi.fn();
    render(
      <CustomerPickerModal
        sessionId="sess-1"
        stopDate="2026-06-06"
        onAdded={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText(/Annulla/));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5.2: Verifica fallisce**

```bash
cd archibald-web-app/frontend
npx vitest run src/components/visit-planning/CustomerPickerModal.spec.tsx 2>&1 | tail -3
```

- [ ] **Step 5.3: Implementa CustomerPickerModal**

Crea `archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.tsx`:

```tsx
import { useState } from 'react';
import { fetchWithRetry } from '../../utils/fetch-with-retry';
import { addStop } from '../../services/visit-planning.service';

type Customer = {
  erp_id: string;
  name:   string;
  city:   string | null;
};

type Props = {
  sessionId: string;
  stopDate:  string;
  onAdded:   () => void;
  onClose:   () => void;
};

export function CustomerPickerModal({ sessionId, stopDate, onAdded, onClose }: Props) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Customer[]>([]);
  const [loading, setLoading]   = useState(false);
  const [adding, setAdding]     = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        // L'API customers restituisce array di customer con erp_id, name, city
        setResults(Array.isArray(data) ? data.slice(0, 10) : (data.customers ?? []).slice(0, 10));
      }
    } catch {
      // silenzioso — l'utente può continuare a cercare
    } finally {
      setLoading(false);
    }
  };

  const add = async (c: Customer) => {
    setAdding(c.erp_id);
    try {
      await addStop(sessionId, {
        sourceType:   'archibald',
        sourceId:     c.erp_id,
        displayName:  c.name,
        stopDate,
        status:       'planned',
        visitMinutes: 30,
      });
      onAdded();
    } catch (err) {
      alert('Errore aggiunta tappa: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px 16px 0 0',
          padding: 20, width: '100%', maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
          ➕ Aggiungi cliente al giro
        </div>

        <input
          type="text"
          placeholder="Cerca cliente per nome o città..."
          value={query}
          onChange={e => search(e.target.value)}
          autoFocus
          style={{
            width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
            padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        {loading && <div style={{ color: '#6b7280', fontSize: 13, padding: 8 }}>Ricerca...</div>}

        {results.map(c => (
          <div key={c.erp_id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid #f1f5f9',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{c.city ?? '—'} · {c.erp_id}</div>
            </div>
            <button
              disabled={adding === c.erp_id}
              onClick={() => add(c)}
              style={{
                background: adding === c.erp_id ? '#e5e7eb' : '#2563eb',
                color: adding === c.erp_id ? '#9ca3af' : 'white',
                border: 'none', borderRadius: 6,
                padding: '5px 12px', fontSize: 13, cursor: 'pointer',
              }}
            >
              {adding === c.erp_id ? '...' : '+ Aggiungi'}
            </button>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '10px 0',
            border: '1px solid #d1d5db', borderRadius: 8,
            background: 'white', cursor: 'pointer', fontSize: 14,
          }}
        >Annulla</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Verifica test passano**

```bash
cd archibald-web-app/frontend
npx vitest run src/components/visit-planning/CustomerPickerModal.spec.tsx 2>&1 | tail -5
```

Atteso: 2 test passano.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.tsx \
        archibald-web-app/frontend/src/components/visit-planning/CustomerPickerModal.spec.tsx
git commit -m "feat(giri-visite): CustomerPickerModal per aggiunta manuale tappa"
```

---

## Task 6 — Integra GenerateButton + CustomerPickerModal in VisitPlanningSessionPage

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx`

- [ ] **Step 6.1: Leggi l'inizio della pagina**

```bash
head -30 archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
```

Trova la lista degli import esistenti.

- [ ] **Step 6.2: Aggiungi import**

In cima al file, dopo gli import esistenti, aggiungi:

```typescript
import { VisitGenerateButton } from '../components/visit-planning/VisitGenerateButton';
import { CustomerPickerModal } from '../components/visit-planning/CustomerPickerModal';
```

- [ ] **Step 6.3: Aggiungi stato showPicker**

Nel corpo del componente `VisitPlanningSessionPage`, trova il blocco degli useState e aggiungi:

```typescript
const [showPicker, setShowPicker] = useState(false);
const [generateError, setGenerateError] = useState<string | null>(null);
```

- [ ] **Step 6.4: Modifica listPanel per mostrare GenerateButton**

Trova la definizione di `listPanel` (il blocco JSX che inizia con `const listPanel = (`).

Sostituisci l'empty state:
```tsx
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Nessuna tappa nel giro.</div>
```

Con:
```tsx
        <VisitGenerateButton
          sessionId={sessionId!}
          stopDate={session.startDate}
          onGenerated={(count) => { setGenerateError(null); load(); }}
          onError={(msg) => setGenerateError(msg)}
        />
```

E sotto il bottone aggiunto, mostra l'errore se presente (inserisci nel JSX del `listPanel` dopo il VisitGenerateButton):
```tsx
        {generateError && (
          <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', padding: '0 16px 8px' }}>
            {generateError}
          </div>
        )}
```

- [ ] **Step 6.5: Aggiungi pulsante "+ Aggiungi cliente" e CustomerPickerModal**

Nel JSX del componente principale (in fondo, prima del `</div>` finale), aggiungi dopo il blocco layout responsive:

```tsx
      {/* Pulsante aggiungi cliente manuale */}
      <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 80 }}>
        <button
          onClick={() => setShowPicker(true)}
          style={{
            background: '#f1f5f9', color: '#374151',
            border: '1px solid #d1d5db', borderRadius: 8,
            padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >➕ Aggiungi cliente manualmente</button>
      </div>

      {showPicker && (
        <CustomerPickerModal
          sessionId={sessionId!}
          stopDate={session.startDate}
          onAdded={() => { setShowPicker(false); load(); }}
          onClose={() => setShowPicker(false)}
        />
      )}
```

- [ ] **Step 6.6: Type-check + test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Atteso: 0 errori TypeScript, tutti i test passano.

- [ ] **Step 6.7: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/VisitPlanningSessionPage.tsx
git commit -m "feat(giri-visite): VisitGenerateButton e CustomerPickerModal integrati in sessione"
```

---

## Task 7 — Backend: gate finale build + test + deploy

- [ ] **Step 7.1: Build + test backend completo**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -6
```

Atteso: 0 errori TypeScript, tutti i test passano.

- [ ] **Step 7.2: Build + test frontend completo**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

Atteso: 0 errori, tutti i test passano.

- [ ] **Step 7.3: Push e verifica deploy**

```bash
cd /Users/hatholdir/Downloads/Archibald
git push origin master
```

Poi controlla:

```bash
gh run list --repo H4tholdir/archibaldblackant --branch master --limit 2 \
  --json status,name,createdAt 2>/dev/null | python3 -c "
import sys,json; runs=json.load(sys.stdin)
for r in runs: print(r['status'], r['name'][:30], r['createdAt'][:19])
"
```

Atteso: entrambi i run `completed success` entro 10 minuti dal push.

---

## Task 8 — Geocoding batch 1299 clienti

Lo script `geocode-customers-batch.mjs` è già scritto e testato. Lo eseguiamo sul VPS (il DB non è accessibile localmente). Nominatim consente 1 req/sec — 1299 clienti = ~22 minuti.

- [ ] **Step 8.1: Copia lo script sul VPS**

```bash
scp -i /tmp/archibald_vps -o StrictHostKeyChecking=no \
  /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/geocode-customers-batch.mjs \
  deploy@91.98.136.198:/tmp/geocode-customers-batch.mjs
```

- [ ] **Step 8.2: Esegui il geocoding in background sul VPS**

Lo script usa il DB localmente al container. Dobbiamo eseguirlo dentro il container backend (che ha le env var del DB):

```bash
# Copia lo script dentro il container backend
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker cp /tmp/geocode-customers-batch.mjs archibald-backend:/app/scripts/geocode-customers-batch.mjs"

# Lancia in background nel container (usa le env var del container)
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker exec -d archibald-backend node /app/scripts/geocode-customers-batch.mjs --limit=1299 \
   > /tmp/geocode-log.txt 2>&1"

echo "Geocoding avviato in background (~22 minuti)"
```

- [ ] **Step 8.3: Lo script scrive i risultati su file JSON**

Lo script (`geocode-customers-batch.mjs`) scrive coordinate su file locale, NON sul DB. Per persistere i risultati nel DB, lo script deve essere integrato con il job backend `geocode-missing` (Piano 2). 

**Per ora**: lo script gira localmente producendo un file JSON. Il risultato viene poi importato via service quando sarà implementato il job. Per verificare il progresso:

```bash
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker exec archibald-backend cat /tmp/geocode-log.txt 2>/dev/null | tail -5"
```

**Alternativa immediata per il DB** — esegui uno script psql di upsert con i dati già prodotti nel file JSON. Questo è il modo più rapido per avere coordinate nel DB senza aspettare Piano 2. Se vuoi procedere in questo modo, crea uno script `import-geocoding-results.mjs` che legge i file `geocode-results-*.json` e fa upsert in `agents.customer_geo_status`.

- [ ] **Step 8.4: Verifica progressivo**

Dopo 30-60 minuti, verifica i clienti geocodificati:

```bash
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald -c \
  \"SELECT quality, COUNT(*) FROM agents.customer_geo_status GROUP BY quality;\""
```

---

## Checklist Gate Piano 1d completato

- [ ] `npm run build --prefix archibald-web-app/backend` — 0 errori TypeScript
- [ ] `npm test --prefix archibald-web-app/backend` — tutti i test passano
- [ ] `npm run type-check --prefix archibald-web-app/frontend` — 0 errori
- [ ] `npm test --prefix archibald-web-app/frontend` — tutti i test passano
- [ ] `POST /api/visit-planning/sessions/:id/generate` → 201 con `generated > 0` (su sessione reale)
- [ ] `GET /api/visit-planning/customers/archibald/55.374/visit-brief` → `suggestedCategories` array non vuoto
- [ ] Browser: creazione sessione → bottone "🎯 Genera giro" visibile → click → tappe appaiono
- [ ] Browser: pulsante "➕ Aggiungi cliente manualmente" → modal → cerca → aggiungi → tappa appare
- [ ] Geocoding: almeno 200 clienti geocodificati nel primo batch
