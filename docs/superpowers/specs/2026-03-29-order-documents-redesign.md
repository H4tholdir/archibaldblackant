# Order Documents Redesign — DDT e Fatture Multi-documento

**Data:** 2026-03-29
**Stato:** Approvato

## Contesto e Motivazione

L'ERP Archibald ha 1036 DDT per 943 ordini. Il sistema attuale salva un solo `ddt_number` e una sola `invoice_number` come colonne piatte su `order_records`. Questo è corretto per il caso base, ma non copre:

- **Backorder**: un ordine spedito in più tranche genera un DDT per ogni spedizione
- **NC + fattura**: un ordine può avere una fattura originale + una nota di credito + una fattura sostitutiva

Conseguenze attuali:
- I DDT backorder sovrascrivono il DDT principale durante il sync
- Le NC linkate a un ordine sovrascrivono la fattura originale
- Il tracking è legato all'ordine anziché alla singola spedizione
- Lo stato "consegnato" si basa su un solo tracking, ignorando spedizioni parziali

---

## Decisioni di Design

| Tema | Decisione |
|------|-----------|
| Schema | Tabelle separate `order_ddts` e `order_invoices` (Approccio A) |
| Gerarchia | `position=0` principale, `position>0` backorder/NC, ordinati per `ddt_id` ERP ASC |
| Tracking | Spostato da `order_records` a `order_ddts` — ogni DDT ha il suo tracking |
| Stato parziale | Nuovo valore `parzialmente_consegnato` in `current_state` |
| Stato consegnato | Solo quando TUTTI i DDT dell'ordine hanno `delivery_confirmed_at IS NOT NULL` |
| Rollout | Due migration separate: 042 (crea + migra, non-destructiva) + 043 (drop colonne) |
| API | `order.ddt` → `order.ddts[]`, `order.invoice` → `order.invoices[]` |
| Frontend | Primary DDT sempre visibile; backorder sotto toggle collassato "Backorder (N)" |

---

## Schema Database

### `agents.order_ddts`

```sql
CREATE TABLE agents.order_ddts (
  id                          TEXT PRIMARY KEY,
  order_id                    TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id                     TEXT NOT NULL,
  position                    INTEGER NOT NULL DEFAULT 0,
  ddt_number                  TEXT NOT NULL,
  ddt_delivery_date           TEXT,
  ddt_id                      TEXT,
  ddt_customer_account        TEXT,
  ddt_sales_name              TEXT,
  ddt_delivery_name           TEXT,
  delivery_terms              TEXT,
  delivery_method             TEXT,
  delivery_city               TEXT,
  attention_to                TEXT,
  ddt_delivery_address        TEXT,
  ddt_quantity                TEXT,
  ddt_customer_reference      TEXT,
  ddt_description             TEXT,
  -- tracking (spostato da order_records)
  tracking_number             TEXT,
  tracking_url                TEXT,
  tracking_courier            TEXT,
  tracking_status             TEXT,
  tracking_key_status_cd      TEXT,
  tracking_status_bar_cd      TEXT,
  tracking_estimated_delivery TEXT,
  tracking_last_location      TEXT,
  tracking_last_event         TEXT,
  tracking_last_event_at      TIMESTAMPTZ,
  tracking_last_synced_at     TIMESTAMPTZ,
  tracking_sync_failures      INTEGER DEFAULT 0,
  tracking_origin             TEXT,
  tracking_destination        TEXT,
  tracking_service_desc       TEXT,
  tracking_delay_reason       TEXT,
  tracking_delivery_attempts  INTEGER DEFAULT 0,
  tracking_attempted_delivery_at TIMESTAMPTZ,
  tracking_events             JSONB,
  delivery_confirmed_at       TIMESTAMPTZ,
  delivery_signed_by          TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, ddt_number)
);

CREATE INDEX idx_order_ddts_user_order ON agents.order_ddts(user_id, order_id);
CREATE INDEX idx_order_ddts_tracking ON agents.order_ddts(tracking_number)
  WHERE tracking_number IS NOT NULL;
```

**Regola `position`:** ordinamento per `ddt_id::bigint ASC` all'interno dello stesso `order_id`. Il DDT con ID ERP più basso (creato per primo) è `position=0` (principale). Ricalcolato dopo ogni sync via query batch.

### `agents.order_invoices`

```sql
CREATE TABLE agents.order_invoices (
  id                          TEXT PRIMARY KEY,
  order_id                    TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id                     TEXT NOT NULL,
  position                    INTEGER NOT NULL DEFAULT 0,
  invoice_number              TEXT NOT NULL,
  invoice_date                TEXT,
  invoice_amount              TEXT,
  invoice_customer_account    TEXT,
  invoice_billing_name        TEXT,
  invoice_quantity            INTEGER,
  invoice_remaining_amount    TEXT,
  invoice_tax_amount          TEXT,
  invoice_line_discount       TEXT,
  invoice_total_discount      TEXT,
  invoice_due_date            TEXT,
  invoice_payment_terms_id    TEXT,
  invoice_purchase_order      TEXT,
  invoice_closed              BOOLEAN,
  invoice_days_past_due       TEXT,
  invoice_settled_amount      TEXT,
  invoice_last_payment_id     TEXT,
  invoice_last_settlement_date TEXT,
  invoice_closed_date         TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, invoice_number)
);

CREATE INDEX idx_order_invoices_user_order ON agents.order_invoices(user_id, order_id);
```

**Regola `position`:** ordinamento per `invoice_date ASC`. La fattura più vecchia è `position=0` (principale). NC e fatture sostitutive seguono in ordine cronologico.

### `agents.order_records` — colonne rimosse

Tutte le colonne `ddt_*`, `delivery_terms`, `delivery_method`, `delivery_city`, `attention_to`, `ddt_delivery_address`, `invoice_*`, e tutte le colonne `tracking_*` + `delivery_confirmed_at` + `delivery_signed_by` vengono rimosse nella migration 043.

---

## Sync Logic

### DDT Sync

**Input:** array flat di `ParsedDdt` dalla ListView `CUSTPACKINGSLIPJOUR_ListView/`.

**Flusso:**

1. **Group + sort in memoria:**
   ```
   parsedDdts
     → group by orderNumber
     → per ogni gruppo: sort by ddtId numerico ASC
     → assign position 0, 1, 2...
   ```

2. **Lookup ordine:**
   ```sql
   SELECT id FROM agents.order_records
   WHERE order_number = $1 AND user_id = $2
   ```
   Se non trovato → `ddtSkipped++`, continua.

3. **UPSERT per ogni DDT:**
   ```sql
   INSERT INTO agents.order_ddts (id, order_id, user_id, position, ddt_number, ...)
   VALUES (gen_random_uuid(), $order_id, $user_id, $position, ...)
   ON CONFLICT (order_id, ddt_number) DO UPDATE SET
     ddt_delivery_date = EXCLUDED.ddt_delivery_date,
     position = EXCLUDED.position,
     -- tracking non sovrascritto se già presente
     tracking_number = COALESCE(order_ddts.tracking_number, EXCLUDED.tracking_number),
     ...
   ```

4. **Riposizionamento batch** dopo tutti gli UPSERT:
   ```sql
   UPDATE agents.order_ddts SET position = subq.pos
   FROM (
     SELECT id,
       ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY ddt_id::bigint ASC) - 1 AS pos
     FROM agents.order_ddts WHERE user_id = $1
   ) subq
   WHERE order_ddts.id = subq.id AND order_ddts.user_id = $1
   ```

5. **Result:** `{ ddtProcessed, ddtInserted, ddtUpdated, ddtSkipped, duration }`

### Invoice Sync

Identico al DDT sync. Group by orderNumber, sort per `invoice_date ASC`, UPSERT in `order_invoices`. Result aggiunge `invoicesInserted` per monitorare nuove NC rilevate.

### Tracking Sync

**Cambia solo il target:**

```
Prima: SELECT id, tracking_number FROM agents.order_records
       WHERE tracking_number IS NOT NULL AND ...

Dopo:  SELECT id, order_id, tracking_number FROM agents.order_ddts
       WHERE tracking_number IS NOT NULL AND ...
```

L'UPDATE tracking avviene sulla riga `order_ddts` specifica. Dopo ogni aggiornamento, viene ricalcolato `current_state` sull'ordine padre (vedi State Machine).

---

## State Machine

### Nuovi valori di `current_state`

| Condizione | `current_state` |
|-----------|----------------|
| Tutti i DDT hanno `delivery_confirmed_at IS NOT NULL` | `consegnato` |
| Almeno 1 DDT consegnato, almeno 1 non ancora | `parzialmente_consegnato` *(nuovo)* |
| Nessun DDT consegnato | invariato (tracking attivo) |
| Nessun DDT presente | invariato |

### Trigger del ricalcolo

Eseguito dopo ogni `UPDATE` su `tracking_*` di un `order_ddt`:

```sql
-- 1. Aggrega stato DDT dell'ordine
SELECT
  COUNT(*)                     AS total,
  COUNT(delivery_confirmed_at) AS delivered
FROM agents.order_ddts
WHERE order_id = $order_id

-- 2. Aggiorna current_state
UPDATE agents.order_records SET current_state = $new_state
WHERE id = $order_id
```

La query è O(1) per ordine (max 2-3 DDT per ordine).

---

## API Shape

### List view (ordini)

JOIN solo con `position=0` per performance:

```sql
LEFT JOIN agents.order_ddts d
  ON d.order_id = o.id AND d.position = 0 AND d.user_id = o.user_id
LEFT JOIN agents.order_invoices i
  ON i.order_id = o.id AND i.position = 0 AND i.user_id = o.user_id
```

La risposta include `ddts: [primaryDdt]` e `invoices: [primaryInvoice]` — array con un solo elemento per il caso comune. I backorder non vengono caricati nella lista.

### Detail view (ordine singolo)

JOIN senza filtro position, ordinati per position ASC nella query esterna:

```sql
LEFT JOIN agents.order_ddts d ON d.order_id = o.id AND d.user_id = o.user_id
LEFT JOIN agents.order_invoices i ON i.order_id = o.id AND i.user_id = o.user_id
-- ...
ORDER BY d.position ASC, i.position ASC
```

In pratica il repository restituisce DDT e fatture come array separati, ognuno già ordinato per `position ASC`.

### Response shape

**Prima:**
```json
{
  "ddt": {
    "ddtNumber": "DDT/26001",
    "trackingNumber": "445291890750",
    "trackingCourier": "FEDEX"
  },
  "invoice": {
    "invoiceNumber": "CF1/26001",
    "invoiceClosed": false
  }
}
```

**Dopo:**
```json
{
  "ddts": [
    {
      "position": 0,
      "ddtNumber": "DDT/26001",
      "ddtDeliveryDate": "2026-03-27",
      "tracking": {
        "trackingNumber": "445291890750",
        "trackingCourier": "FEDEX",
        "trackingStatus": "Delivered",
        "deliveryConfirmedAt": "2026-03-29T10:00:00Z"
      }
    },
    {
      "position": 1,
      "ddtNumber": "DDT/26006001",
      "ddtDeliveryDate": "2026-04-02",
      "tracking": {
        "trackingNumber": "445291999999",
        "trackingCourier": "FEDEX",
        "trackingStatus": "In transito",
        "deliveryConfirmedAt": null
      }
    }
  ],
  "invoices": [
    {
      "position": 0,
      "invoiceNumber": "CF1/26001",
      "invoiceDate": "2026-03-30",
      "invoiceAmount": "500.00",
      "invoiceClosed": false
    }
  ]
}
```

**Accesso dal frontend:** `order.ddts[0]` (primary), `order.ddts.slice(1)` (backorder), `order.invoices[0]` (fattura principale).

---

## Frontend

### Scheda ordine — sezione DDT

```
┌─────────────────────────────────────────┐
│ DDT/26005754  · 27/03/2026  · 50 pz    │  ← position=0, sempre visibile
│ 📦 FedEx 445291890750 [In transito]     │
│                                         │
│ ▼ Backorder (1)                         │  ← collassato di default
│   DDT/26006001  · 02/04/2026  · 12 pz  │
│   📦 FedEx 445291999999 [Consegnato]    │
└─────────────────────────────────────────┘
```

- Il toggle "Backorder (N)" è visibile solo se `order.ddts.length > 1`
- Badge stato ordine aggiunge caso `parzialmente_consegnato` → colore ambra

### Modifiche ai componenti

Tutti i componenti che leggono `order.ddt` o `order.invoice` vanno aggiornati a `order.ddts[0]` e `order.invoices[0]`. La modifica è meccanica ma capillare (~8-10 file). Il tipo `Order` viene aggiornato per primo per far emergere tutti i siti di utilizzo a compile-time.

---

## Piano di Rollout

### Step 1 — Migration 042 (non-destructiva)

File: `042-order-documents-tables.sql`

- Crea `agents.order_ddts` e `agents.order_invoices`
- Copia i dati esistenti da `order_records` come `position=0`
- Le vecchie colonne restano intatte → il vecchio codice continua a girare

### Step 2 — Deploy backend + frontend

- Nuovo codice legge e scrive le nuove tabelle
- Verifica in produzione: contare righe migrate, spot-check dati
- Eseguire un sync manuale DDT e invoice per verificare UPSERT

### Step 3 — Migration 043 (drop colonne)

File: `043-drop-order-documents-columns.sql`

- DROP COLUMN per tutte le 36 colonne rimosse da `order_records`
- DROP INDEX sui vecchi indici DDT e invoice
- Solo dopo conferma che step 2 funziona correttamente in produzione

---

## File Coinvolti

### Backend

| File | Tipo modifica |
|------|--------------|
| `db/migrations/042-order-documents-tables.sql` | Nuovo |
| `db/migrations/043-drop-order-documents-columns.sql` | Nuovo |
| `db/repositories/order-ddts.ts` | Nuovo repository |
| `db/repositories/order-invoices.ts` | Nuovo repository |
| `db/repositories/orders.ts` | Rimozione campi DDT/invoice/tracking, aggiornamento query e tipi |
| `sync/services/ddt-sync.ts` | Riscrittura: group/sort + UPSERT + riposizionamento batch |
| `sync/services/invoice-sync.ts` | Idem |
| `sync/services/tracking-sync.ts` | Cambio target da `order_records` a `order_ddts` |
| `routes/orders.ts` | Response shape: ddts[] e invoices[] |

### Frontend

| File | Tipo modifica |
|------|--------------|
| `src/types/order.ts` (o equivalente) | `ddt` → `ddts[]`, `invoice` → `invoices[]`, tipo `TrackingInfo` si sposta in `DdtInfo` |
| `OrderCardNew.tsx` | Aggiornamento sezione DDT/tracking/invoice, aggiunta toggle backorder |
| ~8-10 altri componenti | `order.ddt` → `order.ddts[0]`, `order.invoice` → `order.invoices[0]` |
