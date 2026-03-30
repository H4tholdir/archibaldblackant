# ERP Sentinel Watcher

**Data**: 2026-03-30
**Status**: DRAFT — non ancora implementato
**Obiettivo**: ridurre la latenza di aggiornamento della PWA da ~10 min a ~2 min, senza aumentare il carico sul sistema.

---

## Problema attuale

Ogni agente fa sync periodica ogni 10 minuti, indipendentemente dal fatto che l'ERP sia cambiato o meno. Con 60+ agenti, questo significa:
- Decine di sessioni browser che girano a vuoto quando non c'è nulla di nuovo
- Latenza fissa di ~10 min anche quando un ordine arriva subito dopo l'ultimo tick
- Ogni sync scarica e analizza sempre tutto (ordini, DDT, fatture) anche se l'ERP non è cambiato

---

## Idea centrale: Sentinel User

Un singolo utente dedicato (o il tuo stesso account admin, che ha visibilità su tutti gli agenti) mantiene una sessione ERP sempre aperta e controlla periodicamente delle **impronte leggere** dell'ERP. Quando un'impronta cambia, triggera la sync pertinente — solo allora, e solo per gli agenti interessati.

### Vantaggi
- Il polling "pesante" (sync completa) parte solo quando c'è qualcosa di nuovo
- Per i dati shared (prodotti, prezzi): uno solo monitora per tutti i 60+ agenti
- Latenza effettiva: ~2 min invece di ~10 min

### Vincolo fondamentale
L'ERP filtra i dati per utente — il sentinel vede solo i propri ordini/DDT, non quelli degli altri agenti. **Eccezione**: il tuo account admin ha visibilità cross-agente, quindi può fungere da sentinel per i dati shared.

---

## Fingerprinting per entità

Il sentinel non scarica mai dati completi. Legge solo "l'impronta" dello stato corrente e la confronta con quella salvata in Redis.

### Prodotti (`shared.products`)
**Segnale**: `MAX(datetime_modificato)` dalla ListView Prodotti (prima riga dopo ordinamento DESC per data modifica).
**Perché funziona**: il campo `datetime_modificato` esiste nel DOM (`xaf_dvi_MODIFIEDDATETIME_View`). Qualsiasi insert/update/delete cambia questo MAX.
**Costo**: una singola navigazione, nessun GetRowValues — solo il valore della prima cella.

### Prezzi (`shared.prices`)
**Segnale**: hash MD5 delle prime 20 righe (product_id + unit_price + price_valid_from + price_valid_to).
**Perché funziona**: i prezzi cambiano raramente. Un hash su 20 righe è quasi sempre sufficiente per rilevare variazioni.
**Alternativa**: count totale + hash della prima riga — se il count non cambia ma la prima riga sì, c'è un update.
**Costo**: una chiamata GetRowValues su 20 righe.

### Ordini per-agente (`agents.order_records`)
**Segnale**: l'ID dell'ordine più recente nella ListView (primo record, ordinato DESC per data).
**Perché funziona**: nuovi ordini hanno ID crescente. Se l'ID massimo cambia → è arrivato un nuovo ordine.
**Limite**: non rileva aggiornamenti di stato su ordini esistenti (es. un ordine che passa da "In elaborazione" a "Spedito"). Per questo si può affiancare: hash del campo `sales_status` delle prime 10 righe.
**Chi monitora**: ogni agente monitora i propri ordini (il sentinel per-agente è il job `sync-orders` stesso, ma eseguito in modalità "check only" prima della sync completa).

### DDT e Fatture
**Segnale**: count totale dalla ListView (valore del paginatore, già disponibile senza scorrere).
**Perché funziona**: DDT e fatture quasi sempre si aggiungono, raramente vengono modificati in modo silenzioso.
**Limite**: non rileva aggiornamenti del tracking su DDT esistenti. Per FedEx non è un problema perché il tracking viene aggiornato da API esterna.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                     SENTINEL WORKER                         │
│  (BullMQ job ripetuto ogni 2 min, queue: shared-sync)       │
│                                                             │
│  1. Apre sessione ERP come utente sentinel                  │
│  2. Legge fingerprint prodotti → confronta Redis            │
│     → cambiato? enqueue sync-products per tutti gli agenti attivi
│  3. Legge fingerprint prezzi → confronta Redis              │
│     → cambiato? enqueue sync-prices per tutti gli agenti attivi
│  4. Aggiorna fingerprint in Redis                           │
│  5. Chiude sessione                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  PER-AGENT LIGHT CHECK                      │
│  (prima di ogni sync-orders, come pre-step opzionale)       │
│                                                             │
│  1. Legge ID ultimo ordine dalla ListView                   │
│  2. Confronta con last_known_order_id in Redis              │
│  3. Se uguale → skip sync completa (nessun nuovo ordine)    │
│  4. Se diverso → procedi con sync completa                  │
└─────────────────────────────────────────────────────────────┘
```

### Storage fingerprints
Redis hash key: `sentinel:fingerprints`
Campi: `products:max_modified`, `prices:hash`, `orders:{userId}:last_id`, ecc.

### Tabella nuova: `system.sentinel_config`
```sql
CREATE TABLE system.sentinel_config (
  key    TEXT PRIMARY KEY,   -- 'sentinel_user_id', 'enabled', ecc.
  value  TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tipi di sync e chi le triggera

| Sync | Trigger attuale | Con sentinel |
|------|----------------|--------------|
| `sync-products` | scheduler ogni 30 min | sentinel ogni 2 min SE fingerprint cambia |
| `sync-prices` | scheduler ogni 30 min | sentinel ogni 2 min SE fingerprint cambia |
| `sync-orders` | scheduler ogni 10 min | ogni 10 min (check leggero) OR sentinel se ordine nuovo |
| `sync-ddt` | scheduler ogni 10 min | invariato (DDT linked a ordini già noti) |
| `sync-invoices` | scheduler ogni 10 min | invariato |
| `sync-customers` | scheduler ogni 30 min | invariato (i clienti cambiano raramente) |

Il sentinel non sostituisce lo scheduler — lo affianca. Lo scheduler rimane come safety net per i casi in cui il sentinel mancasse qualcosa.

---

## Implementazione — fasi

### Fase 1 — Infrastruttura sentinel (shared data)
1. Nuova tabella `system.sentinel_config` (migration)
2. Nuovo job type `sentinel-check` in `operation-types.ts`
3. Handler `sentinel-check`: apre ERP, legge fingerprint prodotti + prezzi
4. Enqueue condizionale `sync-products` / `sync-prices` se fingerprint diverso
5. Scheduler: aggiunge `sentinel-check` ogni 2 min nella queue `shared-sync`

### Fase 2 — Light check per ordini (per-agente)
1. Prima della sync completa ordini, legge solo l'ultimo ID dalla ListView
2. Se invariato rispetto a Redis: restituisce `{ skipped: true, reason: 'no_new_orders' }`
3. Riduce il numero di sync complete da 6/ora a 1-2/ora negli idle

### Fase 3 — Sentinel per stati ordini
1. Legge hash dei `sales_status` delle prime 10 righe della ListView ordini
2. Se cambia → triggera sync ordini anche senza nuovi insert
3. Utile per rilevare cambio stato "In elaborazione" → "Spedito"

---

## Tradeoffs e rischi

| Aspetto | Rischio | Mitigazione |
|---------|---------|-------------|
| Sessione sentinel sempre aperta | ERP potrebbe fare timeout o logout | Circuit breaker + rilogin automatico |
| Fingerprint su prima pagina | Cambiamenti a pagina 2+ non rilevati | Safety net: sync completa ogni 30 min dallo scheduler |
| Hash prezzi su 20 righe | Cambiamento alla riga 21 non rilevato | Aumentare a 50 righe o usare count+hash combinato |
| Sentinel user condiviso | Sessione ERP monopolizzata | Sentinel gira in queue `shared-sync` (1 worker dedicato) |
| Lock agente per ordini | Light check richiede browser context | Non serve: GetRowValues è una chiamata HTTP diretta, non richiede navigazione |

---

## Note di implementazione

- Il sentinel NON usa `sync-customer-addresses` — quell'operazione rimane schedulata separatamente
- Il sentinel usa il tuo account admin come utente ERP (visibilità cross-agente per shared data)
- I fingerprint in Redis hanno TTL di 24h — se Redis si svuota, al riavvio si triggera una sync completa (comportamento corretto)
- Il costo di una sessione sentinel è ~1 chiamata HTTP ogni 2 min (GetRowValues su 20 righe) — trascurabile
