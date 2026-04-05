# Spec: Arca Sync — Date Progressive + KT nella Sync Bidirezionale

**Data**: 2026-04-05  
**Status**: Approvato

---

## Contesto

Il sistema di sync tra PWA e ArcaPro usa una numerazione progressiva condivisa FT/KT (indice CANDIDATE `NUMERO_P` su `CODCNT + ESERCIZIO + NUMERODOC`). Il contatore `agents.ft_counter` traccia solo `last_number`, non la data dell'ultimo documento. Questo causa due problemi:

1. **Violazione contabile**: un KT datato marzo può ricevere numero 426 mentre FT 416 è datato aprile — `numero(N) > numero(N-1)` ma `data(N) < data(N-1)`.
2. **KT escluse dalla sync bidirezionale**: `performArcaSync` gestisce solo FT; le KT pendenti (`arca_kt_synced_at IS NULL`) rimangono fuori.

---

## Obiettivo

- Garantire che per ogni coppia di documenti consecutivi: `data(N) <= data(N+1)`
- Includere le KT pendenti nella sync bidirezionale, ordinate cronologicamente insieme alle FT
- Applicare la stessa logica di date alla sync KT individuale (route `/kt-sync`)

---

## Schema DB — Migration 051

```sql
ALTER TABLE agents.ft_counter
  ADD COLUMN last_date DATE;
```

- Nullable inizialmente (record esistenti avranno `NULL`)
- Lettura: sempre `MAX(last_date)` tra riga FT e riga KT per lo stesso `(esercizio, user_id)` — perché condividono NUMERO_P
- Scrittura: `GREATEST(current_last_date, new_date)` atomicamente con l'incremento di `last_number`

---

## Componente 1: `getNextDocNumber` — aggiunta `docDate`

**File**: `archibald-web-app/backend/src/services/ft-counter.ts`

```typescript
async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',
  docDate: string,           // YYYY-MM-DD, nuovo parametro obbligatorio
): Promise<number>
```

La query upsert aggiorna in un solo round-trip:
```sql
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
VALUES ($1, $2, $3, 1, $4)
ON CONFLICT (esercizio, user_id, tipodoc)
DO UPDATE SET
  last_number = agents.ft_counter.last_number + 1,
  last_date   = GREATEST(agents.ft_counter.last_date, $4)
RETURNING last_number
```

Tutti i chiamanti esistenti (`generateKtExportVbs`, `kt-sync.ts`, `arca-sync-service.ts` step 5 e 8) devono passare `docDate`.

---

## Componente 2: `performArcaSync` — traccia `last_date`

**File**: `archibald-web-app/backend/src/services/arca-sync-service.ts`

### Parsing (`parseNativeArcaFiles`)
Aggiunta al risultato del parsing:
```typescript
maxDateByKey: Map<string, string>   // "esercizio|tipodoc" → max DATADOC (YYYY-MM-DD)
```

Popolato leggendo `DATADOC` da ogni record doctes (formato M/D/YYYY → normalizzato a YYYY-MM-DD).

### Aggiornamento ft_counter (step 6)
Dopo l'aggiornamento di `last_number`, aggiorna anche `last_date`:

```typescript
// Per ogni (esercizio, tipodoc) in maxDateByKey
DO UPDATE SET
  last_number = GREATEST(agents.ft_counter.last_number, $newNumber),
  last_date   = GREATEST(agents.ft_counter.last_date, $newDate)
```

Allinea anche il globalMax per entrambi i tipi (logica già esistente alle righe 1256-1274), estesa per allineare anche `last_date`.

### Step 8 — assegnazione numeri FT pendenti
Quando assegna un numero FT (renumber o conferma), passa `arcaData.testata.DATADOC` a `getNextDocNumber`.

---

## Componente 3: `generateKtExportVbs` — numerazione unificata

**File**: `archibald-web-app/backend/src/services/arca-sync-service.ts`

### Calcolo `effective_last_date`

Per ogni esercizio presente negli ordini KT:
```typescript
const { rows } = await pool.query(
  `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
   FROM agents.ft_counter
   WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
  [userId, esercizio]
);
let effectiveLastDate = rows[0]?.max_date ?? '';

// Anche max(DATADOC) tra le FT pendenti nel batch corrente
for (const ft of ftExportRecords) {
  const ftDate = ft.arcaData.testata.DATADOC ?? '';
  if (ftDate > effectiveLastDate) effectiveLastDate = ftDate;
}
```

### Ordinamento KT

Gli ordini KT vengono ordinati per `creationDate ASC` prima dell'assegnazione numeri:
```typescript
ktOrders.sort((a, b) => (a.creationDate ?? '').localeCompare(b.creationDate ?? ''));
```

### Data effettiva per ogni KT

```typescript
const rawDate = order.creationDate?.slice(0, 10) ?? todayIso();
const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate;
effectiveLastDate = docDate;   // aggiorna per la KT successiva
const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);
```

`generateArcaDataFromOrder` NON cambia firma. Il chiamante passa l'oggetto order con `creationDate` sovrascritta dal `docDate` calcolato:
```typescript
const orderParam = { ...order, creationDate: docDate };
generateArcaDataFromOrder(orderParam, articles, subclient, docNumber, esercizio, 'KT');
```

### Ordinamento finale VBS

Tutti i record (FT + KT) vengono ordinati per `DATADOC ASC` prima di essere passati a `generateVbsScript`:
```typescript
exportRecords.sort((a, b) =>
  (a.arcaData.testata.DATADOC ?? '').localeCompare(b.arcaData.testata.DATADOC ?? '')
);
```

---

## Componente 4: Route `/kt-sync` individuale

**File**: `archibald-web-app/backend/src/routes/kt-sync.ts`

### Ordinamento pre-assegnazione

```typescript
orders.sort((a, b) => (a.creation_date ?? '').localeCompare(b.creation_date ?? ''));
```

### `effective_last_date` per esercizio (Map)

Gli ordini possono avere esercizi diversi. Si usa una `Map<string, string>`:

```typescript
// Pre-carica last_date per tutti gli esercizi distinti degli ordini
const effectiveLastDateByEsercizio = new Map<string, string>();
const uniqueEsercizi = new Set(orders.map(o => o.creation_date?.slice(0, 4) ?? currentYear));
for (const esercizio of uniqueEsercizi) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
     FROM agents.ft_counter
     WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
    [userId, esercizio]
  );
  effectiveLastDateByEsercizio.set(esercizio, rows[0]?.max_date ?? '');
}
```

### Data effettiva + numero

```typescript
const esercizio = order.creation_date?.slice(0, 4) ?? currentYear;
let effectiveLastDate = effectiveLastDateByEsercizio.get(esercizio) ?? '';
const rawDate = order.creation_date?.slice(0, 10) ?? todayIso();
const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate;
effectiveLastDateByEsercizio.set(esercizio, docDate); // aggiorna per il prossimo ordine stesso esercizio
const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);
// orderParam costruito con creationDate = docDate prima di chiamare generateArcaDataFromOrder
```

---

## Gestione helper `todayIso()`

Piccola utility locale (non esportata) usata come fallback:
```typescript
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

---

## Testing

### Unit — `getNextDocNumber`
- Verifica che `last_date` venga aggiornato quando `docDate > current_last_date`
- Verifica che `last_date` NON venga retrocessa quando `docDate < current_last_date` (GREATEST)
- Verifica che `last_number` incrementi correttamente insieme a `last_date`

### Integration — `generateKtExportVbs`
- KT con data antecedente a `last_date` riceve `DATADOC = last_date` (non `creation_date`)
- Più KT con date miste vengono ordinate per data ASC prima dell'assegnazione numeri
- Il VBS finale ha i record ordinati per DATADOC ASC
- `last_date` in ft_counter dopo il finalize = data dell'ultimo documento nel batch

### Integration — route `/kt-sync`
- Ordini con `creation_date` vecchia ricevono `DATADOC = last_date` dal contatore
- Gli ordini vengono processati in ordine crescente di data anche se passati in ordine diverso

### Regression
- `parseNativeArcaFiles` popola correttamente `maxDateByKey` da DATADOC in formato M/D/YYYY
- `performArcaSync` aggiorna `last_date` in ft_counter dopo import da doctes.dbf

---

## Note implementative

- `formatArcaDate` (già esistente in `generate-arca-data.ts`) converte YYYY-MM-DD nel formato Arca. Il confronto ISO `docDate > effectiveLastDate` su stringhe YYYY-MM-DD è corretto.
- Quando `last_date IS NULL` (record esistenti post-migration), `COALESCE(..., '')` ritorna `''`. Qualsiasi data ISO è `> ''`, quindi il fallback è trasparente: si usa la data reale dell'ordine.
- `getNextDocNumber` è ri-esportato anche come `getNextFtNumber` (alias). Entrambi richiedono aggiornamento dei chiamanti per aggiungere `docDate`.

---

## File modificati

| File | Tipo modifica |
|------|--------------|
| `backend/src/db/migrations/051-ft-counter-last-date.sql` | Nuovo — ADD COLUMN |
| `backend/src/services/ft-counter.ts` | Modifica — aggiunta param `docDate` obbligatorio |
| `backend/src/services/arca-sync-service.ts` | Modifica — parseNativeArcaFiles, performArcaSync step 6+8, generateKtExportVbs |
| `backend/src/routes/kt-sync.ts` | Modifica — ordinamento + date adjustment con Map per esercizio |
| `backend/src/services/generate-arca-data-from-order.ts` | Nessuna modifica (chiamante passa `creationDate` aggiustata) |
| `backend/src/services/ft-counter.spec.ts` | Modifica — unit test last_date |
| `backend/src/services/arca-sync-service.spec.ts` | Modifica — test nuovi |
| `backend/src/services/kt-sync.integration.spec.ts` | Modifica — test nuovi |
