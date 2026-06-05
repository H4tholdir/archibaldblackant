# Design: Modulo Giri Visite Intelligenti

**Data:** 2026-06-05  
**Stato:** approvato — pronto per writing-plans  
**Autori:** Francesco Formicola + Claude  
**Riferimento upstream:** `archibald-web-app/docs/VISIT_PLANNING_IMPLEMENTATION_PLAN.md` (piano Codex — base tecnica da cui questo design deriva)

---

## 1. Obiettivo

Costruire un modulo di pianificazione giri visite che funziona come una segretaria commerciale per l'agente Formicola Biagio. Il sistema propone quali clienti visitare, in quale ordine, su quale zona, e prepara l'agente alla visita mostrando storico acquisti e suggerimenti commerciali — tutto dal telefono, prima e durante il giro.

Il sistema propone. L'agente decide sempre. Ogni elemento è modificabile.

---

## 2. Contesto dati reali (audit DB 2026-06-05)

Valori confermati su produzione (`user_id = bbed531f-97a5-4250-865e-39ec149cd048`):

| Metrica | Valore |
|---|---|
| Clienti Archibald totali | 1.371 |
| Con indirizzo/CAP/città | 99%+ |
| Con coordinate GPS (ERP) | 72 (5.2%) — non affidabili |
| Sottoclienti Fresis totali | 1.210 (in `shared.sub_clients`) |
| Record `fresis_history` | 15.392 |
| Match Arca↔Archibald confermati | 540 (534 verificati via `erp_id` join) |
| Clienti con ordini Archibald 2026 | 145 |
| Province principali | SA, NA, CE, PZ, AV, BN, MT |

**Note critiche:**
- `agents.customers.actual_sales` = 0 per tutti — non usabile per scoring. Il fatturato si calcola da `agents.order_records` + `agents.fresis_history`.
- Le coordinate ERP (`geo_latitude`/`geo_longitude` da migrazione 091) sono presenti solo su 72 clienti e non verificate. Non vanno usate come ground truth — richiedono validazione o sostituzione tramite geocoding.
- Fresis (`account_num = 1002328`) appare come cliente con 70 ordini Archibald nel 2026 — è il distributore, non un dentista. Va escluso o marcato come `tipo: distributore` e non inserito nei giri.

---

## 3. Struttura dati FT/KT — regole di deduplica per lo scoring

Formicola Biagio è sia agente Komet che amministratore di Fresis (concessionario). Questo genera due canali di vendita con record sovrapposti:

**FT (Fattura Fresis):**
- Ordine madre in `agents.order_records` intestato a Fresis (account 1002328)
- Ogni sottocliente ha la sua FT in `agents.fresis_history` (sub_client_codice)
- Il record Fresis history è la fonte per il valore del singolo dentista
- L'ordine madre Archibald NON va conteggiato per i singoli dentisti

**KT (ordine diretto cliente):**
- Ordine in `agents.order_records` intestato al cliente dentista (badge KT)
- Lo stesso ordine compare in `agents.fresis_history` con `archibald_order_id` valorizzato
- Doppio conteggio potenziale — va deduplicato

**Regole di deduplica per il scoring `valore_cliente`:**

```
1. FT puro:
   fonte = fresis_history WHERE source='ft' AND archibald_order_id IS NULL
   → usa fresis_history.target_total_with_vat (imponibile documento)
   → NON sommare order_records dell'ordine madre Fresis

2. KT con archibald_order_id:
   → stesso acquisto in entrambe le tabelle
   → usa fresis_history come fonte primaria (ha il ricavo agente)
   → escludi order_records corrispondente dal conteggio

3. KT import diretto Arca (archibald_order_id IS NULL in fresis_history):
   → usa fresis_history

4. Ordini Archibald intestati a clienti NON Fresis:
   → usa order_records.total_amount
   → verifica che non esista record fresis_history corrispondente
```

**Nota:** il campo `fresis_history.revenue` è il **ricavo netto dell'agente** (commissione ~40-50%), non il fatturato del cliente. Per lo scoring del valore cliente usare `target_total_with_vat` (imponibile), non `revenue`.

---

## 4. Decisioni vincolanti (12/12 — tutte approvate da Francesco)

### D1 — Navigazione ibrida
Tre entry point, un solo modulo:
- **Home:** widget compatto "Giro di oggi" — prossime 2-3 tappe, tap → apre sessione
- **Navbar:** voce "Giri" dopo Agenda — per creare/gestire sessioni
- **Agenda:** le tappe `confirmed` generano appuntamenti "Visita cliente" automaticamente

Regola di sincronizzazione Giri↔Agenda:
- tappa → `confirmed` → crea appuntamento Agenda tipo "Visita cliente"
- appuntamento Agenda cancellato → tappa torna a `planned` (non eliminata)
- Il giro è fonte di verità; l'Agenda è la vista calendario delle confirmed

### D2 — Responsive obbligatorio
Tre breakpoint progettati fin dal giorno 1:
- **Smartphone (≤430px):** lista tappe verticale, mappa collassabile (default chiusa), azioni rapide con bottoni grandi, una mano
- **Tablet (768-1024px):** split view mappa + lista side by side, wizard più spaziato
- **Desktop (≥1280px):** tre colonne — sidebar sessioni / mappa centrale grande / sidebar dettaglio tappa selezionata

### D3 — Mappa: Leaflet + OpenStreetMap
- Libreria: Leaflet.js + tile OpenStreetMap — gratuito, open source, nessun costo
- Pin numerati con colori per stato (verde=confirmed, giallo=to_call, grigio=planned, blu=backup)
- Linea percorso tracciata nell'ordine delle tappe
- Su mobile: collassabile, espandibile con tap
- Su tablet/desktop: sempre visibile
- Click su pin → seleziona tappa, mostra anteprima nella sidebar (desktop) o apre scheda (mobile)

### D4 — Navigatore: link universale
Pulsante "🧭 Naviga" genera URL universale che il sistema operativo del telefono risolve nell'app preferita dall'utente (Google Maps / Apple Maps / Waze). Nessuna integrazione proprietaria, zero costi, funziona su tutti i dispositivi.

URL format: `https://maps.google.com/maps?daddr={lat},{lng}` con fallback su indirizzo testuale se coordinate non disponibili.

### D5 — Geocoding: Nominatim batch
- Provider: Nominatim (OpenStreetMap) — gratuito
- Rate limit rispettato: 1 req/sec, User-Agent identificativo, no commerciale intensivo
- Batch iniziale: ~1.371 clienti → ~23 minuti, gira in background una volta sola
- Risultati salvati in `agents.customer_geo_status` con campo `quality` (geocoded / failed / manually_confirmed)
- Fallback se qualità=failed: clustering per città/CAP (funziona per il 99% dei clienti)
- Nuovi clienti: geocodati on-demand al momento della sync ERP
- Le coordinate ERP esistenti (72 clienti) vengono conservate ma marchiate `quality='erp_unverified'` fino a conferma manuale o ri-geocoding

### D6 — Punto di partenza
- Default configurabile nel profilo utente (impostato una volta: indirizzo casa/ufficio)
- Override per singola sessione (es. "oggi parto da Salerno")
- Il punto di rientro segue la stessa logica — default = casa, override per sessione
- Salvato in `agents.users` come colonne `home_lat`, `home_lng`, `home_address`

### D7 — Durata visita
- Default globale: 30 minuti
- Valore per cliente: salvato in `agents.customer_visit_preferences.typical_visit_minutes`
- Il sistema usa il valore del cliente se presente, altrimenti il default globale
- L'agente può modificarlo durante il wizard o dalla scheda cliente

### D8 — Feste patronali
- Festività nazionali: tabella statica interna (aggiornata annualmente, nessuna API esterna)
- Feste patronali: dataset da internet (source affidabile) filtrato per province SA, NA, CE, PZ, AV, BN, MT. Import pre-lancio.
- Confidence: ogni record ha campo `confidence` ('verified' / 'dataset' / 'manual')
- UI override: l'agente può correggere data, aggiungere comuni mancanti, marcare "cliente aperto comunque"
- Comportamento: se festività nazionale → escludi automaticamente (hard). Se patronale con confidence=verified → warning forte + default escludi. Se patronale con confidence=dataset → warning soft, non escludi automaticamente.

### D9 — Scheda visita: scroll unico
Layout scroll unico, sezioni in ordine fisso dall'alto:
1. **Header:** nome cliente, indirizzo, orario tappa, badge sorgente (Archibald/Fresis/Entrambi), pulsanti Chiama / Naviga / Crea Ordine
2. **Da proporre oggi** (sezione in evidenza — sfondo azzurro) — suggerimenti riordino, categorie mancanti, promozioni attive
3. **Ultimi ordini aggregati** — FT + KT + ordini Archibald, ordinati per data
4. **Note agente** — testo libero modificabile
5. **Reminder aperti**
6. **Esito visita** — bottoni: Visitato / Nessun ordine / Chiuso / Non disponibile / Rinvia

### D10 — Tracciamento visita
- Tap manuale: pulsanti esito nella scheda visita (sempre disponibili)
- Intelligente al ritorno in foreground: quando l'agente preme "Naviga" → si salva `navigation_started_at` + `active_stop_id`. Quando l'app torna in foreground dopo ≥5 minuti → banner contestuale: "Sei arrivato da [Nome]? → Segna visitato / Non ancora". Funziona su tutti i dispositivi senza permessi GPS in background.
- Nessun check-in geolocalizzato automatico in v1.

### D11 — Weekly planner e Agenda
- Il planner settimanale è una **bozza macro** — macro-zone per giorno, clienti forti consigliati, warning festività
- Non crea appuntamenti in Agenda
- Flusso: weekly → "Dettaglia [Lunedì]" → apre/crea giro giornaliero → tappe confirmed in quel giro → appuntamenti Agenda
- Il weekly mantiene stato `draft_week` separato da sessioni giornaliere

### D12 — Scheda cliente universale
Nessuna pagina "UnifiedCustomer" separata. La scheda cliente esistente (`/clienti/:id`) diventa universale:
- Se cliente Archibald: ID = `erp_id` (formato `55.374`) — come oggi
- Se cliente solo Arca/Fresis: ID = `arca:{codice}` (es. `arca:C00602`)
- Se cliente merged: ID = `erp_id` del primario Archibald (le fonti Arca sono aggregate)
- Il backend normalizza sempre la stessa struttura `CustomerProfile` prima di rispondere
- Badge sorgente discreti mostrano la provenienza: `[A]` Archibald, `[F]` Fresis, `[A+F]` Entrambi
- Storico ordini: FT + KT da fresis_history + ordini Archibald non Fresis — deduplicati per regole §3

---

## 5. Schema dati — migrazioni necessarie

Prossima migrazione disponibile: **108** (`108-visit-planning.sql`).

### 5.1 Estensioni tabelle esistenti

```sql
-- Punto di partenza/rientro per utente
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS home_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS home_lng NUMERIC(10,7);

-- Tipo distributore (esclude Fresis dal giro)
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS is_distributor BOOLEAN NOT NULL DEFAULT FALSE;
-- Seed: marcare Fresis (account_num = '1002328') come distributore
UPDATE agents.customers SET is_distributor = TRUE WHERE account_num = '1002328';
```

### 5.2 Geo status clienti

```sql
CREATE TABLE agents.customer_geo_status (
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald', 'arca')),
  source_id TEXT NOT NULL,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  normalized_address TEXT,
  quality TEXT NOT NULL DEFAULT 'unknown'
    CHECK (quality IN ('unknown','erp_unverified','geocoded','manually_confirmed','failed')),
  provider TEXT,
  geocoded_at TIMESTAMPTZ,
  manually_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
);
```

### 5.3 Preferenze visita per cliente

```sql
CREATE TABLE agents.customer_visit_preferences (
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald', 'arca')),
  source_id TEXT NOT NULL,
  typical_visit_minutes INTEGER NOT NULL DEFAULT 30,
  preferred_days SMALLINT[] NOT NULL DEFAULT '{}',
  avoid_days SMALLINT[] NOT NULL DEFAULT '{}',
  preferred_time_start TIME,
  preferred_time_end TIME,
  requires_appointment BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id)
);
```

### 5.4 Festività

```sql
CREATE TABLE system.italian_municipal_holidays (
  id SERIAL PRIMARY KEY,
  comune TEXT NOT NULL,
  provincia TEXT NOT NULL,
  regione TEXT,
  date_month SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day SMALLINT NOT NULL CHECK (date_day BETWEEN 1 AND 31),
  holiday_name TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'dataset'
    CHECK (confidence IN ('verified','dataset','manual')),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comune, provincia)
);

CREATE TABLE agents.municipal_holiday_overrides (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  comune TEXT NOT NULL,
  provincia TEXT,
  date_month SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day SMALLINT NOT NULL CHECK (date_day BETWEEN 1 AND 31),
  holiday_name TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, comune, provincia)
);
```

### 5.5 Sessioni giro

```sql
CREATE TABLE agents.visit_planning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('day','week')),
  mode TEXT NOT NULL CHECK (mode IN ('balanced','profitability','coverage','constrained','manual_assist')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planned','in_progress','completed','cancelled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_location_label TEXT,
  start_lat NUMERIC(10,7),
  start_lng NUMERIC(10,7),
  end_location_label TEXT,
  end_lat NUMERIC(10,7),
  end_lng NUMERIC(10,7),
  constraints_json JSONB NOT NULL DEFAULT '{}',
  metrics_json JSONB NOT NULL DEFAULT '{}',
  navigation_started_at TIMESTAMPTZ,
  active_stop_id UUID,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_visit_sessions_user_date
  ON agents.visit_planning_sessions (user_id, start_date)
  WHERE deleted_at IS NULL;
```

### 5.6 Tappe sessione

```sql
CREATE TABLE agents.visit_planning_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL
    REFERENCES agents.visit_planning_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  appointment_id UUID REFERENCES agents.appointments(id) ON DELETE SET NULL,
  stop_date DATE NOT NULL,
  sequence INTEGER,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','to_call','confirmed','planned','backup','visited','skipped','removed')),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_arrival TIMESTAMPTZ,
  estimated_departure TIMESTAMPTZ,
  visit_minutes INTEGER NOT NULL DEFAULT 30,
  travel_minutes_from_previous INTEGER,
  distance_km_from_previous NUMERIC(8,2),
  score_total NUMERIC(8,3),
  score_breakdown_json JSONB NOT NULL DEFAULT '{}',
  recommendation_reasons TEXT[] NOT NULL DEFAULT '{}',
  alerts TEXT[] NOT NULL DEFAULT '{}',
  manual_note TEXT,
  skip_reason TEXT,
  visited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visit_stops_session
  ON agents.visit_planning_stops (session_id, stop_date, sequence);
```

### 5.7 Log visite

```sql
CREATE TABLE agents.customer_visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald','arca')),
  source_id TEXT NOT NULL,
  session_id UUID REFERENCES agents.visit_planning_sessions(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES agents.visit_planning_stops(id) ON DELETE SET NULL,
  visited_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'visited'
    CHECK (outcome IN ('visited','order_created','no_order','closed','not_available','phone_order','rescheduled')),
  order_number TEXT,
  notes TEXT,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Scoring commerciale

### 6.1 Formula

```
score_totale =
  valore_cliente          (peso: 0.30)
+ probabilita_riordino    (peso: 0.25)
+ urgenza_contatto        (peso: 0.15)
+ copertura_zona          (peso: 0.15)
+ opportunita_cross_sell  (peso: 0.10)
+ rilevanza_promozioni    (peso: 0.05)
- rischio_chiusura        (penalità: variabile)
- penalita_dati_mancanti  (penalità: fissa -0.1 se indirizzo mancante)
```

I pesi sono **fissi per modalità** — non configurabili dall'utente. La scelta della modalità è l'unica interfaccia di configurazione.

| Componente | balanced | profitability | coverage | constrained |
|---|---|---|---|---|
| valore_cliente | 0.30 | 0.50 | 0.10 | 0.20 |
| probabilita_riordino | 0.25 | 0.30 | 0.15 | 0.20 |
| urgenza_contatto | 0.15 | 0.05 | 0.40 | 0.15 |
| copertura_zona | 0.15 | 0.05 | 0.25 | 0.30 |
| opportunita_cross_sell | 0.10 | 0.07 | 0.07 | 0.10 |
| rilevanza_promozioni | 0.05 | 0.03 | 0.03 | 0.05 |

La modalità `constrained` privilegia la zona sopra tutto (l'agente ha un impegno fisso in una zona e vuole riempire quella giornata).

### 6.2 Calcolo `valore_cliente`

```sql
-- Fonti per un cliente dato (source_type, source_id):
-- FT puri: fresis_history WHERE archibald_order_id IS NULL, raggruppati per sub_client_codice
-- KT: fresis_history WHERE archibald_order_id IS NOT NULL (escludere order_records corrispondente)
-- Ordini Archibald non-Fresis: order_records WHERE customer_account_num != '1002328'
-- Non sommare mai order_records Fresis + fresis_history per lo stesso acquisto
```

Normalizzazione: percentile su tutti i clienti dell'agente (0–1). Protezione outlier: cap a 95° percentile prima di normalizzare.

### 6.3 Calcolo `probabilita_riordino`

- Stima media giorni tra ordini dagli ultimi 12 mesi (usa fresis_history + order_records deduplicati)
- Calcola `giorni_da_ultimo_ordine` (aggregato tra entrambe le fonti)
- Se `giorni_da_ultimo_ordine` ≈ `ciclo_medio_giorni` ± 20% → score alto
- Se `giorni_da_ultimo_ordine` > `ciclo_medio_giorni` × 1.5 → dormiente, urgenza alta

### 6.4 Calcolo `opportunita_cross_sell`

- Categorie acquistate: estratte da `fresis_history.items[].articleCode` + `order_articles.article_code`
- Mappa articolo → categoria (da `shared.products` o regex su codice)
- Categorie mai acquistate coerenti con il profilo → score positivo
- Non proporre come "mai acquistato" ciò che è stato comprato dall'altra fonte (FT vs KT)

---

## 7. Algoritmo di pianificazione (v1 — euristico)

### Pipeline giornaliera

1. Carica vincoli sessione (zona/CAP/province, orari, modalità)
2. Carica candidati da entrambe le sorgenti (Archibald + Arca/Fresis)
3. Escludi: distributori (`is_distributor=true`), bloccati, senza indirizzo, chiusure certe
4. Applica match confermati (`sub_client_customer_matches`) — non duplicare stesso studio
5. Calcola score per ogni candidato
6. Shortlist: max 50 candidati per sessione
7. Ordina: tappe locked/confirmed prima → nearest-neighbor pesato da score → farthest-first se configurato → rientro progressivo
8. Inserisci backup (max 3 per area, score alto ma non nel percorso ottimale)
9. Calcola orari stimati (durata visita da preferenze + tempo guida da distanza euclidea o OSRM se disponibile)
10. Genera motivazioni e alert per ogni tappa
11. Persiste sessione e tappe

### Fallback senza coordinate

Se il cliente non ha coordinate in `customer_geo_status` (quality != geocoded/manually_confirmed):
- Raggruppamento per città/CAP — efficace per l'itinerario base
- Nessuna linea su mappa Leaflet per quella tappa (pin fisso sul centroide della città)
- Alert visibile: "Posizione approssimata — indirizzo non geocodificato"

---

## 8. API backend

Prefisso: `/api/visit-planning`

### Sessioni
- `GET /sessions?from=&to=&status=&horizon=`
- `POST /sessions` — crea sessione
- `GET /sessions/:sessionId`
- `PATCH /sessions/:sessionId`
- `DELETE /sessions/:sessionId`
- `POST /sessions/:sessionId/generate` — genera candidati e route
- `POST /sessions/:sessionId/recalculate` — ricalcolo parziale (da posizione corrente)

### Tappe
- `GET /sessions/:sessionId/stops`
- `POST /sessions/:sessionId/stops` — aggiunge tappa manuale
- `PATCH /sessions/:sessionId/stops/:stopId`
- `DELETE /sessions/:sessionId/stops/:stopId`
- `POST /sessions/:sessionId/stops/:stopId/confirm`
- `POST /sessions/:sessionId/stops/:stopId/mark-visited`
- `POST /sessions/:sessionId/stops/:stopId/skip`
- `POST /sessions/:sessionId/stops/reorder`
- `POST /sessions/:sessionId/stops/:stopId/navigation-started` — salva timestamp per D10

### Visit brief
- `GET /customers/:sourceType/:sourceId/visit-brief` — storico aggregato, suggerimenti, promozioni, reminder

### Supporto
- `GET /geo/quality-report` — percentuale clienti geocodificati
- `POST /geo/geocode-missing` — avvia job geocoding in background
- `GET /holidays?city=&province=&date=`
- `POST /holidays/overrides`

---

## 9. Frontend — struttura file

```
frontend/src/
├── pages/
│   ├── VisitPlanningPage.tsx          — lista sessioni (/giri)
│   └── VisitPlanningSessionPage.tsx   — sessione singola (/giri/:id)
├── components/visit-planning/
│   ├── VisitPlanningWizard.tsx        — wizard creazione giro (step 1-9)
│   ├── VisitStopCard.tsx              — card tappa nella lista
│   ├── VisitBriefPanel.tsx            — scheda visita scroll unico
│   ├── VisitMap.tsx                   — mappa Leaflet responsive
│   ├── WeeklyVisitPlanner.tsx         — pianificatore settimanale
│   ├── VisitSessionHeader.tsx         — header compatto sessione
│   ├── MunicipalHolidayAlert.tsx      — alert chiusura comune
│   ├── ArrivalBanner.tsx              — banner "Sei arrivato?" (D10)
│   └── VisitOutcomeButtons.tsx        — pulsanti esito visita
├── services/
│   ├── visit-planning.service.ts
│   └── visit-geo.service.ts
└── types/
    └── visit-planning.ts
```

**Widget Home** (`frontend/src/components/HomeVisitWidget.tsx`): card compatta "Giro di oggi" nel `DashboardPage.tsx`.

**Estensione scheda cliente** (`frontend/src/pages/CustomerDetailPage.tsx`): aggiunge tab storico FT/KT unificato, sezione "Da proporre" e pulsante "Aggiungi al giro".

**Router:** aggiungere `/giri` e `/giri/:sessionId` in `App.tsx`.

---

## 10. Fasi di implementazione

Le fasi seguono il piano Codex con le correzioni emerse dal brainstorming.

### Fase 0 — Audit e geocoding (pre-requisito bloccante)
- Query report qualità dati clienti e sub_clients
- Report matching Archibald-Arca esistenti + candidati ad alta confidence (P.IVA uguale)
- Job geocoding batch (Nominatim) su tutti i clienti
- Import dataset feste patronali per SA, NA, CE, PZ, AV, BN, MT
- Seed `is_distributor = TRUE` per Fresis (account_num 1002328)
- Validazione formula score v0 su 3 zone reali con Formicola Biagio

**Gate Fase 0:** ≥70% clienti geocodificati, join cliente-storico affidabile, nessun doppio conteggio evidente, score validato dall'agente.

### Fase 1 — Schema e API base
- Migrazione 108: tutte le tabelle (§5)
- Repository backend per sessioni, tappe, geo, holidays
- API CRUD sessioni e tappe
- Test repository e route

### Fase 2 — Scoring e candidati
- `visit-scoring-service.ts`: calcola score, applica regole FT/KT/deduplica, genera motivazioni
- `unified-customer-service.ts`: costruisce `CustomerProfile` da qualsiasi sorgente
- Filtri zona/CAP/città
- Test con fixture dati reali

### Fase 3 — Planner giornaliero
- Algoritmo euristico pipeline (§7)
- Ordinamento tappe, backup, buffer 15%
- Generazione URL navigatore
- Ricalcolo parziale

### Fase 4 — UI mobile giornaliera
- `VisitPlanningPage`, `VisitPlanningSessionPage`, `VisitStopCard`
- `VisitMap.tsx` (Leaflet responsive, 3 breakpoint)
- `ArrivalBanner.tsx` (D10)
- Test frontend, validazione mobile viewport

### Fase 5 — Scheda visita + scheda cliente universale
- `VisitBriefPanel.tsx` (scroll unico, D9)
- Estensione `CustomerDetailPage` per sorgenti Arca/Fresis (D12)
- Endpoint `visit-brief` con storico aggregato e suggerimenti
- Widget Home (`HomeVisitWidget.tsx`, D1)

### Fase 6 — Chiamate e agenda
- Flusso `to_call`: lista chiamate, registrazione esiti
- Creazione automatica appuntamento Agenda da tappa `confirmed`
- Sincronizzazione bidirezionale Giri↔Agenda (D1)

### Fase 7 — Weekly planner
- Sessione `horizon=week`
- Proposta macro-zone per giorno
- "Dettaglia giornata" → crea sessione day
- Vista settimanale (D11)

### Fase 8 — Feste patronali UI + override
- UI manutenzione feste (D8)
- Alert chiusure nel planner

### Fase 9 (futura, post-validazione v1) — Solver avanzato
- Valutazione Google Route Optimization API vs OR-Tools
- Time windows hard/soft
- Traffico in tempo reale

---

## 11. Testing

### Backend
- Repository: CRUD sessioni, tappe, geo, holidays
- Scoring: fixture con clienti FT/KT, verifica no doppio conteggio
- Deduplica: FT+KT stesso studio → una tappa nel giro
- Planner: giro 6-10 tappe realistico, no zig-zag evidente
- Festività: cliente con patronale confermata → warning, non visita automatica
- Permission: utente non vede sessioni altrui

### Frontend
- Wizard: tutti gli step, validazione input
- Sessione: render vuota, render con alert, modifica tappa
- VisitBriefPanel: scroll, sezioni presenti, badge sorgente
- ArrivalBanner: si mostra e si nasconde correttamente
- Responsive: 375px / 768px / 1280px viewport

### Validazione business (3 scenari con Formicola Biagio)
1. **Zona vicina:** Portici / Ercolano / Castellammare / San Giorgio
2. **Giornata lontana:** Vallo della Lucania → Agropoli → Battipaglia → Salerno
3. **Zona Potenza:** clienti forti + CAP vicini Melfi/Lauria

Ogni scenario confrontato con il giro che l'agente avrebbe fatto manualmente.

---

## 12. Metriche di successo

**Operative:** tempo per preparare un giro, visite completate/giorno, clienti backup usati  
**Commerciali:** ordini da giro, fatturato da giro, tasso ordine/visita, riattivazioni dormienti  
**Sistema:** % clienti geocodificati, % tappe con motivazione, match Arca-Archibald confermati, duplicati evitati

---

## 13. Riferimenti

- Piano Codex completo: `archibald-web-app/docs/VISIT_PLANNING_IMPLEMENTATION_PLAN.md`
- Migrazione coordinate: `backend/src/db/migrations/091-custtable-erp-update-2026-05-10.sql`
- Migrazione agenda: `backend/src/db/migrations/072-agenda-appointments.sql`
- Migrazione matching: `backend/src/db/migrations/023-multimatching.sql`
- Leaflet docs: https://leafletjs.com
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
