# Giri Visite — Piano 1j: Geocoding Backfill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geocodificare i 617 clienti Archibald e 1349 sub_clients Arca senza coordinate, salvando lat/lng in `customer_geo_status` e `sub_clients.lat/lng`, e aggiornare `buildCandidates` per usare entrambe le fonti.

**Architecture:** (1) Migrazione 111 aggiunge `lat`, `lng`, `hidden` a `shared.sub_clients`. (2) `visit-geocoding-service.ts` gestisce le chiamate Nominatim rate-limited (1 req/sec) e salva i risultati. (3) `buildCandidates` usa `COALESCE(customer_geo_status.lat, customers.geo_latitude)` per le coordinate Archibald, e `sub_clients.lat/lng` per Arca. (4) Endpoint admin `POST /api/admin/geocode-backfill` triggera il backfill manualmente.

**Tech Stack:** Express, TypeScript strict, pg, node `fetch` (Nominatim API), Vitest

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/db/migrations/111-geocoding-backfill.sql` | Crea | Aggiunge lat/lng/hidden a sub_clients |
| `backend/src/services/visit-geocoding-service.ts` | Crea | Core geocoding + backfill |
| `backend/src/services/visit-geocoding-service.spec.ts` | Crea | Test TDD |
| `backend/src/routes/admin.ts` | Modifica | Endpoint POST /admin/geocode-backfill |
| `backend/src/services/visit-generate-service.ts` | Modifica | COALESCE lat/lng, Arca usa sub_clients.lat/lng |

---

## Task 1 — Migrazione 111: lat/lng/hidden su sub_clients

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/111-geocoding-backfill.sql`

- [ ] **Step 1.1: Crea il file SQL**

```sql
-- Migration 111: Geocoding backfill — coordina clienti Arca + campo hidden per archiviazione stale

BEGIN;

ALTER TABLE shared.sub_clients
  ADD COLUMN IF NOT EXISTS lat    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sub_clients_hidden ON shared.sub_clients(hidden);
CREATE INDEX IF NOT EXISTS idx_sub_clients_lat_lng ON shared.sub_clients(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

COMMIT;
```

- [ ] **Step 1.2: Applica in produzione**

```bash
ssh -i /tmp/archibald_vps -o StrictHostKeyChecking=no deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml exec -T postgres psql -U archibald -d archibald" \
  < archibald-web-app/backend/src/db/migrations/111-geocoding-backfill.sql
```

Atteso: `ALTER TABLE`, `CREATE INDEX`, `CREATE INDEX`, `COMMIT`

- [ ] **Step 1.3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/db/migrations/111-geocoding-backfill.sql
git commit -m "feat(giri-visite): migrazione 111 — sub_clients.lat/lng/hidden per geocoding backfill"
```

---

## Task 2 — GeocodingService (TDD)

**Files:**
- Create: `archibald-web-app/backend/src/services/visit-geocoding-service.ts`
- Create: `archibald-web-app/backend/src/services/visit-geocoding-service.spec.ts`

### Step 2.1: Crea il test PRIMA dell'implementazione

- [ ] **Step 2.1: Crea i test**

```typescript
// archibald-web-app/backend/src/services/visit-geocoding-service.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress, buildAddressString, buildArcaAddressString } from './visit-geocoding-service';

// Mock globale di fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => { vi.clearAllMocks(); });

describe('buildAddressString', () => {
  test('combina street, postal_code, city', () => {
    expect(buildAddressString('Via Roma 10', '84013', 'Cava de Tirreni')).toBe('Via Roma 10, 84013 Cava de Tirreni');
  });

  test('skippa i campi null', () => {
    expect(buildAddressString(null, '84013', 'Cava de Tirreni')).toBe('84013 Cava de Tirreni');
  });

  test('restituisce null se tutti i campi sono null', () => {
    expect(buildAddressString(null, null, null)).toBeNull();
  });
});

describe('buildArcaAddressString', () => {
  test('combina indirizzo, cap, localita', () => {
    expect(buildArcaAddressString('Via Napoli 5', '84100', 'Salerno')).toBe('Via Napoli 5, 84100 Salerno');
  });

  test('restituisce null se localita mancante', () => {
    expect(buildArcaAddressString('Via Napoli 5', '84100', null)).toBeNull();
  });
});

describe('geocodeAddress', () => {
  test('restituisce lat/lng se Nominatim risponde con risultati', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '40.6824', lon: '14.7681' }],
    });
    const result = await geocodeAddress('Via Roma 10, 84013 Cava de Tirreni');
    expect(result).toEqual({ lat: 40.6824, lng: 14.7681 });
  });

  test('restituisce null se Nominatim risponde con array vuoto', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const result = await geocodeAddress('Indirizzo inesistente XYZ 99999');
    expect(result).toBeNull();
  });

  test('restituisce null se fetch fallisce', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await geocodeAddress('Via Roma 10');
    expect(result).toBeNull();
  });

  test('usa User-Agent corretto nella request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ lat: '40', lon: '14' }] });
    await geocodeAddress('Via Roma 10, 84013 Salerno');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Formicanera') }),
      }),
    );
  });
});
```

- [ ] **Step 2.2: Verifica che i test falliscano**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/services/visit-geocoding-service.spec.ts 2>&1 | tail -5
```

Atteso: errore "cannot find module".

- [ ] **Step 2.3: Implementa `visit-geocoding-service.ts`**

```typescript
// archibald-web-app/backend/src/services/visit-geocoding-service.ts
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT    = 'Formicanera/1.0 (francesco.formicola@live.it)';
const RATE_LIMIT_MS = 1100; // Nominatim ToS: max 1 req/sec

export function buildAddressString(
  street: string | null,
  postalCode: string | null,
  city: string | null,
): string | null {
  const parts = [
    street?.trim() || null,
    [postalCode?.trim(), city?.trim()].filter(Boolean).join(' ') || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function buildArcaAddressString(
  indirizzo: string | null,
  cap: string | null,
  localita: string | null,
): string | null {
  if (!localita?.trim()) return null;
  const parts = [
    indirizzo?.trim() || null,
    [cap?.trim(), localita.trim()].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join(', ');
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}&countrycodes=it`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it' },
    });
    if (!res.ok) return null;
    const results = await res.json() as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export type BackfillResult = {
  archibaldProcessed: number;
  archibaldSucceeded: number;
  arcaProcessed:      number;
  arcaSucceeded:      number;
};

// Backfill coordinate per clienti Archibald senza customer_geo_status geocodificato
async function backfillArchibald(pool: DbPool, userId: string): Promise<{ processed: number; succeeded: number }> {
  const { rows: missing } = await pool.query<{
    erp_id: string; street: string | null; postal_code: string | null; city: string | null;
  }>(
    `SELECT c.erp_id, c.street, c.postal_code, c.city
     FROM agents.customers c
     WHERE c.user_id = $1
       AND c.deleted_at IS NULL
       AND c.is_distributor = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM agents.customer_geo_status g
         WHERE g.user_id = c.user_id
           AND g.source_type = 'archibald'
           AND g.source_id = c.erp_id
           AND g.quality IN ('geocoded', 'manually_confirmed', 'failed')
       )
     ORDER BY c.erp_id
     LIMIT 500`,
    [userId],
  );

  let succeeded = 0;
  for (const row of missing) {
    const address = buildAddressString(row.street, row.postal_code, row.city);
    if (!address) {
      await pool.query(
        `INSERT INTO agents.customer_geo_status
           (user_id, source_type, source_id, lat, lng, quality, provider, geocoded_at, updated_at)
         VALUES ($1,'archibald',$2,NULL,NULL,'failed','nominatim',NOW(),NOW())
         ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
        [userId, row.erp_id],
      );
      continue;
    }

    await sleep(RATE_LIMIT_MS);
    const coords = await geocodeAddress(address);

    await pool.query(
      `INSERT INTO agents.customer_geo_status
         (user_id, source_type, source_id, lat, lng, normalized_address, quality, provider, geocoded_at, updated_at)
       VALUES ($1,'archibald',$2,$3,$4,$5,$6,'nominatim',NOW(),NOW())
       ON CONFLICT (user_id, source_type, source_id)
       DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         normalized_address=EXCLUDED.normalized_address,
         quality=EXCLUDED.quality, geocoded_at=NOW(), updated_at=NOW()`,
      [userId, row.erp_id, coords?.lat ?? null, coords?.lng ?? null, address, coords ? 'geocoded' : 'failed'],
    );

    if (coords) succeeded++;
  }
  return { processed: missing.length, succeeded };
}

// Backfill coordinate per sub_clients Arca senza lat/lng
async function backfillArca(pool: DbPool): Promise<{ processed: number; succeeded: number }> {
  const { rows: missing } = await pool.query<{
    codice: string; indirizzo: string | null; cap: string | null; localita: string | null;
  }>(
    `SELECT codice, indirizzo, cap, localita
     FROM shared.sub_clients
     WHERE lat IS NULL AND hidden = FALSE
     ORDER BY codice
     LIMIT 500`,
  );

  let succeeded = 0;
  for (const row of missing) {
    const address = buildArcaAddressString(row.indirizzo, row.cap, row.localita);
    if (!address) continue;

    await sleep(RATE_LIMIT_MS);
    const coords = await geocodeAddress(address);

    if (coords) {
      await pool.query(
        'UPDATE shared.sub_clients SET lat=$1, lng=$2 WHERE codice=$3',
        [coords.lat, coords.lng, row.codice],
      );
      succeeded++;
    }
  }
  return { processed: missing.length, succeeded };
}

// Entry point principale: chiamato dall'endpoint admin
export async function runGeocodingBackfill(
  pool: DbPool,
  userId: string,
): Promise<BackfillResult> {
  logger.info('Geocoding backfill avviato', { userId });

  const arch = await backfillArchibald(pool, userId);
  logger.info('Backfill Archibald completato', arch);

  const arca = await backfillArca(pool);
  logger.info('Backfill Arca completato', arca);

  return {
    archibaldProcessed: arch.processed,
    archibaldSucceeded: arch.succeeded,
    arcaProcessed:      arca.processed,
    arcaSucceeded:      arca.succeeded,
  };
}
```

- [ ] **Step 2.4: Verifica test passano + build**

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
npx vitest run src/services/visit-geocoding-service.spec.ts 2>&1 | tail -8
npm run build 2>&1 | tail -3
```

Atteso: 7/7 test passano, build OK.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-geocoding-service.ts \
        archibald-web-app/backend/src/services/visit-geocoding-service.spec.ts
git commit -m "feat(giri-visite): GeocodingService — geocodeAddress Nominatim + backfill Archibald + Arca"
```

---

## Task 3 — Endpoint admin POST /geocode-backfill

**Files:**
- Modify: `archibald-web-app/backend/src/routes/admin.ts`

Il backfill richiede molto tempo (minuti). Lo avviamo in modo **fire-and-forget** in background; l'endpoint risponde immediatamente con un job ID per tracking.

- [ ] **Step 3.1: Aggiungi import nel file admin.ts**

Leggi le prime 30 righe di `archibald-web-app/backend/src/routes/admin.ts` per capire la struttura degli import esistenti, poi aggiungi:

```typescript
import { runGeocodingBackfill } from '../services/visit-geocoding-service';
```

- [ ] **Step 3.2: Aggiungi endpoint**

Trova l'ultimo endpoint nel file (cerca `return router`) e aggiungi PRIMA di esso:

```typescript
  // POST /geocode-backfill — avvia geocoding backfill per tutti gli utenti admin
  router.post('/geocode-backfill', requireAdmin, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    res.json({ status: 'started', message: 'Geocoding backfill avviato in background. Controllare i log per i progressi.' });

    // Fire-and-forget: non blocca la risposta HTTP
    runGeocodingBackfill(pool, userId).then(result => {
      logger.info('Geocoding backfill completato', { userId, ...result });
    }).catch(err => {
      logger.error('Geocoding backfill fallito', { userId, err });
    });
  });
```

- [ ] **Step 3.3: Build**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

Atteso: build OK senza errori.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/admin.ts
git commit -m "feat(giri-visite): endpoint POST /admin/geocode-backfill — trigger backfill manuale"
```

---

## Task 4 — COALESCE lat/lng in buildCandidates

**Files:**
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`

`agents.customers` ha `geo_latitude`/`geo_longitude` (72 clienti, 5.3%). `customer_geo_status` ne ha 699 (51.9%). Usiamo COALESCE per massimizzare la copertura.

- [ ] **Step 4.1: Aggiorna la query Archibald in buildCandidates**

Trova la query SELECT nella funzione `buildCandidates` (cerca `SELECT c.erp_id, c.name`). La colonna lat/lng viene da `g.lat, g.lng`. Sostituisci:

```sql
            g.lat, g.lng, g.quality AS geo_quality
```

Con:

```sql
            COALESCE(g.lat, c.geo_latitude)  AS lat,
            COALESCE(g.lng, c.geo_longitude) AS lng,
            CASE
              WHEN g.lat IS NOT NULL THEN g.quality
              WHEN c.geo_latitude IS NOT NULL THEN 'geocoded'
              ELSE 'unknown'
            END AS geo_quality
```

- [ ] **Step 4.2: Aggiorna il parsing delle coordinate nel rawScored**

Trova la riga `const lat = c.lat != null ? parseFloat(c.lat as string) : null;` (dentro il `.map(c => ...)` di rawScored).

La COALESCE restituisce già NUMERIC — il parseFloat resta corretto ma assicurati che il tipo StopRow/rawScored sia compatibile. Non serve nessuna modifica se il codice usa già `parseFloat`.

- [ ] **Step 4.3: Aggiorna la query Arca in buildCandidates per includere lat/lng da sub_clients**

Trova la query 4 (sub_clients senza match). Aggiungi `sc.lat, sc.lng`:

```sql
     FROM shared.sub_clients sc
     WHERE NOT EXISTS (...)
     AND sc.localita IS NOT NULL AND sc.localita != ''
```

Diventa:

```sql
     SELECT sc.codice, sc.ragione_sociale, sc.localita, sc.prov,
            sc.indirizzo, sc.cap, sc.zona,
            sc.lat, sc.lng
     FROM shared.sub_clients sc
     WHERE NOT EXISTS (...)
     AND sc.localita IS NOT NULL AND sc.localita != ''
```

- [ ] **Step 4.4: Popola lat/lng nel profilo CustomerProfile per clienti Arca**

Nel calcolo `arcaProfiled`, il `CustomerProfile` ha `lat: null, lng: null`. Sostituisci con:

```typescript
      const profile: CustomerProfile = {
        sourceType: 'arca', sourceId: sc.codice as string,
        displayName: sc.ragione_sociale as string,
        street: sc.indirizzo as string | null,
        postalCode: sc.cap as string | null,
        city: sc.localita as string,
        province: sc.prov as string | null,
        phone: null, email: null, vatNumber: null,
        lat:  sc.lat  != null ? parseFloat(sc.lat  as string) : null,
        lng:  sc.lng  != null ? parseFloat(sc.lng  as string) : null,
        geoQuality: sc.lat != null ? 'geocoded' : 'unknown',
        isDistributor: false,
        matchedSources: [{ type: 'arca', id: sc.codice as string, name: sc.ragione_sociale as string }],
        zona: sc.zona as string | null,
      };
```

- [ ] **Step 4.5: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

Atteso: build OK, tutti i test passano (build aggiorna il tipo StopRow internamente — TypeScript verifica la consistenza).

- [ ] **Step 4.6: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/services/visit-generate-service.ts
git commit -m "feat(giri-visite): buildCandidates COALESCE lat/lng da customer_geo_status + customers.geo_lat, Arca usa sub_clients.lat/lng"
```

---

## Task 5 — Push finale e verifica

- [ ] **Step 5.1: Test suite completa**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

Atteso: 3380+ backend, 1129+ frontend, 0 falliti.

- [ ] **Step 5.2: Push**

```bash
git push origin master
```

- [ ] **Step 5.3: Triggerare il backfill in produzione**

Dopo il deploy CI/CD (attendere 5-10 minuti per la build), triggerare il backfill:

```bash
# Ottieni il JWT di Francesco da una sessione attiva, poi:
curl -X POST https://formicanera.com/api/admin/geocode-backfill \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json"
```

Alternativa: usa la pagina Admin nell'app.

Atteso: `{"status":"started","message":"Geocoding backfill avviato in background..."}`.

Dopo ~45 minuti controllare i log:
```bash
ssh -i /tmp/archibald_vps deploy@91.98.136.198 \
  "docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail 20 backend | grep -i geocod"
```

---

## Checklist Piano 1j completato

- [ ] Migrazione 111 applicata in produzione (`sub_clients.lat`, `lng`, `hidden`)
- [ ] `geocodeAddress` usa Nominatim con rate limit 1100ms
- [ ] `buildAddressString` e `buildArcaAddressString` gestiscono i null
- [ ] Backfill Archibald salva in `customer_geo_status`
- [ ] Backfill Arca salva in `sub_clients.lat/lng`
- [ ] `buildCandidates` usa `COALESCE(geo_status.lat, customers.geo_latitude)` per Archibald
- [ ] `buildCandidates` usa `sub_clients.lat/lng` per Arca
- [ ] Endpoint `/admin/geocode-backfill` funzionante (solo admin)
- [ ] Build + test passano
- [ ] Backfill triggerato in produzione
