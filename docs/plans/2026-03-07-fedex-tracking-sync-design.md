# FedEx Tracking Sync — Design Document

**Data**: 2026-03-07
**Stato**: Approvato

## Problema

La PWA determina lo stato "Consegnato" tramite euristiche (3+ giorni dal DDT, fattura presente), senza conferma reale dal corriere. Ordini in transito non mostrano dettagli sulla posizione del pacco. L'utente non puo rispondere con certezza alla domanda "dove si trova il mio ordine?".

## Soluzione

Sistema di sync periodico che usa Puppeteer per navigare la pagina FedEx tracking, intercettare la risposta JSON interna (`POST api.fedex.com/track/v2/shipments`), e salvare tutti gli eventi della timeline in DB. Questo alimenta lo stato ordine con dati certi e permette di mostrare una progress bar e una timeline visuale nella card ordine.

## Vincoli

- VPS: 2 vCPU, 4 GB RAM, 80 GB disk (Hetzner CPX22)
- Volume: 60+ utenti, ~420 ordini/giorno, ~800-1600 tracking attivi contemporaneamente
- Corriere: solo FedEx (per ora)
- Nessun accesso all'API ufficiale FedEx — si usa scraping con intercettazione di rete

## Architettura

### Approccio: Puppeteer burst con intercettazione di rete

1. Apri un browser Puppeteer headless dedicato (separato dal pool Archibald)
2. Per ogni tracking: naviga alla pagina FedEx, intercetta la risposta JSON via `page.on('response')`
3. La SPA FedEx chiama `POST https://api.fedex.com/track/v2/shipments` che restituisce JSON strutturato
4. Batch da 50 tracking, poi chiudi browser e libera RAM, riapri per il batch successivo
5. Delay randomizzato 2-5 sec tra un tracking e l'altro

### Perche intercettazione di rete e non DOM scraping

- Dati strutturati JSON vs parsing fragile del DOM
- Se FedEx cambia la UI, l'endpoint API interno e meno probabile che cambi
- Performance: catturare una risposta JSON e piu veloce di aspettare il rendering completo

## 1. Schema DB (migration 011)

Nuovi campi su `agents.order_records`:

### Campi di sintesi

```sql
tracking_status TEXT,               -- 'pending','in_transit','out_for_delivery','delivered','exception','error'
tracking_key_status_cd TEXT,        -- codice FedEx: 'DP','IT','AR','PU','DL','OD'
tracking_status_bar_cd TEXT,        -- 'OW' (on way), 'DL' (delivered), 'DE' (exception)
tracking_estimated_delivery TEXT,   -- ISO: '2026-03-09T20:00:00+01:00'
tracking_last_location TEXT,        -- 'ROISSY CHARLES DE GAULLE CEDEX FR'
tracking_last_event TEXT,           -- 'Departed FedEx hub'
tracking_last_event_at TIMESTAMPTZ, -- timestamp ultimo evento
tracking_last_synced_at TIMESTAMPTZ,
tracking_sync_failures INTEGER DEFAULT 0,
tracking_origin TEXT,               -- 'LEMGO, DE'
tracking_destination TEXT,          -- 'PONTECAGNANO FAIANO, IT'
tracking_service_desc TEXT,         -- 'FedEx International Priority'
delivery_confirmed_at TIMESTAMPTZ,  -- actDeliveryDt quando delivered=true
delivery_signed_by TEXT,            -- receivedByNm
```

### Colonna JSONB per timeline completa

```sql
tracking_events JSONB
```

Struttura di ogni elemento (mappa `scanEventList` FedEx):

```json
{
  "date": "2026-03-07",
  "time": "04:57:00",
  "gmtOffset": "+01:00",
  "status": "Departed FedEx hub",
  "statusCD": "DP",
  "scanLocation": "ROISSY CHARLES DE GAULLE CEDEX FR",
  "delivered": false,
  "exception": false
}
```

### Indice per lo scheduler

```sql
CREATE INDEX idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL OR tracking_status NOT IN ('delivered'))
  AND delivery_confirmed_at IS NULL;
```

### Motivazione JSONB vs tabella separata

- Non servono query sui singoli eventi — si leggono sempre tutti per un ordine
- 15-20 eventi per ordine sono pochi KB
- Ciclo di vita breve (2-4 giorni di transito)
- Coerente col codebase (items, state_timeline, documents sono gia JSONB)

## 2. Backend: Scraper FedEx

**Modulo**: `src/sync/services/fedex-tracking-scraper.ts`

### Flusso

1. Lancia browser headless con `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
2. Per ogni batch (max 50 tracking):
   - Apre una tab, registra listener `page.on('response')` per `api.fedex.com/track/v2/shipments`
   - Naviga a `https://www.fedex.com/fedextrack/?trknbr={trackingNumber}`
   - Attende risposta JSON (timeout 15s)
   - Estrae `packages[0]` con campi di sintesi + `scanEventList`
   - Delay randomizzato 2-5 sec prima del tracking successivo
   - Riutilizza la stessa tab
3. Chiude browser a fine batch, riapre per il batch successivo (libera RAM)

### Output type

```ts
type FedExTrackingResult = {
  trackingNumber: string
  success: boolean
  error?: string
  keyStatus: string
  keyStatusCD: string
  statusBarCD: string
  lastScanStatus: string
  lastScanDateTime: string
  lastScanLocation: string
  estimatedDelivery: string
  actualDelivery: string
  receivedByName: string
  origin: string
  destination: string
  serviceDesc: string
  scanEvents: FedExScanEvent[]
}
```

### Anti-detection

- `puppeteer-extra-plugin-stealth` per fingerprint headless
- Pool di 10-15 User-Agent reali, rotato per ciclo
- Browser separato dal pool Archibald
- Flags: `--no-sandbox --disable-gpu --disable-dev-shm-usage`

### Retry e resilienza

**Livello 1 — Prevenzione**: stealth plugin, UA rotation, delay 2-5s, max ~20 req/min

**Livello 2 — Retry con exponential backoff**: 30s, 2min, poi marca errore temporaneo

**Livello 3 — Errori persistenti**: dopo 3 cicli falliti (~9 ore) badge "Tracking non disponibile" sulla card

**Livello 4 — Problemi sistemici**: >50% tracking falliti in un ciclo sospende il sync, alert nel monitoring

## 3. Backend: Handler e Scheduler

### Handler: `src/operations/handlers/sync-tracking.ts`

1. Query ordini con tracking attivo:
   ```sql
   SELECT order_number, tracking_number, tracking_url
   FROM agents.order_records
   WHERE tracking_number IS NOT NULL
     AND delivery_confirmed_at IS NULL
     AND user_id = $1
   ```
2. Passa tracking numbers allo scraper
3. Per ogni risultato:
   - Successo: aggiorna campi sintesi + JSONB, resetta `tracking_sync_failures = 0`
   - Evento con `delivered: true`: setta `delivery_confirmed_at`, `delivery_signed_by`, `tracking_status = 'delivered'`
   - Errore: incrementa `tracking_sync_failures`, se >= 3 setta `tracking_status = 'error'`
4. >50% fallimenti nel ciclo: sospendi sync, logga errore critico
5. Restituisce: `{ success, trackingProcessed, trackingUpdated, trackingFailed, newDeliveries, duration }`

### Mapping tracking_status

| statusBarCD | keyStatusCD | tracking_status     |
|-------------|-------------|---------------------|
| "OW"        | qualsiasi   | 'in_transit'        |
| "OW"        | "OD"        | 'out_for_delivery'  |
| "DL"        | qualsiasi   | 'delivered'         |
| "DE"        | qualsiasi   | 'exception'         |
| non presente|             | 'pending'           |

### Scheduler in `sync-scheduler.ts`

- Nuovo tipo sync `'tracking'`
- Intervallo: 180 minuti (3 ore)
- Fascia notturna (22:00-06:00): skip o singolo ciclo a mezzanotte
- ~6-7 cicli/giorno

## 4. Frontend: logica stato ordine

### Modifiche a `getOrderStatus` in `orderStatus.ts`

La cascata di priorita resta uguale, ma i punti "Consegnato" e "In transito" diventano data-driven:

```
se tracking_status === 'delivered'           -> Consegnato (confermato dal corriere)
se tracking_status === 'in_transit'/'out_for_delivery' -> In transito
se tracking_status === 'exception'           -> Eccezione corriere (bordo arancione #E65100, sfondo #FFF3E0)
se tracking_status === null                  -> fallback euristiche attuali (retrocompatibilita)
```

### Nuovi campi su `Order` type frontend

```ts
trackingStatus?: string
trackingEvents?: FedExScanEvent[]
trackingEstimatedDelivery?: string
trackingLastLocation?: string
trackingLastEvent?: string
trackingOrigin?: string
trackingDestination?: string
deliveryConfirmedAt?: string
deliverySignedBy?: string
```

### Retrocompatibilita

Ordini vecchi senza tracking sync continuano a usare le euristiche attuali. Il tracking sync si applica solo agli ordini nuovi da quando viene attivato.

## 5. Frontend: mini progress bar (card collassata)

5 step fissi nell'header della card per ordini con tracking attivo:

```
Ritirato -> In viaggio -> Hub locale -> In consegna -> Consegnato
```

### Mapping step dai codici FedEx

| Step         | statusCD attivante                                    | Esempio display                            |
|--------------|-------------------------------------------------------|--------------------------------------------|
| Ritirato     | PU (Picked up)                                        | Ritirato — Bielefeld DE, 4:18 PM          |
| In viaggio   | DP, IT, AR (Departed/In Transit/Arrived)              | In viaggio — Roissy CDG FR, 4:57 AM       |
| Hub locale   | AR quando scanLocation.country = paese destinazione   | Hub locale — Milano IT, 6:30 AM           |
| In consegna  | OD (Out for Delivery)                                 | In consegna — Pontecagnano, 8:15 AM       |
| Consegnato   | DL (Delivered)                                        | Consegnato — 10:30 AM                     |

- Pallini completati: colore bordo dello stato
- Pallino attivo: animazione pulse
- Pallini futuri: grigi
- Sotto: ultima posizione testuale + origine/destinazione ai lati
- Non mostrata per ordini vecchi senza tracking sync

## 6. Frontend: timeline espansa (card espansa)

Nella sezione tracking della card espansa, timeline visuale completa:

- Linea verticale a sinistra con pallini per ogni evento
- Evento: ora + descrizione + localita
- Raggruppati per giorno
- Evento piu recente in alto, evidenziato
- In cima: data consegna stimata (o confermata + firmatario se consegnato)
- Bottone "Apri tracking su FedEx" sempre disponibile
- Non mostrata per ordini vecchi senza tracking sync

## 7. Integrazione monitoring

### SyncControlPanel

- Nuova riga "Tracking FedEx": Start/Stop manuale, intervallo configurabile
- Badge stato: Attivo, In esecuzione, Sospeso

### SyncMonitoringDashboard

- Statistiche ciclo: processati, aggiornati, falliti, nuove consegne
- Ultimo ciclo: timestamp, durata, errori
- Alert per ordini con tracking_sync_failures >= 3
- Alert critico quando sync sospeso per fallimenti massivi

### API endpoint

- `POST /api/operations/sync-tracking` — enqueue job

## Struttura JSON reale FedEx (verificata)

Endpoint: `POST https://api.fedex.com/track/v2/shipments`

Root: `{ transactionId, output: { packages: [...] } }`

Campi package chiave:

| Campo                      | Esempio                                   |
|----------------------------|-------------------------------------------|
| trackingNbr                | "445291931033"                             |
| keyStatus                  | "On the way"                               |
| keyStatusCD                | "DP"                                       |
| statusBarCD                | "OW"                                       |
| lastScanStatus             | "Departed FedEx hub"                       |
| lastScanDateTime           | "2026-03-07T04:57:00+01:00"               |
| mainStatus                 | "Departed FedEx location"                  |
| statusWithDetails          | "Departed FedEx location; ROISSY CDG, FR"  |
| shipperAddress.city        | "LEMGO"                                    |
| shipperAddress.countryCode | "DE"                                       |
| recipientAddress.city      | "PONTECAGNANO FAIANO"                      |
| recipientAddress.countryCode | "IT"                                     |
| estDeliveryDt              | "2026-03-09T20:00:00+01:00"               |
| actDeliveryDt              | "" (vuoto se non consegnato)               |
| receivedByNm               | "" (vuoto, o nome firmatario)              |
| serviceDesc                | "FedEx International Priority"             |

Campi scanEventList:

| Campo           | Esempio                                |
|-----------------|----------------------------------------|
| date            | "2026-03-07"                           |
| time            | "04:57:00"                             |
| gmtOffset       | "+01:00"                               |
| status          | "Departed FedEx hub"                   |
| statusCD        | "DP"                                   |
| scanLocation    | "ROISSY CHARLES DE GAULLE CEDEX FR"    |
| delivered       | false                                  |
| exception       | false                                  |

Codici statusCD noti: PU (Picked Up), IT (In Transit), AR (Arrived), DP (Departed), OD (Out for Delivery), DL (Delivered).
