# Ghost Articles nelle FT Fresis — Design Spec

**Data:** 2026-03-22
**Scope:** Solo ordini FT Fresis con sottocliente selezionato

---

## Problema

Nello storico FT di Fresis esistono articoli il cui codice non è presente in `shared.products` (il catalogo Archibald). La PWA attualmente non permette l'inserimento di questi articoli in nuovi ordini. L'utente deve poterli aggiungere come "articoli non catalogati" che vengono tracciati nella FT ma non inviati al bot per il piazzamento su Archibald ERP.

---

## Soluzione

Trattare gli articoli non catalogati esattamente come articoli da magazzino: `warehouseQuantity = totalQuantity` → il bot li salta internamente tramite il meccanismo esistente. Vengono salvati in `order_articles` con `is_ghost = true` per identificazione semantica.

---

## Modello Dati

### Frontend — `PendingOrderItem`

```ts
isGhostArticle?: boolean                        // articolo non in shared.products
ghostArticleSource?: 'history' | 'manual'       // solo in-memory frontend, NON persistito
```

`ghostArticleSource` non viene inviato al backend né salvato in DB. Serve solo alla logica UI della modale.

### Backend — `SubmitOrderItem` (in `submit-order.ts`)

```ts
isGhostArticle?: boolean
```

### Backend — Migrazione DB

File: `030-ghost-articles.sql`

```sql
ALTER TABLE agents.order_articles
  ADD COLUMN is_ghost BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## Backend

### A) Handler `submit-order.ts`

**Rilevamento ghost-only:**

```ts
const isGhostOnly = items.length > 0 && items.every(i => i.isGhostArticle);
```

Il check `isGhostOnly` viene calcolato da `data.items` all'inizio dell'handler, prima di qualsiasi operazione. La sequenza corretta nel path ghost-only è:

1. Calcola `isGhostOnly` (da `data.items`)
2. Esegui la **query cliente** (necessaria per `effectiveCustomerName` → `fresis_history`)
3. Salta **solo** la validazione `isCustomerComplete` (non la query stessa)
4. Salta il **pre-retry cleanup** (`bot.deleteOrderFromArchibald`) — non esiste ordine Archibald da cancellare
5. Salta `bot.setProgressCallback` e l'enrichment `customerInternalId`/`deliveryAddressId`
6. Salta `bot.createOrder()`
7. Genera `orderId` sintetico e procedi con salvataggio in DB

**Caso ghost-only (`isGhostOnly = true`):**

1. La query cliente viene eseguita normalmente. Solo la validazione `isCustomerComplete` viene **saltata**. Se `completenessRow` è null (cliente non trovato), il throw esistente è accettabile: per un ordine ghost-only il cliente è sempre il profilo Fresis (`55.261`) che esiste nel DB.
2. NON viene chiamato `bot.createOrder()`.
3. `orderId` sintetico generato nell'handler: `ghost-${Date.now()}`.
4. `isWarehouseOnly` esteso:
   ```ts
   const isWarehouseOnly = orderId.startsWith('warehouse-') || orderId.startsWith('ghost-');
   ```
   Questo fa sì che `saveOrderVerificationSnapshot` e `batchTransfer` vengano saltati.
5. `order_records` creato con:
   - `order_type = 'Warehouse'` (riusa il path warehouse-only esistente — intenzionale)
   - `sales_status = 'WAREHOUSE_FULFILLED'`
   - `sales_origin = 'PWA'`
   - `articles_synced_at = NOW()` — impostato subito alla creazione.
6. Lo scheduler `getOrdersNeedingArticleSync` deve escludere gli ordini ghost-only. Il solo `articles_synced_at = NOW()` non è sufficiente: la query ha tre branch OR problematici:
   - Secondo branch: `current_state NOT IN (stati finali) AND articles_synced_at < 1 day` — `WAREHOUSE_FULFILLED` non è uno stato finale, quindi dopo 1 giorno l'ordine viene ri-accodato.
   - Terzo branch: `articles_synced_at < NOW() - 7 days` senza filtro stato — ri-accoderebbe ogni 7 giorni.
   Il fix corretto è aggiungere `AND order_type != 'Warehouse'` alla query come condizione **esterna** alla clausola OR (livello WHERE principale), non dentro un singolo branch:
   ```sql
   WHERE ... AND order_type != 'Warehouse' AND (
     articles_synced_at IS NULL
     OR (current_state NOT IN (...) AND articles_synced_at < NOW() - INTERVAL '1 day')
     OR articles_synced_at < NOW() - INTERVAL '7 days'
   )
   ```
   Questo esclude sia i ghost-only che i warehouse-only preesistenti da tutti e tre i branch.
7. La UPDATE su `fresis_history SET archibald_order_id = ghost-..., current_state = 'piazzato'` funziona tramite la condizione `merged_into_order_id = pendingOrderId`. Lo stato `'piazzato'` per ghost-only significa "FT processata (solo magazzino interno, nessun ordine ERP)" — semanticamente diverso dal "piazzato" classico, ma accettabile perché la UI dello storico FT mostra già gli ordini warehouse con lo stesso stato. L'ID sintetico usa `Date.now()` (13 cifre) e non si sovrappone mai ai formati ID Archibald reali (numerici puri). Le query `getByMotherOrder`/`getSiblings` usano `LIKE '%orderId%'` senza virgolette: il rischio di falsi positivi con un ID di 13 cifre (`ghost-1742659200000`) è trascurabile in pratica. `propagateState` usa `LIKE '%"orderId"%'` con virgolette e non troverà mai match per ghost orders — comportamento corretto.
7. `DELETE pending_orders` al termine del flow avviene normalmente (`verificationPassed = true` perché il path inline-sync è saltato).
8. Il retry cleanup (`PENDING-%`) non si applica: non esiste ordine Archibald da cancellare. Intenzionale.

**Caso ordine misto (articoli normali + ghost):**

- `bot.createOrder()` chiamato normalmente con `data.items` integro; il bot skippa i ghost via `warehouseQuantity = quantity`.
- `saveOrderVerificationSnapshot` usa `kometItems` (filtro `warehouseQuantity < quantity`): i ghost vengono già esclusi automaticamente.
- `isWarehouseOnly = false` (orderId restituito dal bot è un ID Archibald reale), il sync PDF avviene normalmente per i soli articoli normali.
- `articles_synced_at` non viene impostato manualmente: il sync avviene tramite lo scheduler come per qualsiasi ordine con articoli normali.

**Calcolo `grossAmount`:** su tutti gli items (normali + ghost). Il `discountPercent` globale Fresis si applica anche ai ghost — intenzionale, dato che gli articoli ghost sono venduti al sottocliente con lo stesso sconto dell'ordine.

**Salvataggio in `order_articles`:**
- La query INSERT esistente (14 colonne) deve essere estesa con la 15ª colonna `is_ghost`.
- Ghost items: `warehouse_quantity = quantity`, `warehouse_sources = []`, `is_ghost = true`.
- Articoli normali: `is_ghost = false` (o omesso, dato il DEFAULT FALSE).

### B) Guard in `send-to-verona` handler

Il guard deve essere posto **come prima istruzione del handler**, prima di qualsiasi chiamata al bot:

```ts
// PRIMA di bot.sendOrderToVerona(data.orderId)
if (data.orderId.startsWith('ghost-')) {
  return { success: false, message: 'Ordine ghost: nessun ordine Archibald da inviare' };
}
```

Impedisce che il bot tenti di inviare a Verona un ordine inesistente su Archibald ERP.

### C) Nuovo endpoint — ricerca articoli ghost da storico FT

```
GET /api/fresis-history/ghost-articles
```

Autenticazione: `req.user!.userId` dal JWT. Nessun query param.

**Registrare PRIMA del route parametrico `/:id`** nel router per evitare conflitti.

La funzione `getGhostArticleSuggestions(pool, userId)` viene aggiunta a `FresisHistoryRouterDeps` e cablata in `server.ts`.

Aggregazione runtime su `fresis_history.items` JSONB: articoli mai apparsi nelle FT dell'agente non presenti in `shared.products` (inclusi soft-deleted — un articolo rimosso dal catalogo è comunque "non catalogato"). Deduplicati per codice, ordinati per occorrenze decrescenti. Quando lo stesso codice ha `price`/`discount`/`vat` diversi in FT diverse, si usa il valore della **FT più recente** (ordinamento per `created_at DESC`).

```ts
type GhostArticleSuggestion = {
  articleCode: string;
  description: string;
  price: number;       // prezzo unitario prima dello sconto, prima dell'IVA — dalla FT più recente
  discount: number;    // 0 se non disponibile
  vat: number;         // intero (4, 10, 22)
  occurrences: number;
};
```

**Performance:** query con `jsonb_array_elements` su `fresis_history`. Volume per agente limitato, nessun indice GIN aggiuntivo necessario.

### D) Esportazione ArcaPro (`generateArcaData`)

Gli articoli ghost vengono **esclusi** dalla generazione di `arca_data`. I codici articolo ghost non esistono nell'anagrafica ArcaPro e la loro inclusione causerebbe errori di integrità referenziale all'import.

Il filtro deve avvenire nei **chiamanti** (non in `generateArcaData` stessa, che non ha visibilità su `isGhostArticle` dopo il cast del tipo):

1. **`send-to-verona.ts`** — per ordini misti (il guard `orderId.startsWith('ghost-')` blocca già i ghost-only, ma non i misti): filtrare `row.items` prima di passarli a `generateArcaData`. Il cast deve avvenire a un tipo intermedio che includa `isGhostArticle`, poiché `GenerateInput['items']` (il tipo attuale) non ha quel campo:
   ```ts
   type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
   const exportItems = (row.items as GenerateItemWithGhost[])
     .filter(i => !i.isGhostArticle) as GenerateInput['items'];
   ```

2. **`fresis-history.ts` route (percorso `generateFtNow`)** — stesso pattern su `record.items`:
   ```ts
   type GenerateItemWithGhost = GenerateInput['items'][number] & { isGhostArticle?: boolean };
   const exportItems = (record.items as GenerateItemWithGhost[])
     .filter(i => !i.isGhostArticle) as GenerateInput['items'];
   ```

Non è necessario definire un tipo `FresisHistoryItem` separato: il cast inline con `& { isGhostArticle?: boolean }` è sufficiente e non richiede nuovi file di tipo.

**Prerequisito critico:** il campo `isGhostArticle` deve essere presente nel JSONB `fresis_history.items`. Questo JSONB viene scritto al momento della POST `/archive` dal frontend. Il componente frontend che costruisce il payload `/archive` deve includere esplicitamente `isGhostArticle` nella lista dei campi serializzati per ogni item — non può essere lasciato a un comportamento implicito "as-is". Se il payload è costruito tramite un mapping esplicito dei campi, `isGhostArticle` deve essere aggiunto a quel mapping. Aggiungere `isGhostArticle?: boolean` alla lista dei file da modificare nella sezione Frontend (componente che chiama POST `/archive`).

---

## Frontend

### A) Trigger nel form ricerca articoli

Visibile **solo** per ordini FT Fresis con sottocliente selezionato.

Condizione: **zero risultati da `shared.products`** (né match esatti né fuzzy, inclusi soft-deleted — un articolo soft-deleted è trattato come non catalogato). La presenza di risultati warehouse non influenza questa condizione.

> **"Inserisci come articolo non catalogato"**

### B) Modale "Articolo non catalogato"

**Tab 1 — Dallo storico FT**
- Lista da `GET /api/fresis-history/ghost-articles`
- Ogni riga: codice, descrizione, prezzo, sconto, occorrenze
- Click → precompila form (tutti editabili); `quantity` default `1`

**Tab 2 — Inserimento manuale**
- Campi: codice articolo, descrizione, quantità, prezzo, sconto, IVA
- Obbligatori: codice articolo, IVA
- IVA: intero (4, 10, 22) — validato nel componente `GhostArticleModal` prima dell'insert nell'ordine
- Sconto: opzionale, default `0`
- Se il codice esiste in `shared.products` (esclusi soft-deleted): warning "Questo articolo è presente nel catalogo" ma inserimento permesso

**Validazione IVA:** avviene in `GhostArticleModal` lato client. Se l'utente bypassa e invia `vat = undefined`, il backend ritorna 400 (gestione difensiva in `SubmitOrderItem`).

### C) Struttura item aggiunto all'ordine

```ts
{
  articleCode: "...",
  description: "...",
  quantity: N,
  price: N,
  discount: N,              // default 0
  vat: N,                   // intero (4, 10, 22) — obbligatorio
  isGhostArticle: true,
  ghostArticleSource: 'history' | 'manual',   // in-memory, non inviato al backend
  warehouseQuantity: N,     // = quantity → bot lo salta
  warehouseSources: [],
}
```

### D) Nessuna distinzione visiva

Gli articoli ghost vengono visualizzati nel form ordine senza badge o colori diversi.

### E) Ordini ghost-only già piazzati (vista storico)

Un ordine ghost-only piazzato appare nel pannello ordini come un ordine di tipo `Warehouse` (stesso rendering degli ordini warehouse-only). I ghost items nella vista dettaglio ordine sono mostrati come articoli normali.

Il tasto "Invia a Verona" deve essere **disabilitato** per ordini ghost-only. Aggiungere un check esplicito su `orderId.startsWith('ghost-')` nella funzione `isNotSentToVerona` (o `canSendToVerona`), non affidarsi implicitamente a `transfer_status = null`: un futuro cambio che imposti `transfer_status` per ghost-only farebbe ricomparire il bottone senza questo guard esplicito.

---

## Vincoli

- Feature abilitata **solo** per ordini FT Fresis con sottocliente selezionato.
- IVA **obbligatoria** e intera (4, 10, 22) per articoli ghost.
- Il bot non riceve articoli ghost direttamente: filtrati via `warehouseQuantity = quantity`.
- `articles_synced_at = NOW()` impostato alla creazione per ordini ghost-only + filtro `order_type != 'Warehouse'` in `getOrdersNeedingArticleSync`.
- Tasto "Invia a Verona" disabilitato per ordini con ID `ghost-...`.
- `ghostArticleSource` solo in-memory frontend, non persistito.
- `grossAmount` include tutti gli items (normali + ghost), con `discountPercent` globale applicato a entrambi.

---

## File da Modificare

### Backend
- `src/db/migrations/030-ghost-articles.sql` — colonna `is_ghost` su `order_articles`
- `src/operations/handlers/submit-order.ts` — `isGhostArticle` in `SubmitOrderItem`, ghost-only path, `articles_synced_at = NOW()`, estensione `isWarehouseOnly`
- `src/db/repositories/orders.ts` — filtro `AND order_type != 'Warehouse'` in `getOrdersNeedingArticleSync`
- `src/routes/fresis-history.ts` — filtro `!isGhostArticle` su `record.items` nel percorso `generateFtNow` prima di `generateArcaData`
- Tipo `FresisHistoryItem` (dove definito) — aggiunta `isGhostArticle?: boolean`
- `src/operations/handlers/send-to-verona.ts` — guard early return per `ghost-` IDs + filtro `!isGhostArticle` su `row.items` prima di `generateArcaData` (ordini misti)
- `src/routes/fresis-history.ts` — endpoint `GET /ghost-articles` (prima di `/:id`), `getGhostArticleSuggestions` in `FresisHistoryRouterDeps`
- `src/db/repositories/fresis-history.ts` — `getGhostArticleSuggestions(pool, userId)`
- `src/server.ts` — wire-up `getGhostArticleSuggestions`

### Frontend
- `src/types/pending-order.ts` — campi `isGhostArticle`, `ghostArticleSource`
- `src/components/GhostArticleModal.tsx` — nuovo componente (Tab 1 + Tab 2)
- Componente ricerca articoli nel form FT — trigger "Inserisci come non catalogato"
- `src/api/fresis-history.ts` — metodo `getGhostArticles()`
- Componente che costruisce il payload POST `/archive` — aggiungere `isGhostArticle` alla serializzazione esplicita degli items
- `src/utils/orderStatus.ts` — aggiungere check `orderId.startsWith('ghost-')` in `isNotSentToVerona`
