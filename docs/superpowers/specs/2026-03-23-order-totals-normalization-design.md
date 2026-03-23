# Order Totals Normalization — Design Spec

**Date:** 2026-03-23
**Status:** Final
**Scope:** Frontend + Backend — tutti i punti del flusso economico ordine

---

## 1. Contesto e Problema

### Flusso ordine

```
OrderFormSimple → PendingOrder (localStorage/DB) → PendingOrdersPage
    → PDF preview → submit-order (backend) → Archibald ERP
    → FresisHistoryPage → PDF FT/KT
```

In ogni stadio vengono ricalcolati importi con formule leggermente diverse, producendo differenze di centesimi tra le fasi.

### Precisione decimali per sistema

| Sistema | Precisione campi economici |
|---------|---------------------------|
| ArcaPro (DBF locale) | 8 decimali (Double, B8@8) — es. `PREZZOUN=20.49200000` |
| Archibald ERP (online) | 2 decimali — es. `PREZZOTOT=31.95` |
| PWA frontend/backend | 2 decimali (target) |

**Regola fondamentale**: Archibald ERP è l'unico sistema non modificabile. Tutto si normalizza a **2 decimali** come l'ERP. I dati da ArcaPro DBF vengono arrotondati a 2 decimali al punto di ingresso.

---

## 2. Modello economico ERP Archibald (fonte di verità)

Verificato su 16 righe reali da `agents.order_articles` + 3 ordini KT da `agents.fresis_history`.

### Calcolo riga (PREZZOTOT)

```
PREZZOTOT = round2(PREZZOUN × QUANTITA × (1 − lineDiscount/100))
```

dove `round2(x) = Math.round(x * 100) / 100`.

Ogni riga è arrotondata indipendentemente.

### Sconto globale documento (SCONTIF)

SCONTIF è un fattore moltiplicativo di testata (1 = nessuno sconto; 0.37 per sconto 63%). Non modifica i singoli PREZZOTOT nei record di riga.

### IVA — gestione per gruppo aliquota

Archibald ERP **non gestisce IVA**. L'IVA è responsabilità del nostro sistema.
Formula verificata su ordini KT reali:

```
Per ogni aliquota IVA r:
  imponibile_r = round2( sum_r(PREZZOTOT_i) × SCONTIF )
  iva_r        = round2( imponibile_r × r / 100 )
totale = sum(imponibile_r) + sum(iva_r)
```

Il round avviene una sola volta per gruppo aliquota, **non** per riga.

### Campi testata — formule autoritative

| Campo | Formula | Note |
|-------|---------|------|
| TOTMERCE | `sum(PREZZOTOT_i)` | somma righe, nessun round aggiuntivo |
| TOTNETTO | **`round2(TOTMERCE × SCONTIF)`** | **formula autoritativa** |
| TOTSCONTO | `TOTMERCE − TOTNETTO` | derivato, non autoritativo; no round2 aggiuntivo (entrambi i termini hanno già ≤2 dec.) |
| TOTIMP | `sum(imponibile_r)` | somma di valori già arrotondati |
| TOTIVA | `sum(iva_r)` | somma di valori già arrotondati |
| TOTDOC | `TOTIMP + TOTIVA` | **mai** applicare round2 ulteriore |

**Nota critica su TOTNETTO vs TOTSCONTO**: `round2(TOTMERCE × SCONTIF) + round2(TOTMERCE × (1−SCONTIF))` non è necessariamente uguale a `TOTMERCE` (possibile gap di 0.01 €). La formula autoritativa è `TOTNETTO = round2(TOTMERCE × SCONTIF)`. `TOTSCONTO` si deriva come semplice sottrazione `TOTMERCE − TOTNETTO` senza ulteriore round2 (la differenza di due multipli interi di 0.01 è sempre un multiplo intero di 0.01).

**Nota critica su TOTDOC**: `TOTIMP + TOTIVA` è sempre esatta perché entrambi sono somme di `round2()` già applicati. **Non** applicare `round2` al totale finale — questo introdurrebbe centesimi spuri.

---

## 3. Architettura — modulo canonico `arca-math.ts`

### Vincolo O-1 e strategia anti-drift

Frontend e backend sono separati (regola O-1). Creiamo **due file distinti** con logica identica:

- `archibald-web-app/frontend/src/utils/arca-math.ts`
- `archibald-web-app/backend/src/utils/arca-math.ts`

**Prevenzione drift**: entrambi i file devono iniziare con il seguente blocco di warning, visibile prima di qualsiasi codice:

```typescript
// =============================================================================
// ⚠️  ATTENZIONE — FILE DUPLICATO (regola O-1: frontend e backend separati)
//
// Questo file esiste in due copie identiche:
//   • archibald-web-app/frontend/src/utils/arca-math.ts
//   • archibald-web-app/backend/src/utils/arca-math.ts
//
// Qualsiasi modifica alla logica, alle firme delle funzioni o ai casi edge
// DEVE essere applicata ad ENTRAMBE le copie contemporaneamente.
//
// Se stai modificando solo questo file, fermati e aggiorna anche l'altro.
// =============================================================================
```

I test golden dataset (§7.2) sono duplicati nei due `arca-math.spec.ts`. L'enforcement è a code review: qualsiasi modifica a un file `arca-math.ts` deve essere riflessa nell'altro. Non è richiesto un gate CI automatizzato per la sincronizzazione dei sorgenti (fuori scope).

### API del modulo

```typescript
/** round2(x) = Math.round(x * 100) / 100 */
export function round2(value: number): number

/**
 * Importo riga netto: round2(qty × price × (1 − discountPercent/100))
 * discountPercent è un numero semplice (non stringa a cascata).
 */
export function arcaLineAmount(
  quantity: number,
  unitPrice: number,
  lineDiscountPercent: number
): number

/**
 * Fattore sconto a cascata: "10+5" → 0.9 × 0.95 = 0.855
 * Casi edge:
 *   - stringa vuota o undefined → 1 (nessuno sconto)
 *   - singolo valore "28.05" → 1 − 0.2805 = 0.7195
 *   - componente non-numerica (es. "N/A") → trattata come 0 (nessuno sconto su quel componente)
 * Uso: parseFloat di ogni segmento separato da "+"; reduce moltiplicando (1 − seg/100)
 */
export function cascadeDiscountFactor(discountStr: string | undefined): number

/**
 * Calcola IVA raggruppata per aliquota (single round per gruppo, non per riga).
 * scontif = 1 se nessuno sconto globale.
 */
export function arcaVatGroups(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number
): ReadonlyArray<{ vatRate: number; imponibile: number; iva: number }>

/**
 * Totali documento completi.
 * shippingCost (opz) è trattato come spesetr: imponibile extra con shippingVatRate.
 * acconto e abbuono sono sempre 0 — fuori scope per la PWA.
 * Totale spedizione: round2(shippingCost × (1 + shippingVatRate/100)) se presente.
 * shippingCost è opaco nel return value: è già assorbito in totImp e totIva.
 * Callers che vogliono mostrare "Spedizione: X €" devono usare shippingCost direttamente.
 * TOTDOC = TOTIMP + TOTIVA — mai applicare round2 ulteriore.
 */
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

### Principio di enforcement

Nessun'altra parte del codebase calcola importi economici senza delegare a `arca-math.ts`. Enforcement: commento `// arca-math-bypass: <reason>` obbligatorio su qualsiasi calcolo diretto non banale (es. display-only senza side effect). Reviewable a code review.

---

## 4. File da modificare

| File | Problema | Fix |
|------|---------|-----|
| `frontend/src/utils/arca-math.ts` | **da creare** | Nuovo modulo canonico |
| `backend/src/utils/arca-math.ts` | **da creare** | Copia identica backend |
| `frontend/src/utils/order-calculations.ts` | `archibaldLineAmount` duplicato; `calculateOrderTotals` IVA senza round per gruppo | Delega ad `arca-math`; mantiene export `archibaldLineAmount` come re-export per retrocompatibilità temporanea |
| `frontend/src/utils/arca-totals.ts` | `calculateRowTotal` e `calculateArcaTotals` con IVA accumulata senza round per gruppo; TOTNETTO derivato in modo non-autoritativo | Delega a `arca-math`; `calculateArcaTotals` diventa wrapper di `arcaDocumentTotals` |
| `frontend/src/services/pdf-export.service.ts` | `lineSubtotal` non arrotondato; IVA accumulata senza round per gruppo; totali finali non arrotondati | Usa `arcaLineAmount` + `arcaDocumentTotals` |
| `frontend/src/pages/PendingOrdersPage.tsx` | IVA calcolata per riga invece che per gruppo | Usa `arcaDocumentTotals` |
| `frontend/src/components/OrderFormSimple.tsx` | `total` non salvato nei `PendingOrderItem`; `discountPercent` non propagato | Salva `total = arcaLineAmount(...)` per ogni item + `discountPercent` corretto (vedi §5) |
| `frontend/src/utils/arca-document-generator.ts` | Usa `calculateRowTotal` / `calculateArcaTotals` | Delega ad `arca-math` |
| `frontend/src/components/arca/ArcaTabRiepilogo.tsx` | `groupByIva` accumula IVA per riga senza round per gruppo | Usa `arcaVatGroups` |
| `frontend/src/components/OrderCardNew.tsx` | `recalcLineAmounts` usa `archibaldLineAmount` OK; `vatAmount` e `lineTotalWithVat` calcolati per riga senza round per gruppo | Fix IVA display: usa `arcaVatGroups`; note che questo file è display-only (non persiste dati) |
| `backend/src/operations/handlers/submit-order.ts` | `archibaldLineAmount` duplicato; IVA per riga; `calculateAmounts` applica sconto sul totale invece che per-gruppo | Usa `arca-math` backend; `gross_amount` in DB = `TOTNETTO` (= `round2(totMerce × scontif)`) |
| `frontend/src/pages/FresisHistoryPage.tsx` | Audit: verifica che `discountPercent` SCONTIF sia correttamente passato a `pdf-export.service.ts` | Audit + fix SCONTIF se necessario; confermato in scope |
| `frontend/src/utils/revenue-calculation.ts` | Audit: potrebbe contenere calcoli economici propri | Audit: se trova calcoli, delega ad `arca-math`; altrimenti nessun cambiamento |

---

## 5. Semantica di `PendingOrderItem.total` e migrazione

### Decisione

`total?: number` rimane **opzionale** (non si fa breaking change al tipo).
Semantica canonica: `total` = **netto riga senza IVA** = `arcaLineAmount(qty, price, discountPercent)`.

**Fallback obbligatorio** per ogni consumer che legge `total`:
```typescript
const net = item.total ?? arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
```
Questo fallback deve essere identico in tutti i file (mai l'espressione non-arrotondata `item.price * item.quantity * ...`).

### Migrazione ordini esistenti in localStorage

Gli ordini già presenti in localStorage con `total = undefined` continuano a funzionare grazie al fallback. Non è necessaria una migration one-shot. Il fallback `arcaLineAmount` produce risultati corretti anche per ordini vecchi (stessa formula). Gli ordini già sincronizzati in DB che hanno `total` nel campo JSON `items` mantengono il valore storico come riferimento ERP.

### `discountPercent` nel `PendingOrder`

`PendingOrder.discountPercent` è sempre un numero semplice rappresentante la percentuale di sconto globale (es. `63` per Fresis). **Non** può essere una stringa a cascata — `cascadeDiscountFactor` è riservato al parsing dei campi `SCONTI` di ArcaPro DBF. `SCONTIF = 1 − discountPercent/100`.

---

## 6. Normalizzazione dati da ArcaPro DBF

I campi economici ArcaPro (PREZZOUN, PREZZOTOT, TOTIMP, TOTDOC, TOTIVA ecc.) hanno 8 decimali nel DBF. Al punto di ingresso (parsing record DBF), applicare `round2()` prima di qualsiasi calcolo o persistenza.

---

## 7. Strategia di test

### 7.1 Unit test — `arca-math.spec.ts`

Colocati in entrambe le directory (frontend + backend). Test identici.

- `round2`: property-based con `fast-check` (idempotenza: `round2(round2(x)) === round2(x)`)
- `arcaLineAmount`: golden dataset da 16 righe reali (vedi §7.2)
- `cascadeDiscountFactor`: singolo, doppio, vuoto, NaN component
- `arcaVatGroups`: 3 ordini KT reali (vedi §7.2)
- `arcaDocumentTotals`: invariante `totDoc === totImp + totIva` con property test. L'uguaglianza `===` è safe perché `totImp` e `totIva` sono somme di multipli interi di 0.01 (output di `round2`); la loro somma è ancora un multiplo intero di 0.01 e non richiede arrotondamento — nessun accumulo di errori IEEE 754 se non si applica `round2` extra.
- `arcaDocumentTotals`: con shipping, senza shipping, scontif=1

### 7.2 Golden dataset completo

File: `__tests__/arca-math.golden.ts`

```typescript
// 16 righe da order 51.318 — verificate contro agents.order_articles
export const GOLDEN_ROWS = [
  { qty: 5,  price:  8.88, disc: 28.05, expected:  31.95 },
  { qty: 5,  price: 17.64, disc: 28.05, expected:  63.46 },
  { qty: 5,  price: 16.25, disc: 28.05, expected:  58.46 },
  { qty: 5,  price: 26.78, disc: 28.05, expected:  96.34 },
  { qty: 1,  price: 51.00, disc: 28.07, expected:  36.68 },
  // rimanenti 11 righe da recuperare con:
  // SELECT article_code, quantity, unit_price, discount_percent, line_amount
  // FROM agents.order_articles WHERE order_id = (
  //   SELECT id FROM agents.order_records WHERE order_number = '51.318'
  // ) ORDER BY article_code
] as const;

// 3 ordini KT da agents.fresis_history — scontif=1
export const GOLDEN_KT_ORDERS = [
  { totnetto: 213.12, vatRate: 22, expectedIva: 46.89, expectedTotDoc: 260.01 },
  { totnetto: 204.93, vatRate: 22, expectedIva: 45.08, expectedTotDoc: 250.01 },
  { totnetto: 327.87, vatRate: 22, expectedIva: 72.13, expectedTotDoc: 400.00 },
] as const;
```

I rimanenti 11 golden rows vengono generati via query sul DB produzione prima dell'implementazione.

### 7.3 Test di integrazione cross-layer

Backend integration test: `submit-order` salva in DB `gross_amount` identico a `arcaDocumentTotals.totNetto` calcolato frontend per lo stesso ordine.

### 7.4 Test di regressione PDF

Snapshot test in `pdf-export.service.spec.ts`: per un `PendingOrder` campione fissato, i totali del PDF corrispondono a `arcaDocumentTotals`.

---

## 8. Invarianti post-deploy

1. `arcaLineAmount(qty, price, disc)` restituisce sempre esattamente 2 decimali.
2. `arcaDocumentTotals` restituisce `totDoc === totImp + totIva` (uguaglianza esatta, no round aggiuntivo).
3. `PendingOrderItem.total` quando presente = netto riga (no IVA); fallback = `arcaLineAmount`.
4. `PendingOrder.discountPercent` è sempre un numero semplice; `SCONTIF = 1 − discountPercent/100`.
5. `pdf-export.service.ts` non contiene logica di calcolo economico autonoma.
6. Le due copie di `arca-math.ts` sono sincronizzate (commento + test identici = gate CI).

---

## 9. Fuori scope

- Modifica al bot (`archibald-bot.ts`) — il bot continua a settare qty e discount; l'ERP ricalcola i totali autonomamente.
- Modifica alla struttura DB (nessuna migration richiesta).
- `acconto` e `abbuono` — sempre 0 nella PWA, non modellati.
- Cambio formato DBF ArcaPro.
