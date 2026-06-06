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
   Regola (opzione A — floor): il totale km viene mostrato come **limite inferiore** quando ci sono tappe senza coordinate.
   Il calcolo usa haversine×1.25 solo tra tappe consecutive entrambe geocodificate; i tratti adiacenti a una tappa senza coordinate vengono omessi dal conteggio.
   Il valore mostrato è prefissato con `≥` per indicare che è un minimo: `≥18,4 km (6/7 tappe localizzate)`.
   Questo evita di mostrare un totale confidenziale ma errato per difetto significativo (la tappa senza coordinate potrebbe essere la più lontana).
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

## UI/UX Design Decisions — VINCOLANTI AL 100%

> Tutti gli elementi di questa sezione sono stati approvati visivamente tramite mockup interattivi. L'implementazione DEVE rispettarli esattamente. Nessuna deviazione senza approvazione esplicita.
> Mockup di riferimento: `.superpowers/brainstorm/13443-1780748322/content/`

---

### Home page `/giri` — Redesign

**Due entry point con peso visivo distinto (griglia 2/3 + 1/3):**

- **Primario (2/3 larghezza, sfondo gradiente blu `#1e3a5f→#2563eb`):**
  - Label piccolo: "TU SCEGLI I CLIENTI"
  - Titolo: "📍 Pianifica per zona"
  - Testo: "Sfoglia la lista clienti per zona, seleziona chi visitare e costruisci il giro. Le tappe partono come 'da chiamare' per fissare appuntamento."
  - CTA: "Esplora zone →" (bottone bianco con testo blu)

- **Secondario (1/3 larghezza, bianco con bordo #e5e7eb):**
  - Label piccolo: "IL SISTEMA SCEGLIE"
  - Titolo: "⚡ Genera automaticamente"
  - Testo: "L'algoritmo seleziona i clienti migliori in base a valore, urgenza e zona."
  - CTA: "Genera giro" (bottone outline grigio)

**Nome giro auto-generato (binding):**
- Da Zone Explorer: `Giro {Nome Zona} — {Lunedì 08/06}` (es. "Giro Salerno — Lunedì 09/06")
- Da auto-generate: `Giro — {Lunedì 08/06}`
- Il campo nome è editabile ma pre-compilato con questo valore
- Il sottotitolo della sessione in lista include: `zona {N} {PROV} · {N} tappe · {Modalità}`

**Lista sessioni esistenti**: stessa struttura attuale + pulsante 🗑 rosso chiaro visibile sempre.

---

### ZoneListPage `/giri/zone`

**Struttura visiva (ogni zona è una card):**

```
[checkbox] [BADGE-ZONA] [nome zona]                [totale]
           [chip città 1] [chip città 2] [chip]     [N attivi]
           [━━━━━━░░░░░░] ← barra verde % attivi    [━━━━━]
```

**Badge zona**: quadrato colorato per provincia, numero (o "-1") in bianco, `border-radius: 9px`
- SA → `#2563eb` (blu)
- NA → `#7c3aed` (viola)
- PZ → `#059669` (verde scuro)
- AV → `#d97706` (ambra)
- CE → `#dc2626` (rosso)
- Altre province → `#6b7280` (grigio)

**Multi-selezione (binding):**
- Checkbox visibile a sinistra di ogni card
- Tap → toggle selezione
- Card selezionata: `border: 2px solid #2563eb; background: #eff6ff`
- City chips selezionate: `background: #dbeafe; color: #1d4ed8`

**Barra sticky inferiore:**
- 0 zone selezionate: bottone disabilitato "Seleziona almeno una zona"
- 1+ zone: "**N zone selezionate** · M clienti totali" + CTA "Sfoglia clienti →" (`#2563eb`)

**Raggruppamento**: zone raggruppate per provincia con section label (`font-size: 11px, uppercase, #9ca3af`).
Zone piccole (< ~30 clienti): stessa struttura ma card con `padding` ridotto e `opacity: 0.8`.

**Zona -1**: mostrata come "-1" nel badge (non rinominata — è organizzazione interna).

**Tutte le zone vengono mostrate** senza soglia minima di esclusione, incluse zone piccole (AV, CE, etc.).

---

### ZoneClientListPage `/giri/zone/[selezione]/clients`

**Header:**
- Zone selezionate come pill blu (`background: #2563eb; color: white; border-radius: 20px`)
- Subtitle: "Seleziona i clienti da includere nel giro"

**Ordinamento — 4 tab (tutto italiano, binding):**
1. "Distanza da casa" (default se home_lat/lng configurato)
2. "Fatturato quest'anno"
3. "Fatturato storico"
4. "Ultimo ordine"
- Tab attivo: `background: #2563eb; color: white`
- Tab attivo mostra freccia ordinamento: `↑ Distanza da casa`

**Ricerca**: input full-width con placeholder "🔍 Cerca per nome, città, telefono..."

**Riepilogo**: "427 clienti · 178 attivi quest'anno" + "N selezionati" allineato a destra (in blu se >0)

**Due sezioni separate (binding):**
- `✅ Clienti attivi — ordinati per [criterio]` (section label verde)
- `⚠️ Clienti inattivi — nessun ordine nell'anno` (section label arancio)
- I clienti inattivi sono SEMPRE in fondo indipendentemente dall'ordinamento scelto

**Card cliente (struttura griglia: checkbox | corpo | destra):**
- Checkbox sinistra (22×22px, `border-radius: 5px`)
- Corpo: nome + badge sorgente + indirizzo + meta-row + telefono
- Destra: distanza da casa + fatturato anno corrente

**Badge sorgente (testo completo, non singola lettera):**
- Archibald → `background: #dbeafe; color: #1e40af; testo: "Archibald"`
- Fresis/Arca → `background: #d1fae5; color: #065f46; testo: "Fresis"`

**Meta-row**: fatturato quest'anno (verde se >0), giorni dall'ultimo ordine

**Telefono — azione primaria, prominente:**
- Pulsante `background: #eff6ff; color: #2563eb; padding: 5px 12px; border-radius: 8px; font-weight: 700`
- Se nessun telefono: `📵 Nessun telefono registrato` (grigio)

**Distanza da casa:**
- Se geocodificato: `📍 2,1 km` (testo grigio scuro, separatore decimale virgola italiana)
- Se non geocodificato: `📍 —` con etichetta "posizione non disponibile"
- Non geocodificati: sempre in fondo agli attivi, prima degli inattivi

**Clienti inattivi:**
- `opacity: 0.6; background: #fafafa`
- Badge rosso: "Inattivo da N giorni" (`background: #fee2e2; color: #dc2626`)
- Pulsante "Archivia" in basso a destra: `border: 1px solid #e5e7eb; color: #9ca3af; border-radius: 6px`
- Hover Archivia: `border-color: #ef4444; color: #ef4444`
- Anche i clienti inattivi sono selezionabili (l'utente può includerne uno se vuole)

**Sticky bar inferiore:**
- Info: "**N clienti selezionati** · Le tappe saranno in stato 'da chiamare' — contatta per fissare appuntamento"
- Azioni: label "Giro per:" + `<select>` con prossimi giorni lavorativi + bottone "Crea giro →" (`#2563eb`)

---

### Intent A — Schermata rilevamento appuntamenti

Quando l'utente sceglie "Genera automaticamente" per una data con appuntamenti in agenda, **prima** della generazione viene mostrata questa schermata:

**Contenuto:**
- Titolo: "📅 Appuntamenti trovati per {Lunedì 09/06}"
- Subtitle: "Il sistema ha rilevato N appuntamenti confermati in agenda"
- Testo: "Costruisco il giro **attorno a questi appuntamenti fissi**, riempiendo le finestre libere con clienti vicini."

**Per ogni appuntamento rilevato:**
```
[10 | :00]  Nome cliente
            📍 Indirizzo
            ⏱ N min
            🔒 Fisso — non spostabile
```
- Blocco orario: `background: #eff6ff; border-radius: 8px` con ora grande in blu
- Badge "🔒 Fisso — non spostabile": `background: #dbeafe; color: #1e40af`

**Per ogni finestra libera:**
```
✅ Finestra libera: HH:MM → HH:MM
   Circa N min disponibili → posso inserire N-M clienti vicini a [zona]
```
- `background: #f0fdf4; border: 1px dashed #86efac; border-radius: 8px`

**CTA:**
- "▶ Genera giro con questi appuntamenti" (primario, `#2563eb`, `flex: 2`)
- "Ignora" (secondario, outline grigio, `flex: 1`)

**Nella sessione generata (result Intent A):**
- Appuntamenti fissi: `border-left: 4px solid #2563eb; background: #eff6ff`
  - Badge: "🔒 Appuntamento" in viola
  - Status: `confirmed`
- Tappe di riempimento: `border-left: 4px solid #f59e0b`
  - Status: `to_call`
  - Meta: "📞 Da chiamare · N min · Città · 🚗 N min da app. HH:MM"
- Header contatori: `🔒 N appuntamenti fissi · 📞 N da chiamare · ⚪ N suggeriti`

---

### Session Page — Aggiornamenti UI (Piano 1l)

**Header aggiornato:**
- Titolo: "{Titolo giro auto-generato}"
- Subtitle: "zona N {PROV} · {Modalità} · N tappe"
- Azioni destra: "🔄 Rigenera" (outline blu) + "▶ Avvia navigazione" (verde `#16a34a`)

**Contatori stato (sotto il titolo, sempre visibili):**
```
✅ N visitati · 📅 N confermati · 📞 N da chiamare · ⚪ N suggeriti
```
- Ogni counter: pill colorato (`font-size: 12px; padding: 4px 10px; border-radius: 20px`)
- Colori: visitati=verde, confermati=blu, da chiamare=ambra, suggeriti=grigio

**Mappa — pannello stats (barra scura `#1e293b` sopra la mappa):**
```
≥18,4 km (6/7 tappe localizzate)  |  2h 45min di guida  |  08:30 → 17:00  |  2 ✅ visite completate
```
- `≥` prefix OBBLIGATORIO quando ci sono tappe senza coordinate
- Tra ogni stat: divisore verticale `background: #334155; width: 1px; height: 28px`
- "visite completate" in verde se >0

**Mappa — polyline percorso:**
- Tratti completati (tra tappe visitate): linea verde continua, spessore 2px, `opacity: 0.9`
- Tratti futuri: linea blu tratteggiata `stroke-dasharray: 2,1.5`, `opacity: 0.7`
- I tratti adiacenti a tappe senza coordinate NON vengono disegnati

**Mappa — marker:**
- Visitato: cerchio verde pieno `#16a34a` + numero bianco
- Confermato / tappa corrente: cerchio blu `#2563eb` + numero, `width: 32px` (più grande)
- Tooltip sulla tappa corrente: `background: #1e293b; color: white; border-radius: 6px`
  - Contenuto: "HH:MM · Nome tappa · ora prossima tappa"
- Da chiamare: cerchio ambra `#f59e0b` + numero
- Suggerito: cerchio grigio `#9ca3af` + numero
- ETA sforato (>10 min): marker arancio lampeggiante
- Casa (punto partenza): `🏠` marker `background: #303e4f`

**Mappa — legenda (bottom-left, binding):**
```
🟢 Visitato  🔵 Confermato  🟡 Da chiamare  ⚪ Suggerito
— percorso completato   ╌ prossime tappe
```
- `background: rgba(255,255,255,0.9); border-radius: 8px; padding: 8px 10px; font-size: 10px`

**Card tappa — varianti per stato:**
- "Da chiamare": `border-left: 4px solid #f59e0b`
  - Pulsante telefono prominente: `background: #fef3c7; color: #92400e; border: 1px solid #fde68a`
  - Mostra numero direttamente: "📞 089-464606"
- "Appuntamento confermato": `border-left: 4px solid #2563eb; background: #eff6ff`
- "Visitato": `border-left: 4px solid #16a34a; background: #f0fdf4`

**Navigazione completa — barra sotto la mappa:**
- Testo info: "Apri Google Maps con tutte le tappe in sequenza"
  - Se >9 tappe: "(fermate 1-8 + destinazione finale)" — le tappe 9 fino a N-1 sono omesse dall'URL
- Bottone: "🗺️ Apri in Google Maps" (`background: #16a34a; color: white; border-radius: 10px`)
- URL: `https://www.google.com/maps/dir/[home]/[stop1]/…/[stop8]/[stopN]`
  - `[home]` = `home_lat,home_lng` se disponibile, altrimenti skip
  - Coordinate delle tappe geocodificate in formato `lat,lng`; tappe senza coords: `displayName` encodato

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
