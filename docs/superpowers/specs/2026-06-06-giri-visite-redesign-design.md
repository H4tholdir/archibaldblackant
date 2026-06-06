# Giri Visite — Redesign Completo
**Data:** 2026-06-06  
**Stato:** APPROVATO — pronto per pianificazione  
**Piani di implementazione:** 1j · 1k · 1l

---

## Contesto e motivazione

Il sistema giri-visite (Piani 1a–1i) è operativo ma ha tre problemi fondamentali:

1. **Algoritmo cieco alla geografia reale**: genera route scegliendo clienti per score globale senza rispettare zone geografiche o tappe bloccate → route incoerenti
2. **Flusso UX non corrisponde al workflow reale di Biagio**: l'agente lavora per zona (esplora lista → seleziona → costruisce giro ipotetico → chiama per confermare), non per auto-generazione
3. **Mappa decorativa**: mostra solo un segnaposto approssimativo, senza itinerario reale, km, ETA

Il redesign introduce:
- **Zone Explorer** come entry point principale
- **Smart Generation** con intent detection (appuntamenti fissi vs esplorazione zona)
- **Geocoding backfill** come prerequisito per distanze reali
- **Map Itinerary** con polyline, stats, navigazione

---

## Architettura generale (Approccio 1)

```
/giri                            ← Home: Zone Explorer + Sessions list
  /giri/zone                     ← ZoneListPage (nuovo)
  /giri/zone/:zona/:prov         ← ZoneClientListPage (nuovo)
  /giri/:sessionId               ← SessionPage (estesa)
  /giri/corsi                    ← esistente
  /giri/feste                    ← esistente
```

### Flusso principale

```
/giri
  └─ [Esplora zona] ──→ ZoneListPage
       └─ [seleziona zona] ──→ ZoneClientListPage
            ├─ ordina/filtra/seleziona clienti
            ├─ archivia stale
            └─ [Pianifica giro — data] ──→ SessionPage
                 └─ Smart Generation (ottimizza + riempie)

  └─ [+ Nuovo giro] ──→ Wizard (flow rapido, invariato per auto-generate)
```

### Invarianti preservate
- `status='skipped'` e la query skip-bonus (ultimi 90gg) restano invariati
- Regenerate soft-delete `status NOT IN ('visited','confirmed','skipped','removed')` rimane
- I campi del tipo `VisitPlanningStop` non cambiano struttura (aggiunta `zona` already done)

---

## Piano 1j — Geocoding Backfill (prerequisito)

### Problema
- 617/1348 clienti Archibald (45.8%) senza coordinate
- 1349 Arca sub_clients senza colonna lat/lng
- Senza coordinate: "ordina per distanza" impossibile, VRPTW degradato

### Copertura attuale
| Fonte | Clienti geocodificati |
|---|---|
| `customer_geo_status` (quality=geocoded/confirmed) | 699 |
| `customers.geo_latitude` (colonna diretta) | 72 |
| Combinato | 731 / 1348 (54.2%) |
| **Mancanti** | **617 (45.8%)** |
| Arca sub_clients | 0 / 1349 (0%) |

### Soluzione

**Migrazione 111**: Aggiunge colonna `lat NUMERIC(10,7), lng NUMERIC(10,7)` a `shared.sub_clients` per le coordinate Arca.

**Background geocoding job** (operation type `geocode-customers`):
1. Seleziona clienti Archibald senza riga in `customer_geo_status` o con quality='failed'
2. Costruisce indirizzo: `street + ', ' + postal_code + ' ' + city`
3. Chiama Nominatim API con rate limiting (1 req/sec)
4. Salva in `customer_geo_status` con `quality='geocoded', provider='nominatim'`
5. Stesso processo per Arca sub_clients → salva in `sub_clients.lat/lng`

**Degradazione graceful**:
- Clienti senza coordinate: mostrati in lista ma non ordinabili per distanza (fallback: ordina per zona → città)
- VRPTW: usa haversine per chi ha coords; inserisce gli altri tramite nearest-neighbor alla fine

**Trigger**:
- Al primo login dopo deploy del Piano 1j
- Ogni settimana (ridotto, solo nuovi clienti)
- Manuale da admin

**Stima tempo**: ~1348 clienti / 1 req/sec ≈ 22 min per Archibald; ~1349 Arca ≈ 22 min. Totale ~45 min in background.

---

## Piano 1k — Zone Explorer + ZoneClientList

### ZoneListPage (`/giri/zone`)

**Backend endpoint**: `GET /api/visit-planning/zones`

Risposta per ogni zona:
```typescript
type ZoneSummary = {
  zona:           string;       // "7"
  prov:           string;       // "SA"
  label:          string;       // "Salerno città"
  totalClients:   number;       // 193
  activeThisYear: number;       // 87 (hanno fatto ordini nell'anno corrente)
  topCities:      string[];     // ["SALERNO", "BARONISSI", "PASTENA"]
};
```

**Query**:
```sql
SELECT
  czm.zona, czm.prov,
  COUNT(DISTINCT c.erp_id) AS total_clients,
  COUNT(DISTINCT c.erp_id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM agents.order_records o
      JOIN agents.customers cc ON cc.account_num = o.customer_account_num
      WHERE cc.erp_id = c.erp_id AND cc.user_id = c.user_id
        AND EXTRACT(YEAR FROM o.creation_date::date) = EXTRACT(YEAR FROM CURRENT_DATE)
    )
  ) AS active_this_year
FROM agents.customers c
JOIN system.city_zone_map czm
  ON czm.city_normalized = UPPER(TRIM(c.city))
  AND czm.prov = COALESCE(c.county, ...)
WHERE c.user_id = $1 AND c.deleted_at IS NULL AND c.hidden = FALSE
GROUP BY czm.zona, czm.prov
ORDER BY total_clients DESC;
```

**UI ZoneListPage**:
```
🗺️ Esplora Zone Clienti                    [← Giri]

┌─────────────────────────────────────────┐
│ Zona 7 — Salerno città          SA      │
│ 193 clienti · 87 attivi quest'anno      │
│ Salerno · Baronissi · Pastena           │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Zona 8 — Piana del Sele / Cilento  SA  │
│ 234 clienti · 91 attivi quest'anno      │
│ Battipaglia · Agropoli · Eboli          │
└─────────────────────────────────────────┘
...
```

---

### ZoneClientListPage (`/giri/zone/:zona/:prov`)

**Backend endpoint**: `GET /api/visit-planning/zones/:zona/:prov/clients`

Parametri query: `sortBy: 'distance'|'ytd'|'lifetime'|'lastOrder'`, `includeHidden: false`

Risposta per ogni cliente:
```typescript
type ZoneClient = {
  sourceType:      'archibald' | 'arca';
  sourceId:        string;
  displayName:     string;
  city:            string;
  address:         string | null;
  phone:           string | null;
  lat:             number | null;
  lng:             number | null;
  distanceKm:      number | null;     // da home_lat/home_lng utente
  ytdRevenue:      number;            // ordini anno corrente (€ imponibile)
  lifetimeRevenue: number;            // tutti gli ordini
  lastOrderDate:   string | null;
  daysSinceOrder:  number | null;
  isHidden:        boolean;
};
```

**Ordinamento**:
- `distance`: haversine(home, cliente) — null/senza-coords in fondo
- `ytd`: ordini anno corrente decrescente
- `lifetime`: tutti gli ordini decrescente
- `lastOrder`: data ultimo ordine decrescente

**UI ZoneClientListPage**:
```
← Zona 7 — Salerno città
193 clienti · 87 attivi  [Ordina: Distanza ▾]  [🔍]

[☐] Dr. Rossi Mario                      SA zona 7
    Via Roma 10 · 📞 089-123456
    💶 €3.200 ytd · Ultimo: 45gg fa
    [📍 0.8 km]

[☑] Studio Odonto Viola                  SA zona 7
    Via Napoli 5 · 📞 089-234567
    💶 €8.100 ytd · Ultimo: 12gg fa
    [📍 2.1 km]

[☐] Lab. Bianchi                         SA zona 7
    Via Carducci 3 · 📞 —
    💶 €0 ytd · Dormiente: 827gg
    [Archivia]

───────────────────────────────────────────
[4 selezionati] [📅 Pianifica giro per ___]
```

**Archiviazione stale**:
- Pulsante "Archivia" su ogni cliente → `UPDATE agents.customers SET hidden=TRUE`
- I clienti archiviati non appaiono nelle liste e non vengono inclusi in buildCandidates
- Riattivazione dalla pagina profilo cliente (`/customers/:id`)
- Arca sub_clients: stesso meccanismo via `shared.sub_clients.hidden` (colonna da aggiungere)

**Azione "Pianifica giro"**:
- Seleziona data (date picker)
- Crea sessione con le tappe pre-caricate come `status='to_call'`
- Naviga a `/giri/:sessionId`
- Smart Generation ottimizza l'ordine (VRPTW) mantenendo i clienti selezionati

---

## Piano 1l — Smart Generation + Map Itinerary

### Smart Generation

#### Intent detection

```typescript
async function detectIntent(
  pool: DbPool,
  userId: string,
  date: string,        // YYYY-MM-DD
): Promise<'appointment_anchored' | 'zone_based'> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM agents.appointments
     WHERE user_id = $1
       AND DATE(start_at AT TIME ZONE 'Europe/Rome') = $2
       AND deleted_at IS NULL`,
    [userId, date],
  );
  return parseInt(rows[0].count) > 0
    ? 'appointment_anchored'
    : 'zone_based';
}
```

#### Intent A — Appointment-anchored

1. Carica appuntamenti confermati per la data (da `agents.appointments`)
   - Se `customer_erp_id IS NULL` → l'appuntamento viene usato solo come vincolo temporale (time block), non genera una tappa
2. Converte ogni appuntamento con `customer_erp_id` in `VisitPlanningStop` con:
   - `status: 'confirmed'`
   - `locked: true`
   - `estimatedArrival` dall'orario `start_at` dell'appuntamento
   - `sourceId` dal `customer_erp_id` se presente
3. Calcola finestre temporali libere tra gli appuntamenti
4. Identifica le zone degli appuntamenti (da `city_zone_map` tramite city del cliente)
5. Per ogni finestra libera: seleziona candidati dalla stessa zona, ordinati per prossimità geografica all'appuntamento adiacente + score
   - Se il cliente dell'appuntamento non ha coordinate: usa centroide della zona (da `city_zone_map`) come punto d'ancoraggio per il calcolo prossimità
6. VRPTW ottimizza la sequenza completa (appuntamenti = hard constraints)

**Parametri finestra temporale**:
- Inizio giornata: `home_preferred_time_start` (default 08:00)
- Fine giornata: `home_preferred_time_end` (default 18:00)
- Visita standard: 30 min + travel_time stimato

#### Intent B — Zone-based

**B1: Selezione manuale** (da ZoneClientListPage)
- Le tappe entrano già pre-caricate con `status='to_call'`
- `generateVisitRoute` viene chiamato con `mode='manual'` e la lista pre-esistente
- Ottimizza solo l'ordine VRPTW, non aggiunge né rimuove clienti
- Restituisce le tappe riordinate per sequenza ottimale

**B2: Auto-generate da zona**
- `buildCandidates` accetta parametro `zoneFilter?: { zona: string; prov: string }[]`
- Filtro applicato: `WHERE czm.zona = ANY($zones) AND czm.prov = ANY($provs)`
- Top N candidati per score: N = `MAX_STOPS[horizon]` (day=15, week=10/giorno) come configurato in `visit-generate-service.ts`
- VRPTW ottimizza il percorso

```typescript
// Signature aggiornata di buildCandidates
export async function buildCandidates(
  pool: DbPool,
  userId: string,
  mode: VisitMode,
  options?: {
    zoneFilter?: Array<{ zona: string; prov: string }>;
    excludeSourceIds?: string[];  // clienti già in sessione come locked
  },
): Promise<ScoredProfile[]>
```

#### Regenerate zone-aware

```typescript
router.post('/sessions/:sessionId/regenerate', async (req, res) => {
  // ... [esistente: capture staleIds, load session]

  // NUOVO: identifica zone delle tappe bloccate
  const { rows: lockedStops } = await pool.query(
    `SELECT DISTINCT czm.zona, czm.prov
     FROM agents.visit_planning_stops vps
     JOIN agents.customers c
       ON c.erp_id = vps.source_id AND c.user_id = vps.user_id
     JOIN system.city_zone_map czm
       ON czm.city_normalized = UPPER(TRIM(c.city))
     WHERE vps.session_id = $1 AND vps.user_id = $2 AND vps.locked = TRUE`,
    [sid, userId],
  );

  const zoneFilter = lockedStops.length > 0
    ? lockedStops.map(r => ({ zona: r.zona, prov: r.prov }))
    : undefined;  // nessun filtro se nessuna tappa bloccata

  const newStops = session.horizon === 'week'
    ? await generateWeeklyDistribution(pool, userId, sid, session.mode, stopDate, startLat, startLng, { zoneFilter })
    : await generateVisitRoute(pool, userId, sid, session.mode, session.horizon, startLat, startLng, stopDate, { zoneFilter });
  // ...
});
```

#### Status flow tappe (aggiornato)

```
suggested    → proposto dall'algoritmo, non ancora validato da Biagio
to_call      → Biagio vuole visitarlo, deve chiamare per fissare
confirmed    → appuntamento confermato con ora fissa
planned      → in agenda senza ora specifica
visited      → visita effettuata ✅
skipped      → saltato (cliente non disponibile, disdetta)
removed      → rimosso dal giro (soft delete)
```

UI SessionPage: badge contatori per stato visibili nell'header
```
3 🟢 confermati · 4 📞 da chiamare · 2 ⚪ suggeriti
```

#### Giornaliero vs Settimanale

| Parametro | Giornaliero | Settimanale |
|---|---|---|
| Zone | 1 zona (o 2 adiacenti) | 1 zona per giorno della settimana |
| Max tappe/giorno | 8-12 (config utente) | 6-10 per giorno |
| Intent detection | Per la data specifica | Per ogni giorno della settimana |
| VRPTW | Ottimizzazione singola | Per-day, indipendente |
| Wizard settimanale | n/a | "Seleziona zona per ogni giorno" |

---

### Map Itinerary (estensione VisitMap + SessionPage)

#### Dati mostrati sulla mappa

1. **Polyline percorso**: linea che collega le tappe in ordine di sequenza
2. **Marker numerati**: ogni tappa con numero sequenza e colore stato
   - Tappa visitata: ✅ marker verde pieno
   - Tappa da visitare: ⚪ cerchio con numero (outline)
   - ETA sforato (ora attuale > estimatedArrival + 10min): marker arancio lampeggiante
3. **Pannello stats** (sopra la mappa):
   ```
   📍 12.4 km (8/11 tappe localizzate) · ⏱ 3h 20min · 🕐 08:30→17:15
   ```
   Regola: il totale km viene sempre mostrato, con indicazione `(N/M tappe localizzate)` quando N < M.
   Il totale include haversine×1.25 per le tappe geocodificate + 0 per quelle senza coordinate (contatore onesto).
4. **ETA per tappa**: visibile nelle card delle tappe (già presente tramite VRPTW)

#### Calcolo distanza totale

Il VRPTW solver (`visit-vrptw-solver.ts`) già calcola `travelMinutes` per ogni step. Aggiungere:
- `travelKm = travelMinutes / 60 * 50` (stima 50 km/h media) come approssimazione
- Somma per distanza totale giornata
- Oppure: usare Haversine tra coordinate consecutive × 1.25 (road factor)

#### Navigazione

**Per-stop**: pulsante 🧭 già esistente → `https://maps.google.com/maps?daddr=<displayName>` (invariato)

**Multi-stop (tutto il giro)**:
```
https://www.google.com/maps/dir/[home]/[stop1]/[stop2]/.../[stopN]
```
URL Google Maps con waypoints separati da `/`. Limite: 10 waypoint su mobile.
Per giri con >10 tappe: apre le prime 9 + destinazione finale.

Pulsante "▶ Avvia navigazione completa" nell'header della SessionPage.

---

## Ordine di implementazione

```
Piano 1j — Geocoding backfill
  ├── Migrazione 111 (sub_clients.lat/lng + hidden)
  ├── Operation type geocode-customers
  ├── Background job Nominatim (rate limited)
  └── buildCandidates usa COALESCE(geo_status, customers.geo_lat)

Piano 1k — Zone Explorer
  ├── GET /api/visit-planning/zones (endpoint)
  ├── GET /api/visit-planning/zones/:zona/:prov/clients (endpoint)
  ├── ZoneListPage.tsx
  ├── ZoneClientListPage.tsx
  ├── Stale archiving (hidden=true)
  └── Link da /giri home

Piano 1l — Smart Generation + Map Itinerary
  ├── buildCandidates: zoneFilter param
  ├── detectIntent()
  ├── Intent A: appointment-anchored generation
  ├── Intent B1: manual selection VRPTW-only
  ├── Intent B2: auto-generate with zone filter
  ├── Regenerate: zone-aware
  ├── VisitMap: polyline + stats panel
  ├── SessionPage: "Avvia navigazione completa" button
  └── Status counters nell'header sessione
```

---

## File nuovi / modificati per piano

### Piano 1j
| File | Op |
|---|---|
| `backend/src/db/migrations/111-geocoding-backfill.sql` | Crea |
| `backend/src/services/geocoding-service.ts` | Crea |
| `backend/src/operations/handlers/geocode-customers.ts` | Crea |
| `backend/src/services/visit-generate-service.ts` | Modifica (COALESCE lat/lng) |

### Piano 1k
| File | Op |
|---|---|
| `backend/src/routes/visit-planning-router.ts` | Modifica (2 endpoint) |
| `frontend/src/pages/ZoneListPage.tsx` | Crea |
| `frontend/src/pages/ZoneClientListPage.tsx` | Crea |
| `frontend/src/services/visit-planning.service.ts` | Modifica (listZones, listZoneClients) |
| `frontend/src/AppRouter.tsx` | Modifica (2 route) |
| `frontend/src/pages/VisitPlanningPage.tsx` | Modifica (link Esplora Zone) |

### Piano 1l
| File | Op |
|---|---|
| `backend/src/services/visit-generate-service.ts` | Modifica (zoneFilter) |
| `backend/src/services/visit-generate-intent.ts` | Crea (detectIntent, Intent A) |
| `backend/src/routes/visit-planning-router.ts` | Modifica (regenerate zone-aware) |
| `frontend/src/components/visit-planning/VisitMap.tsx` | Modifica (polyline, stats) |
| `frontend/src/pages/VisitPlanningSessionPage.tsx` | Modifica (nav button, counters) |
