# Piano implementazione: Giri Visite Intelligenti

Data: 2026-06-05  
Stato: proposta strutturata per review tecnica e adversarial review  
Scope: PWA Archibald, backend agenti, dati clienti/ordini/appuntamenti/promozioni

## 1. Obiettivo

Costruire un modulo di pianificazione giri visite che funzioni come una segretaria commerciale intelligente per l'agente:

- suggerisce quali clienti visitare o chiamare;
- organizza sessioni giornaliere e settimanali;
- ottimizza il percorso in base a zona, CAP, localita, citta, distanza e vincoli orari;
- evita giornate sprecate per chiusure, festivita nazionali/locali e clienti non disponibili;
- lavora su entrambe le liste clienti disponibili per l'utente Formicola Biagio: clienti Archibald ERP e clienti/sottoclienti Arca-Fresis;
- riconosce clienti uguali tra le due sorgenti e aggrega storico, anagrafica e informazioni commerciali;
- massimizza il valore commerciale del giro, non solo il numero di tappe;
- prepara l'agente alla visita mostrando storico ordini, riordini probabili, categorie mancanti, promozioni e spunti di vendita.

La funzione non deve sostituire l'esperienza dell'agente: deve proporre, spiegare il motivo delle proposte e permettere correzioni manuali rapide.

## 2. Principi di prodotto

1. L'agente mantiene il controllo.
   Ogni giro generato deve essere modificabile: blocca tappa, rimuovi cliente, cambia ordine, aggiungi cliente, conferma appuntamento, marca come backup.

2. Il sistema deve spiegare le raccomandazioni.
   Esempi: "ultimo ordine 94 giorni fa", "cliente ad alto fatturato", "vicino a 3 tappe confermate", "probabile riordino frese conservative".

3. Ottimizzazione commerciale prima della pura ottimizzazione geografica.
   Il percorso piu corto non e sempre il migliore se salta clienti ad alta probabilita di ordine.

4. Robustezza su dati imperfetti.
   Indirizzi, coordinate, date ultimo ordine e disponibilita potrebbero essere incompleti. Il sistema deve degradare bene e segnalare cosa manca.

5. Mobile-first.
   La funzione nasce per essere usata la mattina, in auto, davanti al cliente e tra una visita e l'altra.

6. Integrazione progressiva.
   La v1 deve agganciarsi ai dati gia presenti: `agents.customers`, `shared.sub_clients`, `shared.sub_client_customer_matches`, `shared.sub_client_sub_client_matches`, `agents.order_records`, `agents.order_articles`, `agents.fresis_history`, `agents.appointments`, `agents.customer_reminders`, `system.promotions`.

7. Identita cliente unificata.
   Il planner non deve ragionare su "cliente ERP" e "cliente Arca" come mondi separati quando rappresentano lo stesso studio. Deve costruire un profilo unificato con fonti tracciate e confidence del match.

## 3. Contesto tecnico esistente

Elementi gia presenti nel progetto:

- Clienti: `agents.customers`, con anagrafica, citta, CAP, storico commerciale sintetico, coordinate ERP `geo_latitude`/`geo_longitude` aggiunte dalla migrazione 091.
- Sottoclienti/clienti Arca-Fresis: `shared.sub_clients`, con codice Arca, ragione sociale, indirizzo, CAP, localita, provincia, P.IVA, zona, agente, listino, pagamenti e campi anagrafici estesi.
- Matching Archibald-Arca: `shared.sub_client_customer_matches` supporta relazioni N:M tra sottoclienti Arca e clienti Archibald; `shared.sub_client_sub_client_matches` supporta relazioni tra sottoclienti duplicati o collegati.
- Storico Fresis/Arca: `agents.fresis_history`, con `sub_client_codice`, cliente madre Archibald, items, revenue, FT/KT/import Arca, DDT, tracking, fatture e stato.
- Ordini: `agents.order_records`, con cliente, date, importi, stato.
- Articoli ordine: `agents.order_articles`, utile per riordini e cross-sell.
- Agenda: `agents.appointments`, gia collegabile a `customer_erp_id`.
- Promemoria cliente: `agents.customer_reminders`.
- Promozioni: `system.promotions`, con regole trigger e selling points.
- Frontend: pagine gia esistenti per clienti, dettaglio cliente, agenda, storico ordini, prodotti.

Nota tecnica importante: le migrazioni storiche mostrano una normalizzazione degli ID cliente. Il piano deve usare lo schema attuale effettivo:

- preferire `agents.customers.erp_id` come ID cliente canonico lato PWA;
- mantenere `account_num` quando serve raccordo con ordini/ERP;
- per Arca-Fresis usare `shared.sub_clients.codice` come ID sorgente;
- non usare direttamente `customer_erp_id` come unica identita del planner: serve un identificatore unificato che possa contenere uno o piu record Archibald e uno o piu record Arca;
- prima dell'implementazione validare FK e indici sul DB reale, per evitare mismatch tra `customer_profile`, `erp_id`, `internal_id` e `account_num`.

## 4. Identita cliente unificata

### 4.1 Problema

Per l'utente Formicola Biagio la PWA gestisce due liste clienti:

- lista Archibald ERP: `agents.customers`;
- lista Arca/Fresis: `shared.sub_clients`.

Lo stesso studio puo esistere in entrambe le liste con codici diversi, nomi leggermente diversi, indirizzi non identici o storico distribuito tra sistemi diversi. Se il planner usa solo una lista:

- sottostima il valore commerciale del cliente;
- puo suggerire due visite duplicate allo stesso studio;
- perde storico prodotti/ordini Fresis;
- sbaglia ranking dei clienti forti;
- non mostra all'agente il quadro completo davanti al cliente.

### 4.2 Regola di prodotto

Il planner deve lavorare su un'entita logica chiamata `UnifiedCustomer`.

Un `UnifiedCustomer` puo essere composto da:

- un solo cliente Archibald;
- un solo sottocliente Arca;
- uno o piu clienti Archibald collegati a uno o piu sottoclienti Arca;
- sottoclienti Arca collegati tra loro senza cliente Archibald.

Ogni informazione aggregata deve mantenere la provenienza:

- `source: archibald`;
- `source: arca`;
- `source: fresis_history`;
- `source: manual_match`;
- `source: inferred_match`.

### 4.3 Matching

Usare prima i match gia presenti:

- `shared.sub_client_customer_matches`;
- `shared.sub_client_sub_client_matches`;
- `shared.sub_clients.matched_customer_profile_id`, solo come legacy/backfill dove ancora utile.

Poi proporre match candidati non confermati usando segnali:

- P.IVA uguale;
- codice fiscale uguale;
- nome normalizzato simile;
- indirizzo/CAP/localita/provincia compatibili;
- telefono/email uguali;
- storico Fresis che punta a `customer_id` o `customer_name` Archibald.

I match automatici non devono fondere definitivamente senza controllo se la confidence non e alta. La UI deve mostrare "possibile duplicato/match" e permettere conferma manuale.

### 4.4 Aggregazione dati

Per pianificare un giro, il planner deve calcolare su `UnifiedCustomer`:

- anagrafica migliore disponibile;
- indirizzo preferito per visita;
- coordinate migliori disponibili;
- telefoni/email/referenti unificati;
- zona/CAP/localita/provincia da entrambe le fonti;
- storico ordini Archibald;
- storico Fresis/Arca;
- articoli acquistati da entrambe le fonti;
- fatturato aggregato;
- ultimo ordine aggregato;
- ultima visita aggregata;
- reminder e appuntamenti collegati a qualsiasi sorgente del cliente.

Regola conservativa per conflitti:

- non cancellare differenze;
- mostrare fonte e alternative;
- scegliere un default operativo, ma permettere override.

Esempio: se Archibald ha indirizzo A e Arca ha indirizzo B, la tappa deve avere un indirizzo principale scelto con regola trasparente e un alert "indirizzi diversi tra Archibald e Arca".

## 5. Definizioni funzionali

### 5.1 Sessione giro

Una sessione giro e un piano modificabile composto da:

- orizzonte: giorno singolo o settimana;
- agente/user;
- punto partenza e punto rientro;
- modalita ottimizzazione;
- filtri territoriali;
- vincoli orari;
- candidati suggeriti;
- tappe confermate;
- clienti da chiamare;
- clienti backup;
- output: itinerario, motivazioni, alert, metriche.

### 5.2 Stati cliente nella sessione

- `suggested`: suggerito dal sistema, non ancora lavorato.
- `to_call`: da chiamare per conferma.
- `confirmed`: appuntamento confermato.
- `planned`: inserito nel giro ma non confermato.
- `backup`: cliente vicino da usare se salta tempo o appuntamento.
- `visited`: visita completata.
- `skipped`: saltato, con motivo.
- `removed`: rimosso manualmente dal giro.

### 5.3 Modalita ottimizzazione

1. `balanced`
   Default. Mix tra fatturato probabile, copertura zona, numero visite e percorso ragionevole.

2. `profitability`
   Privilegia clienti forti, riordino probabile, promozioni rilevanti e valore atteso. Accetta meno visite se il potenziale vendita e piu alto.

3. `coverage`
   Privilegia copertura territorio, clienti non visitati da tempo, clienti dormienti e numero visite.

4. `constrained`
   Parte da vincoli dell'agente: vicino casa, appuntamenti personali, rientro entro una certa ora, zona obbligata, prima/ultima tappa fissata.

5. `manual_assist`
   L'agente sceglie quasi tutto; il sistema ordina, segnala rischi e propone backup.

## 6. Requisiti funzionali

### 6.1 Pianificazione giornaliera

Input:

- data;
- ora inizio/fine;
- partenza/rientro;
- modalita;
- zone/CAP/comuni/localita/provincia;
- massimo visite desiderate;
- durata media visita;
- buffer desiderato;
- clienti obbligatori;
- sorgenti incluse: Archibald, Arca/Fresis o entrambe;
- opzione "unisci clienti corrispondenti";
- appuntamenti gia confermati;
- eventuali vincoli personali.

Output:

- lista tappe ordinate;
- orari stimati;
- tempi di guida stimati;
- clienti backup per area;
- eventuali duplicati/match incerti da verificare;
- alert chiusure/festivita/dati mancanti;
- motivazione per ogni tappa;
- link navigatore per tappa e per intero percorso quando supportato.

### 6.2 Pianificazione settimanale

Input:

- settimana;
- giorni lavorativi;
- base di partenza/rientro;
- aree disponibili;
- obiettivi: fatturato, copertura, recupero clienti dormienti, numero visite;
- appuntamenti gia presenti in agenda.

Output:

- proposta lunedi-venerdi per macro-zone;
- clienti forti consigliati per ogni giorno;
- giorni da dedicare a zone lontane;
- giorni vicini a casa;
- warning su festivita e chiusure;
- possibilita di trasformare ogni giorno in una sessione giro dettagliata.

### 6.3 Chiamate e conferme

Il sistema deve supportare un flusso pre-giro:

1. genera lista clienti da chiamare;
2. mostra telefono, referente, ultimo ordine, motivazione;
3. l'agente registra esito:
   - confermato;
   - non risponde;
   - richiamare;
   - non disponibile;
   - ordina da remoto;
   - visita non necessaria;
4. aggiorna sessione e agenda.

### 6.4 Scheda visita

Per ogni cliente nel giro:

- dati anagrafici e indirizzo;
- ultimo ordine;
- frequenza ordine stimata;
- categorie acquistate;
- categorie non acquistate;
- ultimi articoli acquistati;
- storico Archibald e storico Arca/Fresis aggregati;
- badge sorgenti dati: Archibald, Arca, Fresis;
- alert se il cliente ha record duplicati o match incerto;
- suggerimenti riordino;
- promozioni compatibili;
- note agente;
- reminder aperti;
- pulsanti: chiama, naviga, apri cliente, crea ordine, segna visitato, rinvia, salta.

## 7. Dati necessari

### 7.1 Dati gia disponibili

Da `agents.customers`:

- `user_id`;
- `erp_id`;
- `account_num`;
- `name`;
- `street`;
- `postal_code`;
- `city`;
- `geo_address`;
- `geo_latitude`;
- `geo_longitude`;
- `last_order_date`;
- `actual_order_count`;
- `actual_sales`;
- `previous_order_count_1`;
- `previous_sales_1`;
- `previous_order_count_2`;
- `previous_sales_2`;
- `phone`;
- `mobile`;
- `email`;
- `attention_to`;
- `blocked_status`;
- `deleted_at`, se presente nello schema corrente.

Da `agents.order_records`:

- `customer_profile_id`;
- `customer_name`;
- `creation_date`;
- `total_amount`;
- `gross_amount`;
- `order_number`;
- `current_state`;
- `invoice_date`;
- `invoice_amount`.

Da `agents.order_articles`:

- `article_code`;
- `article_description`;
- `quantity`;
- `line_amount`;
- `created_at`.

Da `shared.sub_clients`:

- `codice`;
- `ragione_sociale`;
- `suppl_ragione_sociale`;
- `indirizzo`;
- `cap`;
- `localita`;
- `prov`;
- `telefono`, `telefono2`, `telefono3`;
- `email`;
- `partita_iva`;
- `cod_fiscale`;
- `zona`;
- `pers_da_contattare`;
- `email_amministraz`;
- `agente`, `agente2`;
- `settore`, `classe`;
- `pag`, `listino`;
- `matched_customer_profile_id`;
- `match_confidence`;
- `arca_synced_at`.

Da `shared.sub_client_customer_matches`:

- `sub_client_codice`;
- `customer_profile_id`;
- `created_at`.

Da `shared.sub_client_sub_client_matches`:

- `sub_client_codice_a`;
- `sub_client_codice_b`;
- `created_at`.

Da `agents.fresis_history`:

- `sub_client_codice`;
- `sub_client_name`;
- `sub_client_data`;
- `customer_id`;
- `customer_name`;
- `items`;
- `revenue`;
- `target_total_with_vat`;
- `created_at`;
- `archibald_order_id`;
- `archibald_order_number`;
- `current_state`;
- `invoice_number`;
- `invoice_date`;
- `invoice_amount`;
- `arca_data`;
- `parent_customer_name`;
- `source`.

Da `agents.appointments`:

- appuntamenti gia presenti;
- collegamento cliente;
- orari bloccati;
- note e location.

Da `system.promotions`:

- promozioni attive;
- trigger rules;
- selling points;
- prezzi promo/listino.

### 7.2 Dati nuovi da introdurre

1. Coordinate affidabili.
   Anche se esistono campi geo ERP, serve uno stato qualita:
   - coordinate confermate;
   - coordinate derivate da geocoding;
   - indirizzo ambiguo;
   - geocoding fallito;
   - aggiornato manualmente.

2. Disponibilita cliente.
   Giorni/orari di apertura, chiusure note, preferenze contatto.

3. Visite storiche.
   La visita non coincide sempre con ordine. Serve registrare quando l'agente passa anche se non vende.

4. Feste patronali/comunali.
   Tabella precompilata e modificabile dall'utente.

5. Sessioni giro e tappe.
   Stato persistente delle pianificazioni.

6. Metriche scoring.
   Snapshot dei motivi di score al momento della generazione, per spiegabilita e debug.

7. Identita unificata cliente.
   Tabella o vista materializzata che collega sorgenti multiple e normalizza le informazioni operative per il planner.

## 8. Schema dati proposto

Migrazione indicativa: `108-visit-planning.sql` o numero successivo disponibile.

### 8.1 Identita cliente unificata

Approccio raccomandato:

- non spostare subito i dati esistenti;
- creare una tabella `agents.unified_customers` per l'identita logica;
- creare una tabella `agents.unified_customer_sources` per collegare record Archibald e Arca;
- popolarla da match manuali esistenti e generare candidati da confermare.

```sql
CREATE TABLE agents.unified_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  primary_source TEXT NOT NULL CHECK (primary_source IN ('archibald', 'arca', 'merged')),
  primary_archibald_erp_id TEXT,
  primary_arca_codice TEXT,
  match_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (match_status IN ('single_source', 'confirmed', 'candidate', 'conflict')),
  match_confidence NUMERIC(5,3),
  merged_sales_total NUMERIC(12,2),
  merged_last_order_date DATE,
  merged_order_count INTEGER,
  merged_sources_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

```sql
CREATE TABLE agents.unified_customer_sources (
  unified_customer_id UUID NOT NULL REFERENCES agents.unified_customers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('archibald_customer', 'arca_subclient')),
  source_id TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  match_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_method IN ('manual', 'existing_match', 'vat', 'fiscal_code', 'name_address', 'history_link', 'single_source')),
  confidence NUMERIC(5,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unified_customer_id, source_type, source_id)
);
```

Nota: prima di rendere questa tabella persistente, valutare una vista read-only/materialized view per la Fase 0. Se il matching cambia spesso, una vista riduce il rischio di desincronizzazione.

Le tabelle del planner dovrebbero puntare a `unified_customer_id` e mantenere anche campi sorgente opzionali per compatibilita/debug.

### 8.2 Tabelle geografia e festivita

```sql
CREATE TABLE agents.customer_geo_status (
  user_id TEXT NOT NULL,
  unified_customer_id UUID,
  source_type TEXT CHECK (source_type IN ('archibald_customer', 'arca_subclient')),
  source_id TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  normalized_address TEXT,
  quality TEXT NOT NULL DEFAULT 'unknown',
  provider TEXT,
  geocoded_at TIMESTAMPTZ,
  manually_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_type, source_id),
  FOREIGN KEY (unified_customer_id)
    REFERENCES agents.unified_customers(id)
    ON DELETE SET NULL
);
```

```sql
CREATE TABLE system.italian_municipal_holidays (
  id SERIAL PRIMARY KEY,
  comune TEXT NOT NULL,
  provincia TEXT,
  regione TEXT,
  date_month SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day SMALLINT NOT NULL CHECK (date_day BETWEEN 1 AND 31),
  name TEXT,
  source TEXT,
  confidence TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comune, provincia)
);
```

```sql
CREATE TABLE agents.municipal_holiday_overrides (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  comune TEXT NOT NULL,
  provincia TEXT,
  date_month SMALLINT NOT NULL CHECK (date_month BETWEEN 1 AND 12),
  date_day SMALLINT NOT NULL CHECK (date_day BETWEEN 1 AND 31),
  name TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, comune, provincia)
);
```

### 8.3 Disponibilita e preferenze cliente

```sql
CREATE TABLE agents.customer_visit_preferences (
  user_id TEXT NOT NULL,
  unified_customer_id UUID NOT NULL REFERENCES agents.unified_customers(id) ON DELETE CASCADE,
  preferred_days SMALLINT[] NOT NULL DEFAULT '{}',
  avoid_days SMALLINT[] NOT NULL DEFAULT '{}',
  preferred_time_start TIME,
  preferred_time_end TIME,
  typical_visit_minutes INTEGER NOT NULL DEFAULT 30,
  requires_appointment BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_contact_channel TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, unified_customer_id)
);
```

### 8.4 Sessioni e tappe

```sql
CREATE TABLE agents.visit_planning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('day', 'week')),
  mode TEXT NOT NULL CHECK (mode IN ('balanced', 'profitability', 'coverage', 'constrained', 'manual_assist')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'in_progress', 'completed', 'cancelled')),
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
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

```sql
CREATE TABLE agents.visit_planning_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agents.visit_planning_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  unified_customer_id UUID NOT NULL REFERENCES agents.unified_customers(id) ON DELETE CASCADE,
  archibald_erp_id TEXT,
  arca_codice TEXT,
  appointment_id UUID REFERENCES agents.appointments(id) ON DELETE SET NULL,
  stop_date DATE NOT NULL,
  sequence INTEGER,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'to_call', 'confirmed', 'planned', 'backup', 'visited', 'skipped', 'removed')),
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
```

### 8.5 Storico visite

```sql
CREATE TABLE agents.customer_visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  unified_customer_id UUID NOT NULL REFERENCES agents.unified_customers(id) ON DELETE CASCADE,
  archibald_erp_id TEXT,
  arca_codice TEXT,
  session_id UUID REFERENCES agents.visit_planning_sessions(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES agents.visit_planning_stops(id) ON DELETE SET NULL,
  visited_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'visited'
    CHECK (outcome IN ('visited', 'order_created', 'no_order', 'closed', 'not_available', 'phone_order', 'rescheduled')),
  order_number TEXT,
  notes TEXT,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 9. Scoring commerciale

### 9.1 Score iniziale interpretabile

La v1 deve usare un modello deterministico e spiegabile, non un modello AI opaco.

```text
score_totale =
  valore_cliente
+ probabilita_riordino
+ urgenza_contatto
+ copertura_zona
+ opportunita_cross_sell
+ rilevanza_promozioni
- costo_deviazione
- rischio_chiusura
- penalita_dati_mancanti
```

### 9.2 Componenti

`valore_cliente`

- basato sulla somma controllata di:
  - `agents.customers.actual_sales`, `previous_sales_1`, `previous_sales_2`;
  - `agents.order_records.total_amount`/`gross_amount`;
  - `agents.fresis_history.revenue`, `target_total_with_vat`, `invoice_amount`;
- normalizzato su percentile per agente;
- deduplicato quando un record Fresis e collegato allo stesso ordine Archibald, per evitare doppio conteggio;
- protegge dai clienti con importi sporadici anomali usando mediana o winsorization.

`probabilita_riordino`

- stima giorni medi tra ordini;
- calcola ultimo ordine aggregato tra Archibald e Fresis/Arca;
- se cliente compra ogni 60-90 giorni e l'ultimo ordine aggregato e vicino alla soglia, score sale;
- usare categorie/articoli ricorrenti da `order_articles` e `fresis_history.items`.

`urgenza_contatto`

- giorni da ultima visita, non solo ultima vendita;
- reminder aperti;
- cliente dormiente con storico buono.

`copertura_zona`

- cliente nello stesso cluster/CAP/comune delle tappe confermate;
- bonus se riempie un buco tra due appuntamenti;
- penalita se crea zig-zag.

`opportunita_cross_sell`

- categorie comprate storicamente;
- categorie coerenti mai acquistate;
- prodotti complementari.
- confronta famiglie acquistate su Archibald e Fresis per evitare di proporre come "mai comprato" qualcosa acquistato dall'altra sorgente.

`rilevanza_promozioni`

- promozioni attive compatibili con storico cliente;
- corsi o bundle collegati a prodotti.

`rischio_chiusura`

- festivita nazionali;
- feste patronali;
- giorno settimana evitato;
- chiusura manuale nota;
- appuntamento non confermato.

`match_quality`

- bonus se il cliente unificato ha match confermato e dati ricchi;
- penalita/alert se il match e candidato o conflittuale;
- mai fondere storico di due clienti con match incerto senza renderlo visibile.

### 9.3 Output spiegabile

Ogni stop deve salvare:

- `score_total`;
- `score_breakdown_json`;
- `recommendation_reasons`;
- `alerts`.

Esempio:

```json
{
  "value": 0.82,
  "reorder": 0.71,
  "zone_fit": 0.64,
  "route_cost": -0.18,
  "closure_risk": -0.10,
  "match_quality": 0.90,
  "sources": ["archibald", "arca", "fresis_history"]
}
```

## 10. Algoritmo di pianificazione

### 10.1 Pipeline

1. Carica vincoli sessione.
2. Costruisce o carica `UnifiedCustomer` per l'utente.
3. Carica clienti candidati da entrambe le sorgenti.
4. Applica match confermati e segnala match candidati.
5. Esclude clienti non visitabili:
   - eliminati;
   - bloccati;
   - senza indirizzo utilizzabile, salvo modalita manuale;
   - chiusura certa nel giorno.
6. Calcola score commerciale aggregato.
7. Crea shortlist.
8. Ottimizza sequenza.
9. Inserisce backup vicini.
10. Genera alert e motivazioni.
11. Persiste sessione e tappe.

### 10.2 V1 senza solver complesso

Per la prima versione, evitare subito un solver pesante. Proporre:

- clustering per comune/CAP/provincia/coordinate;
- shortlist massimo 30-50 candidati;
- ordinamento euristico:
  - tappe locked/confermate prima;
  - vincoli orari rispettati;
  - nearest-neighbor pesato dallo score;
  - farthest-first per giornate lontane, quando configurato;
  - rientro progressivo verso casa;
  - 15-20% buffer.

Questo permette una v1 utile e debuggabile.

### 10.3 V2 con solver

Valutare integrazione con:

- Google Route Optimization API;
- OR-Tools backend-side;
- Timefold Field Service Routing, se si vuole un modello enterprise con replanning.

Il problema tecnico formale e un VRPTW con profitti/penalita:

- time windows;
- durata visita;
- partenza/rientro;
- tappe obbligatorie;
- tappe opzionali;
- penalita per saltare clienti ad alto valore;
- costo viaggio;
- buffer;
- pause.

### 10.4 Replanning real-time

Durante la giornata:

- appuntamento salta;
- cliente chiama;
- traffico/ritardo;
- ordine fatto al telefono;
- visita dura piu del previsto.

La sessione deve supportare "ricalcola da qui":

- posizione corrente o ultima tappa completata;
- tempo residuo;
- tappe locked future;
- backup vicini.

## 11. API backend proposte

Prefisso: `/api/visit-planning`

### 10.1 Sessioni

- `GET /sessions?from=&to=&status=`
- `POST /sessions`
- `GET /sessions/:sessionId`
- `PATCH /sessions/:sessionId`
- `DELETE /sessions/:sessionId`

### 10.2 Generazione

- `POST /sessions/:sessionId/generate`
  - genera candidati e route;
  - non sovrascrive tappe locked senza flag esplicito.

- `POST /sessions/:sessionId/recalculate`
  - ricalcolo parziale da tappa/ora corrente.

- `POST /preview`
  - preview non persistente per sperimentare filtri e modalita.

### 10.3 Tappe

- `PATCH /sessions/:sessionId/stops/:stopId`
- `POST /sessions/:sessionId/stops`
- `DELETE /sessions/:sessionId/stops/:stopId`
- `POST /sessions/:sessionId/stops/:stopId/confirm`
- `POST /sessions/:sessionId/stops/:stopId/mark-visited`
- `POST /sessions/:sessionId/stops/:stopId/skip`
- `POST /sessions/:sessionId/stops/reorder`

### 10.4 Dati di supporto

- `GET /customers/:erpId/visit-brief`
  - storico sintetico, riordini, cross-sell, promozioni, reminder.

- `GET /unified-customers?search=&source=&matchStatus=`
  - ricerca profili unificati, includendo clienti solo Archibald, solo Arca e merged.

- `GET /unified-customers/:id`
  - dettaglio fonti collegate e storico aggregato.

- `POST /unified-customers/match-candidates`
  - calcola possibili match Archibald-Arca da confermare.

- `POST /unified-customers/:id/sources`
  - aggiunge manualmente una sorgente al cliente unificato.

- `DELETE /unified-customers/:id/sources/:sourceType/:sourceId`
  - separa un match errato.

- `GET /municipal-holidays?city=&province=&date=`
- `PUT /municipal-holidays/overrides`
- `GET /geo/quality-report`
- `POST /geo/geocode-missing`

## 12. Layout tecnico consigliato

### 12.1 Backend

File indicativi:

- `backend/src/db/migrations/108-visit-planning.sql`
- `backend/src/db/repositories/visit-planning.ts`
- `backend/src/db/repositories/visit-planning.spec.ts`
- `backend/src/routes/visit-planning.ts`
- `backend/src/routes/visit-planning.spec.ts`
- `backend/src/services/visit-scoring-service.ts`
- `backend/src/services/visit-scoring-service.spec.ts`
- `backend/src/services/visit-route-planner.ts`
- `backend/src/services/visit-route-planner.spec.ts`
- `backend/src/services/municipal-holidays.ts`
- `backend/src/services/customer-visit-brief.ts`
- `backend/src/services/unified-customer-service.ts`
- `backend/src/services/customer-match-candidates.ts`

Responsabilita:

- repository: solo persistenza e query;
- scoring service: calcolo score e motivazioni;
- route planner: ordinamento, buffer, backup, ricalcolo;
- route HTTP: validazione input, auth, risposta API;
- municipal holidays: lookup festivita nazionali/locali e override agente;
- visit brief: aggregazione storico ordini/articoli/promozioni/reminder.
- unified customer service: costruzione profilo unificato da Archibald + Arca/Fresis, deduplica e aggregazione storico.
- match candidates: suggerimento match non confermati con confidence e motivazioni.

### 12.2 Frontend

File indicativi:

- `frontend/src/pages/VisitPlanningPage.tsx`
- `frontend/src/pages/VisitPlanningSessionPage.tsx`
- `frontend/src/services/visit-planning.service.ts`
- `frontend/src/types/visit-planning.ts`
- `frontend/src/components/visit-planning/VisitPlanningWizard.tsx`
- `frontend/src/components/visit-planning/VisitStopCard.tsx`
- `frontend/src/components/visit-planning/VisitBriefPanel.tsx`
- `frontend/src/components/visit-planning/WeeklyVisitPlanner.tsx`
- `frontend/src/components/visit-planning/MunicipalHolidayAlert.tsx`
- `frontend/src/components/visit-planning/UnifiedCustomerSourceBadges.tsx`
- `frontend/src/components/visit-planning/CustomerMatchWarning.tsx`
- `frontend/src/services/unified-customers.service.ts`

Integrazione router:

- aggiungere route `/visit-planning`;
- aggiungere route `/visit-planning/:sessionId`;
- collegare da Dashboard/Agenda/CustomerProfile solo dopo MVP base, per non creare dipendenze premature.

### 12.3 Contratti TypeScript

Definire tipi condivisi coerenti con API:

- `VisitPlanningSession`;
- `VisitPlanningStop`;
- `VisitPlanningMode`;
- `VisitStopStatus`;
- `VisitScoreBreakdown`;
- `VisitRecommendationReason`;
- `VisitAlert`;
- `CustomerVisitBrief`;
- `MunicipalHoliday`.
- `UnifiedCustomer`;
- `UnifiedCustomerSource`;
- `CustomerMatchCandidate`.

## 13. Frontend UX

### 13.1 Navigazione

Nuova route:

- `/visit-planning`
- `/visit-planning/:sessionId`

Possibile voce menu: "Giri visite".

### 13.2 Pagina lista

Elementi:

- oggi;
- domani;
- settimana corrente;
- sessioni draft/in corso;
- bottone "Crea giro";
- KPI: visite pianificate, confermate, backup, tempo guida stimato, valore potenziale.

### 13.3 Wizard crea giro

Step:

1. Orizzonte: giorno o settimana.
2. Modalita: bilanciato, redditivita, copertura, vincolato, assistito.
3. Area: zona, CAP, comune, provincia, distanza.
4. Orari e vincoli.
5. Clienti obbligatori o esclusi.
6. Sorgenti dati: Archibald, Arca/Fresis, entrambe.
7. Match: usa confermati, mostra candidati, escludi match incerti.
8. Anteprima candidati.
9. Genera giro.

### 13.4 Vista sessione giornaliera

Layout mobile:

- header con data, modalita, stato;
- metriche compatte;
- alert principali;
- lista tappe verticale;
- tab mappa/lista;
- swipe/action buttons;
- ogni card con:
  - orario;
  - cliente;
  - badge sorgenti: Archibald, Arca/Fresis, merged;
  - citta/CAP;
  - stato;
  - motivo raccomandazione;
  - ultimo ordine;
  - importo annuo/storico;
  - azioni: chiama, naviga, apri, visita, salta.

### 13.5 Vista settimanale

- colonne lun-ven;
- macro-zone;
- clienti forti per giorno;
- warning festivita;
- pulsante "dettaglia giornata";
- drag and drop giorno/cliente solo dopo MVP se non rallenta.

### 13.6 Scheda visita

Accessibile da ogni stop:

- storico ordini sintetico;
- sezione "Sorgenti": Archibald ERP, Arca, Fresis history, match e confidence;
- articoli ricorrenti;
- "probabile da proporre";
- promozioni;
- note;
- crea ordine;
- crea reminder;
- esito visita.

## 14. Integrazione agenda e notifiche

Quando una tappa passa a `confirmed`:

- creare o collegare `agents.appointments`;
- usare tipo sistema "Visita cliente";
- salvare `customer_erp_id` quando esiste un cliente Archibald primario;
- se il cliente e solo Arca/Fresis, salvare riferimento nel `notes`/campo esteso finche `agents.appointments` non supporta `unified_customer_id`;
- includere location e note.

Quando una visita viene rinviata:

- creare reminder o aggiornare appuntamento;
- non perdere il motivo.

Quando una sessione settimanale viene confermata:

- creare appuntamenti solo per tappe confermate o planned? Decisione consigliata:
  - confermate: si;
  - planned/non confermate: no, restano solo nella sessione;
  - backup: no.

## 15. Festivita e feste patronali

### 14.1 Fonti

- Festivita nazionali: usare provider aggiornabile, per esempio Nager.Date o tabella interna aggiornata annualmente.
- Feste patronali: import precompilato da dataset verificato/manuale, con confidence.

### 14.2 Regole

- Se festivita nazionale: hard warning, escludere salvo override.
- Se festa patronale comune cliente: warning forte, default escludi se confidence alta.
- Se confidence bassa: mostra warning ma non escludere automaticamente.
- L'utente puo correggere data o marcare "cliente aperto comunque".

### 14.3 UI manutenzione

Pagina admin o sezione impostazioni:

- cerca comune;
- vedi festa;
- modifica data/nome;
- aggiungi nota;
- marca fonte;
- storico modifiche in audit log se disponibile.

## 16. Geocoding e mappe

### 15.1 Strategia

1. Usare coordinate ERP se presenti e plausibili.
2. Se mancanti, geocodare indirizzo normalizzato.
3. Salvare quality status.
4. Permettere correzione manuale.

### 15.2 Provider da valutare

- Google Maps Platform: migliore integrazione con Route Optimization, costi e quote da valutare.
- OpenStreetMap/Nominatim: attenzione a policy, rate limit e affidabilita commerciale.
- HERE/Mapbox: alternative solide.

### 15.3 Requisiti minimi

- non geocodare in massa senza rate limiting;
- cache obbligatoria;
- audit delle coordinate aggiornate;
- fallback senza mappa: lista ordinata per citta/CAP.

## 17. Fasi di implementazione

### Fase 0: Audit dati e prototipo scoring offline

Obiettivo: capire qualita dati prima di costruire UI.

Task:

- query su percentuale clienti con citta/CAP/indirizzo/coordinate;
- query su qualita `shared.sub_clients`: CAP/localita/provincia/P.IVA/indirizzo;
- conteggio match esistenti Archibald-Arca;
- conteggio possibili duplicati non matchati per P.IVA/nome/indirizzo;
- distribuzione `actual_sales`, `last_order_date`, ordini per cliente;
- distribuzione `agents.fresis_history.revenue`, date documento, articoli/items per sottocliente;
- analisi clienti senza ordini recenti;
- verifica join clienti-ordini-articoli e sottoclienti-fresis-history;
- script locale che genera top candidati per una citta/CAP.
- script locale che produce `UnifiedCustomer` preview per Formicola Biagio.

Output:

- report dati;
- formula score v0;
- report matching Archibald-Arca;
- esempi di storico aggregato per clienti matched;
- esempi reali validati con agente.

Gate:

- almeno 80% clienti target con indirizzo usabile o strategia fallback chiara;
- join cliente-ordine affidabile;
- join sottocliente-storico Fresis affidabile;
- nessun doppio conteggio evidente tra ordine Archibald e record Fresis collegato;
- score interpretabile dall'agente.

### Fase 1: Modello dati e API base

Task:

- migrazione tabelle sessioni/tappe/preferenze/festivita/visit logs;
- migrazione o vista per identita cliente unificata;
- repository backend;
- API CRUD sessioni;
- API preview candidati;
- test repository e route.

Gate:

- si crea sessione;
- si salvano tappe;
- si ricarica sessione completa;
- schema FK corretto sugli ID cliente attuali.
- un cliente solo Arca puo entrare in sessione anche senza record Archibald.
- un cliente matched aggrega storico senza duplicare importi.

### Fase 2: Scoring e candidati

Task:

- servizio `visit-scoring-service`;
- servizio `unified-customer-service`;
- calcolo valore cliente;
- calcolo riordino probabile;
- motivazioni testuali;
- alert dati mancanti;
- filtro zona/CAP/citta.
- scoring aggregato Archibald + Arca/Fresis.

Gate:

- per un comune reale, output coerente con aspettativa agente;
- ogni cliente suggerito ha motivazione;
- nessuna raccomandazione muta o inspiegabile.
- due record dello stesso studio non appaiono come due tappe separate se match confermato.

### Fase 3: Planner giornaliero euristico

Task:

- generazione sessione day;
- ordinamento tappe;
- tappe locked;
- backup vicini;
- buffer;
- export/link navigatore.

Gate:

- genera un giro di 6-10 visite realistico;
- non fa zig-zag evidenti;
- permette modifiche manuali e ricalcolo.

### Fase 4: UI mobile giornaliera

Task:

- pagina `/visit-planning`;
- wizard crea giro;
- vista sessione;
- card stop;
- azioni chiama/naviga/apri cliente/segna visitato/salta;
- test frontend.

Gate:

- utilizzabile da telefono;
- nessun overflow UI;
- azioni principali entro massimo due tocchi.

### Fase 5: Integrazione agenda e chiamate

Task:

- stato `to_call`;
- esiti chiamata;
- creazione appuntamenti per confermati;
- aggiornamento sessione da agenda;
- reminder automatici per non risponde/richiamare.

Gate:

- cliente confermato appare in agenda;
- cancellazione/rinvio non lascia dati incoerenti;
- esiti chiamata tracciati.

### Fase 6: Pianificazione settimanale

Task:

- sessione `week`;
- proposta macro-zone per giorno;
- trasformazione giorno in giro dettagliato;
- gestione appuntamenti gia esistenti.

Gate:

- settimana leggibile e modificabile;
- ogni giornata puo essere dettagliata;
- warning festivita visibili.

### Fase 7: Visit brief commerciale

Task:

- endpoint cliente `visit-brief`;
- ultimi ordini;
- articoli ricorrenti;
- categorie mancanti;
- promozioni compatibili;
- reminder;
- UI scheda visita.

Gate:

- davanti al cliente l'agente vede cosa proporre;
- suggerimenti non inventano dati;
- link creazione ordine funziona.

### Fase 8: Solver avanzato e traffico

Solo dopo validazione v1.

Task:

- valutare Google Route Optimization API vs OR-Tools vs Timefold;
- stimare costi;
- gestire time windows hard/soft;
- replanning real-time;
- metriche prima/dopo.

Gate:

- migliora realmente rispetto all'euristica;
- costi sostenibili;
- fallback se provider esterno non disponibile.

## 18. Testing

### 17.1 Backend

- repository sessioni/tappe;
- scoring con fixture;
- filtri CAP/citta;
- festivita;
- geocoding status;
- ricalcolo con tappe locked;
- permission: user non vede sessioni di altri.
- unified customer: match confermati, solo Archibald, solo Arca, N:M, conflitti.
- deduplica importi tra `order_records` e `fresis_history`.

### 17.2 Frontend

- wizard;
- render sessione vuota;
- render sessione con alert;
- modifica tappa;
- cambio stato;
- scheda visita;
- mobile viewport.

### 17.3 E2E

- crea giro domani;
- conferma cliente;
- crea appuntamento;
- segna visitato;
- crea reminder da cliente non disponibile;
- ricalcola giro dopo skip.

### 17.4 Validazione business

Usare almeno 3 scenari reali:

1. Zona vicina casa: Portici-Ercolano-Castellammare-San Giorgio.
2. Giornata lontana: Vallo della Lucania/Tito/Agropoli/Battipaglia/Salerno.
3. Zona Potenza con clienti forti e CAP vicini.

Ogni scenario va confrontato con il giro che l'agente avrebbe fatto manualmente.

## 19. Metriche di successo

Metriche operative:

- tempo medio per preparare giro;
- numero visite completate;
- tempo guida stimato vs effettivo;
- visite saltate;
- clienti backup usati;
- appuntamenti confermati.

Metriche commerciali:

- ordini creati da giro;
- fatturato da giro;
- tasso ordine per visita;
- riattivazioni clienti dormienti;
- categorie cross-sell vendute.

Metriche qualita sistema:

- percentuale clienti con coordinate affidabili;
- percentuale tappe con motivazione;
- modifiche manuali dell'agente;
- accettazione raccomandazioni;
- errori festivita/chiusura.
- match Archibald-Arca confermati;
- duplicati evitati nel giro;
- percentuale visite su clienti con storico aggregato corretto.

## 20. Rischi e mitigazioni

### Rischio: dati indirizzo scarsi

Mitigazione:

- report qualita prima;
- geocoding progressivo;
- fallback su citta/CAP;
- correzione manuale.

### Rischio: algoritmo ottimizza cose sbagliate

Mitigazione:

- score spiegabile;
- modalita diverse;
- feedback agente;
- confronto con giri manuali.

### Rischio: doppio conteggio storico Archibald/Fresis

Mitigazione:

- deduplica con `archibald_order_id`, `archibald_order_number`, date/importi e origine;
- salvare breakdown per sorgente;
- test su casi Fresis reali;
- mostrare all'agente quando uno storico e aggregato.

### Rischio: match errato tra clienti diversi

Mitigazione:

- usare auto-merge solo con segnali forti, per esempio P.IVA uguale;
- match incerti come candidati, non confermati;
- UI per separare record;
- audit dei match manuali.

### Rischio: feste patronali incomplete

Mitigazione:

- confidence per dato;
- override manuale;
- non escludere automaticamente dati a bassa confidence.

### Rischio: troppe funzionalita in v1

Mitigazione:

- v1 day planner + scoring + edit manuale;
- weekly planner e visit brief avanzato in fasi successive.

### Rischio: provider mappe costoso o instabile

Mitigazione:

- cache;
- rate limit;
- astrazione provider;
- fallback euristico interno.

### Rischio: privacy e dati localizzazione

Mitigazione:

- non tracciare posizione live senza consenso esplicito;
- salvare solo dati necessari;
- audit su accessi e modifiche.

## 21. Decisioni aperte

1. Provider mappe/geocoding: Google, Mapbox, HERE, OSM o ibrido?
2. Punto partenza/rientro: fisso per agente o scelto per sessione?
3. Durata visita default: 30 minuti o configurabile per cliente/categoria?
4. Festivita patronali: fonte iniziale e processo di verifica.
5. Scoring: pesi iniziali decisi da noi o configurabili admin?
6. Integrazione calendario esterno: solo ICS attuale o Google Calendar bidirezionale?
7. Tracciamento visita: manuale o con check-in geolocalizzato opzionale?
8. Weekly planner: deve creare appuntamenti subito o solo bozze?
9. Per clienti solo Arca, quale route dettaglio apriamo: pagina sottocliente, pagina Fresis o nuova pagina unified customer?
10. Le tappe devono essere sempre su `unified_customer_id` gia persistito o possiamo usare una preview virtuale nella Fase 0?
11. Quale regola di deduplica usiamo quando `fresis_history.archibald_order_id` e valorizzato ma importi/date non coincidono?
12. I match `shared.sub_client_customer_matches` sono globali o vanno interpretati diversamente per utente/agente?

## 22. Checklist per adversarial review

Chi revisiona deve provare a smontare il piano rispondendo a queste domande:

1. Quale parte del piano assume dati che oggi non abbiamo?
2. Gli ID cliente sono coerenti con lo schema reale o rischiano mismatch?
3. Lo scoring puo favorire sempre gli stessi clienti e far dimenticare i medi/dormienti?
4. Cosa succede se un cliente forte e geograficamente scomodo?
5. Cosa succede se il cliente ha ultimo ordine vecchio ma in realta compra da un altro canale?
6. Il planner genera valore anche senza coordinate precise?
7. Le feste patronali possono creare falsi positivi dannosi?
8. La UI e davvero usabile da telefono con una mano?
9. Le tappe confermate sono protette dal ricalcolo?
10. Cosa succede se l'agente modifica manualmente quasi tutto?
11. I suggerimenti commerciali sono basati su dati verificabili o rischiano allucinazioni?
12. Quale funzionalita puo essere tagliata senza compromettere MVP?
13. Quale query diventera lenta con migliaia di clienti e ordini?
14. Come misuriamo se il giro generato e migliore di quello manuale?
15. Quale fallback abbiamo se Google/solver/mappe non rispondono?
16. Il piano considera correttamente clienti solo Arca/Fresis senza cliente Archibald?
17. Dove rischiamo di sommare due volte lo stesso ordine?
18. Cosa succede se un sottocliente Arca e collegato a piu clienti Archibald?
19. Cosa succede se un cliente Archibald e collegato a piu sottoclienti Arca?
20. La UI rende chiara la provenienza dei dati o nasconde conflitti importanti?

## 23. Prompt pronto per adversarial review

Usare questo prompt con un altro agente IA:

```text
Agisci come Staff Engineer e Product Critic. Leggi il piano "Giri Visite Intelligenti" per la PWA Archibald.
Il tuo compito non e confermare il piano, ma trovare rischi, assunzioni deboli, punti sovra-progettati, gap dati, problemi di schema, problemi UX mobile, problemi di performance e casi limite commerciali.
Presta particolare attenzione alla doppia lista clienti Archibald ERP + Arca/Fresis, al matching tra clienti uguali, alla somma degli storici e al rischio di doppio conteggio.

Rispondi in questo formato:
1. Findings critici ordinati per severita, con riferimento alla sezione del piano.
2. Assunzioni non dimostrate.
3. Parti da tagliare dall'MVP.
4. Parti da anticipare per ridurre rischio.
5. Domande bloccanti prima dell'implementazione.
6. Versione alternativa dell'MVP in massimo 10 punti.

Non proporre funzionalita nuove se non servono a ridurre un rischio concreto.
```

## 24. MVP raccomandato

MVP minimo ma utile:

1. Audit dati.
2. Preview `UnifiedCustomer` per Archibald + Arca/Fresis.
3. Match confermati esistenti + candidati ad alta confidence.
4. Sessione giro giornaliera.
5. Filtri area: citta, CAP, provincia, raggio se coordinate disponibili.
6. Scoring deterministico aggregato.
7. Lista candidati con motivazioni e badge sorgente.
8. Stati: suggested, to_call, confirmed, planned, backup, visited, skipped.
9. Ordinamento euristico semplice.
10. Modifica manuale.
11. Integrazione agenda per confermati.
12. Scheda visita base con ultimi ordini/articoli Archibald + Fresis aggregati.

Da non mettere nella primissima v1:

- solver avanzato;
- traffico live;
- check-in geolocalizzato;
- Google Calendar bidirezionale;
- AI generativa per raccomandazioni non verificabili;
- drag and drop complesso settimanale;
- automazioni telefoniche.

## 25. Fonti tecniche e benchmark di riferimento

Da usare come basi durante la progettazione dettagliata:

- Google Route Optimization API: https://developers.google.com/maps/documentation/route-optimization
- Google Route Optimization time windows: https://developers.google.com/maps/documentation/route-optimization/time-windows
- Google OR-Tools VRPTW: https://developers.google.com/optimization/routing/vrptw
- Google OR-Tools penalties/dropping visits: https://developers.google.com/optimization/routing/penalties
- Timefold Field Service Routing: https://docs.timefold.ai/field-service-routing/latest/introduction
- Nager.Date public holidays API: https://date.nager.at/api
- Paper "Planning profitable tours for field sales forces": https://arxiv.org/abs/2011.14822

## 26. Prossimo passo consigliato

Prima di scrivere codice applicativo, fare una "Fase 0" concreta:

1. creare query/report qualita dati;
2. creare report matching Archibald-Arca/Fresis per Formicola Biagio;
3. scegliere 3 zone reali;
4. generare manualmente una classifica clienti con formula score v0 aggregata;
5. farla validare dall'agente;
6. correggere pesi, match e motivazioni;
7. solo dopo implementare schema/API.

Questa fase riduce il rischio principale: costruire un planner tecnicamente elegante ma commercialmente non aderente al modo reale in cui l'agente lavora.
