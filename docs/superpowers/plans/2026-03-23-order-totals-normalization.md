# Order Totals Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre il modulo canonico `arca-math.ts` (frontend + backend) e aggiornare tutti i file che calcolano importi economici per usarlo, eliminando le discrepanze di centesimi nel flusso completo degli ordini.

**Architecture:** Un singolo modulo `arca-math.ts` per ogni lato (frontend/backend, regola O-1) esporta tutte le funzioni di calcolo — `round2`, `arcaLineAmount`, `cascadeDiscountFactor`, `arcaVatGroups`, `arcaDocumentTotals`. Tutti gli altri file che oggi contengono logica di calcolo propria vengono aggiornati per delegare a questo modulo. Il calcolo IVA diventa per-gruppo (non per-riga), allineando la PWA al comportamento verificato su dati ERP reali.

**Tech Stack:** TypeScript strict, Vitest, fast-check (property tests), jsPDF (pdf-export — no test framework, solo smoke test manuale)

**Spec:** `docs/superpowers/specs/2026-03-23-order-totals-normalization-design.md`

---

## File Map

| Azione | File |
|--------|------|
| **CREATE** | `frontend/src/utils/arca-math.ts` |
| **CREATE** | `frontend/src/utils/arca-math.spec.ts` |
| **CREATE** | `backend/src/utils/arca-math.ts` |
| **CREATE** | `backend/src/utils/arca-math.spec.ts` |
| **MODIFY** | `frontend/src/utils/arca-totals.ts` |
| **MODIFY** | `frontend/src/utils/order-calculations.ts` |
| **MODIFY** | `frontend/src/services/pdf-export.service.ts` |
| **MODIFY** | `frontend/src/pages/PendingOrdersPage.tsx` |
| **MODIFY** | `frontend/src/components/OrderFormSimple.tsx` ← 4 punti: handleSubmit + calculateTotals + loading + global discount |
| **MODIFY** | `frontend/src/components/CustomerHistoryModal.tsx` ← buildPendingItem: total/subtotal senza round2 |
| **MODIFY** | `frontend/src/utils/arca-document-generator.ts` |
| **MODIFY** | `frontend/src/components/arca/ArcaTabRiepilogo.tsx` |
| **MODIFY** | `frontend/src/components/OrderCardNew.tsx` |
| **MODIFY** | `backend/src/operations/handlers/submit-order.ts` |
| **AUDIT** | `frontend/src/pages/FresisHistoryPage.tsx` |
| **AUDIT** | `frontend/src/utils/revenue-calculation.ts` |

---

## Task 1: Crea frontend `arca-math.ts`

**Files:**
- Create: `archibald-web-app/frontend/src/utils/arca-math.ts`
- Create: `archibald-web-app/frontend/src/utils/arca-math.spec.ts`

- [ ] **Step 1.1: Scrivi il test fallente**

Crea `archibald-web-app/frontend/src/utils/arca-math.spec.ts`:

```typescript
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  round2,
  arcaLineAmount,
  cascadeDiscountFactor,
  arcaVatGroups,
  arcaDocumentTotals,
} from "./arca-math";

// Dati reali da agents.order_articles (ordine ORD/25003448, 100% match ERP)
const GOLDEN_ROWS = [
  { qty: 1,  price: 174.40, disc: 70.40, expected:  51.62 },
  { qty: 2,  price:  16.64, disc: 45.01, expected:  18.30 },
  { qty: 7,  price: 167.20, disc: 45.00, expected: 643.72 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 10, price:  11.29, disc: 70.40, expected:  33.42 },
  { qty: 5,  price:  11.29, disc: 70.40, expected:  16.71 },
  { qty: 5,  price:  11.29, disc: 70.40, expected:  16.71 },
  { qty: 10, price:  10.27, disc: 70.40, expected:  30.40 },
  { qty: 10, price:  19.37, disc: 70.40, expected:  57.34 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:  15.78, disc: 70.41, expected:  23.35 },
  { qty: 1,  price: 332.09, disc: 70.40, expected:  98.30 },
  { qty: 10, price:   7.29, disc: 70.40, expected:  21.58 },
  { qty: 5,  price:   5.50, disc: 70.40, expected:   8.14 },
] as const;

// 3 ordini KT reali da agents.fresis_history (scontif=1, IVA 22%)
const GOLDEN_KT_ORDERS = [
  { totNetto: 213.12, vatRate: 22, expectedIva: 46.89, expectedTotDoc: 260.01 },
  { totNetto: 204.93, vatRate: 22, expectedIva: 45.08, expectedTotDoc: 250.01 },
  { totNetto: 327.87, vatRate: 22, expectedIva: 72.13, expectedTotDoc: 400.00 },
] as const;

describe("round2", () => {
  test("arrotonda a 2 decimali", () => {
    expect(round2(1.256)).toBe(1.26);
    expect(round2(1.254)).toBe(1.25);
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });

  test("idempotenza: round2(round2(x)) === round2(x)", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10000, noNaN: true }), (x) =>
        round2(round2(x)) === round2(x),
      ),
    );
  });
});

describe("arcaLineAmount", () => {
  test("golden dataset: 16 righe ERP reali", () => {
    for (const row of GOLDEN_ROWS) {
      expect(arcaLineAmount(row.qty, row.price, row.disc)).toBe(row.expected);
    }
  });

  test("zero quantità → 0", () => {
    expect(arcaLineAmount(0, 10, 20)).toBe(0);
  });

  test("zero sconto → qty × price arrotondato", () => {
    // 3 × 1.336 = 4.008 → round2 = 4.01 (valore sicuro in IEEE 754: 400.8 >> 400.5)
    expect(arcaLineAmount(3, 1.336, 0)).toBe(4.01);
  });

  test("sconto 100% → 0", () => {
    expect(arcaLineAmount(5, 100, 100)).toBe(0);
  });
});

describe("cascadeDiscountFactor", () => {
  test("stringa vuota → 1 (nessuno sconto)", () => {
    expect(cascadeDiscountFactor("")).toBe(1);
    expect(cascadeDiscountFactor(undefined)).toBe(1);
  });

  test("sconto singolo: '28.05' → 0.7195", () => {
    expect(cascadeDiscountFactor("28.05")).toBeCloseTo(0.7195, 6);
  });

  test("sconto cascata: '10+5' → 0.855", () => {
    expect(cascadeDiscountFactor("10+5")).toBeCloseTo(0.855, 6);
  });

  test("componente non numerica → 1 (nessuno sconto su quel componente)", () => {
    expect(cascadeDiscountFactor("N/A")).toBe(1);
  });
});

describe("arcaVatGroups", () => {
  test("golden KT: per-gruppo, scontif=1", () => {
    for (const order of GOLDEN_KT_ORDERS) {
      const lines = [{ prezzotot: order.totNetto, vatRate: order.vatRate }];
      const groups = arcaVatGroups(lines, 1);
      expect(groups).toEqual([
        { vatRate: order.vatRate, imponibile: order.totNetto, iva: order.expectedIva },
      ]);
    }
  });

  test("aliquote miste: round per gruppo indipendente", () => {
    const lines = [
      { prezzotot: 100, vatRate: 22 },
      { prezzotot: 50, vatRate: 4 },
    ];
    const groups = arcaVatGroups(lines, 1);
    expect(groups).toEqual([
      { vatRate: 22, imponibile: 100, iva: 22 },
      { vatRate: 4, imponibile: 50, iva: 2 },
    ]);
  });

  test("scontif < 1: imponibile = round2(sum × scontif)", () => {
    const lines = [{ prezzotot: 200, vatRate: 22 }];
    const groups = arcaVatGroups(lines, 0.9);
    expect(groups).toEqual([{ vatRate: 22, imponibile: 180, iva: 39.6 }]);
  });
});

describe("arcaDocumentTotals", () => {
  test("invariante: totDoc === totImp + totIva (property test)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            prezzotot: fc.float({ min: 0, max: 1000, noNaN: true }),
            vatRate: fc.constantFrom(4, 10, 22),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.float({ min: 0.1, max: 1, noNaN: true }),
        (lines, scontif) => {
          const t = arcaDocumentTotals(lines, scontif);
          // Uguaglianza esatta safe perché totImp e totIva sono somme di interi × 0.01
          return t.totDoc === t.totImp + t.totIva;
        },
      ),
    );
  });

  test("caso base: riga singola, scontif=1, no spedizione", () => {
    const lines = [{ prezzotot: 100, vatRate: 22 }];
    expect(arcaDocumentTotals(lines, 1)).toEqual({
      totMerce: 100,
      totSconto: 0,
      totNetto: 100,
      totImp: 100,
      totIva: 22,
      totDoc: 122,
    });
  });

  test("TOTNETTO autoritativo: round2(totMerce × scontif)", () => {
    const lines = [{ prezzotot: 200, vatRate: 22 }];
    const t = arcaDocumentTotals(lines, 0.9);
    expect(t.totNetto).toBe(180);
    expect(t.totSconto).toBe(20);
    expect(t.totIva).toBe(39.6);
    expect(t.totDoc).toBe(219.6);
  });

  test("con spedizione: inclusa in totImp e totIva, opaca al caller", () => {
    const lines = [{ prezzotot: 100, vatRate: 22 }];
    const t = arcaDocumentTotals(lines, 1, 10, 22);
    expect(t.totImp).toBe(110);
    expect(t.totIva).toBe(24.2);
    expect(t.totDoc).toBe(134.2);
  });

  test("righe vuote → tutti 0", () => {
    expect(arcaDocumentTotals([], 1)).toEqual({
      totMerce: 0, totSconto: 0, totNetto: 0,
      totImp: 0, totIva: 0, totDoc: 0,
    });
  });

  test("golden KT: ordini reali da fresis_history", () => {
    for (const order of GOLDEN_KT_ORDERS) {
      const lines = [{ prezzotot: order.totNetto, vatRate: order.vatRate }];
      const t = arcaDocumentTotals(lines, 1);
      expect(t.totIva).toBe(order.expectedIva);
      expect(t.totDoc).toBe(order.expectedTotDoc);
    }
  });
});
```

- [ ] **Step 1.2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-math.spec
```

Expected: FAIL — "Cannot find module './arca-math'"

- [ ] **Step 1.3: Implementa `arca-math.ts`**

Crea `archibald-web-app/frontend/src/utils/arca-math.ts`:

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

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function arcaLineAmount(
  quantity: number,
  unitPrice: number,
  lineDiscountPercent: number,
): number {
  return round2(quantity * unitPrice * (1 - lineDiscountPercent / 100));
}

export function cascadeDiscountFactor(discountStr: string | undefined): number {
  if (!discountStr || discountStr.trim() === "") return 1;
  const parts = discountStr.split("+").map((s) => parseFloat(s.trim()));
  // NaN component (es. "N/A") = 0% sconto su quel componente → factor invariato
  return parts.reduce((factor, d) => (isNaN(d) ? factor : factor * (1 - d / 100)), 1);
}

export function arcaVatGroups(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number,
): ReadonlyArray<{ vatRate: number; imponibile: number; iva: number }> {
  const map = new Map<number, number>();
  for (const line of lines) {
    map.set(line.vatRate, (map.get(line.vatRate) ?? 0) + line.prezzotot);
  }
  return Array.from(map.entries()).map(([vatRate, sumPrezzotot]) => {
    const imponibile = round2(sumPrezzotot * scontif);
    return { vatRate, imponibile, iva: round2(imponibile * vatRate / 100) };
  });
}

export function arcaDocumentTotals(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number,
  shippingCost?: number,
  shippingVatRate?: number,
): {
  totMerce: number;
  totSconto: number;
  totNetto: number;
  totImp: number;
  totIva: number;
  totDoc: number;
} {
  const totMerce = lines.reduce((sum, l) => sum + l.prezzotot, 0);
  const totNetto = round2(totMerce * scontif);
  const totSconto = totMerce - totNetto;

  const groups = arcaVatGroups(lines, scontif);
  let totImp = groups.reduce((sum, g) => sum + g.imponibile, 0);
  let totIva = groups.reduce((sum, g) => sum + g.iva, 0);

  if (shippingCost != null && shippingCost > 0) {
    const vatRate = shippingVatRate ?? 22;
    totImp += shippingCost;
    totIva = round2(totIva + round2(shippingCost * vatRate / 100));
  }

  return { totMerce, totSconto, totNetto, totImp, totIva, totDoc: totImp + totIva };
}
```

- [ ] **Step 1.4: Esegui i test e verifica che passino**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-math.spec
```

Expected: PASS — tutti i test ✓

- [ ] **Step 1.5: Commit**

```bash
git add archibald-web-app/frontend/src/utils/arca-math.ts \
        archibald-web-app/frontend/src/utils/arca-math.spec.ts
git commit -m "feat(arca-math): add canonical economic calculations module (frontend)"
```

---

## Task 2: Crea backend `arca-math.ts`

**Files:**
- Create: `archibald-web-app/backend/src/utils/arca-math.ts`
- Create: `archibald-web-app/backend/src/utils/arca-math.spec.ts`

- [ ] **Step 2.1: Copia il test (identico al frontend)**

Crea `archibald-web-app/backend/src/utils/arca-math.spec.ts` — **contenuto identico** a `frontend/src/utils/arca-math.spec.ts`. Cambia solo il path di import:
```typescript
import { ... } from "./arca-math"; // stesso path relativo
```

- [ ] **Step 2.2: Esegui il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --run arca-math.spec
```

Expected: FAIL — "Cannot find module './arca-math'"

- [ ] **Step 2.3: Copia l'implementazione**

Crea `archibald-web-app/backend/src/utils/arca-math.ts` — **contenuto identico** a `frontend/src/utils/arca-math.ts`. Il commento di warning in cima deve fare riferimento a entrambi i path.

- [ ] **Step 2.4: Esegui i test backend**

```bash
npm test --prefix archibald-web-app/backend -- --run arca-math.spec
```

Expected: PASS — tutti i test ✓

- [ ] **Step 2.5: Type-check backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK, nessun errore TypeScript.

- [ ] **Step 2.6: Commit**

```bash
git add archibald-web-app/backend/src/utils/arca-math.ts \
        archibald-web-app/backend/src/utils/arca-math.spec.ts
git commit -m "feat(arca-math): add canonical economic calculations module (backend)"
```

---

## Task 3: Aggiorna `arca-totals.ts` per delegare a `arca-math`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/arca-totals.ts`
- Test: `archibald-web-app/frontend/src/utils/arca-totals.spec.ts` (esiste già, non modificare)

**Obiettivo:** `calculateArcaTotals` e `calculateRowTotal` delegano a `arca-math`. La firma pubblica rimane invariata, quindi i test esistenti devono continuare a passare.

- [ ] **Step 3.1: Verifica che i test esistenti passino (baseline)**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-totals.spec
```

Expected: PASS — 8 test ✓ (baseline prima delle modifiche)

- [ ] **Step 3.2: Riscrivi `arca-totals.ts`**

Sostituisci l'intero contenuto di `archibald-web-app/frontend/src/utils/arca-totals.ts`:

```typescript
import type { ArcaRiga } from "../types/arca-data";
import { round2, arcaVatGroups, arcaDocumentTotals, cascadeDiscountFactor } from "./arca-math";

export function parseCascadeDiscount(sconti: string): number {
  const s = sconti.trim();
  if (!s) return 0;
  const parts = s.split("+").map((p) => parseFloat(p.trim()));
  if (parts.some(isNaN)) return 0;
  let factor = 1;
  for (const pct of parts) {
    factor *= 1 - pct / 100;
  }
  return Math.round((1 - factor) * 10000) / 100;
}

export function cascadeDiscountToFactor(sconti: string): number {
  return cascadeDiscountFactor(sconti);
}

export type ArcaTotals = {
  totmerce: number;
  totsconto: number;
  totnetto: number;
  totimp: number;
  totiva: number;
  totdoc: number;
  totesen: number;
};

type ArcaRigaForTotals = Pick<ArcaRiga, "PREZZOTOT" | "ALIIVA">;

type SpeseTotals = {
  spesetr: number;
  speseim: number;
  speseva: number;
  spesetriva: string;
  speseimiva: string;
  spesevaiva: string;
};

export function calculateArcaTotals(
  righe: ArcaRigaForTotals[],
  scontif: number,
  spese: SpeseTotals,
  acconto: number,
  abbuono: number,
): ArcaTotals {
  // Separa righe esenti (ALIIVA non numerica o 0) da righe tassate
  const nonExemptLines = righe
    .filter((r) => parseFloat(r.ALIIVA) > 0)
    .map((r) => ({ prezzotot: r.PREZZOTOT, vatRate: parseFloat(r.ALIIVA) }));

  const totesen = round2(
    righe
      .filter((r) => !(parseFloat(r.ALIIVA) > 0))
      .reduce((s, r) => s + r.PREZZOTOT, 0),
  );

  // Totale merce include tutte le righe (tassate + esenti)
  const totMerceAll = round2(righe.reduce((s, r) => s + r.PREZZOTOT, 0));
  const totNetto = round2(totMerceAll * scontif);
  const totSconto = totMerceAll - totNetto;

  // Calcola VAT solo sulle righe tassate (con spedizione principale)
  const shippingCost = spese.spesetr > 0 ? spese.spesetr : undefined;
  const shippingVatRate =
    spese.spesetr > 0 ? parseFloat(spese.spesetriva) || 22 : undefined;
  const vatTotals = arcaDocumentTotals(
    nonExemptLines,
    scontif,
    shippingCost,
    shippingVatRate,
  );

  // Spese extra (speseim, speseva) — di norma 0
  const extraImp = spese.speseim + spese.speseva;
  let extraIva = 0;
  if (spese.speseim > 0) {
    extraIva += round2(spese.speseim * (parseFloat(spese.speseimiva) || 0) / 100);
  }
  if (spese.speseva > 0) {
    extraIva += round2(spese.speseva * (parseFloat(spese.spesevaiva) || 0) / 100);
  }

  // totimp = VAT imponibile (righe tassate + spedizione) + esenti + spese extra
  const exemptNetto = round2(totesen * scontif);
  const totimp = round2(vatTotals.totImp + exemptNetto + extraImp);
  const totiva = round2(vatTotals.totIva + extraIva);
  const totdoc = round2(totimp + totiva - acconto - abbuono);

  return {
    totmerce: totMerceAll,
    totsconto: totSconto,
    totnetto: totNetto,
    totimp,
    totiva,
    totdoc,
    totesen,
  };
}

export function calculateRowTotal(
  prezzoun: number,
  quantita: number,
  sconti: string,
): number {
  const factor = cascadeDiscountFactor(sconti);
  return round2(prezzoun * quantita * factor);
}
```

- [ ] **Step 3.2b: Aggiungi test per comportamento per-gruppo IVA**

In `archibald-web-app/frontend/src/utils/arca-totals.spec.ts`, aggiungi il seguente test al gruppo `calculateArcaTotals` esistente:

```typescript
test("IVA calcolata per-gruppo (non per-riga): due righe stessa aliquota → round unico", () => {
  // Senza per-gruppo: round(33.33*0.22) + round(33.34*0.22) = 7.33+7.33 = 14.66
  // Con per-gruppo:   round((33.33+33.34)*0.22) = round(66.67*0.22) = round(14.67) = 14.67
  const righe = [
    { PREZZOTOT: 33.33, ALIIVA: "22" },
    { PREZZOTOT: 33.34, ALIIVA: "22" },
  ];
  const spese = { spesetr: 0, speseim: 0, speseva: 0, spesetriva: "", speseimiva: "", spesevaiva: "" };
  const result = calculateArcaTotals(righe, 1, spese, 0, 0);
  expect(result.totiva).toBe(14.67); // per-gruppo: corretto
});
```

- [ ] **Step 3.3: Esegui i test esistenti + il nuovo**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-totals.spec
```

Expected: PASS — tutti 9 test ✓ (8 esistenti + 1 nuovo per-gruppo)

- [ ] **Step 3.4: Commit**

```bash
git add archibald-web-app/frontend/src/utils/arca-totals.ts
git commit -m "refactor(arca-totals): delegate to arca-math canonical module"
```

---

## Task 4: Aggiorna `order-calculations.ts` — re-export da arca-math

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/order-calculations.ts`
- Test: `archibald-web-app/frontend/src/utils/order-calculations.spec.ts` (esiste già, non modificare)

**Obiettivo:** Rimuovi la definizione locale di `archibaldLineAmount` (riga 217-223) e importala da `arca-math`. La firma pubblica rimane invariata.

- [ ] **Step 4.1: Verifica baseline**

```bash
npm test --prefix archibald-web-app/frontend -- --run order-calculations.spec
```

Expected: PASS (baseline)

- [ ] **Step 4.2: Sostituisci la definizione locale**

In `archibald-web-app/frontend/src/utils/order-calculations.ts`:

1. Aggiungi in cima (dopo gli import esistenti):
```typescript
import { arcaLineAmount as arcaLineAmountCanonical } from "./arca-math";
```

2. Rimuovi la funzione `archibaldLineAmount` esistente (righe 217-223) e sostituiscila con un re-export:
```typescript
// Re-export da arca-math — stessa formula, stessa firma
export const archibaldLineAmount = arcaLineAmountCanonical;
```

- [ ] **Step 4.3: Esegui i test esistenti**

```bash
npm test --prefix archibald-web-app/frontend -- --run order-calculations.spec
```

Expected: PASS — tutti i test ✓

- [ ] **Step 4.4: Commit**

```bash
git add archibald-web-app/frontend/src/utils/order-calculations.ts
git commit -m "refactor(order-calculations): re-export archibaldLineAmount from arca-math"
```

---

## Task 5: Fix `pdf-export.service.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/services/pdf-export.service.ts`

**Bugs da correggere:**
1. **Riga 77**: `lineSubtotal` fallback non usa `arcaLineAmount` (manca arrotondamento)
2. **Righe 313-319**: vatMap accumula IVA per-riga (nessun round per gruppo)
3. **Righe 328-330**: totImp e totIva non arrotondati per gruppo

- [ ] **Step 5.1: Aggiorna gli import in cima al file**

Aggiungi ai primi import di `pdf-export.service.ts` (un solo blocco completo):
```typescript
import { arcaLineAmount, arcaVatGroups, arcaDocumentTotals, round2 } from "../utils/arca-math";
```

- [ ] **Step 5.2: Fix `lineSubtotal` (riga 76-77)**

Sostituisci:
```typescript
const lineSubtotal = (item: PendingOrderItem): number =>
  item.total ?? item.price * item.quantity * (1 - (item.discount || 0) / 100);
```
Con:
```typescript
const lineSubtotal = (item: PendingOrderItem): number =>
  item.total ?? arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
```

- [ ] **Step 5.3: Fix calcolo totali (righe 300-330)**

Sostituisci il blocco che va dalla riga 300 (`const totalMerce = ...`) fino alla riga 330 (`const totFattura = totImp + totIva`):

```typescript
const scontif = 1 - (order.discountPercent ?? 0) / 100;
const lines = order.items.map((item) => ({
  prezzotot: lineSubtotal(item),
  vatRate: item.vat ?? 0,
}));

// totNetto per soglia spedizione (senza spedizione)
const { totNetto: totalNetto } = arcaDocumentTotals(lines, scontif);
const totalMerce = lines.reduce((s, l) => s + l.prezzotot, 0);

const shipping = order.noShipping
  ? { cost: 0, tax: 0, total: 0 }
  : order.shippingCost !== undefined
    ? {
        cost: order.shippingCost,
        tax: order.shippingTax ?? 0,
        total: order.shippingCost + (order.shippingTax ?? 0),
      }
    : calculateShippingCosts(totalNetto);

// Costruisce vatMap per le righe di display nel PDF (round per gruppo)
const vatGroups = arcaVatGroups(lines, scontif);
const vatMap = new Map<number, { imp: number; tax: number }>(
  vatGroups.map((g) => [g.vatRate, { imp: g.imponibile, tax: g.iva }]),
);
if (shipping.cost > 0) {
  const r = 22;
  const prev = vatMap.get(r) ?? { imp: 0, tax: 0 };
  // Usa round2(cost * 22/100) anziché shipping.tax per garantire coerenza con arcaDocumentTotals
  // (calculateShippingCosts restituisce già 22% ma lo ricalcoliamo esplicitamente)
  const shippingIva = round2(shipping.cost * r / 100);
  vatMap.set(r, { imp: prev.imp + shipping.cost, tax: round2(prev.tax + shippingIva) });
}
const vatRates = [...vatMap.entries()].sort((a, b) => a[0] - b[0]);
const nVatRows = Math.max(vatRates.length, 1);

const totImp = [...vatMap.values()].reduce((s, v) => s + v.imp, 0);
const totIva = [...vatMap.values()].reduce((s, v) => s + v.tax, 0);
const totFattura = totImp + totIva;
```

Nota: questa modifica aggiunge l'import di `arcaDocumentTotals` che non era nei Task 5.1 — aggiungilo all'import:
```typescript
import { arcaLineAmount, arcaVatGroups, arcaDocumentTotals, round2 } from "../utils/arca-math";
```

- [ ] **Step 5.4: Crea test di snapshot totali PDF**

Crea `archibald-web-app/frontend/src/services/pdf-export.service.spec.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { arcaLineAmount, arcaDocumentTotals } from "../utils/arca-math";

// Verifica che la logica totali usata in pdf-export produca risultati coerenti
// con il golden dataset (stessa formula, no per-riga divergenza)
describe("pdf-export totals snapshot", () => {
  test("ordine FT: due righe stessa IVA → per-gruppo non per-riga", () => {
    const items = [
      { quantity: 2, price: 50.00, discount: 0, vat: 22 },
      { quantity: 1, price: 33.34, discount: 0, vat: 22 },
    ];
    const lines = items.map((item) => ({
      prezzotot: arcaLineAmount(item.quantity, item.price, item.discount),
      vatRate: item.vat,
    }));
    const scontif = 1; // nessuno sconto globale
    const { totImp, totIva, totDoc } = arcaDocumentTotals(lines, scontif);
    // totMerce = 100 + 33.34 = 133.34
    // totImp = 133.34 (scontif=1)
    // totIva = round2(133.34 * 0.22) = round2(29.3348) = 29.33
    // totDoc = 133.34 + 29.33 = 162.67
    expect(totImp).toBe(133.34);
    expect(totIva).toBe(29.33);
    expect(totDoc).toBe(162.67);
  });

  test("ordine KT golden: totDoc = totNetto × 1.22 arrotondato per-gruppo", () => {
    const GOLDEN_KT = [
      { totNetto: 213.12, expectedIva: 46.89, expectedTotDoc: 260.01 },
      { totNetto: 204.93, expectedIva: 45.08, expectedTotDoc: 250.01 },
      { totNetto: 327.87, expectedIva: 72.13, expectedTotDoc: 400.00 },
    ];
    for (const order of GOLDEN_KT) {
      const lines = [{ prezzotot: order.totNetto, vatRate: 22 }];
      const { totIva, totDoc } = arcaDocumentTotals(lines, 1);
      expect(totIva).toBe(order.expectedIva);
      expect(totDoc).toBe(order.expectedTotDoc);
    }
  });
});
```

- [ ] **Step 5.4b: Esegui il test**

```bash
npm test --prefix archibald-web-app/frontend -- --run pdf-export.service.spec
```

Expected: PASS — 2 test ✓

- [ ] **Step 5.5: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: nessun errore TypeScript.

- [ ] **Step 5.6: Commit**

```bash
git add archibald-web-app/frontend/src/services/pdf-export.service.ts \
        archibald-web-app/frontend/src/services/pdf-export.service.spec.ts
git commit -m "fix(pdf-export): use arcaLineAmount fallback and per-group VAT rounding"
```

---

## Task 6: Fix `PendingOrdersPage.tsx` — IVA per gruppo

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

**Bug:** Righe ~1903-1911 calcolano IVA per-riga invece che per-gruppo.

- [ ] **Step 6.1: Trova le righe da modificare**

In `PendingOrdersPage.tsx`, cerca il blocco che calcola `itemsVAT` (intorno a riga 1900). Il codice attuale fa qualcosa del tipo:
```typescript
const itemsVAT = order.items.reduce((sum, item) => {
  const lineAmount = itemSubtotal(order, item);
  const lineAfterGlobalDiscount = Math.round(lineAmount * (1 - ...) * 100) / 100;
  return sum + Math.round(lineAfterGlobalDiscount * (item.vat / 100) * 100) / 100;
}, 0);
```

- [ ] **Step 6.2: Aggiungi l'import di `arcaDocumentTotals`**

Aggiungi nel blocco import di `PendingOrdersPage.tsx` (vicino agli import esistenti da `order-calculations`):
```typescript
import { arcaDocumentTotals } from "../utils/arca-math";
```

- [ ] **Step 6.3: Sostituisci il blocco totali (righe 1883-1916)**

Il blocco attuale in `PendingOrdersPage.tsx` (righe 1883-1916) calcola `orderSubtotal`, `subtotalAfterGlobalDiscount`, `shippingCosts`, `itemsVAT` per-riga, e `orderTotal`. Sostituisci **l'intero blocco** con:

```typescript
// SOSTITUISCE le righe 1883-1916:
const scontif = 1 - (order.discountPercent ?? 0) / 100;
const lines = order.items.map((item) => ({
  prezzotot: itemSubtotal(order, item),
  vatRate: item.vat ?? 0,
}));

// subtotalAfterGlobalDiscount via round2 canonico (TOTNETTO = round2(TOTMERCE × scontif))
const { totNetto: subtotalAfterGlobalDiscount } = arcaDocumentTotals(lines, scontif);

// Spedizione: usa il subtotale netto come soglia (identico alla logica esistente)
const shippingCosts = order.noShipping
  ? { cost: 0, tax: 0, total: 0 }
  : calculateShippingCosts(subtotalAfterGlobalDiscount);
const shippingCost = shippingCosts.cost;
const shippingTax = shippingCosts.tax;

// Totali documento con IVA per-gruppo (non per-riga) + spedizione
const { totImp, totIva, totDoc } = arcaDocumentTotals(
  lines,
  scontif,
  shippingCost > 0 ? shippingCost : undefined,
  shippingCost > 0 ? 22 : undefined,
);
const orderVAT = totIva;
const orderTotal = totDoc;
```

Poi aggiorna i punti in cui il JSX usa `subtotalAfterGlobalDiscount`, `orderVAT`, `orderTotal` — i nomi sono gli stessi, quindi nessun rename necessario nel JSX.

**Importante:** `itemSubtotal` usa già `archibaldLineAmount` (riga 25-30) — non toccare quella funzione.

- [ ] **Step 6.4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 6.5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx
git commit -m "fix(pending-orders): use per-group VAT via arcaDocumentTotals"
```

---

## Task 7: Fix `OrderFormSimple.tsx` — 4 flussi di calcolo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Bugs da correggere (4 punti nel file):**
1. `handleSubmit` (~riga 2695): crea `orderItems` senza il campo `total`
2. `calculateTotals()` (~riga 2547): somma `item.vat` per-riga invece che per-gruppo
3. Caricamento ordine per modifica (~riga 488-527): `subtotal` senza `round2`
4. `onAddArticle` callback (~riga 5259-5273): `subtotal/vat/total` senza `round2`

- [ ] **Step 7.1: Aggiungi import**

```typescript
import { arcaLineAmount, arcaDocumentTotals } from "../utils/arca-math";
```

- [ ] **Step 7.2: Fix `handleSubmit` — aggiungi campo `total`**

Nel mapping `items.map((item) => ({ ... }))` dentro `handleSubmit` (~riga 2695), aggiungi dopo `discount`:
```typescript
total: arcaLineAmount(item.quantity, item.unitPrice, item.discount ?? 0),
```

Questo salva il netto riga senza IVA = `PREZZOTOT` come da semantica ERP.

- [ ] **Step 7.3: Fix `calculateTotals()` — IVA per-gruppo**

Sostituisci la funzione `calculateTotals` (~riga 2547-2574):

```typescript
const calculateTotals = () => {
  const lines = items.map((item) => ({
    prezzotot: item.subtotal,  // item.subtotal è già arcaLineAmount (già arrotondato)
    vatRate: item.vatRate ?? 0,
  }));
  // scontif = 1 perché OrderFormSimple applica il globalDiscount già ai singoli item.discount
  const { totNetto, totImp, totIva, totDoc } = arcaDocumentTotals(lines, 1);

  const finalSubtotal = totNetto;
  const shippingCosts = noShipping
    ? { cost: 0, tax: 0, total: 0 }
    : calculateShippingCosts(finalSubtotal);

  const { totImp: totImpWithShip, totIva: totIvaWithShip, totDoc: finalTotal } =
    shippingCosts.cost > 0
      ? arcaDocumentTotals(lines, 1, shippingCosts.cost, 22)
      : { totImp, totIva, totDoc };

  return {
    itemsSubtotal: totNetto,
    itemsVAT: totIvaWithShip,
    itemsTotal: finalTotal,
    finalSubtotal,
    shippingCost: shippingCosts.cost,
    shippingTax: shippingCosts.tax,
    finalVAT: totIvaWithShip,
    finalTotal,
  };
};
```

**Nota:** `item.subtotal` in `OrderFormSimple` è già calcolato con `round2` per i nuovi item (flusso normal add). Il `scontif=1` è corretto perché lo sconto globale è già baked nel `item.discount` di ogni riga.

- [ ] **Step 7.4: Fix caricamento ordine per modifica (~riga 488-527)**

Cerca il blocco che carica un ordine esistente per edit mode. Il codice attuale è:
```typescript
const subtotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
const vatAmount = subtotal * (vatRate / 100);
```

Sostituisci con:
```typescript
const subtotal = arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
```

- [ ] **Step 7.5: Fix `onAddArticle` callback (~riga 5259-5273)**

Cerca il blocco `const mapped: OrderItem = { ... }` nel callback di `onAddArticle`. Sostituisci i calcoli inline:
```typescript
// PRIMA (senza round2):
subtotal: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100),
vat: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (newItem.vat / 100),
total: newItem.quantity * newItem.price * (1 - (newItem.discount ?? 0) / 100) * (1 + newItem.vat / 100),
```

Con:
```typescript
// DOPO (con arcaLineAmount):
subtotal: arcaLineAmount(newItem.quantity, newItem.price, newItem.discount ?? 0),
vat: Math.round(arcaLineAmount(newItem.quantity, newItem.price, newItem.discount ?? 0) * (newItem.vat / 100) * 100) / 100,
total: (() => {
  const sub = arcaLineAmount(newItem.quantity, newItem.price, newItem.discount ?? 0);
  const v = Math.round(sub * (newItem.vat / 100) * 100) / 100;
  return Math.round((sub + v) * 100) / 100;
})(),
```

- [ ] **Step 7.6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7.7: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "fix(order-form): normalize all economic calculations via arca-math"
```

---

## Task 7b: Fix `CustomerHistoryModal.tsx` — `onAddArticle` mapping

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

**Bug:** `buildPendingItem()` (~riga 202-249) costruisce `PendingOrderItem` con `subtotal/vat/total` senza `round2`. Il discount per cliente diretto viene ricavato a posteriori con un calcolo non arrotondato.

- [ ] **Step 7b.1: Aggiungi import**

```typescript
import { arcaLineAmount } from "../utils/arca-math";
```

- [ ] **Step 7b.2: Fix calcolo `combinedDiscount` per Fresis**

Cerca la riga con `combinedDiscount`:
```typescript
const combinedDiscount = orderDiscountPercent > 0
  ? Math.round((1 - (1 - a.discountPercent / 100) * (1 - orderDiscountPercent / 100)) * 10000) / 100
  : a.discountPercent;
```

Questo calcolo è corretto (percentuale combinata a 2 decimali). Lascialo invariato.

- [ ] **Step 7b.3: Fix `buildPendingItem` output**

In `buildPendingItem()`, quando si costruisce il `PendingOrderItem` da restituire, verifica che il campo `total` sia impostato usando `arcaLineAmount`:

```typescript
// Assicurati che total sia sempre round2(qty × price × (1 - disc/100))
const netSubtotal = arcaLineAmount(quantity, price, discountPercent);
// ...
return {
  // ...
  quantity,
  price,
  discount: discountPercent,
  total: netSubtotal,  // netto riga senza IVA, semantica ERP
  // ...
};
```

- [ ] **Step 7b.4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7b.5: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "fix(customer-history-modal): normalize item totals via arcaLineAmount"
```

---

## Task 8: Fix `arca-document-generator.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/utils/arca-document-generator.ts`
- Test: `archibald-web-app/frontend/src/utils/arca-document-generator.spec.ts` (esiste già)

- [ ] **Step 8.1: Verifica baseline**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-document-generator.spec
```

Expected: PASS (baseline)

- [ ] **Step 8.2: Sostituisci gli import da `arca-totals` con `arca-math`**

In `arca-document-generator.ts`, sostituisci:
```typescript
import { calculateArcaTotals, calculateRowTotal } from "./arca-totals";
```
Con:
```typescript
import { arcaLineAmount, arcaDocumentTotals, cascadeDiscountFactor } from "./arca-math";
import type { ArcaTotals } from "./arca-totals";
```

- [ ] **Step 8.3: Aggiorna `itemToArcaRiga`**

La chiamata `calculateRowTotal(item.price, item.quantity, sconti)` diventa:
```typescript
const factor = cascadeDiscountFactor(sconti);
const prezzotot = arcaLineAmount(item.quantity, item.price, (1 - factor) * 100);
```

Oppure più direttamente (se `sconti` è sempre un numero semplice):
```typescript
const prezzotot = arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
```

Verifica quale variante è corretta leggendo il codice di `itemToArcaRiga` nel file.

- [ ] **Step 8.4: Verifica dipendenza `totesen` in `generateArcaData`**

Leggi `generateArcaData` nel file. Cerca se il campo `totesen` (righe IVA esenti) viene acceduto o passato all'output.

**⚠️ Se usa `totesen`:** NON sostituire la chiamata a `calculateArcaTotals`. Il Task 3 ha già riscritto `calculateArcaTotals` per delegare a `arca-math`, quindi il fix IVA per-gruppo è già attivo transitivamente. Salta al Step 8.5.

**Solo se NON usa `totesen`:** Sostituisci `calculateArcaTotals(righe, scontif, spese, 0, 0)` con:
```typescript
const totals = arcaDocumentTotals(
  righe.map((r) => ({ prezzotot: r.PREZZOTOT, vatRate: parseFloat(r.ALIIVA) || 0 })),
  scontif,
  spesetr > 0 ? spesetr : undefined,
  spesetr > 0 ? 22 : undefined,
);
```

- [ ] **Step 8.5: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- --run arca-document-generator.spec
```

Expected: PASS

- [ ] **Step 8.6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 8.7: Commit**

```bash
git add archibald-web-app/frontend/src/utils/arca-document-generator.ts
git commit -m "refactor(arca-document-generator): delegate to arca-math"
```

---

## Task 9: Fix `ArcaTabRiepilogo.tsx` — IVA per gruppo

**Files:**
- Modify: `archibald-web-app/frontend/src/components/arca/ArcaTabRiepilogo.tsx`

**Bug:** `groupByIva` (righe 32-78) accumula IVA per riga senza round per gruppo.

- [ ] **Step 9.1: Aggiungi import**

```typescript
import { arcaVatGroups } from "../../utils/arca-math";
```

- [ ] **Step 9.2: Sostituisci `groupByIva` con `arcaVatGroups`**

Trova il blocco che calcola `groupByIva` (gira intorno alle righe 32-78). La chiamata `groupByIva(righe, scontif)` deve essere sostituita con:

```typescript
const vatGroups = arcaVatGroups(
  righe
    .filter((r) => parseFloat(r.ALIIVA) > 0)
    .map((r) => ({ prezzotot: r.PREZZOTOT, vatRate: parseFloat(r.ALIIVA) })),
  scontif,
);
```

Poi, nei render dei dati IVA, usa `vatGroups[i].imponibile` e `vatGroups[i].iva` invece dei valori calcolati da `groupByIva`.

- [ ] **Step 9.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 9.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/arca/ArcaTabRiepilogo.tsx
git commit -m "fix(arca-tab-riepilogo): use per-group VAT rounding via arcaVatGroups"
```

---

## Task 10: Fix `OrderCardNew.tsx` — IVA display (solo display)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

**Bug:** `recalcLineAmounts` (riga ~644) calcola `vatAmount` per-riga senza round per gruppo. Questo file è **display-only** (non persiste dati).

- [ ] **Step 10.1: Aggiungi import**

```typescript
import { arcaVatGroups, round2 } from "../utils/arca-math";
```

- [ ] **Step 10.2: Fix `recalcLineAmounts`**

Il calcolo per-riga di `vatAmount` e `lineTotalWithVat` rimane corretto per il display di singole righe (ogni riga mostra la propria IVA approssimativa). Questo è display-only e il lieve delta tra somma per-riga vs per-gruppo è accettabile nell'interfaccia.

L'importante è che il **totale visualizzato per l'intero ordine** usi `arcaDocumentTotals`. Cerca nella funzione che calcola i totali del card (non `recalcLineAmounts` ma il calcolo aggregato) e sostituisci con `arcaDocumentTotals`.

```typescript
import { arcaDocumentTotals, arcaLineAmount } from "../utils/arca-math";
// Nel calcolo del totale ordine del card:
const scontif = 1 - (order.discountPercent ?? 0) / 100;
const lines = items.map(item => ({
  prezzotot: arcaLineAmount(item.quantity, item.unitPrice, item.discountPercent),
  vatRate: item.vatPercent,
}));
const { totDoc, totIva } = arcaDocumentTotals(lines, scontif);
```

- [ ] **Step 10.3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 10.4: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "fix(order-card): use arcaDocumentTotals for order total display"
```

---

## Task 11: Fix backend `submit-order.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`

**Bug:** `archibaldLineAmount` duplicata (riga 55-57); `calculateAmounts` applica sconto globale al totale anziché per-gruppo.

- [ ] **Step 11.1: Sostituisci l'import e la definizione locale**

In cima al file, aggiungi:
```typescript
import { arcaLineAmount, round2 } from '../../utils/arca-math';
```

Rimuovi la funzione locale `archibaldLineAmount` (righe 55-57).

- [ ] **Step 11.2: Aggiorna `calculateAmounts`**

Sostituisci la funzione `calculateAmounts` (righe 59-72):

```typescript
function calculateAmounts(
  items: SubmitOrderItem[],
  discountPercent?: number,
): { grossAmount: number; total: number } {
  const grossAmount = items.reduce((sum, item) => {
    return sum + arcaLineAmount(item.quantity, item.price, item.discount ?? 0);
  }, 0);

  const scontif = 1 - (discountPercent ?? 0) / 100;
  const total = round2(grossAmount * scontif);

  return { grossAmount, total };
}
```

**Nota semantica:** `grossAmount` = TOTMERCE (somma righe), `total` = TOTNETTO = `round2(TOTMERCE × SCONTIF)`. Questo allinea i valori salvati in DB con il modello ERP.

- [ ] **Step 11.2b: Scrivi test di integrazione per `calculateAmounts`**

Crea o estendi `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts` (se non esiste, crealo).

Aggiungi il seguente test (le due funzioni sono locali al modulo, testale come unit test estraendo il calcolo):

```typescript
import { describe, expect, test } from "vitest";
import { arcaLineAmount, round2 } from "../../utils/arca-math";

// Replica il comportamento di calculateAmounts per garantire coerenza con arca-math
describe("submit-order calculateAmounts semantics", () => {
  test("grossAmount = somma arcaLineAmount, total = round2(grossAmount × scontif)", () => {
    const items = [
      { quantity: 7,  price: 167.20, discount: 45.00 },
      { quantity: 10, price: 11.29,  discount: 70.40 },
    ];
    const expectedGross = arcaLineAmount(7, 167.20, 45.00) + arcaLineAmount(10, 11.29, 70.40);
    // = 643.72 + 33.42 = 677.14
    expect(expectedGross).toBe(677.14);
    const discountPercent = 10;
    const expectedTotal = round2(677.14 * 0.9);
    // = round2(609.426) = 609.43
    expect(expectedTotal).toBe(609.43);
  });

  test("sconto globale 0% → total === grossAmount", () => {
    const gross = arcaLineAmount(1, 100, 0);
    expect(round2(gross * 1)).toBe(100);
  });
});
```

- [ ] **Step 11.3: Esegui i test del handler**

```bash
npm test --prefix archibald-web-app/backend -- --run submit-order
```

Se non esiste un test per `submit-order`, esegui tutti i test backend per verificare nessuna regressione:

```bash
npm test --prefix archibald-web-app/backend
```

- [ ] **Step 11.4: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: build OK.

- [ ] **Step 11.5: Commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts
git commit -m "fix(submit-order): use arca-math and canonical TOTNETTO formula"
```

---

## Task 12: Audit `FresisHistoryPage.tsx` e `revenue-calculation.ts`

**Files:**
- Audit: `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`
- Audit: `archibald-web-app/frontend/src/utils/revenue-calculation.ts`

- [ ] **Step 12.1: Audit `revenue-calculation.ts`**

Leggi il file (17 righe totali). La funzione `calculateItemRevenue` calcola il margine per articolo:
```typescript
const prezzoCliente = unitPrice * quantity * (1 - itemDiscount/100) * (1 - globalDiscount/100)
```

Questa espressione NON è arrotondata. Si tratta di un calcolo di revenue/margine (non di importo di documento), quindi il mancato arrotondamento ha impatto solo sulla precisione interna del margine visualizzato. **Non richiede fix urgente** ma aggiungere `round2` migliora la coerenza:

Se il calcolo di `prezzoCliente` è usato per display di margine (non per totali documento), aggiungi:
```typescript
import { round2 } from "./arca-math";
// ...
const prezzoCliente = round2(unitPrice * quantity * (1 - itemDiscount/100) * (1 - globalDiscount/100));
```

Se il calcolo è display-only e non alimenta PDF/totali, questo fix è MINOR — a tua discrezione.

- [ ] **Step 12.2: Audit `FresisHistoryPage.tsx` — passaggio discountPercent**

Cerca in `FresisHistoryPage.tsx` la funzione `handleDownloadPDF` (~riga 436-512). Verifica che `discountPercent` passato a `pdf-export.service.ts` corrisponda a `(1 - SCONTIF) × 100`:

- Per ordini con `arca_data.testata`: controlla che `testata.SCONTI` sia convertito correttamente in percentuale
- Per ordini KT (senza testata): `discountPercent = 0` → `scontif = 1` ✓
- Per ordini senza `arca_data`: usa `order.discountPercent` ✓

Se trovi che `testata.SCONTI` viene passato come stringa cascade e non come numero, aggiungi la conversione:
```typescript
import { cascadeDiscountFactor } from "../utils/arca-math";
// Converti SCONTI stringa → discountPercent numero
const discountFromSconti = testata?.SCONTI
  ? (1 - cascadeDiscountFactor(testata.SCONTI)) * 100
  : 0;
```

- [ ] **Step 12.3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 12.4: Commit**

```bash
git add archibald-web-app/frontend/src/utils/revenue-calculation.ts \
        archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx
git commit -m "fix: audit FresisHistoryPage discount passthrough and revenue rounding"
```

---

## Task 13: Test suite completa + type-check finale

- [ ] **Step 13.1: Test frontend completi**

```bash
npm test --prefix archibald-web-app/frontend
```

Expected: PASS — nessuna regressione su test esistenti + nuovi test arca-math.

- [ ] **Step 13.2: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: PASS — nessuna regressione.

- [ ] **Step 13.3: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 13.4: Build backend**

```bash
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 13.5: Commit finale se necessario**

```bash
# Verifica se restano modifiche non ancora committate
git status
# Aggiungi SOLO i file specifici che risultano modified/untracked (es. documentazione, file audit)
# NON usare git add -A — ogni task ha già il proprio commit
# Se non restano file, skip questo step
```

---

## Checklist pre-deploy

Prima di fare push/deploy, verificare manualmente:

1. Crea un ordine test in PWA (OrderFormSimple) → `total` per ogni item è presente nel localStorage
2. Apri PendingOrdersPage → i totali visualizzati corrispondono all'ordine creato
3. Genera PDF da PendingOrdersPage → totImp + totIva = totFattura senza centesimi spuri
4. Genera PDF da FresisHistoryPage (ordine FT) → stessi totali del PDF precedente
5. Genera PDF da FresisHistoryPage (ordine KT con scontif=1) → totDoc ≈ totnetto × 1.22

> **Nota E2E (obbligatoria per modifiche bot):** Questo piano NON modifica `archibald-bot.ts`. Il bot non richiede test E2E su produzione per questa feature.
