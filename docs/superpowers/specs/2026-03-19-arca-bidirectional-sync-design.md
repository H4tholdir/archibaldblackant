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
2. **Mancato aggiornamento**: se un operatore modifica un documento in Arca (es. cambia uno sconto), la PWA mantiene la versione vecchia
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

## Modifiche al Data Model

### Migration 029

```sql
-- 1. Separazione counter FT / KT
ALTER TABLE agents.ft_counter ADD COLUMN IF NOT EXISTS tipodoc TEXT NOT NULL DEFAULT 'FT';
ALTER TABLE agents.ft_counter DROP CONSTRAINT ft_counter_pkey;

INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
SELECT esercizio, user_id, 'KT', last_number
FROM agents.ft_counter WHERE tipodoc = 'FT'
ON CONFLICT DO NOTHING;

ALTER TABLE agents.ft_counter ADD PRIMARY KEY (esercizio, user_id, tipodoc);

-- 2. Link KT → FT companion warehouse
ALTER TABLE agents.fresis_history
  ADD COLUMN IF NOT EXISTS warehouse_companion_ft_id TEXT
  REFERENCES agents.fresis_history(id);
```

### Campi invariati

`current_state` è già `TEXT` libero. Il nuovo valore `'cancellato_in_arca'` non richiede modifiche allo schema SQL. Da aggiornare solo il type union TypeScript in frontend e backend.

---

## Algoritmo `performArcaSync` — Flusso Aggiornato

### FASE 1 — Costruzione mappa Arca

```typescript
// Tre strutture da buildare durante il parse:
arcaDocMap:      Map<"ESERCIZIO|TIPODOC|NUMERODOC|CODICECF", ArcaRecord>
arcaDocKeys:     Set<"ESERCIZIO|TIPODOC|NUMERODOC">   // conflict detection
arcaMaxByTipodoc: Map<"ESERCIZIO|TIPODOC", number>    // max per tipo
```

### FASE 2 — Aggiornamento counter separati

Per ogni combinazione `(ESERCIZIO, TIPODOC)` trovata in Arca:

```sql
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
VALUES ($1, $2, $3, $4)
ON CONFLICT (esercizio, user_id, tipodoc)
DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)
```

### FASE 3 — Import + Update da Arca

Per ogni record in `arcaDocMap`:

```
id = deterministicId(userId, esercizio, tipodoc, numerodoc, codicecf)

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

```
PWA records con source='arca_import' il cui invoice_number NON è in arcaDocMap:
  → UPDATE current_state = 'cancellato_in_arca', state_updated_at = NOW()

  SE il record ha ddt_number IS NOT NULL
     OR tracking_number IS NOT NULL
     OR delivery_completed_date IS NOT NULL:
    → aggiungi a deletionWarnings nel SyncResult
```

### FASE 5 — Normalizzazione numerazione PWA

```
Per ogni record source='app' con arca_data IS NOT NULL:
  key = "ESERCIZIO|TIPODOC|NUMERODOC"

  IF key IN arcaDocKeys:
    // Numero occupato da un documento Arca diverso → rinumera
    tipodoc = arca_data.testata.TIPODOC  // 'FT' o 'KT'
    newNum = getNextDocNumber(pool, userId, esercizio, tipodoc)

    UPDATE agents.fresis_history SET:
      invoice_number        = "{tipodoc} {newNum}/{esercizio}"
      archibald_order_number = "{tipodoc} {newNum}/{esercizio}"
      arca_data             = JSON patch: testata.NUMERODOC = newNum
      updated_at            = NOW()

    renumbered++
```

### FASE 6 — Build exportRecords per VBS

Invariata rispetto al flusso attuale, ma usa i numeri già normalizzati dalla FASE 5.

---

## `SyncResult` — Tipo Aggiornato

```typescript
type SyncResult = {
  imported: number;
  skipped: number;
  exported: number;
  updated: number;          // NUOVO: record aggiornati da Arca
  softDeleted: number;      // NUOVO: record marcati cancellato_in_arca
  renumbered: number;       // NUOVO: record PWA rinumerati
  deletionWarnings: Array<{ // NUOVO: cancellazioni con dati PWA
    invoiceNumber: string;
    hasTracking: boolean;
    hasDdt: boolean;
    hasDelivery: boolean;
  }>;
  ktNeedingMatch: Array<{ orderId: string; customerName: string }>;
  ktMissingArticles: string[];
  errors: string[];
  ftExportRecords: VbsExportRecord[];
  parseStats: NativeParseResult['stats'];
}
```

---

## `getNextDocNumber` — Firma Aggiornata

```typescript
async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',  // NUOVO parametro
): Promise<number>
```

Tutti i chiamanti aggiornati di conseguenza.

---

## Generazione KT + FT Companion Warehouse (`generateKtExportVbs`)

### Rilevamento articoli warehouse

Per ogni KT order eligible, dopo aver caricato gli `order_articles`:

```
warehouseArticles = articles.filter(a => a.warehouseQuantity > 0)
  .map(a => ({ ...a, quantity: a.warehouseQuantity }))

Casistiche:
  qty=10, warehouse_qty=10 → escluso dalla KT, FT qty=10   (fully warehouse)
  qty=10, warehouse_qty=3  → KT qty=7,  FT qty=3           (partial)
  qty=10, warehouse_qty=0  → KT qty=10, non va in FT        (no warehouse)
```

### Generazione FT companion (se warehouseArticles non vuoto)

```typescript
const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT')

const arcaDataFt = generateArcaDataFromOrder(
  { ...orderData },
  warehouseArticles,
  subclient,
  ftNum,
  esercizio,
  'FT',   // tipodoc override
)

// Aggiunta al VBS
exportRecords.push({
  invoiceNumber: `FT ${ftNum}/${esercizio}`,
  arcaData: arcaDataFt,
})

// Salvataggio in DB
const ftCompanionId = deterministicId(userId, esercizio, 'FT', String(ftNum), subclient.codice)
await insertFresisHistoryRecord(pool, {
  id: ftCompanionId,
  source: 'app',
  invoiceNumber: `FT ${ftNum}/${esercizio}`,
  items: warehouseArticles,
  arcaData: arcaDataFt,
  // eredita sub_client, customer, date, discount dal KT parent
})

// Link KT → FT companion
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
  TIPODOC = KT, NUMERODOC = 333, ...righe KT (senza warehouse articles)

' --- FT 127/2026 --- (warehouse companion)
  TIPODOC = FT, NUMERODOC = 127, ...righe warehouse only
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
  {/* contenuto card */}
</div>
```

### Esclusione dalla ricerca storico

Filtro applicato **lato backend** nelle query di ricerca storico usate durante la creazione ordine:

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

Gli errori ANAGRAFE `NUMERO_P` osservati nel log del 19/03 sono probabilmente causati dal fallimento dei doctes precedenti che può corrompere lo stato del cursore VFP per le operazioni successive. La correzione dei conflitti FT/KT (FASE 5) dovrebbe ridurre drasticamente questi errori eliminando la causa principale. Monitorare il log della sync successiva.

---

## Casi Limite

| Caso | Comportamento |
|---|---|
| PWA crea FT 326, operatore crea FT 326 in Arca con stesso CODICECF | FASE 3: update PWA da Arca (stesso documento) |
| PWA crea FT 326, operatore crea FT 326 in Arca con CODICECF diverso | FASE 5: rinumera FT PWA a 327+ |
| Operatore cancella FT già consegnata con tracking PWA | Soft delete + warning in SyncResult |
| KT con tutti articoli da magazzino (`warehouse-XXX`) | Non eligible per KT export; se ha warehouse articles, genera solo FT companion |
| KT companion FT già generata, viene ri-eseguito finalize-kt | `deterministicId` garantisce idempotenza: no duplicati |

---

## File da Modificare

### Backend
- `src/db/migrations/029-arca-bidirectional-sync.sql` ← NUOVO
- `src/services/ft-counter.ts` — aggiunge parametro `tipodoc`
- `src/services/arca-sync-service.ts` — fasi 2-5 + FT companion
- `src/services/generate-arca-data-from-order.ts` — supporto `tipodoc` override

### Frontend
- `src/pages/FresisHistoryPage.tsx` (o equivalente) — stile barrato + warning
- Qualsiasi query che alimenta la ricerca storico durante creazione ordine

### Test
- `src/services/arca-sync-service.spec.ts` — test per update, soft delete, renumber
- `src/services/ft-counter.spec.ts` — test per counter separato FT/KT
