# Report: Diff Sistematico Magazzino + Fresis Merged Orders

**Data:** 2026-03-02
**Branch vecchio:** `master-backup-pre-unified-queue`
**Branch attuale:** `master`

---

## Risultato: 3 problemi trovati, 1 critico

---

## Problema 1 (CRITICO): `warehouse_sources_json` non salvato nel submit-order handler

**File:** `backend/src/operations/handlers/submit-order.ts` (riga 153-184)

L'INSERT in `agents.order_articles` include `warehouse_quantity` ma **omette `warehouse_sources_json`**.

**Vecchio branch:**
```typescript
// queue-manager.ts
warehouseSourcesJson: item.warehouseSources
  ? JSON.stringify(item.warehouseSources)
  : undefined,   // ← SALVATO
```

**Branch attuale:**
```sql
INSERT INTO agents.order_articles (
  order_id, user_id, article_code, article_description, quantity,
  unit_price, discount_percent, line_amount, warehouse_quantity, created_at
  -- ← warehouse_sources_json MANCANTE
) VALUES ...
```

Il dato `warehouseSources` (quale scatola ha fornito quanti pezzi) è disponibile in `data.items[i].warehouseSources` ma non viene mai serializzato e salvato.

**Impatto:** Dopo la creazione ordine, è impossibile sapere da quali scatole specifiche provenivano i pezzi. Solo il totale `warehouse_quantity` per articolo è noto.

**Fix:** Aggiungere `warehouse_sources_json` all'INSERT SQL.

---

## Problema 2 (MEDIO): `batchMarkSold` non pulisce `reserved_for_order`

**File:** `backend/src/db/repositories/warehouse.ts`

**Vecchio branch:**
```sql
UPDATE warehouse_items
SET sold_in_order = ?,
    reserved_for_order = NULL,   -- ← PULISCE la prenotazione
    customer_name = COALESCE(?, customer_name)
WHERE user_id = ? AND reserved_for_order = ?
```

**Branch attuale:**
```sql
UPDATE agents.warehouse_items
SET sold_in_order = $1,
    customer_name = COALESCE($3, customer_name)
    -- ← reserved_for_order NON viene pulito
WHERE user_id = $2 AND reserved_for_order = $1 AND sold_in_order IS NULL
```

**Impatto:** Un item può avere sia `reserved_for_order = 'X'` che `sold_in_order = 'X'`. Le query di disponibilità (`reserved_for_order IS NULL AND sold_in_order IS NULL`) funzionano correttamente perché `sold_in_order IS NOT NULL` li esclude comunque. Ma qualsiasi codice che conta i "riservati" via `reserved_for_order IS NOT NULL` sovraconta (include anche i venduti).

**Fix:** Aggiungere `reserved_for_order = NULL` al SET del batchMarkSold.

---

## Problema 3 (DA VERIFICARE): Endpoint `delete-from-archibald` e `edit-in-archibald` mancanti

**File vecchio:** `backend/src/routes/fresis-history-routes.ts`

Il vecchio branch aveva due endpoint che lanciavano il bot:
1. `POST /fresis-history/:id/delete-from-archibald` — cancella ordine da Archibald ERP
2. `POST /fresis-history/:id/edit-in-archibald` — modifica ordine in Archibald ERP

**File attuale:** `backend/src/routes/fresis-history.ts` — questi endpoint NON esistono.

**Impatto:** Se il frontend li chiama, riceverà 404. Però questi endpoint potrebbero essere stati spostati nel sistema di operazioni (`delete-order` e `edit-order` handler esistono). Serve verificare se il frontend li invoca ancora direttamente o usa il nuovo sistema.

---

## Componenti FUNZIONANTI (nessuna differenza logica)

| Componente | Status |
|---|---|
| Bot `createOrder()` — filtro warehouse items | Identico |
| Bot — warehouse-only orders (`warehouse-{timestamp}`) | Identico |
| Fresis history reconciliation (`state → 'piazzato'`) | Identico (+ atomico in transazione) |
| Pending order deletion post-completamento | Identico (+ atomico in transazione) |
| Calcolo importi (grossAmount, totalAmount) | Identico |
| Schema Zod validation (warehouseSources, warehouseQuantity) | Identico |
| Frontend: WarehouseMatchAccordion | Solo miglioramento UI (pulse per perfect match) |
| Frontend: order-merge.ts (mergeFresisPendingOrders) | Identico |
| Frontend: warehouse-matching.ts | Identico |
| Frontend: tipo PendingOrder (warehouseSources, warehouseQuantity) | Identico |
| Backend: batchReserve, batchRelease, batchTransfer | Identico |
| Backend: fresis-history repository (getAll, upsert, propagateState, archive) | Identico |
| Backend: warehouse boxes CRUD | Identico (+ safety guards su reserved/sold) |
| Frontend: WarehouseInventoryView, WarehouseUpload, BoxManagement | Identico |

---

## Flusso completo warehouse — vecchio vs nuovo

### Creazione pending order con articoli da magazzino

1. Utente aggiunge articolo nell'OrderForm → **WarehouseMatchAccordion** mostra match
2. Utente seleziona scatole → `warehouseSources` e `warehouseQuantity` salvati nell'item
3. `batchReserve` chiamato → items nel DB segnati come `reserved_for_order = pendingOrderId`
4. Pending order salvato con items inclusi warehouseSources

**Vecchio e nuovo: IDENTICO** ✅

### Invio ordine ad Archibald

5. Bot `createOrder()` filtra items:
   - warehouseQty >= totalQty → escluso dall'ordine Archibald (solo magazzino)
   - warehouseQty < totalQty → qty ridotta (totalQty - warehouseQty)
   - Tutti warehouse → return `warehouse-{timestamp}` senza toccare Archibald
6. Ordine creato su Archibald → orderId restituito
7. Order record + articles salvati in DB
8. **`warehouse_sources_json` salvato** (vecchio) vs **NON salvato** (nuovo) ← BUG
9. Fresis history → state = 'piazzato'
10. Pending order cancellato

### Post-completamento: mark sold

11. `batchMarkSold` chiamato con `orderId` → items nel DB segnati come `sold_in_order`
12. **`reserved_for_order` pulito** (vecchio) vs **NON pulito** (nuovo) ← PROBLEMA

### Fallimento ordine

13. `batchRelease` chiamato → items nel DB: `reserved_for_order = NULL` (tornano disponibili)

**Vecchio e nuovo: IDENTICO** ✅
