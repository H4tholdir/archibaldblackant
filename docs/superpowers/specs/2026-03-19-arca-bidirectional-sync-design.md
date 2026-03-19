# Arca ↔ PWA Sync Bidirezionale — Design Spec

**Data**: 2026-03-19
**Scope**: Normalizzazione numeri FT/KT, aggiornamento record esistenti da Arca, soft delete, FT companion warehouse

---

## Contesto e Problema

Il sistema attuale gestisce la sync Arca ↔ PWA in modo parzialmente unidirezionale:
- **Arca → PWA**: funziona solo per l'import di nuovi documenti (insert-only)
- **PWA → Arca**: genera un VBS con numeri hardcoded al momento della sync

Questo crea tre classi di problemi quando operatori usano Arca direttamente mentre la PWA è attiva:

1. **Conflitti numerazione**: la PWA assegna FT/KT con numeri già usati da operatori in Arca → VBS fallisce con `Uniqueness of index NUMERO_P is violated`
2. **Mancato aggiornamento**: se un operatore modifica un documento in Arca, la PWA mantiene la versione vecchia
3. **Mancato soft delete**: se un operatore cancella un documento in Arca, la PWA lo mantiene attivo

Caso aggiuntivo: ordini KT con articoli parzialmente o totalmente da magazzino non generano la FT contabile corrispondente per gli articoli warehouse.

---

## Principio Guida

**Arca è la fonte di verità.** La PWA si adatta ad Arca, mai il contrario. La PWA esporta verso Arca solo i documenti che ha creato autonomamente (`source='app'`) e che non hanno ancora un corrispondente in Arca.

---

## Architettura Generale

```
Arca DBF → PWA:
  1. Import nuovi documenti         (già esistente, mantenuto)
  2. Update documenti modificati    ← NUOVO
  3. Soft delete cancellati         ← NUOVO

PWA → Arca (VBS):
  4. Export con numeri normalizzati ← FIX
  5. FT companion per warehouse     ← NUOVO
```

---

## Nota su `deterministicId` — Due Popolazioni di Record

Il codebase ha due percorsi di import con firme diverse:

```typescript
// Percorso LEGACY (arca-import-service.ts:681) — 4 argomenti
deterministicId(userId, esercizio, numerodoc, codicecf)

// Percorso NUOVO (arca-sync-service.ts:912, parseNativeArcaFiles) — 5 argomenti
deterministicId(userId, esercizio, tipodoc, numerodoc, codicecf)
```

Le due firme producono ID diversi per lo stesso documento. I record in produzione importati via percorso legacy hanno ID a 4 argomenti. Questi record:
- **Non** vengono aggiornati dalla FASE 3 (UPDATE) — il loro ID non coinciderà mai con quello calcolato da `parseNativeArcaFiles`
- **Vengono** protetti dalla re-importazione dal check su `existingInvoiceNumbers` (già presente)
- Costituiscono una **popolazione separata** che non interferisce con la nuova logica

Non è necessaria una migration per riconciliare gli ID legacy: la protezione via `invoice_number` è sufficiente. Nel tempo, i documenti legacy verranno gradualmente sostituiti da record aggiornati tramite il nuovo percorso.

---

## Modifiche al Data Model

### Migration 029 (deploy prerequisito al codice)

> ⚠️ **Dipendenza di deploy**: questa migration deve essere applicata in produzione **prima** del deploy del nuovo codice. Il codice utilizza la PK a 3 colonne `(esercizio, user_id, tipodoc)` — se la migration non è applicata, gli INSERT su `ft_counter` falliscono.

```sql
BEGIN;

-- 1. Separazione counter FT / KT
--    Il default 'FT' trasforma le righe esistenti in righe FT.
ALTER TABLE agents.ft_counter
  ADD COLUMN IF NOT EXISTS tipodoc TEXT NOT NULL DEFAULT 'FT';

ALTER TABLE agents.ft_counter DROP CONSTRAINT ft_counter_pkey;

-- Seed KT al valore corrente di FT (conservativo: nessun conflitto garantito).
-- Questa scelta spreca intenzionalmente alcuni numeri KT bassi per sicurezza.
-- Il counter verrà aggiornato al valore reale Arca alla prima sync.
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
SELECT esercizio, user_id, 'KT', last_number
FROM agents.ft_counter
WHERE tipodoc = 'FT'
ON CONFLICT DO NOTHING;

ALTER TABLE agents.ft_counter ADD PRIMARY KEY (esercizio, user_id, tipodoc);

-- 2. Link KT order → FT companion warehouse (su order_records, non fresis_history)
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS warehouse_companion_ft_id TEXT;

COMMIT;
```

### Campi invariati

`current_state` è già `TEXT` libero. Il nuovo valore `'cancellato_in_arca'` non richiede modifiche allo schema SQL. Da aggiornare solo il type union TypeScript in frontend e backend.

---

## `getNextDocNumber` — Firma Aggiornata

```typescript
async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',   // nuovo parametro obbligatorio
): Promise<number>
```

**Call site da aggiornare (entrambi obbligatori):**

1. `arca-sync-service.ts` → `generateKtExportVbs` — generazione numeri KT:
   ```typescript
   const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT')
   ```

2. `arca-sync-service.ts` → `generateKtExportVbs` — generazione numero FT companion:
   ```typescript
   const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT')
   ```

---

## Algoritmo `performArcaSync` — Flusso Aggiornato

### FASE 1 — Costruzione mappa Arca

```typescript
// Tre strutture da buildare durante il parse in parseNativeArcaFiles:
arcaDocMap:       Map<"ESERCIZIO|TIPODOC|NUMERODOC|CODICECF", ArcaRecord>
arcaDocKeys:      Set<"ESERCIZIO|TIPODOC|NUMERODOC">   // 3-part key per conflict detection
arcaMaxByTipodoc: Map<"ESERCIZIO|TIPODOC", number>     // max numerodoc per tipo
```

### FASE 2 — Aggiornamento counter separati (usa nuova PK a 3 colonne)

```sql
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
VALUES ($1, $2, $3, $4)
ON CONFLICT (esercizio, user_id, tipodoc)
DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)
```

Eseguito per ogni `(ESERCIZIO, TIPODOC)` distinto trovato in Arca.

### FASE 3 — Import + Update da Arca

```
Per ogni record in arcaDocMap:
  id = deterministicId(userId, esercizio, tipodoc, numerodoc, codicecf)  // 5 argomenti

  IF id NON esiste in PWA DB:
    → INSERT (comportamento attuale)

  IF id esiste in PWA DB:
    → UPDATE solo campi Arca-owned:
        target_total_with_vat, discount_percent, items, shipping_cost,
        shipping_tax, invoice_amount, invoice_date, notes,
        archibald_order_number, arca_data, updated_at

    Campi PWA-owned NON toccati:
        current_state, state_updated_at, ddt_number, ddt_delivery_date,
        tracking_number, tracking_url, tracking_courier,
        delivery_completed_date, revenue, merged_into_order_id, merged_at,
        invoice_closed, invoice_remaining_amount, invoice_due_date
```

### FASE 4 — Soft Delete

Confronto tra `invoice_number` dei record PWA e le chiavi a 3 parti di `arcaDocKeys`.

La chiave viene ricostruita dall'`invoice_number` con parsing:
```typescript
// invoice_number = "FT 326/2026" → key = "2026|FT|326"
function invoiceNumberToKey(invoiceNumber: string): string | null {
  const m = invoiceNumber.match(/^(\w+)\s+(\d+)\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}|${m[1]}|${m[2]}`
}
```

```
PWA records con source='arca_import' il cui invoiceNumberToKey(invoice_number)
NON è in arcaDocKeys:
  → UPDATE current_state = 'cancellato_in_arca', state_updated_at = NOW()

  SE il record ha ddt_number IS NOT NULL
     OR tracking_number IS NOT NULL
     OR delivery_completed_date IS NOT NULL:
    → aggiungi a deletionWarnings nel SyncResult
```

### FASE 5 — Normalizzazione numerazione PWA

```
Per ogni record source='app' con arca_data IS NOT NULL:
  key = invoiceNumberToKey(invoice_number)  // "ESERCIZIO|TIPODOC|NUMERODOC"

  IF key IN arcaDocKeys:
    // Numero occupato da un doc Arca con CODICECF diverso → rinumera
    tipodoc = arca_data.testata.TIPODOC  // 'FT' o 'KT'
    newNum = getNextDocNumber(pool, userId, esercizio, tipodoc)

    UPDATE agents.fresis_history SET:
      invoice_number         = "{tipodoc} {newNum}/{esercizio}"
      archibald_order_number = "{tipodoc} {newNum}/{esercizio}"
      arca_data              = JSON patch: testata.NUMERODOC = String(newNum)
      updated_at             = NOW()

    renumbered++
```

### FASE 6 — Build exportRecords per VBS

Invariata rispetto al flusso attuale, usa i numeri già normalizzati dalla FASE 5.

---

## `SyncResult` — Tipo Aggiornato

```typescript
type SyncResult = {
  // ...esistenti...
  updated: number;           // record aggiornati da Arca
  softDeleted: number;       // record marcati cancellato_in_arca
  renumbered: number;        // record PWA rinumerati
  deletionWarnings: Array<{  // cancellazioni con dati PWA a rischio
    invoiceNumber: string;
    hasTracking: boolean;
    hasDdt: boolean;
    hasDelivery: boolean;
  }>;
}
```

---

## Generazione KT + FT Companion Warehouse (`generateKtExportVbs`)

### Rilevamento articoli warehouse

```typescript
// warehouseQuantity è mappato da warehouse_quantity nel repository orders.ts (verificato)
const warehouseArticles = articles
  .filter(a => (a.warehouseQuantity ?? 0) > 0)
  .map(a => ({ ...a, quantity: a.warehouseQuantity! }))

// Casistiche:
// qty=10, warehouse_qty=10 → escluso dalla KT, FT qty=10   (fully warehouse)
// qty=10, warehouse_qty=3  → KT qty=7,  FT qty=3           (partial)
// qty=10, warehouse_qty=0  → KT qty=10, non va in FT        (no warehouse)
```

### Guard: KT con tutti articoli da magazzino

```typescript
const nonWarehouseArticles = articles.filter(a => (a.warehouseQuantity ?? 0) < a.quantity)

if (nonWarehouseArticles.length === 0) {
  // Ordine completamente da magazzino: non generare la KT in Arca.
  // Genera solo la FT companion se ci sono warehouse articles.
  // Non pushare nulla in exportRecords per la KT.
} else {
  // Genera KT normalmente con nonWarehouseArticles (quantità ridotta per i partial)
  exportRecords.push({ invoiceNumber: `KT ${docNumber}/${esercizio}`, arcaData: ktArcaData })
}
```

### Generazione FT companion (se `warehouseArticles.length > 0`)

```typescript
const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT')

const arcaDataFt = generateArcaDataFromOrder(
  { ...orderData },
  warehouseArticles,   // solo articoli con qty = warehouseQuantity
  subclient,
  ftNum,
  esercizio,
  'FT',                // tipodoc override
)

exportRecords.push({
  invoiceNumber: `FT ${ftNum}/${esercizio}`,
  arcaData: arcaDataFt,
})

// Salvataggio in DB (idempotente via deterministicId)
const ftCompanionId = deterministicId(userId, esercizio, 'FT', String(ftNum), subclient.codice)
await insertFresisHistoryRecord(pool, {
  id: ftCompanionId,
  source: 'app',
  invoiceNumber: `FT ${ftNum}/${esercizio}`,
  items: warehouseArticles,
  arcaData: arcaDataFt,
  // eredita sub_client, customer, date, discount dal KT parent
})

// Link su order_records (non fresis_history)
await pool.query(
  `UPDATE agents.order_records
   SET warehouse_companion_ft_id = $1
   WHERE id = $2 AND user_id = $3`,
  [ftCompanionId, order.id, userId],
)
```

### Ordine nel VBS per coppia KT + FT companion

```
' --- KT 333/2026 ---
  TIPODOC = KT, NUMERODOC = 333, righe senza warehouse articles (o quantità ridotta)

' --- FT 127/2026 --- (warehouse companion)
  TIPODOC = FT, NUMERODOC = 127, righe con soli articoli da magazzino
```

Entrambi generano la rispettiva riga in `SCADENZE.DBF`.

---

## Frontend

### Documenti `cancellato_in_arca` — visualizzazione barrata

```tsx
const isCancelled = record.currentState === 'cancellato_in_arca'

<div style={{
  textDecoration: isCancelled ? 'line-through' : 'none',
  opacity: isCancelled ? 0.5 : 1,
}}>
  {isCancelled && (
    <span style={{ fontSize: 11, color: '#cc0000', fontWeight: 600 }}>
      CANCELLATO IN ARCA
    </span>
  )}
</div>
```

### Esclusione dalla ricerca storico

Filtro applicato **lato backend** in tutte le query di ricerca storico usate durante la creazione ordine:

```sql
WHERE current_state != 'cancellato_in_arca'
```

### Warning cancellazioni con dati PWA

```tsx
{deletionWarnings.length > 0 && (
  <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: 12 }}>
    ⚠️ {deletionWarnings.length} documenti cancellati in Arca
    contengono dati PWA (tracking/DDT/consegna):
    {deletionWarnings.map(w => (
      <div key={w.invoiceNumber}>
        <strong>{w.invoiceNumber}</strong>
        {w.hasTracking && ' · tracking'}
        {w.hasDdt && ' · DDT'}
        {w.hasDelivery && ' · consegna completata'}
      </div>
    ))}
  </div>
)}
```

### FT companion — indicatore visivo

```tsx
{record.warehouseCompanionFtId && (
  <span style={{ fontSize: 11, color: '#666' }}>
    📦 FT warehouse collegata
  </span>
)}
```

---

## Comportamento ANAGRAFE

Gli errori ANAGRAFE `NUMERO_P` osservati nel log del 19/03 sono probabilmente causati dal fallimento dei doctes precedenti che può corrompere lo stato del cursore VFP. La correzione dei conflitti FT/KT (FASE 5) dovrebbe ridurre drasticamente questi errori eliminando la causa principale. Monitorare il log della sync successiva.

---

## Casi Limite

| Caso | Comportamento |
|---|---|
| PWA crea FT 326, operatore crea FT 326 con stesso CODICECF | FASE 3: update PWA da Arca (stesso documento, 5-arg ID coincide) |
| PWA crea FT 326, operatore crea FT 326 con CODICECF diverso | FASE 5: rinumera FT PWA a 327+ |
| Record importato via percorso legacy (4-arg ID) modificato in Arca | Non viene aggiornato via FASE 3; protetto da re-import via invoice_number |
| Operatore cancella FT già consegnata con tracking PWA | Soft delete + warning in SyncResult |
| KT con TUTTI articoli da magazzino | Nessuna KT in VBS; solo FT companion se warehouseArticles presenti |
| KT con articoli PARZIALMENTE da magazzino | KT con qty ridotta + FT companion con qty warehouse |
| finalize-kt eseguito due volte per stesso ordine | deterministicId su FT companion garantisce idempotenza |

---

## File da Modificare

### Backend
- `src/db/migrations/029-arca-bidirectional-sync.sql` ← NUOVO
- `src/services/ft-counter.ts` — aggiunge parametro `tipodoc` obbligatorio
- `src/services/arca-sync-service.ts` — fasi 2-5 + FT companion + call sites `getNextDocNumber`
- `src/services/generate-arca-data-from-order.ts` — supporto `tipodoc` override ('FT' vs 'KT')

### Frontend
- Componenti lista storico Fresis — stile barrato + badge + warning
- Query/service storico durante creazione ordine — aggiunge filtro `current_state != 'cancellato_in_arca'`

### Test
- `src/services/arca-sync-service.spec.ts` — test per update, soft delete, renumber, FT companion
- `src/services/ft-counter.spec.ts` — test per counter separato FT/KT
