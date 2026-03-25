# Piano: Migrazione campi importo da TEXT a NUMERIC

## Obiettivo

Eliminare la frammentazione di formato (italiano vs americano) nelle colonne importo di `agents.order_records` convertendole da `TEXT` a `NUMERIC`. Risultato: nessun parsing difensivo, nessun formato stringa, coerenza totale.

## Campi coinvolti in `agents.order_records`

| Colonna | Tipo attuale | Tipo target |
|---|---|---|
| `total_amount` | `TEXT` | `NUMERIC` |
| `gross_amount` | `TEXT` | `NUMERIC` |
| `total_vat_amount` | `TEXT` | `NUMERIC` |
| `total_with_vat` | `TEXT` | `NUMERIC` |

## Step 1 — Migration SQL (migration 033)

File: `src/db/migrations/033-order-records-amounts-numeric.sql`

La `USING` clause deve gestire la conversione dalle stringhe esistenti in DB
(formato italiano "1.234,56 €", formato americano "1234.56", NULL, stringa vuota):

```sql
CREATE OR REPLACE FUNCTION parse_amount_text(v TEXT) RETURNS NUMERIC AS $$
BEGIN
  IF v IS NULL OR trim(v) = '' THEN RETURN NULL; END IF;
  -- rimuovi simbolo €, spazi, separatori migliaia, converti virgola decimale
  RETURN CAST(
    regexp_replace(
      regexp_replace(trim(v), '[€\s]', '', 'g'),  -- rimuovi € e spazi
      '\.(?=\d{3})', '', 'g'                       -- rimuovi punti migliaia
    )
    REPLACE (',', '.')                              -- virgola → punto decimale
  AS NUMERIC);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE agents.order_records
  ALTER COLUMN total_amount    TYPE NUMERIC USING parse_amount_text(total_amount),
  ALTER COLUMN gross_amount    TYPE NUMERIC USING parse_amount_text(gross_amount),
  ALTER COLUMN total_vat_amount TYPE NUMERIC USING parse_amount_text(total_vat_amount),
  ALTER COLUMN total_with_vat  TYPE NUMERIC USING parse_amount_text(total_with_vat);

DROP FUNCTION parse_amount_text;
```

## Step 2 — Backend: write path

Rimuovere tutte le conversioni stringa nei write path.

**`sync/services/order-sync.ts`**
- `order.total ?? null` → già stringa dal PDF, sarà castata da PG automaticamente se numerica
- Oppure parsare prima di inserire: `parseFloat(order.total?.replace(...))` → NUMERIC

**`operations/handlers/submit-order.ts`**
- `total.toFixed(2).replace('.', ',')` → `total` (numero diretto)
- `grossAmount.toFixed(2).replace('.', ',')` → `grossAmount`

**`operations/handlers/sync-order-articles.ts`**
- `grossAmount.toFixed(2).replace('.', ',')` → `grossAmount`
- `totalVatAmount.toString()` → `totalVatAmount`
- `totalWithVat.toString()` → `totalWithVat`

**`verification/inline-order-sync.ts`** (saveArticlesToDb)
- Stesse sostituzioni di sync-order-articles

**`operations/handlers/edit-order.ts`**
- Le sub-query `SUM(line_amount)` già restituiscono NUMERIC — nessuna modifica necessaria

## Step 3 — Backend: read path

**`db/repositories/orders.ts`**
- Tipo `total_amount: string | null` → `total_amount: number | null`
- Tipo `gross_amount: string | null` → `gross_amount: number | null`
- Tipo `total_vat_amount: string | null` → `number | null`
- Tipo `total_with_vat: string | null` → `number | null`
- Mappatura: `total: row.total_amount` (rimuovere conversioni)

**`temporal-comparisons.ts`**
- Rimuovere `parseItalianCurrency(order.total_amount)` → usare `order.total_amount` direttamente (già number)
- Rimuovere import di `parseItalianCurrency` se non usato altrove
- Rimuovere il check `total_amount IS NOT NULL AND total_amount != ''` (NULL è sufficiente)

**`dashboard-service.ts`**
- `totalAmount: o.total_amount` — tipo diventa `number | null` invece di `string | null`

## Step 4 — Frontend: rimuovere i parseFloat

**`frontend/src/types/order.ts`**
- `totalVatAmount?: string` → `totalVatAmount?: number`
- `totalWithVat?: string` → `totalWithVat?: number`
- `grossAmount?: string` → `grossAmount?: number`
- `total?: string | null` → `total?: number | null`  (il campo `totalAmount` in widget)

**`frontend/src/components/OrderCardNew.tsx`**
- Rimuovere tutti i `parseFloat(order.totalWithVat)` → usare `order.totalWithVat` direttamente
- Rimuovere tutti i `parseFloat(order.totalVatAmount)` → usare `order.totalVatAmount` direttamente
- Riga 3500, 3511, 3515, 4437, 4440, 4447, 4448, 4731: tutti i `parseFloat(order.totalWithVat)`

**`frontend/src/types/widget.ts`**
- `totalAmount: string | null` → `totalAmount: number | null`

**`frontend/src/components/WidgetOrderConfigModal.tsx`**
- `parseAmount(order.totalAmount)` → `order.totalAmount` direttamente

## Step 5 — Eliminare `parseItalianCurrency` se non più usata

Verificare se `parseItalianCurrency` in `temporal-comparisons.ts` (o altrove) ha ancora consumatori.
Se orfana, rimuoverla.

## Note tecniche

- La migration è `ALTER TABLE … ALTER COLUMN … USING` — operazione bloccante su PostgreSQL ma veloce su ~1000 righe
- Il parsing SQL nella USING clause gestisce NULL, stringhe vuote, formato "1.234,56 €" e "1234.56"
- Il PDF parser `pdf-parser-orders-service.ts` continua a restituire stringhe: la conversione avviene nel write path (order-sync) prima di scrivere in DB
- `order-sync.ts` dovrà parsare `order.total` e `order.grossAmount` da stringa italiana a number prima dell'INSERT/UPDATE — aggiungere una funzione di parsing locale (o riusare `parseItalianCurrency` solo lì)

## Verifica finale

- `npm run build` backend e frontend senza errori TypeScript
- `npm test` backend e frontend senza regressioni
- Query produzione: `SELECT total_amount, gross_amount, total_vat_amount, total_with_vat FROM agents.order_records LIMIT 5` → tutti i valori sono numeri puri, nessuna stringa
