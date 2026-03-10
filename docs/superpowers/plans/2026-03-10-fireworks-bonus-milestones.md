# Fireworks Milestone Bonus Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attivare fuochi d'artificio a stelle (`fireworks`) ogni volta che l'agente supera un milestone del bonus progressivo annuale (es. ogni 75.000€ di fatturato cumulativo annuo), in aggiunta ai coriandoli mensili già esistenti.

**Architecture:** Il backend aggiunge `bonusMilestonesReached: number` al return di `calculateHeroStatus()` usando `currentYearRevenue` e `bonusInterval` già presenti nella funzione. Il frontend aggiorna il tipo `HeroStatusData` e aggiunge una seconda chiamata a `useConfettiCelebration` con `variant: "fireworks"` nel widget hero.

**Tech Stack:** TypeScript, Vitest (backend), React 19, canvas-confetti, localStorage per cooldown

---

## Chunk 1: Backend — aggiungere `bonusMilestonesReached`

### Task 1: Unit test per `bonusMilestonesReached` in `widget-calculations.spec.ts`

**Files:**
- Modify: `archibald-web-app/backend/src/widget-calculations.spec.ts`

- [ ] **Step 1: Aggiungere il test `calculateBonusMilestonesReached` a `widget-calculations.spec.ts`**

Aggiungere in fondo al file dopo tutti i test esistenti:

```typescript
describe("calculateBonusMilestonesReached", () => {
  test.each([
    { yearlyRevenue: 0, bonusInterval: 75_000, expected: 0 },
    { yearlyRevenue: 74_999, bonusInterval: 75_000, expected: 0 },
    { yearlyRevenue: 75_000, bonusInterval: 75_000, expected: 1 },
    { yearlyRevenue: 149_999, bonusInterval: 75_000, expected: 1 },
    { yearlyRevenue: 150_000, bonusInterval: 75_000, expected: 2 },
    { yearlyRevenue: 300_000, bonusInterval: 75_000, expected: 4 },
    { yearlyRevenue: 100_000, bonusInterval: 0, expected: 0 },
    { yearlyRevenue: 100_000, bonusInterval: -1, expected: 0 },
  ])(
    "$yearlyRevenue € / $bonusInterval € → $expected milestone/s",
    ({ yearlyRevenue, bonusInterval, expected }) => {
      expect(calculateBonusMilestonesReached(yearlyRevenue, bonusInterval)).toBe(expected);
    },
  );
});
```

Aggiungere `calculateBonusMilestonesReached` all'import esistente in testa al file (riga 3), **preservando** la riga `import type` separata:

```typescript
import { determineHeroStatus, calculateBonusMilestonesReached } from "./widget-calculations";
import type { WidgetStatus } from "./widget-calculations";
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

```bash
npm test --prefix archibald-web-app/backend -- --run widget-calculations.spec.ts
```

Output atteso: FAIL — `calculateBonusMilestonesReached is not a function` (o simile).

---

### Task 2: Implementare `calculateBonusMilestonesReached` e aggiornare il return di `calculateHeroStatus`

**Files:**
- Modify: `archibald-web-app/backend/src/widget-calculations.ts`

- [ ] **Step 3: Aggiungere la funzione `calculateBonusMilestonesReached` in `widget-calculations.ts`**

Inserire dopo la riga 30 (dopo la definizione di `OrderData`, prima della sezione "WORKING DAYS"):

```typescript
export function calculateBonusMilestonesReached(
  currentYearRevenue: number,
  bonusInterval: number,
): number {
  if (bonusInterval <= 0) return 0;
  return Math.floor(currentYearRevenue / bonusInterval);
}
```

- [ ] **Step 4: Aggiornare il body di `calculateHeroStatus` per includere il nuovo campo**

Nel file `widget-calculations.ts`, alla riga 281 (dopo `const progressNextBonus = ...`), aggiungere:

```typescript
const bonusMilestonesReached = calculateBonusMilestonesReached(currentYearRevenue, bonusInterval);
```

Nel return object (riga 295-309), aggiungere `bonusMilestonesReached` dopo `progressNextBonus`:

```typescript
return {
  status,
  currentMonthRevenue,
  monthlyTarget,
  missingToMonthlyTarget,
  progressMonthly,
  progressNextBonus,
  bonusMilestonesReached,
  microCopy,
  projectedProgress,
  projectedMonthRevenue,
  comparisonPreviousMonth,
  comparisonSameMonthLastYear,
  comparisonYearlyProgress,
  sparkline,
};
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

```bash
npm test --prefix archibald-web-app/backend -- --run widget-calculations.spec.ts
```

Output atteso: tutti i test PASS.

- [ ] **Step 6: Build TypeScript per verificare che compili**

```bash
npm run build --prefix archibald-web-app/backend
```

Output atteso: build completata senza errori.

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/widget-calculations.ts archibald-web-app/backend/src/widget-calculations.spec.ts
git commit -m "feat(widget): add bonusMilestonesReached to calculateHeroStatus"
```

---

## Chunk 2: Frontend — tipo e componente

### Task 3: Aggiornare `HeroStatusData` nel tipo frontend

**Files:**
- Modify: `archibald-web-app/frontend/src/types/dashboard.ts`

- [ ] **Step 8: Aggiungere `bonusMilestonesReached: number` all'interfaccia `HeroStatusData`**

Nel file `frontend/src/types/dashboard.ts`, all'interfaccia `HeroStatusData` (riga 45-60), aggiungere `bonusMilestonesReached` dopo `progressNextBonus`:

```typescript
export interface HeroStatusData {
  status: WidgetStatus;
  currentMonthRevenue: number;
  monthlyTarget: number;
  missingToMonthlyTarget: number;
  progressMonthly: number; // 0-1 decimal (es. 0.64 = 64%)
  progressNextBonus: number; // 0-1 decimal (es. 0.21 = 21%)
  bonusMilestonesReached: number; // numero di milestone bonus annuali raggiunti
  microCopy: string;
  projectedProgress: number;
  projectedMonthRevenue: number;
  comparisonPreviousMonth?: TemporalComparison;
  comparisonSameMonthLastYear?: TemporalComparison;
  comparisonYearlyProgress?: TemporalComparison;
  sparkline?: SparklineData;
}
```

- [ ] **Step 9: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore TypeScript.

---

### Task 4: Aggiungere chiamata `useConfettiCelebration` per fireworks in `HeroStatusWidgetNew.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/widgets/HeroStatusWidgetNew.tsx`

**Nota dipendenza:** questo chunk richiede che il backend (Chunk 1) sia già deployato — i due chunk vanno committati e deployati insieme.

**Nota test:** `useConfettiCelebration` è un side-effect visivo che usa `canvas-confetti` e `localStorage`. Testarlo in unit test richiederebbe mock pesanti (canvas-confetti, localStorage) che violano CLAUDE.md T-4 ("Prefer integration tests over heavy mocking"). Non esistendo un test per il hook esistente (`sideCannons`), non si aggiunge un test per questo secondo call. La verifica è garantita da type-check + test esistenti che non devono regredire.

- [ ] **Step 10: Aggiungere il secondo hook dopo quello esistente (riga 96)**

Nel file `HeroStatusWidgetNew.tsx`, subito dopo la chiamata `useConfettiCelebration` esistente (riga 91-96), aggiungere:

```typescript
useConfettiCelebration({
  enabled: data.bonusMilestonesReached > 0,
  key: `bonus-milestone-${data.bonusMilestonesReached}-${now.getFullYear()}`,
  variant: "fireworks",
  cooldownMs: 365 * 24 * 60 * 60 * 1000,
});
```

Nota: la variabile `now` è già dichiarata a riga 88 (`const now = new Date()`), quindi non serve dichiararla di nuovo.

- [ ] **Step 11: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: nessun errore TypeScript.

- [ ] **Step 12: Test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```

Output atteso: tutti i test PASS.

- [ ] **Step 13: Commit**

```bash
git add archibald-web-app/frontend/src/types/dashboard.ts archibald-web-app/frontend/src/components/widgets/HeroStatusWidgetNew.tsx
git commit -m "feat(widget): trigger star fireworks on each annual bonus milestone"
```

---

## Verifica finale

- [ ] **Step 14: Build backend e frontend completi**

```bash
npm run build --prefix archibald-web-app/backend && npm run type-check --prefix archibald-web-app/frontend
```

Output atteso: entrambi completati senza errori.

- [ ] **Step 15: Test backend completi**

```bash
npm test --prefix archibald-web-app/backend
```

Output atteso: tutti i test PASS.
