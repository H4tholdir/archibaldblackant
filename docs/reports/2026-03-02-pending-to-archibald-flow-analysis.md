# Report: Flusso Piazzamento Ordini Pending su Archibald

**Data:** 2026-03-02
**Branch analizzato:** `master-backup-pre-unified-queue` (vecchio, funzionante)
**Branch attuale:** `master` (unified queue, in corso di fix)

---

## 1. Flusso Frontend — Click "Invia Ordini Selezionati"

### Vecchio branch

1. **Raccolta ordini selezionati** via `selectedOrderIds` (Set)
2. **POST `/api/bot/submit-orders`** con body `{ orders: [...] }` — batch singola request
3. **Risposta**: `{ success: true, jobIds: ["id1", "id2"] }`
4. **Per ogni ordine selezionato**:
   - Stato cambiato a `"syncing"` in IndexedDB + server
   - `savePendingOrder({ ...order, status: "syncing" })`
5. **Toast**: `"Ordini inviati al bot. Job IDs: ..."`
6. **Refetch** degli ordini pending
7. **Deselect** tutti gli ordini

### Branch attuale

1. Raccolta ordini via `selectedOrderIds`
2. **`enqueueOperation('submit-order', {...})`** per ogni ordine — N request separate
3. Risposta: `{ success: true, jobId: "id" }` per ciascuna
4. **`trackJobs([{ orderId, jobId }])`** — salva mapping in `jobTracking` Map
5. Stato cambiato a `"syncing"`
6. Toast + refetch

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G1 | Vecchio: batch singola request. Nuovo: N request separate | Minore, funzionale |
| G2 | Vecchio: `jobToPendingMap` lato server. Nuovo: `jobTracking` lato client (volatile) | **Il mapping jobId→orderId si perde cambiando pagina** |

---

## 2. Progress Bar — Comportamento Dettagliato

### Vecchio branch — `job-progress-mapper.ts`

Il vecchio aveva un **mapper centralizzato** con milestone precise:

```
navigation.ordini       → 10%  "Apertura sezione ordini"
form.customer           → 25%  "Inserimento cliente"
form.articles.start     → 35%  "Inizio inserimento articoli"
form.articles.progress  → 35-70% "Inserimento articolo {n} di {tot}" (interpolato)
form.articles.complete  → 70%  "Articoli inseriti"
form.discount           → 80%  "Applicazione sconto globale"
form.submit.start       → 90%  "Salvataggio ordine in corso"
form.submit.complete    → 100% "Ordine salvato con successo"
```

**Caratteristiche chiave:**
- Progress **interpolato** per gli articoli (35-70% distribuito per numero articoli)
- Label **dinamiche** con metadata: `"Inserimento articolo 3 di 5"`
- Mapper separati per ogni tipo di operazione (delete, edit, customer, sendToVerona)

### Branch attuale — `submit-order.ts` (BOT_PROGRESS_MAP)

```
navigation.ordini       → 15%  "Navigazione lista ordini"
form.nuovo              → 20%  "Apertura nuovo ordine"
form.customer           → 25%  "Selezione cliente"
form.articles.start     → 30%  "Inserimento articoli"
form.articles.progress  → 40%  "Inserimento articoli"
form.discount           → 50%  "Applicazione sconto"
form.save               → 55%  "Salvataggio ordine"
form.confirm            → 60%  "Conferma ordine"
```

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G3 | Manca interpolazione articoli (35-70% → fisso 40%) | **Barra non avanza durante inserimento articoli** |
| G4 | Mancano `form.articles.complete`, `form.submit.start`, `form.submit.complete` | **Barra salta da 40% a 70% (fase DB)** |
| G5 | Nessun supporto metadata per label dinamiche | "Inserimento articoli" generico vs "Inserimento articolo 3 di 5" |
| G6 | Mancano mapper per delete-order, edit-order, customer, sendToVerona | **Solo submit-order ha progress leggibile** |

---

## 3. Stato Visuale della Card Pending

### Vecchio branch

- **Pre-invio**: card normale, selezionabile con checkbox
- **Dopo invio (syncing)**: `cardOpacity: 0.6`, badge "In Elaborazione"
- **Job attivo**: progress bar visibile con percentuale e label
- **Job completato**:
  - Progress bar verde al 100% con "Ordine salvato con successo"
  - Card con background `#f0fdf4` (verde chiaro)
  - **Resta visibile** finché il server non viene refetchato
  - Il `pendingOrder` viene **cancellato dal DB lato server** nel `processOrder`
  - Al prossimo refetch (trigger da `JOB_COMPLETED` event), l'ordine scompare
- **Job fallito**:
  - Progress bar rossa con messaggio di errore
  - Bottone "Riprova Ordine" visibile
  - `pending_orders.status = "error"` e `error_message` salvati nel DB
  - **L'ordine resta nella lista** con lo stato errore persistito

### Branch attuale

- Pre-invio e dopo invio: **identico** al vecchio
- Job attivo: progress bar con jobTracking enrichment → **funziona**
- Job completato: delay 4s prima del refetch → **migliorato** ma:
  - Il `jobTracking` è solo in RAM → **perso se cambi pagina**
  - Nessun feedback visuale di completamento se ritorni alla pagina dopo
- Job fallito: errore mostrato, bottone "Riprova Ordine" → **funziona**

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G7 | `jobTracking` in RAM: perso navigando via dalla pagina | **Se cambi pagina durante un job, perdi il tracking** |
| G8 | Vecchio: errore persistito in DB (`pending_orders.status = "error"`). Nuovo: solo WebSocket event | **Dopo refresh, l'errore non è visibile** |

---

## 4. WebSocket Events — Struttura Payload

### Vecchio branch

Ogni evento ha una struttura wrapper:
```json
{
  "type": "JOB_PROGRESS",
  "payload": {
    "jobId": "...",
    "pendingOrderId": "...",
    "progress": 50,
    "operation": "Inserimento articolo 2 di 3",
    "operationCategory": "form.articles.progress",
    "metadata": { "currentArticle": 2, "totalArticles": 3 }
  },
  "timestamp": "2026-03-02T..."
}
```

**Campi chiave nel payload:**
- `pendingOrderId` — collegamento diretto all'ordine pending
- `operation` — label human-readable già formattata
- `operationCategory` — category machine-readable
- `metadata` — dati aggiuntivi per template dinamici

### Branch attuale

```json
{
  "event": "JOB_PROGRESS",
  "jobId": "...",
  "type": "submit-order",
  "progress": 40,
  "label": "Inserimento articoli"
}
```

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G9 | Manca `pendingOrderId` nel payload WS | Il frontend deve mappare jobId→orderId dalla sua RAM (volatile) |
| G10 | Manca `metadata` per template dinamici | Impossibile mostrare "articolo 2 di 3" |
| G11 | Struttura payload diversa (`payload.operation` vs top-level `label`) | Richiederebbe adapter nel frontend |

---

## 5. Admin Page — Jobs Queue

### Vecchio branch — Funzionalità complete

**Endpoint:** `GET /api/admin/jobs?limit=50&status={filter}`

**Campi per job:**
```typescript
{
  jobId: string;
  status: "waiting" | "active" | "completed" | "failed";
  userId: string;
  username: string;           // Nome utente leggibile
  orderData: {                // Dati completi dell'ordine
    customerName: string;
    items: Array<{ articleCode, quantity, description }>;
  };
  createdAt: number;
  result?: { orderId: string; duration: number };  // Solo se completed
  error?: string;             // Solo se failed
}
```

**UI:**
- Tabella con colonne: Job ID (troncato), User, Cliente, Status (badge colorato), Order ID, Data, Azioni
- **Riga espandibile** → mostra: Job ID completo, User ID, lista articoli (codice × qty + descrizione), errore
- **Filtro status**: Tutti / Waiting / Active / Completed / Failed
- **Ricerca**: per jobId, username, customerName, orderId, error
- **Paginazione**: 20 job per pagina
- **Azioni**: Retry (per failed), Cancel (per active/waiting)
- **"Pulisci eccesso"**: rimuove job oltre i limiti retention (40 completed, 10 failed)
- **Retention config**: mostrata come "Retention: max completati, falliti"
- **Auto-refresh**: ogni 10 secondi

### Branch attuale

**Endpoint:** `GET /api/admin/jobs?limit=50&status={filter}`

**Campi (dopo fix odierno):**
```typescript
{
  jobId: string;
  type: string;               // "submit-order", "sync-customers", ecc.
  status: string;
  userId: string;
  username: string;           // ✅ Aggiunto oggi
  orderData: Record<string, unknown>;  // ✅ Aggiunto oggi
  createdAt: number;
  processedAt: number | null;
  finishedAt: number | null;
  result: unknown;            // ✅ Aggiunto oggi
  error: string | null;       // ✅ Aggiunto oggi
  progress: number;
}
```

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G12 | Vecchio: solo job ordini. Nuovo: tutti i tipi (sync, download, ecc.) | I sync jobs riempiono la lista admin, confondendo gli ordini utente |
| G13 | Job retention: vecchio aveva `removeOnComplete: { count: 40 }` nel BullMQ. Nuovo: non configurato | **I job possono accumularsi senza limite** |
| G14 | Vecchio: `retryJob` creava nuovo job con stessi dati + cancellava il vecchio. Verificare se il nuovo fa lo stesso | Da verificare |

---

## 6. Post-Completamento — Operazioni DB

### Vecchio branch (sequenza esatta nel `processOrder`)

1. `bot.createOrder(orderData)` → restituisce `orderId`
2. Calcolo importi (grossAmount, totalAmount)
3. `orderDb.upsertOrder(userId, orderRecord)` — inserisce in `orders`
4. `orderDb.saveOrderArticles(articles)` — inserisce articoli
5. `job.updateProgress(100)`
6. **Emit `JOB_COMPLETED`** via WebSocket
7. `UPDATE fresis_history SET state='piazzato'` — reconciliazione
8. `DELETE FROM pending_orders WHERE id = ?` — rimozione pending
9. Return `{ orderId, duration, timestamp }`

**In caso di errore:**
1. **Emit `JOB_FAILED`** via WebSocket
2. `UPDATE pending_orders SET status='error', error_message=?` — **errore persistito!**
3. Bot cleanup (close browser)
4. Lock release
5. Throw error → BullMQ marca job come failed

### Branch attuale (in `submit-order.ts`)

1. `bot.createOrder(data)` → restituisce `orderId`
2. `onProgress(70, 'Salvataggio ordine nel database')`
3. Calcolo importi
4. **Transaction PostgreSQL**:
   - INSERT `agents.order_records`
   - INSERT `agents.order_articles`
   - UPDATE `agents.fresis_history`
   - DELETE `agents.pending_orders`
5. `onProgress(100, 'Ordine completato')`
6. Return `{ orderId }`

### Gap identificati

| # | Gap | Impatto |
|---|-----|---------|
| G15 | Vecchio: errore persistito in `pending_orders.status='error'`. Nuovo: errore solo via WebSocket | **Dopo browser refresh, l'errore è perso** |
| G16 | Vecchio: `JOB_COMPLETED` emesso PRIMA della delete. Nuovo: progress 100 emesso prima, ma `JOB_COMPLETED` emesso dal processor DOPO il return | Timing diverso, potrebbe causare race condition |

---

## 7. Riepilogo Gap per Priorità

### Critici (bloccano funzionalità)

| # | Gap | Fix necessaria |
|---|-----|----------------|
| G3 | Progress articoli non interpolato | Implementare `calculateArticleProgress` con metadata |
| G8/G15 | Errore non persistito nel DB | Aggiungere UPDATE pending_orders su fallimento |

### Importanti (degradano UX)

| # | Gap | Fix necessaria |
|---|-----|----------------|
| G4 | Milestone mancanti nel progress | Completare BOT_PROGRESS_MAP |
| G5/G10 | Label generiche senza metadata | Passare metadata nel callback |
| G6 | Solo submit-order ha progress mapper | Creare mapper per delete, edit, customer, sendToVerona |
| G7 | jobTracking perso navigando | Persistere tracking in sessionStorage o ridurre dipendenza |
| G12 | Admin mostra tutti i tipi di job | Aggiungere filtro per tipo o separare sync da ordini |
| G13 | Nessuna retention configurata | Aggiungere removeOnComplete/removeOnFail al BullMQ |

### Minori

| # | Gap | Fix necessaria |
|---|-----|----------------|
| G2 | Mapping jobId→orderId solo client-side | Eventualmente persistere lato server |
| G9 | Manca pendingOrderId nel WS payload | Aggiungere al broadcast |
| G11 | Struttura payload WS diversa | Il frontend attuale gestisce, ma non è identico |
| G14 | Retry job: verificare comportamento | Testare endpoint retry |
| G16 | Timing JOB_COMPLETED vs delete | Verificare se causa problemi |
