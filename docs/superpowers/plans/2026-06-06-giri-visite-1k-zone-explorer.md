# Giri Visite — Piano 1k: Zone Explorer + ZoneClientList

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare il Zone Explorer come entry point principale di `/giri`: lista zone selezionabili, lista clienti per zona con ordinamento e archiviazione stale, redesign della home `/giri` con i due entry point.

**Architecture:** (1) Due endpoint backend: `GET /zones` restituisce tutte le zone con stats; `GET /zones/clients?z=7_SA&z=8_SA` restituisce clienti combinati di N zone con distanza haversine e segmentazione attivi/inattivi. (2) Tre nuove pagine frontend: `ZoneListPage`, `ZoneClientListPage`, home `/giri` redesignata. (3) Stale archiving via `PATCH /customers/:erpId/hidden`. Il nome giro viene auto-generato dal wizard.

**Tech Stack:** Express, TypeScript strict, pg, React 19, Vitest. Design: spec UI `2026-06-06-giri-visite-redesign-design.md` sezione "UI/UX Design Decisions — VINCOLANTI AL 100%".

**Prerequisiti:** Piano 1j completato (migrazione 111 applicata, `sub_clients.hidden` disponibile).

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/routes/visit-planning-router.ts` | Modifica | 2 endpoint GET /zones + GET /zones/clients |
| `frontend/src/services/visit-planning.service.ts` | Modifica | listZones(), listZoneClients(), archiveCustomer() |
| `frontend/src/types/visit-planning.ts` | Modifica | ZoneSummary, ZoneClient types |
| `frontend/src/pages/ZoneListPage.tsx` | Crea | Lista zone multi-select |
| `frontend/src/pages/ZoneClientListPage.tsx` | Crea | Lista clienti per zona/e |
| `frontend/src/pages/VisitPlanningPage.tsx` | Modifica | Redesign home con 2 entry point + auto-naming |
| `frontend/src/components/visit-planning/VisitPlanningWizard.tsx` | Modifica | Nome giro auto-generato |
| `frontend/src/AppRouter.tsx` | Modifica | Route /giri/zone + /giri/zone/clienti |

---

## Task 1 — Backend: endpoint GET /zones

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

- [ ] **Step 1.1: Aggiungi la funzione di label zona**

In `visit-planning-router.ts`, aggiungi prima di `return router` la mappatura etichette:

```typescript
  // Mappa zone → etichette geografiche (vincolante da spec UI)
  const ZONE_LABELS: Record<string, string> = {
    'SA_7': 'Salerno città',         'SA_8': 'Piana del Sele / Cilento',
    'SA_5': 'Agro Nocerino',         'SA_6': "Valle dell'Irno",
    'SA_4': 'Pagani / Angri',        'SA_9': 'Sala Consilina / Vallo',
    'SA_3': 'Scafati / Angri SA',    'SA_2': 'Cetara / Scafati',
    'NA_3': 'Stabia / Pompei / Gragnano', 'NA_2': 'Costa Vesuviana',
    'NA_-1': 'Napoli città / Corona Est',  'NA_1': 'Napoli Est / Vesuvio',
    'NA_4': 'Sant\'Antonio Abate / Ottaviano',
    'PZ_9': 'Potenza / Basilicata',
    'AV_6': 'Avellino / Montoro',    'AV_7': 'Grottaminarda / Lioni',
    'CE_-1': 'Caserta / Terra di Lavoro',
  };
  function zoneLabel(zona: string, prov: string): string {
    return ZONE_LABELS[`${prov}_${zona}`] ?? `Zona ${zona}`;
  }
```

- [ ] **Step 1.2: Aggiungi endpoint GET /zones**

```typescript
  // ── Lista zone con statistiche ─────────────────────────────────────────
  router.get('/zones', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const year   = new Date().getFullYear();

      // Zone dai clienti Archibald
      const { rows: archRows } = await pool.query(
        `SELECT czm.zona, czm.prov,
                COUNT(DISTINCT c.erp_id)::int AS total_clients,
                COUNT(DISTINCT c.erp_id) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM agents.order_records o
                    JOIN agents.customers cc
                      ON cc.account_num = o.customer_account_num AND cc.user_id = o.user_id
                    WHERE cc.erp_id = c.erp_id AND cc.user_id = c.user_id
                      AND EXTRACT(YEAR FROM o.creation_date::date) = $2
                  )
                )::int AS active_this_year,
                array_agg(DISTINCT UPPER(TRIM(c.city)) ORDER BY UPPER(TRIM(c.city))) FILTER (
                  WHERE c.city IS NOT NULL AND c.city != ''
                ) AS cities
         FROM agents.customers c
         JOIN system.city_zone_map czm
           ON czm.city_normalized = UPPER(TRIM(c.city))
          AND czm.prov = COALESCE(c.county, (
            SELECT prov FROM system.city_zone_map WHERE city_normalized = UPPER(TRIM(c.city)) LIMIT 1
          ))
         WHERE c.user_id = $1 AND c.deleted_at IS NULL
           AND c.hidden = FALSE AND c.is_distributor = FALSE
           AND czm.zona NOT IN ('0', '100')
         GROUP BY czm.zona, czm.prov`,
        [userId, year],
      );

      // Zone dai sub_clients Arca
      const { rows: arcaRows } = await pool.query(
        `SELECT sc.zona, sc.prov,
                COUNT(*)::int AS total_clients,
                COUNT(*) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM agents.fresis_history fh
                    WHERE fh.sub_client_codice = sc.codice AND fh.user_id = $1
                      AND EXTRACT(YEAR FROM fh.created_at) = $2
                  )
                )::int AS active_this_year,
                array_agg(DISTINCT UPPER(TRIM(sc.localita)) ORDER BY UPPER(TRIM(sc.localita)))
                  FILTER (WHERE sc.localita IS NOT NULL) AS cities
         FROM shared.sub_clients sc
         WHERE NOT EXISTS (
           SELECT 1 FROM shared.sub_client_customer_matches m WHERE m.sub_client_codice = sc.codice
         )
         AND sc.hidden = FALSE
         AND sc.zona IS NOT NULL AND sc.zona NOT IN ('0', '100')
         AND sc.prov IS NOT NULL
         GROUP BY sc.zona, sc.prov`,
        [userId, year],
      );

      // Merge per (zona, prov)
      type ZoneKey = string; // `${zona}|${prov}`
      const zoneMap = new Map<ZoneKey, {
        zona: string; prov: string; totalClients: number;
        activeThisYear: number; topCities: string[];
      }>();

      for (const r of [...archRows, ...arcaRows]) {
        const key: ZoneKey = `${r.zona}|${r.prov}`;
        const existing = zoneMap.get(key);
        const cities = (r.cities as string[] | null) ?? [];
        if (existing) {
          existing.totalClients    += r.total_clients as number;
          existing.activeThisYear  += r.active_this_year as number;
          existing.topCities        = [...new Set([...existing.topCities, ...cities])].slice(0, 3);
        } else {
          zoneMap.set(key, {
            zona: r.zona as string, prov: r.prov as string,
            totalClients:   r.total_clients as number,
            activeThisYear: r.active_this_year as number,
            topCities:      cities.slice(0, 3),
          });
        }
      }

      const zones = [...zoneMap.values()]
        .filter(z => z.totalClients > 0)
        .sort((a, b) => b.totalClients - a.totalClients)
        .map(z => ({ ...z, label: zoneLabel(z.zona, z.prov) }));

      res.json(zones);
    } catch (err) {
      logger.error('listZones error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 1.3: Build backend**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

- [ ] **Step 1.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts
git commit -m "feat(giri-visite): GET /zones — lista zone con stats clienti attivi/totali"
```

---

## Task 2 — Backend: endpoint GET /zones/clients

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`

L'endpoint accetta query param `z=7_SA&z=8_SA` (ripetuto per ogni zona), `sortBy`, `search`. Restituisce clienti attivi + inattivi in due sezioni separate, con distanza haversine da `home_lat/home_lng` dell'utente.

- [ ] **Step 2.1: Aggiungi la funzione haversine**

```typescript
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
```

- [ ] **Step 2.2: Aggiungi endpoint GET /zones/clients**

```typescript
  // ── Clienti per zone selezionate ──────────────────────────────────────
  router.get('/zones/clients', async (req, res) => {
    try {
      const userId  = (req as AuthRequest).user!.userId;
      const year    = new Date().getFullYear();
      const sortBy  = (req.query.sortBy as string) ?? 'distance';
      const search  = (req.query.search as string | undefined)?.toLowerCase();

      // Parsing zone: z=7_SA&z=8_SA → [{ zona:'7', prov:'SA' }]
      const zParam = Array.isArray(req.query.z)
        ? (req.query.z as string[])
        : req.query.z ? [req.query.z as string] : [];
      if (zParam.length === 0) return res.status(400).json({ error: 'Almeno una zona richiesta' });
      const zones = zParam.map(s => { const [z, p] = s.split('_'); return { zona: z, prov: p }; });

      // Home position per calcolo distanza
      const { rows: userRows } = await pool.query(
        'SELECT home_lat, home_lng FROM agents.users WHERE id = $1', [userId],
      );
      const homeLat = userRows[0]?.home_lat != null ? parseFloat(userRows[0].home_lat as string) : null;
      const homeLng = userRows[0]?.home_lng != null ? parseFloat(userRows[0].home_lng as string) : null;

      // Clienti Archibald nelle zone
      const zonaConditionsArch = zones.map((_, i) =>
        `(czm.zona = $${i * 2 + 3} AND czm.prov = $${i * 2 + 4})`
      ).join(' OR ');
      const zonaParamsArch = zones.flatMap(z => [z.zona, z.prov]);

      const { rows: archClients } = await pool.query(
        `SELECT c.erp_id AS source_id, 'archibald' AS source_type,
                c.name AS display_name, c.city, c.street, c.phone,
                COALESCE(g.lat, c.geo_latitude) AS lat,
                COALESCE(g.lng, c.geo_longitude) AS lng,
                COALESCE(
                  SUM(o.total_amount) FILTER (WHERE EXTRACT(YEAR FROM o.creation_date::date) = $2),
                  0
                ) AS ytd_revenue,
                COALESCE(SUM(o.total_amount), 0) AS lifetime_revenue,
                MAX(o.creation_date::date) AS last_order_date
         FROM agents.customers c
         JOIN system.city_zone_map czm
           ON czm.city_normalized = UPPER(TRIM(c.city))
         LEFT JOIN agents.customer_geo_status g
           ON g.user_id = c.user_id AND g.source_type = 'archibald'
          AND g.source_id = c.erp_id AND g.quality IN ('geocoded', 'manually_confirmed')
         LEFT JOIN agents.order_records o
           ON o.customer_account_num = c.account_num AND o.user_id = c.user_id
         WHERE c.user_id = $1
           AND c.deleted_at IS NULL AND c.hidden = FALSE AND c.is_distributor = FALSE
           AND (${zonaConditionsArch})
         GROUP BY c.erp_id, c.name, c.city, c.street, c.phone, g.lat, g.lng, c.geo_latitude, c.geo_longitude`,
        [userId, year, ...zonaParamsArch],
      );

      // Clienti Arca nelle zone
      const zonaConditionsArca = zones.map((_, i) =>
        `(sc.zona = $${i * 2 + 2} AND sc.prov = $${i * 2 + 3})`
      ).join(' OR ');
      const zonaParamsArca = zones.flatMap(z => [z.zona, z.prov]);

      const { rows: arcaClients } = await pool.query(
        `SELECT sc.codice AS source_id, 'arca' AS source_type,
                sc.ragione_sociale AS display_name, sc.localita AS city,
                sc.indirizzo AS street, sc.telefono AS phone,
                sc.lat, sc.lng,
                COALESCE(
                  SUM(fh.target_total_with_vat / 1.22) FILTER (
                    WHERE EXTRACT(YEAR FROM fh.created_at) = $1
                  ), 0
                ) AS ytd_revenue,
                COALESCE(SUM(fh.target_total_with_vat / 1.22), 0) AS lifetime_revenue,
                MAX(fh.created_at::date) AS last_order_date
         FROM shared.sub_clients sc
         LEFT JOIN agents.fresis_history fh
           ON fh.sub_client_codice = sc.codice AND fh.user_id = $1
         WHERE NOT EXISTS (
           SELECT 1 FROM shared.sub_client_customer_matches m WHERE m.sub_client_codice = sc.codice
         )
         AND sc.hidden = FALSE
         AND (${zonaConditionsArca})
         GROUP BY sc.codice, sc.ragione_sociale, sc.localita, sc.indirizzo, sc.telefono, sc.lat, sc.lng`,
        [year, ...zonaParamsArca],
      );

      // Calcola distanza + days_since_order per ogni cliente
      type RawClient = {
        source_id: string; source_type: string; display_name: string;
        city: string | null; street: string | null; phone: string | null;
        lat: string | null; lng: string | null;
        ytd_revenue: string; lifetime_revenue: string; last_order_date: string | null;
      };

      const toClient = (r: RawClient) => {
        const lat  = r.lat  != null ? parseFloat(r.lat)  : null;
        const lng  = r.lng  != null ? parseFloat(r.lng)  : null;
        const distanceKm = (lat != null && lng != null && homeLat != null && homeLng != null)
          ? Math.round(haversineKm(homeLat, homeLng, lat, lng) * 10) / 10
          : null;
        const lastOrderDate  = r.last_order_date ?? null;
        const daysSinceOrder = lastOrderDate
          ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000)
          : null;
        return {
          sourceType:      r.source_type,
          sourceId:        r.source_id,
          displayName:     r.display_name,
          city:            r.city,
          address:         r.street,
          phone:           r.phone,
          lat, lng, distanceKm,
          ytdRevenue:      parseFloat(r.ytd_revenue),
          lifetimeRevenue: parseFloat(r.lifetime_revenue),
          lastOrderDate,
          daysSinceOrder,
          isHidden: false,
        };
      };

      let clients = [...archClients, ...arcaClients].map(r => toClient(r as RawClient));

      // Filtro ricerca
      if (search) {
        clients = clients.filter(c =>
          c.displayName.toLowerCase().includes(search) ||
          (c.city ?? '').toLowerCase().includes(search) ||
          (c.phone ?? '').includes(search)
        );
      }

      // Segmenta: attivi (ordine nell'anno) vs inattivi
      const active   = clients.filter(c => c.ytdRevenue > 0 || (c.daysSinceOrder != null && c.daysSinceOrder <= 365));
      const inactive = clients.filter(c => c.ytdRevenue <= 0 && (c.daysSinceOrder == null || c.daysSinceOrder > 365));

      // Ordinamento attivi
      const sortFn = (a: typeof active[0], b: typeof active[0]) => {
        switch (sortBy) {
          case 'ytd':      return b.ytdRevenue - a.ytdRevenue;
          case 'lifetime': return b.lifetimeRevenue - a.lifetimeRevenue;
          case 'lastOrder':
            if (!a.lastOrderDate) return 1;
            if (!b.lastOrderDate) return -1;
            return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
          default: { // distance
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm - b.distanceKm;
          }
        }
      };
      active.sort(sortFn);
      inactive.sort((a, b) => (b.daysSinceOrder ?? 9999) - (a.daysSinceOrder ?? 9999)); // più inattivi prima

      res.json({ active, inactive, total: clients.length });
    } catch (err) {
      logger.error('listZoneClients error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 2.3: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 2.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts
git commit -m "feat(giri-visite): GET /zones/clients — clienti per zone multi-select con distanza haversine e segmentazione attivi/inattivi"
```

---

## Task 3 — Tipi frontend + funzioni service

**Files:**
- Modify: `archibald-web-app/frontend/src/types/visit-planning.ts`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`

- [ ] **Step 3.1: Aggiungi tipi in `visit-planning.ts`**

In fondo al file, aggiungi:

```typescript
export type ZoneSummary = {
  zona:           string;
  prov:           string;
  label:          string;
  totalClients:   number;
  activeThisYear: number;
  topCities:      string[];
};

export type ZoneClient = {
  sourceType:      'archibald' | 'arca';
  sourceId:        string;
  displayName:     string;
  city:            string | null;
  address:         string | null;
  phone:           string | null;
  lat:             number | null;
  lng:             number | null;
  distanceKm:      number | null;
  ytdRevenue:      number;
  lifetimeRevenue: number;
  lastOrderDate:   string | null;
  daysSinceOrder:  number | null;
  isHidden:        boolean;
};

export type ZoneClientsResult = {
  active:   ZoneClient[];
  inactive: ZoneClient[];
  total:    number;
};
```

- [ ] **Step 3.2: Aggiungi funzioni in `visit-planning.service.ts`**

In fondo al file:

```typescript
export async function listZones(): Promise<import('../types/visit-planning').ZoneSummary[]> {
  const res = await fetchWithRetry(`${BASE}/zones`);
  if (!res.ok) throw new Error(`listZones ${res.status}`);
  return res.json();
}

export async function listZoneClients(
  zones: Array<{ zona: string; prov: string }>,
  sortBy: 'distance' | 'ytd' | 'lifetime' | 'lastOrder',
  search?: string,
): Promise<import('../types/visit-planning').ZoneClientsResult> {
  const params = new URLSearchParams();
  zones.forEach(z => params.append('z', `${z.zona}_${z.prov}`));
  params.set('sortBy', sortBy);
  if (search) params.set('search', search);
  const res = await fetchWithRetry(`${BASE}/zones/clients?${params}`);
  if (!res.ok) throw new Error(`listZoneClients ${res.status}`);
  return res.json();
}

export async function archiveCustomer(
  sourceType: 'archibald' | 'arca',
  sourceId:   string,
): Promise<void> {
  if (sourceType === 'archibald') {
    const res = await fetchWithRetry(`/api/customers/${encodeURIComponent(sourceId)}/hidden`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true }),
    });
    if (!res.ok) throw new Error(`archiveCustomer ${res.status}`);
  } else {
    const res = await fetchWithRetry(`${BASE}/arca-clients/${encodeURIComponent(sourceId)}/hidden`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error(`archiveArcaCustomer ${res.status}`);
  }
}
```

**Nota**: l'endpoint `/api/customers/:id/hidden` per Archibald esiste già (`PATCH /customers/:erpId/hidden` in `customers.ts`). Per Arca, aggiungere endpoint nel Task 3b.

- [ ] **Step 3.3: Aggiungi endpoint PATCH /arca-clients/:id/hidden nel router**

In `visit-planning-router.ts`, aggiungi prima di `return router`:

```typescript
  router.patch('/arca-clients/:codice/hidden', async (req, res) => {
    try {
      await pool.query(
        'UPDATE shared.sub_clients SET hidden = TRUE WHERE codice = $1',
        [req.params.codice],
      );
      res.status(204).end();
    } catch (err) {
      logger.error('archiveArcaClient error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 3.4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 3.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/types/visit-planning.ts \
        archibald-web-app/frontend/src/services/visit-planning.service.ts \
        archibald-web-app/backend/src/routes/visit-planning-router.ts
git commit -m "feat(giri-visite): tipi ZoneSummary/ZoneClient + listZones/listZoneClients/archiveCustomer service"
```

---

## Task 4 — ZoneListPage.tsx

**Files:**
- Create: `archibald-web-app/frontend/src/pages/ZoneListPage.tsx`

Rispetta esattamente la spec UI (sezione "ZoneListPage"). Colori badge per provincia, multi-select, barra sticky.

- [ ] **Step 4.1: Crea il file**

```tsx
// archibald-web-app/frontend/src/pages/ZoneListPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ZoneSummary } from '../types/visit-planning';
import { listZones } from '../services/visit-planning.service';

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669',
  AV: '#d97706', CE: '#dc2626',
};
function provColor(prov: string): string { return PROV_COLORS[prov] ?? '#6b7280'; }

const PROV_ORDER = ['SA', 'NA', 'PZ', 'AV', 'CE'];
function provSort(prov: string): number { const i = PROV_ORDER.indexOf(prov); return i < 0 ? 99 : i; }

export function ZoneListPage() {
  const navigate = useNavigate();
  const [zones, setZones]         = useState<ZoneSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set()); // key: `${zona}_${prov}`

  useEffect(() => {
    listZones().then(setZones).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSfoglia = () => {
    if (selected.size === 0) return;
    const params = [...selected].join(',');
    navigate(`/giri/zone/clienti?z=${encodeURIComponent(params)}`);
  };

  // Raggruppa per provincia
  const byProv = zones.reduce<Record<string, ZoneSummary[]>>((acc, z) => {
    (acc[z.prov] ??= []).push(z);
    return acc;
  }, {});
  const sortedProvs = Object.keys(byProv).sort((a, b) => provSort(a) - provSort(b));

  const totalSelected = zones
    .filter(z => selected.has(`${z.zona}_${z.prov}`))
    .reduce((s, z) => s + z.totalClients, 0);

  const CARD: React.CSSProperties = {
    background: 'white', border: '2px solid #e5e7eb', borderRadius: 12,
    padding: '12px 14px', marginBottom: 8, display: 'flex',
    alignItems: 'center', gap: 12, cursor: 'pointer',
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Caricamento zone...</div>;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 16px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#111827' }}>📍 Esplora Zone Clienti</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, paddingLeft: 30 }}>
        Seleziona una o più zone per sfogliare i clienti
      </div>
      <div style={{ fontSize: 12, color: '#2563eb', background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
        💡 Tocca per selezionare · puoi combinare più zone · poi "Sfoglia clienti"
      </div>

      {sortedProvs.map(prov => (
        <div key={prov}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>
            {prov === 'SA' ? 'Salerno — SA' : prov === 'NA' ? 'Napoli — NA' : prov === 'PZ' ? 'Potenza — PZ' : prov === 'AV' ? 'Avellino — AV' : prov === 'CE' ? 'Caserta — CE' : prov}
          </div>
          {byProv[prov].map(z => {
            const key  = `${z.zona}_${z.prov}`;
            const isSel = selected.has(key);
            const isSmall = z.totalClients < 30;
            const activePct = z.totalClients > 0 ? (z.activeThisYear / z.totalClients) * 100 : 0;
            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                style={{
                  ...CARD,
                  borderColor: isSel ? '#2563eb' : '#e5e7eb',
                  background: isSel ? '#eff6ff' : 'white',
                  opacity: isSmall ? 0.85 : 1,
                  padding: isSmall ? '9px 14px' : '12px 14px',
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: isSel ? 'none' : '2px solid #d1d5db',
                  background: isSel ? '#2563eb' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 13,
                }}>{isSel ? '✓' : ''}</div>

                {/* Badge zona */}
                <div style={{
                  width: isSmall ? 34 : 40, height: isSmall ? 34 : 40,
                  borderRadius: 9, background: provColor(prov),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isSmall ? 13 : 15, fontWeight: 800, color: 'white', flexShrink: 0,
                }}>{z.zona}</div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{z.label}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {z.topCities.slice(0, 3).map(c => (
                      <span key={c} style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 6,
                        background: isSel ? '#dbeafe' : '#f1f5f9',
                        color: isSel ? '#1d4ed8' : '#475569',
                      }}>{c.charAt(0) + c.slice(1).toLowerCase()}</span>
                    ))}
                  </div>
                  <div style={{ width: 40, height: 3, background: '#e5e7eb', borderRadius: 2, marginTop: 6 }}>
                    <div style={{ width: `${activePct}%`, height: 3, background: '#16a34a', borderRadius: 2 }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: isSmall ? 15 : 18, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{z.totalClients}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>clienti</div>
                  <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{z.activeThisYear} attivi</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Sticky bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 16px rgba(0,0,0,.12)', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100,
      }}>
        <div>
          {selected.size > 0 ? (
            <>
              <div style={{ fontSize: 13, color: '#374151' }}>
                <strong style={{ color: '#2563eb' }}>{selected.size} {selected.size === 1 ? 'zona selezionata' : 'zone selezionate'}</strong>
                {' '}· {totalSelected} clienti totali
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {[...selected].map(k => {
                  const z = zones.find(z => `${z.zona}_${z.prov}` === k);
                  return z?.label ?? k;
                }).join(' + ')}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Seleziona almeno una zona</div>
          )}
        </div>
        <button
          disabled={selected.size === 0}
          onClick={handleSfoglia}
          style={{
            background: selected.size > 0 ? '#2563eb' : '#e5e7eb',
            color: selected.size > 0 ? 'white' : '#9ca3af',
            border: 'none', borderRadius: 10, padding: '10px 20px',
            fontWeight: 700, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
          }}
        >Sfoglia clienti →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 4.3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/ZoneListPage.tsx
git commit -m "feat(giri-visite): ZoneListPage — multi-select zone con badge prov, barra sticky, stats attivi"
```

---

## Task 5 — ZoneClientListPage.tsx

**Files:**
- Create: `archibald-web-app/frontend/src/pages/ZoneClientListPage.tsx`

Rispetta la spec UI (sezione "ZoneClientListPage"). Ordinamento 4 tab italiani, sezioni attivi/inattivi, telefono prominente, archivia.

- [ ] **Step 5.1: Crea il file**

```tsx
// archibald-web-app/frontend/src/pages/ZoneClientListPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ZoneClient } from '../types/visit-planning';
import { listZoneClients, archiveCustomer } from '../services/visit-planning.service';
import * as vpService from '../services/visit-planning.service';

type SortBy = 'distance' | 'ytd' | 'lifetime' | 'lastOrder';

const SORT_LABELS: Record<SortBy, string> = {
  distance:  'Distanza da casa',
  ytd:       "Fatturato quest'anno",
  lifetime:  'Fatturato storico',
  lastOrder: 'Ultimo ordine',
};

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669', AV: '#d97706', CE: '#dc2626',
};

export function ZoneClientListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parsing zone dal query param z=7_SA,8_SA
  const zParam = searchParams.get('z') ?? '';
  const zones  = zParam.split(',').filter(Boolean).map(s => {
    const parts = s.split('_');
    const prov  = parts[parts.length - 1];
    const zona  = parts.slice(0, -1).join('_');
    return { zona, prov };
  });

  const [sortBy, setSortBy]         = useState<SortBy>('distance');
  const [search, setSearch]         = useState('');
  const [active, setActive]         = useState<ZoneClient[]>([]);
  const [inactive, setInactive]     = useState<ZoneClient[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [archiving, setArchiving]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listZoneClients(zones, sortBy, search || undefined)
      .then(r => { setActive(r.active); setInactive(r.inactive); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [zParam, sortBy, search]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleArchive = async (c: ZoneClient) => {
    if (!confirm(`Archiviare "${c.displayName}"? Scomparirà dalle liste e dal generatore giri. Riattivabile dalla scheda cliente.`)) return;
    setArchiving(c.sourceId);
    try {
      await archiveCustomer(c.sourceType as 'archibald' | 'arca', c.sourceId);
      load();
    } catch { alert('Errore durante archiviazione.'); }
    finally { setArchiving(null); }
  };

  const handleCreaGiro = async (date: string) => {
    // Costruisce il nome giro con la prima zona selezionata
    const firstZone = zones[0];
    const zoneLabel = `Zona ${firstZone.zona} ${firstZone.prov}`;
    const d = new Date(date);
    const weekday = d.toLocaleDateString('it-IT', { weekday: 'long' });
    const dayMonth = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const title = `Giro ${zoneLabel} — ${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${dayMonth}`;

    // Crea sessione con i clienti selezionati pre-caricati
    const session = await vpService.createSession({ title, horizon: 'day', mode: 'balanced', startDate: date, endDate: date });

    // Aggiunge ogni cliente selezionato come stop to_call
    const selectedClients = [...active, ...inactive].filter(c => selected.has(c.sourceId));
    for (const c of selectedClients) {
      await vpService.addStop(session.id, {
        sourceType:  c.sourceType as 'archibald' | 'arca',
        sourceId:    c.sourceId,
        displayName: c.displayName,
        stopDate:    date,
        status:      'to_call',
        visitMinutes: 30,
      });
    }
    navigate(`/giri/${session.id}`);
  };

  // Zona pills per l'header
  const zonePills = zones.map(z => ({
    key: `${z.zona}_${z.prov}`,
    label: `Zona ${z.zona} ${z.prov}`,
    color: PROV_COLORS[z.prov] ?? '#6b7280',
  }));

  const ClientCard = ({ c, isInactive }: { c: ZoneClient; isInactive?: boolean }) => {
    const isSel = selected.has(c.sourceId);
    return (
      <div
        onClick={() => !isInactive ? toggleSelect(c.sourceId) : undefined}
        style={{
          background: isSel ? '#eff6ff' : isInactive ? '#fafafa' : 'white',
          borderBottom: '1px solid #f1f5f9',
          borderLeft: isSel ? '3px solid #2563eb' : isInactive ? '3px solid #fee2e2' : '3px solid transparent',
          padding: '13px 16px',
          display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'start',
          cursor: isInactive ? 'default' : 'pointer',
          opacity: isInactive ? 0.65 : 1,
        }}
      >
        {/* Checkbox */}
        <div style={{
          width: 20, height: 20, borderRadius: 5, marginTop: 2, flexShrink: 0,
          border: isSel ? 'none' : '2px solid #d1d5db',
          background: isSel ? '#2563eb' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 12,
        }}>{isSel ? '✓' : ''}</div>

        {/* Corpo */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {c.displayName}
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
              background: c.sourceType === 'archibald' ? '#dbeafe' : '#d1fae5',
              color: c.sourceType === 'archibald' ? '#1e40af' : '#065f46',
            }}>{c.sourceType === 'archibald' ? 'Archibald' : 'Fresis'}</span>
            {isInactive && c.daysSinceOrder && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 4 }}>
                Inattivo da {c.daysSinceOrder} giorni
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            {c.address ? `${c.address} · ` : ''}{c.city ?? ''}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: isInactive ? '#dc2626' : '#16a34a' }}>
              💶 €{c.ytdRevenue.toLocaleString('it-IT', { maximumFractionDigits: 0 })} quest'anno
            </span>
            {c.daysSinceOrder != null && !isInactive && (
              <span style={{ fontSize: 12, color: '#374151' }}>🕐 {c.daysSinceOrder} giorni fa</span>
            )}
            {c.distanceKm == null && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>📍 posizione non disponibile</span>
            )}
          </div>
          {c.phone ? (
            <button
              onClick={e => { e.stopPropagation(); window.location.href = `tel:${c.phone}`; }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >📞 {c.phone}</button>
          ) : (
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, display: 'inline-block' }}>📵 Nessun telefono registrato</span>
          )}
        </div>

        {/* Destra */}
        <div style={{ textAlign: 'right' }}>
          {c.distanceKm != null ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>📍 {c.distanceKm.toLocaleString('it-IT')} km</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>da casa</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#d1d5db' }}>📍 —</div>
          )}
          <div style={{ fontSize: 14, fontWeight: 800, color: isInactive ? '#9ca3af' : '#111827', marginTop: 4 }}>
            €{c.ytdRevenue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af' }}>quest'anno</div>
          {isInactive && (
            <button
              onClick={e => { e.stopPropagation(); handleArchive(c); }}
              disabled={archiving === c.sourceId}
              style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'block', width: '100%' }}
            >{archiving === c.sourceId ? '...' : 'Archivia'}</button>
          )}
        </div>
      </div>
    );
  };

  // Date picker: prossimi 7 giorni lavorativi
  const workDays: string[] = [];
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (workDays.length < 7) {
    if (d.getDay() !== 0 && d.getDay() !== 6) workDays.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  const [selectedDate, setSelectedDate] = useState(workDays[0]);
  const fmtDate = (iso: string) => {
    const dt = new Date(iso + 'T00:00:00');
    return dt.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' })
      .replace(/^./, c => c.toUpperCase());
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 130 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => navigate('/giri/zone')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Clienti zone selezionate</div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginLeft: 30, marginBottom: 6 }}>Seleziona i clienti da includere nel giro</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {zonePills.map(p => (
            <span key={p.key} style={{ fontSize: 11, fontWeight: 700, color: 'white', padding: '3px 10px', borderRadius: 20, background: p.color }}>{p.label}</span>
          ))}
        </div>
      </div>

      {/* Sort tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {(Object.keys(SORT_LABELS) as SortBy[]).map(k => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            border: `1.5px solid ${sortBy === k ? '#2563eb' : '#d1d5db'}`,
            background: sortBy === k ? '#2563eb' : 'white',
            color: sortBy === k ? 'white' : '#6b7280', cursor: 'pointer',
          }}>
            {sortBy === k ? `↑ ` : ''}{SORT_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Ricerca */}
      <div style={{ padding: '10px 16px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Cerca per nome, città, telefono..."
          style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#f9fafb', outline: 'none' }}
        />
      </div>

      {/* Riepilogo */}
      <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
        <span>{total} clienti · {active.length} attivi quest'anno</span>
        {selected.size > 0 && <span style={{ fontWeight: 700, color: '#2563eb' }}>{selected.size} selezionati</span>}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Caricamento clienti...</div>
      ) : (
        <>
          {/* Sezione attivi */}
          {active.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', background: '#f1f5f9', borderBottom: '1px solid #e5e7eb', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#16a34a' }}>
                ✅ Clienti attivi — {active.length} — ordinati per {SORT_LABELS[sortBy].toLowerCase()}
              </div>
              {active.map(c => <ClientCard key={`${c.sourceType}:${c.sourceId}`} c={c} />)}
            </>
          )}

          {/* Sezione inattivi */}
          {inactive.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', background: '#fef9f0', borderBottom: '1px solid #fed7aa', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c2410c' }}>
                ⚠️ Clienti inattivi — nessun ordine nell'anno — {inactive.length}
              </div>
              {inactive.map(c => <ClientCard key={`${c.sourceType}:${c.sourceId}`} c={c} isInactive />)}
            </>
          )}
        </>
      )}

      {/* Sticky bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: `2px solid ${selected.size > 0 ? '#2563eb' : '#e5e7eb'}`,
        boxShadow: '0 -4px 20px rgba(37,99,235,.1)', padding: '12px 20px', zIndex: 100,
      }}>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
          {selected.size > 0 ? (
            <><strong style={{ color: '#2563eb' }}>{selected.size} clienti selezionati</strong>
              <small style={{ color: '#9ca3af', marginLeft: 6 }}>Le tappe saranno "da chiamare" — contatta per fissare appuntamento</small></>
          ) : (
            <span style={{ color: '#9ca3af' }}>Seleziona i clienti da includere nel giro</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Giro per:</span>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#374151', background: '#f9fafb' }}
          >
            {workDays.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
          <button
            disabled={selected.size === 0}
            onClick={() => handleCreaGiro(selectedDate)}
            style={{
              background: selected.size > 0 ? '#2563eb' : '#e5e7eb',
              color: selected.size > 0 ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 10, padding: '10px 22px',
              fontWeight: 700, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >Crea giro →</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
```

- [ ] **Step 5.3: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/ZoneClientListPage.tsx
git commit -m "feat(giri-visite): ZoneClientListPage — lista clienti zona con multi-select, sort italiano, archivia, crea giro"
```

---

## Task 6 — Redesign VisitPlanningPage + AppRouter + auto-naming wizard

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx`
- Modify: `archibald-web-app/frontend/src/components/visit-planning/VisitPlanningWizard.tsx`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`

- [ ] **Step 6.1: Aggiorna AppRouter.tsx**

Aggiungi import e route **PRIMA di `/giri/feste`**:

```typescript
import { ZoneListPage } from './pages/ZoneListPage';
import { ZoneClientListPage } from './pages/ZoneClientListPage';
```

```tsx
<Route path="/giri/zone" element={<ZoneListPage />} />
<Route path="/giri/zone/clienti" element={<ZoneClientListPage />} />
```

- [ ] **Step 6.2: Redesign VisitPlanningPage.tsx**

Leggi il file corrente. Sostituisci il blocco header (titolo + pulsante "+ Nuovo giro") con il nuovo design a due entry point:

```tsx
      {/* Due entry point — griglia 2/3 + 1/3 (spec vincolante) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 24 }}>
        {/* Primario: Pianifica per zona */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          borderRadius: 12, padding: 20, color: 'white',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, display: 'inline-block', marginBottom: 10 }}>
            TU SCEGLI I CLIENTI
          </span>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>📍 Pianifica per zona</div>
          <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4, marginBottom: 14 }}>
            Sfoglia la lista clienti per zona, seleziona chi visitare e costruisci il giro. Le tappe partono come "da chiamare" per fissare appuntamento.
          </div>
          <button
            onClick={() => navigate('/giri/zone')}
            style={{ background: 'white', color: '#2563eb', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}
          >Esplora zone →</button>
        </div>

        {/* Secondario: Genera automaticamente */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, display: 'inline-block', marginBottom: 10 }}>
              IL SISTEMA SCEGLIE
            </span>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 6 }}>⚡ Genera automaticamente</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, marginBottom: 14 }}>
              L'algoritmo seleziona i clienti migliori in base a valore, urgenza e zona.
            </div>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 0', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: '100%', textAlign: 'center' }}
          >Genera giro</button>
        </div>
      </div>
```

Rimuovi il vecchio header con il titolo "🗺️ Giri Visite" + bottone "+ Nuovo giro" (ora è il titolo della pagina, spostalo sopra la griglia come semplice testo).

- [ ] **Step 6.3: Auto-naming nel wizard**

In `VisitPlanningWizard.tsx`, nel passo con data/titolo, aggiorna il default del titolo in base alla data:

Trova `const [title, setTitle] = useState('');` e cambia in:

```typescript
  const formatTitleDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const wd = d.toLocaleDateString('it-IT', { weekday: 'long' });
    const dm = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`;
  };
  const [title, setTitle] = useState(() => `Giro — ${formatTitleDate(today)}`);
```

E aggiorna il placeholder e il valore nell'input titolo per mostrare il default:
- Il campo è pre-compilato con `Giro — Lunedì 09/06` (modificabile dall'utente)
- Quando cambia la data: aggiorna anche il titolo default se l'utente non ha ancora modificato manualmente

Aggiungi `useEffect`:
```typescript
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  useEffect(() => {
    if (!titleManuallyEdited) {
      setTitle(`Giro — ${formatTitleDate(startDate)}`);
    }
  }, [startDate, titleManuallyEdited]);
```

E sull'input titolo: `onChange={e => { setTitle(e.target.value); setTitleManuallyEdited(true); }}`

- [ ] **Step 6.4: Type-check + test**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

- [ ] **Step 6.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx \
        archibald-web-app/frontend/src/components/visit-planning/VisitPlanningWizard.tsx
git commit -m "feat(giri-visite): home /giri redesign — 2 entry point, ZoneListPage/ZoneClientListPage routes, auto-naming wizard"
```

---

## Task 7 — Push finale + verifica gate

- [ ] **Step 7.1: Test suite completa**

```bash
npm test --prefix archibald-web-app/backend 2>&1 | grep -E "Tests|passed|failed" | tail -2
npm test --prefix archibald-web-app/frontend 2>&1 | grep -E "Tests|passed|failed" | tail -2
```

Atteso: 0 fallimenti.

- [ ] **Step 7.2: Push**

```bash
git push origin master
```

---

## Checklist Piano 1k completato

- [ ] `GET /api/visit-planning/zones` risponde con tutte le zone + stats
- [ ] `GET /api/visit-planning/zones/clients?z=7_SA&z=8_SA` risponde con clienti segmentati
- [ ] ZoneListPage: multi-select zone, badge colorati per provincia, barra sticky
- [ ] ZoneListPage: zona -1 mostrata come "-1"
- [ ] ZoneClientListPage: ordinamento 4 tab italiani corretto, clienti inattivi SEMPRE in fondo
- [ ] ZoneClientListPage: telefono pulsante prominente, badge "Archibald"/"Fresis"
- [ ] ZoneClientListPage: "Crea giro →" crea sessione con tappe `to_call` + nome auto-generato
- [ ] Home `/giri`: griglia 2/3 + 1/3 con i due entry point
- [ ] Wizard: nome pre-compilato, si aggiorna con la data
- [ ] Route `/giri/zone` e `/giri/zone/clienti` funzionanti
- [ ] Build + test passano
