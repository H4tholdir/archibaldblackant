# Order Totals Normalization — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Frontend + Backend — tutti i punti del flusso economico ordine

---

## 1. Contesto e Problema

### Flusso attuale

```
OrderFormSimple → PendingOrder (localStorage) → PendingOrdersPage
    → PDF preview → submit-order (backend) → Archibald ERP
    → FresisHistoryPage → PDF FT/KT
```

In ogni stadio vengono ricalcolati importi (subtotale riga, IVA, totale) con formule leggermente diverse, producendo differenze di centesimi tra le fasi.

### Precisione decimali per sistema

| Sistema | Precisione campi economici |
|---------|---------------------------|
| ArcaPro (DBF locale) | 8 decimali (Double, B8@8) — es. `PREZZOUN=20.49200000` |
| Archibald ERP (online) | 2 decimali — es. `PREZZOTOT=31.95` |
| PWA frontend/backend | 2 decimali (target) |

**Regola fondamentale**: Archibald ERP è l'unico sistema che non possiamo modificare. Tutti i valori devono essere normalizzati a **2 decimali** come fa l'ERP. Quando leggiamo dati da ArcaPro DBF, arrotondiamo a 2 decimali al punto di ingresso.

---

## 2. Modello economico ERP Archibald (fonte di verità)

Verificato su 16 righe reali da `agents.order_articles` + `agents.fresis_history`.

### Calcolo riga (PREZZOTOT)

```
PREZZOTOT = round2(PREZZOUN × QUANTITA × (1 − lineDiscount/100))
```

dove `round2(x) = Math.round(x * 100) / 100`.

**Non** accumula: ogni riga è arrotondata indipendentemente.

### Sconto globale documento (SCONTIF)

SCONTIF è un fattore moltiplicativo applicato a livello di testata (default 1 = nessuno sconto; 0.37 per sconto 63%).
Archibald ERP **non** moltiplica SCONTIF per PREZZOTOT nei singoli record di riga. Il fattore viene applicato sul totale merce nel calcolo degli aggregati di testata.

### IVA — gestione per gruppo aliquota

Archibald ERP **non gestisce IVA**. L'IVA è responsabilità del nostro sistema.
Formula corretta (verificata su ordini KT reali):

```
Per ogni aliquota IVA `r`:
  imponibile_r = round2( sum_r(PREZZOTOT_i) × SCONTIF )
  iva_r        = round2( imponibile_r × r / 100 )
totale = sum(imponibile_r) + sum(iva_r)
```

**Importante**: il round avviene una sola volta per gruppo aliquota, **non** per riga.

### Campi testata calcolati da noi (FT/KT)

| Campo | Formula |
|-------|---------|
| TOTMERCE | `sum(PREZZOTOT_i)` — solo righe, prima di SCONTIF |
| TOTSCONTO | `round2(TOTMERCE × (1 − SCONTIF))` |
| TOTNETTO | `round2(TOTMERCE × SCONTIF)` = `TOTMERCE − TOTSCONTO` |
| TOTIMP | `sum(imponibile_r)` (= TOTNETTO se aliquota unica) |
| TOTIVA | `sum(iva_r)` |
| TOTDOC | `TOTIMP + TOTIVA` |

---

## 3. Architettura — modulo canonico `arca-math.ts`

### Vincolo O-1

Frontend e backend sono separati. Creiamo **due copie identiche** (stessa logica, stessa API):

- `archibald-web-app/frontend/src/utils/arca-math.ts`
- `archibald-web-app/backend/src/utils/arca-math.ts`

### API del modulo

```typescript
// Arrotondamento standard a 2 decimali
export function round2(value: number): number

// Importo riga: round2(qty × price × (1 - discountPercent/100))
export function arcaLineAmount(
  quantity: number,
  unitPrice: number,
  lineDiscountPercent: number
): number

// Fattore sconto a cascata: "10+5" → 0.9 × 0.95 = 0.855
export function cascadeDiscountFactor(discountStr: string): number

// IVA per gruppo aliquota (single round per group, no round per row)
export function arcaVatGroups(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number
): ReadonlyArray<{ vatRate: number; imponibile: number; iva: number }>

// Totali documento completi
export function arcaDocumentTotals(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number,
  shippingCost?: number,
  shippingVatRate?: number
): {
  totMerce: number;
  totSconto: number;
  totNetto: number;
  totImp: number;
  totIva: number;
  totDoc: number;
}
```

### Principio chiave

Nessun'altra parte del codebase calcola importi economici dall'esterno di `arca-math.ts`. Tutti i file esistenti che contengono logica di calcolo vengono aggiornati per delegare a questo modulo.

---

## 4. File da modificare

| File | Problema | Fix |
|------|---------|-----|
| `frontend/src/utils/arca-math.ts` | **da creare** | Nuovo modulo canonico |
| `backend/src/utils/arca-math.ts` | **da creare** | Copia identica backend |
| `frontend/src/utils/order-calculations.ts` | `archibaldLineAmount` duplicato; `calculateOrderTotals` IVA senza round per gruppo | Rimuove duplicato, delega ad `arca-math` |
| `frontend/src/utils/arca-totals.ts` | `calculateArcaTotals` e `calculateRowTotal` divergono da `arcaDocumentTotals` | Rimuove o wrappa su `arca-math` |
| `frontend/src/services/pdf-export.service.ts` | `lineSubtotal` non arrotondato; IVA accumulata senza round per gruppo; totali finali non arrotondati | Usa `arcaLineAmount` + `arcaDocumentTotals` |
| `frontend/src/pages/PendingOrdersPage.tsx` | IVA calcolata per riga invece che per gruppo | Usa `arcaDocumentTotals` |
| `frontend/src/components/OrderFormSimple.tsx` | `total` non salvato nei `PendingOrderItem`; `discountPercent` non salvato | Salva `total = arcaLineAmount(...)` per ogni item + `discountPercent` corretto |
| `frontend/src/utils/arca-document-generator.ts` | Usa `calculateRowTotal` / `calculateArcaTotals` esistenti | Delega ad `arca-math` |
| `frontend/src/components/arca/ArcaTabRiepilogo.tsx` | `groupByIva` round per gruppo OK ma formula `totale` potenzialmente diversa da `arcaDocumentTotals` | Allinea a `arcaDocumentTotals` |
| `backend/src/operations/handlers/submit-order.ts` | `archibaldLineAmount` duplicato; IVA per riga | Usa modulo `arca-math` backend |
| `frontend/src/pages/FresisHistoryPage.tsx` | PDF FT/KT usa `pdf-export.service.ts` (già fixato), ma verifica che `discountPercent` SCONTIF sia correttamente passato | Audit + fix se necessario |

### Semantica di `PendingOrderItem.total`

**Decisione**: `total` = **netto riga senza IVA** = `arcaLineAmount(qty, price, discountPercent)`.
Questo è consistente con i dati reali in `fresis_history` (PREZZOTOT del ERP).
`OrderFormSimple` deve correggere il salvataggio per usare questa semantica.

---

## 5. Normalizzazione dati da ArcaPro

Quando i dati arrivano da ArcaPro DBF (sync locale via File System Access API):

- `PREZZOUN`, `PREZZOTOT`, `TOTIMP`, `TOTDOC` ecc. hanno 8 decimali nel DBF
- Al punto di ingresso (parsing del record DBF), applicare `round2()` prima di persistere
- Dopo round2, la pipeline è identica a qualsiasi altro ordine

---

## 6. Strategia di test

### 6.1 Unit test — `arca-math.spec.ts`

Colocato nella stessa directory del modulo. Test per ogni funzione esportata:

- `round2`: property-based con `fast-check` (additività, idempotenza)
- `arcaLineAmount`: golden data da 16 righe ERP reali
- `cascadeDiscountFactor`: casi singolo/multiplo/zero/negativo
- `arcaVatGroups`: verificato contro 3 ordini KT reali da `fresis_history`
- `arcaDocumentTotals`: round-trip, coerenza interna (totDoc = totImp + totIva)

### 6.2 Golden dataset

File `arca-math.golden.ts` (in `__tests__/`) con:

```typescript
export const GOLDEN_ROWS = [
  // 16 righe da order 51.318 con qty, price, disc, expectedLineAmount
  { qty: 5, price: 8.88, disc: 28.05, expected: 31.95 },
  // ...
]

export const GOLDEN_ORDERS = [
  // 3 ordini KT da fresis_history con scontif=1
  { totnetto: 213.12, vatRate: 22, expectedIva: 46.89, expectedTotDoc: 260.01 },
  // ...
]
```

### 6.3 Test di integrazione cross-layer

Backend integration test: verifica che `submit-order` salvi in DB gli stessi importi che il frontend calcolavrebbe per lo stesso ordine (stesso articolo, qty, prezzo, sconto).

### 6.4 Test di regressione PDF

Snapshot test: per un `PendingOrder` campione, verifica che `pdf-export.service.ts` produca totali identici a `arcaDocumentTotals`.

---

## 7. Invarianti da mantenere dopo il deploy

1. `arcaLineAmount(qty, price, disc)` restituisce sempre 2 decimali.
2. `arcaDocumentTotals` restituisce `totDoc = totImp + totIva` senza resto.
3. Tutti i campi `total` salvati in `PendingOrderItem` = netto riga (no IVA).
4. `discountPercent` nel `PendingOrder` corrisponde sempre a `(1 - SCONTIF) × 100`.
5. `pdf-export.service.ts` non contiene logica di calcolo proprietaria: usa solo `arca-math`.

---

## 8. Fuori scope

- Modifica al formato di sync con Archibald ERP (bot.ts / archibald-bot.ts) — il bot continua a settare qty e discount; l'ERP ricalcola i totali autonomamente.
- Modifica alla struttura DB (nessuna migration richiesta).
- Cambio al formato DBF ArcaPro.
