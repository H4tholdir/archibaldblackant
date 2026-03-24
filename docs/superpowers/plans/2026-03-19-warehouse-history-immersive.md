# Warehouse Check da Storico + Sistema 4-Colori Immersivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il controllo magazzino quando si inserisce un articolo/ordine dallo storico (`CustomerHistoryModal`), e redesignare il sistema warehouse del form `/order` con un tema cromatico immersivo a 4 livelli.

**Architecture:** Due fasi indipendenti che condividono la palette colori. Fase 1: `CustomerHistoryModal` guadagna un pre-fetch batch dei match magazzino → righe tinte → dialog di conferma con diff codice. Fase 2: `WarehouseMatchAccordion` e `OrderFormSimple` redesignati con CSS custom properties che colorano l'intera pagina in base al match level migliore.

**Visual references (APPROVATI):**
- `CustomerHistoryModal`: `.superpowers/brainstorm/vis-1773784935/warehouse-v4.html`
- Form `/order` immersivo: `.superpowers/brainstorm/vis-1773784935/warehouse-immersive-v1.html`

**Tech Stack:** React 19, TypeScript strict, inline `style={{}}`, Vitest

---

## File Structure

### Nuovi file
- `src/utils/warehouse-theme.ts` — costanti palette 4 livelli (condiviso da Phase 1 e 2)
- `src/components/WarehouseHistoryDialog.tsx` — dialog warehouse per CustomerHistoryModal (sia articolo singolo che copia ordine)

### File modificati
- `src/types/warehouse.ts` — aggiungere `SelectedWarehouseMatch` (spostata da `WarehouseMatchAccordion`)
- `src/services/warehouse-matching.ts` — estrarre helper `matchItemAgainstCode`, aggiungere `findWarehouseMatchesBatch`
- `src/components/CustomerHistoryModal.tsx` — pre-fetch batch, row tinting, dialog integration
- `src/components/WarehouseMatchAccordion.tsx` — visual redesign 4-colori, nuovo prop `onMatchLevelChange`
- `src/components/OrderFormSimple.tsx` — rimuovere hardcoded green, aggiungere tema dinamico via CSS vars

---

## ═══════════════ PHASE 1: CustomerHistoryModal ═══════════════

---

### Task 1: Costanti palette 4 livelli

**Files:**
- Create: `archibald-web-app/frontend/src/utils/warehouse-theme.ts`

- [ ] **Step 1: Creare il file con la palette**

```typescript
// archibald-web-app/frontend/src/utils/warehouse-theme.ts
import type { MatchLevel } from '../services/warehouse-matching';

export type WarehouseThemeLevel = MatchLevel | 'none';

export type LevelColors = {
  bg: string;        // sfondo leggero (row tint, card bg)
  bgMid: string;     // sfondo medio (header, banner)
  border: string;    // bordo principale
  accent: string;    // colore testo/icone
  btnBg: string;     // sfondo bottone CTA
};

export const WAREHOUSE_LEVEL_COLORS: Record<WarehouseThemeLevel, LevelColors> = {
  none:         { bg: '#f8fafc', bgMid: '#f1f5f9', border: '#e2e8f0', accent: '#64748b', btnBg: '#64748b' },
  exact:        { bg: '#f0fdf4', bgMid: '#d1fae5', border: '#34d399', accent: '#059669', btnBg: '#059669' },
  'figura-gambo': { bg: '#eff6ff', bgMid: '#dbeafe', border: '#60a5fa', accent: '#2563eb', btnBg: '#2563eb' },
  figura:       { bg: '#fffbeb', bgMid: '#fef3c7', border: '#fbbf24', accent: '#d97706', btnBg: '#d97706' },
  description:  { bg: '#fff7ed', bgMid: '#ffedd5', border: '#fb923c', accent: '#ea580c', btnBg: '#ea580c' },
};

export const WAREHOUSE_LEVEL_LABELS: Record<WarehouseThemeLevel, string> = {
  none: 'Nessun match',
  exact: 'Match esatto',
  'figura-gambo': 'Stessa figura + gambo',
  figura: 'Stessa figura',
  description: 'Descrizione simile',
};

/** Restituisce il level più alto trovato in un array di match */
export function bestMatchLevel(matches: { level: MatchLevel }[]): WarehouseThemeLevel {
  if (matches.some(m => m.level === 'exact')) return 'exact';
  if (matches.some(m => m.level === 'figura-gambo')) return 'figura-gambo';
  if (matches.some(m => m.level === 'figura')) return 'figura';
  if (matches.some(m => m.level === 'description')) return 'description';
  return 'none';
}

/** True se il livello è pre-selezionato di default (exact e figura-gambo) */
export function isAutoSelected(level: MatchLevel): boolean {
  return level === 'exact' || level === 'figura-gambo';
}
```

- [ ] **Step 2: Creare test per `bestMatchLevel` e `isAutoSelected`**

```typescript
// archibald-web-app/frontend/src/utils/warehouse-theme.spec.ts
import { describe, expect, test } from 'vitest';
import { bestMatchLevel, isAutoSelected } from './warehouse-theme';
import type { MatchLevel } from '../services/warehouse-matching';

const m = (level: MatchLevel) => ({ level });

describe('bestMatchLevel', () => {
  test('returns none for empty array', () => {
    expect(bestMatchLevel([])).toBe('none');
  });
  test('returns exact when present', () => {
    expect(bestMatchLevel([m('figura'), m('exact')])).toBe('exact');
  });
  test('returns figura-gambo when no exact', () => {
    expect(bestMatchLevel([m('figura'), m('figura-gambo')])).toBe('figura-gambo');
  });
  test('returns figura when no better match', () => {
    expect(bestMatchLevel([m('description'), m('figura')])).toBe('figura');
  });
  test('returns description when only match', () => {
    expect(bestMatchLevel([m('description')])).toBe('description');
  });
});

describe('isAutoSelected', () => {
  test('exact is auto-selected', () => expect(isAutoSelected('exact')).toBe(true));
  test('figura-gambo is auto-selected', () => expect(isAutoSelected('figura-gambo')).toBe(true));
  test('figura is NOT auto-selected', () => expect(isAutoSelected('figura')).toBe(false));
  test('description is NOT auto-selected', () => expect(isAutoSelected('description')).toBe(false));
});
```

- [ ] **Step 3: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- warehouse-theme
```
Expected: 9 test PASS

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/utils/warehouse-theme.ts archibald-web-app/frontend/src/utils/warehouse-theme.spec.ts
git commit -m "feat(warehouse): add 4-level color theme constants and helpers"
```

---

### Task 1b: Spostare `SelectedWarehouseMatch` in `src/types/warehouse.ts`

**Files:**
- Modify: `archibald-web-app/frontend/src/types/warehouse.ts`
- Modify: `archibald-web-app/frontend/src/components/WarehouseMatchAccordion.tsx`

**Motivo:** `SelectedWarehouseMatch` è un tipo condiviso tra `WarehouseHistoryDialog` (nuovo) e `WarehouseMatchAccordion`. Tenerlo in `WarehouseMatchAccordion` crea un import cross-component non idiomatico. Va in `src/types/warehouse.ts` come gli altri tipi warehouse.

- [ ] **Step 1: Aggiungere il tipo in `warehouse.ts`**

```typescript
// Aggiungere in fondo a archibald-web-app/frontend/src/types/warehouse.ts
export type SelectedWarehouseMatch = {
  warehouseItemId: number;
  articleCode: string;
  boxName: string;
  quantity: number;
  maxAvailable: number;
};
```

- [ ] **Step 2: Aggiornare `WarehouseMatchAccordion.tsx`**

Rimuovere la definizione `export interface SelectedWarehouseMatch { ... }` (righe 16-22) e aggiungere import:
```typescript
import type { SelectedWarehouseMatch } from '../types/warehouse';
```
Mantenere il re-export per compatibilità con i consumer esistenti:
```typescript
export type { SelectedWarehouseMatch };
```

- [ ] **Step 3: Verificare che non si rompano altri consumer**

```bash
grep -r "SelectedWarehouseMatch" archibald-web-app/frontend/src --include="*.tsx" --include="*.ts" -l
```
Per ogni file trovato, verificare che l'import da `./WarehouseMatchAccordion` funzioni ancora (grazie al re-export).

- [ ] **Step 4: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/types/warehouse.ts archibald-web-app/frontend/src/components/WarehouseMatchAccordion.tsx
git commit -m "refactor(warehouse): move SelectedWarehouseMatch to src/types/warehouse.ts"
```

---

### Task 2: `matchItemAgainstCode` helper + `findWarehouseMatchesBatch` in warehouse-matching.ts

**Files:**
- Modify: `archibald-web-app/frontend/src/services/warehouse-matching.ts`
- Test: `archibald-web-app/frontend/src/services/warehouse-matching.spec.ts` (se esiste, altrimenti creare)

**Problema:** `findWarehouseMatches` chiama `getWarehouseItems()` ogni invocazione. Con 50+ articoli unici in `CustomerHistoryModal` ci sarebbero 50+ richieste API. Serve una versione batch che chiama l'API una sola volta, riusando la logica di matching tramite un helper privato (senza duplicare il loop).

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `warehouse-matching.spec.ts` (o crearlo):
```typescript
import { describe, expect, test, vi } from 'vitest';
import * as warehouseApi from '../api/warehouse';
import { findWarehouseMatchesBatch } from './warehouse-matching';

describe('findWarehouseMatchesBatch', () => {
  test('chiama getWarehouseItems una sola volta per N articoli', async () => {
    const mockItems = [
      { id: 1, articleCode: 'H129FSQ.104.023', description: 'Testa', boxName: 'Box A', quantity: 5, soldInOrder: null, reservedForOrder: null },
      { id: 2, articleCode: 'H129FSQ.104.020', description: 'Testa alt', boxName: 'Box B', quantity: 3, soldInOrder: null, reservedForOrder: null },
    ];
    const spy = vi.spyOn(warehouseApi, 'getWarehouseItems').mockResolvedValue(mockItems);

    const inputs = [
      { code: 'H129FSQ.104.023', description: 'Testa' },
      { code: 'H129FSQ.104.020', description: 'Testa alt' },
      { code: '801.314.014', description: 'Altro' },
    ];
    const result = await findWarehouseMatchesBatch(inputs);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.get('H129FSQ.104.023')?.[0].level).toBe('exact');
    expect(result.get('H129FSQ.104.020')?.[0].level).toBe('exact');
    expect(result.get('801.314.014')).toEqual([]);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- warehouse-matching
```
Expected: FAIL `findWarehouseMatchesBatch is not a function`

- [ ] **Step 3: Estrarre l'helper privato `matchItemAgainstCode` e riscrivere `findWarehouseMatches` per usarlo**

```typescript
// Aggiungere PRIMA di findWarehouseMatches (non esportata — privata al modulo):
function matchItemAgainstCode(
  item: WarehouseItem,
  inputParts: ArticleCodeParts,
  description: string | undefined,
  minScore: number,
): WarehouseMatch | null {
  const itemParts = parseArticleCode(item.articleCode);
  const availableQty = item.quantity;

  if (inputParts.raw === itemParts.raw) {
    const match: WarehouseMatch = { item, level: 'exact', score: 100, availableQty, reason: 'Match esatto - stesso codice articolo' };
    return match.score >= minScore ? match : null;
  }
  if (
    inputParts.figura === itemParts.figura &&
    inputParts.gambo !== null &&
    inputParts.gambo === itemParts.gambo &&
    inputParts.misura !== itemParts.misura
  ) {
    const match: WarehouseMatch = { item, level: 'figura-gambo', score: 80, availableQty, reason: `Stessa figura + gambo, misura diversa (${itemParts.misura} vs ${inputParts.misura})` };
    return match.score >= minScore ? match : null;
  }
  if (
    inputParts.figura === itemParts.figura &&
    (inputParts.gambo !== itemParts.gambo || inputParts.misura !== itemParts.misura)
  ) {
    const diffs: string[] = [];
    if (inputParts.gambo !== itemParts.gambo) diffs.push(`gambo diverso (${itemParts.gambo} vs ${inputParts.gambo})`);
    if (inputParts.misura !== itemParts.misura) diffs.push(`misura diversa (${itemParts.misura} vs ${inputParts.misura})`);
    const match: WarehouseMatch = { item, level: 'figura', score: 60, availableQty, reason: `Stessa figura, ${diffs.join(', ')}` };
    return match.score >= minScore ? match : null;
  }
  if (description && item.description) {
    const similarity = calculateSimilarity(description, item.description);
    if (similarity >= 0.7) {
      const score = Math.round(similarity * 50);
      if (score >= minScore) {
        return { item, level: 'description', score, availableQty, reason: `Descrizione simile (${Math.round(similarity * 100)}%)` };
      }
    }
  }
  return null;
}
```

Poi, nel corpo di `findWarehouseMatches` (riga ~157-229), sostituire il loop `for (const item of allItems)` con:

```typescript
for (const item of allItems) {
  const match = matchItemAgainstCode(item, inputParts, description, minScore);
  if (match) matches.push(match);
}
```

- [ ] **Step 4: Implementare `findWarehouseMatchesBatch` usando l'helper**

Aggiungere in fondo al file (dopo `hasExactMatch`):

```typescript
/**
 * Batch version: fetches warehouse items once, then matches all provided codes.
 * Use this when matching many articles at once (e.g. CustomerHistoryModal pre-fetch).
 *
 * @returns Map<articleCode, WarehouseMatch[]> — empty array means no matches
 */
export async function findWarehouseMatchesBatch(
  inputs: Array<{ code: string; description?: string }>,
  minScore = 50,
): Promise<Map<string, WarehouseMatch[]>> {
  const allWarehouseItems = await getWarehouseItems();
  const availableItems = allWarehouseItems.filter(
    (item) => !item.soldInOrder && !item.reservedForOrder,
  );

  const result = new Map<string, WarehouseMatch[]>();
  for (const { code, description } of inputs) {
    const inputParts = parseArticleCode(code);
    const matches: WarehouseMatch[] = [];
    for (const item of availableItems) {
      const match = matchItemAgainstCode(item, inputParts, description, minScore);
      if (match) matches.push(match);
    }
    matches.sort((a, b) => b.score !== a.score ? b.score - a.score : b.availableQty - a.availableQty);
    result.set(code, matches);
  }
  return result;
}
```

- [ ] **Step 5: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- warehouse-matching
```
Expected: tutti i test PASS

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/services/warehouse-matching.ts archibald-web-app/frontend/src/services/warehouse-matching.spec.ts
git commit -m "feat(warehouse): extract matchItemAgainstCode helper, add findWarehouseMatchesBatch"
```

---

### Task 3: Pre-fetch warehouse matches in CustomerHistoryModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

**Nota:** Niente test unitari qui — la logica è gestita da `findWarehouseMatchesBatch` già testata. Questo task è solo integrazione.

- [ ] **Step 1: Aggiungere import e nuovo stato**

In `CustomerHistoryModal.tsx`, aggiungere dopo gli import esistenti:

```typescript
import { findWarehouseMatchesBatch } from '../services/warehouse-matching';
import type { WarehouseMatch } from '../services/warehouse-matching';
import { bestMatchLevel } from '../utils/warehouse-theme';
```

Aggiungere dopo `const [copiedOrderIds, setCopiedOrderIds] = useState...`:

```typescript
// Warehouse matches pre-fetch: Map<articleCode, WarehouseMatch[]>
const [warehouseMatchMap, setWarehouseMatchMap] = useState<Map<string, WarehouseMatch[]>>(new Map());
```

- [ ] **Step 2: Aggiungere useEffect per il pre-fetch**

Aggiungere dopo l'`useEffect` per `listinoPrices` (dopo riga ~82):

```typescript
useEffect(() => {
  if (!isOpen || orders.length === 0) return;
  const inputs = Array.from(
    new Map(
      orders.flatMap((o) =>
        o.articles.map((a) => [a.articleCode, { code: a.articleCode, description: a.articleDescription }])
      )
    ).values()
  );
  findWarehouseMatchesBatch(inputs)
    .then((map) => setWarehouseMatchMap(map))
    .catch(() => {});
}, [isOpen, orders]);
```

- [ ] **Step 3: Passare `warehouseMatchMap` a `OrderCard`**

Aggiungere `warehouseMatchMap` alla `OrderCardProps` e passarla dal componente padre:

```typescript
// In OrderCardProps type (riga ~448):
warehouseMatchMap: Map<string, WarehouseMatch[]>;

// Nel render (riga ~405):
<OrderCard
  ...
  warehouseMatchMap={warehouseMatchMap}
/>
```

- [ ] **Step 4: Aggiungere `warehouseMatches` alle props di `ArticleRow` (necessario prima del type-check)**

```typescript
// Nella definizione ArticleRow props (riga ~574):
warehouseMatches: WarehouseMatch[];
```

Aggiungere anche `warehouseMatches` al destructuring dentro `function ArticleRow({ ..., warehouseMatches })`.
**Nota:** la logica che usa questo prop verrà aggiunta in Task 4 — per ora basta che la prop esista per far passare il type-check del Task 3.

- [ ] **Step 5: Passare `warehouseMatches` ad ogni `ArticleRow` da `OrderCard`**

```typescript
// In ArticleRow call (riga ~543):
<ArticleRow
  ...
  warehouseMatches={warehouseMatchMap.get(article.articleCode) ?? []}
/>
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(history-modal): pre-fetch warehouse matches for all articles on open"
```

---

### Task 4: Row tinting in ArticleRow

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx` (funzione `ArticleRow`)

**Visual reference:** `warehouse-v4.html` — tinta leggera sulla riga (`bg`), sotto codice: info warehouse, sotto descrizione: diff in plain-language. Stile inline come da convenzione codebase.

- [ ] **Step 1: La prop `warehouseMatches` è già definita in Task 3 Step 4 — aggiungere gli import necessari**

Aggiungere in cima a `CustomerHistoryModal.tsx` (se non già presenti):
```typescript
import { bestMatchLevel, WAREHOUSE_LEVEL_COLORS } from '../utils/warehouse-theme';
```

- [ ] **Step 2: Calcolare il best level e i colori nella funzione ArticleRow**

Aggiungere all'inizio del corpo di `ArticleRow`:

```typescript
const bestLevel = bestMatchLevel(warehouseMatches);
const colors = WAREHOUSE_LEVEL_COLORS[bestLevel];
const topMatch = warehouseMatches[0] ?? null;
```

- [ ] **Step 3: Applicare tinta leggera alla riga**

Modificare il `<tr>` style (riga ~598). Sostituire `background: rowBg` con:

```typescript
background: isFlashing ? undefined : (hovered ? '#eff6ff' : (bestLevel !== 'none' ? colors.bg : 'white')),
```

- [ ] **Step 4: Info warehouse inline — sotto il codice**

Nella `<td>` del codice (riga ~604), aggiungere dopo `{substituteCode && ...}`:

```tsx
{bestLevel !== 'none' && topMatch && (
  <span style={{ display: 'block', fontSize: 9, fontWeight: 700, color: colors.accent, marginTop: 1 }}>
    {bestLevel === 'exact'
      ? `🏪 ${topMatch.availableQty} pz · ${topMatch.item.boxName}`
      : `→ ${topMatch.item.articleCode}`
    }
  </span>
)}
```

- [ ] **Step 5: Diff plain-language — sotto la descrizione**

Nella `<td>` della descrizione (riga ~615), aggiungere dopo il `<span>` descrizione:

```tsx
{bestLevel !== 'none' && topMatch && bestLevel !== 'exact' && (
  <span style={{ display: 'block', fontSize: 9, color: colors.accent, marginTop: 1 }}>
    {topMatch.reason}
  </span>
)}
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(history-modal): row tinting with 4-level warehouse color system"
```

---

### Task 5: `WarehouseHistoryDialog` — dialog articolo singolo

**Files:**
- Create: `archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx`
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`

**Visual reference:** Tab 1 di `warehouse-v4.html` — dialog con diff codice (Richiesto/Trovato con parte diversa evidenziata), spiegazione, selettore quantità, pre-selezione automatica per exact/figambo.

- [ ] **Step 1: Creare `WarehouseHistoryDialog.tsx`**

```typescript
// archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx
import { useState } from 'react';
import type { WarehouseMatch } from '../services/warehouse-matching';
import type { SelectedWarehouseMatch } from '../types/warehouse';
import { WAREHOUSE_LEVEL_COLORS, WAREHOUSE_LEVEL_LABELS, isAutoSelected } from '../utils/warehouse-theme';

type Props = {
  articleCode: string;
  description: string;
  requestedQuantity: number;
  matches: WarehouseMatch[];
  onConfirm: (selections: SelectedWarehouseMatch[]) => void;
  onSkip: () => void;   // aggiungi senza magazzino
  onCancel: () => void;
};

export function WarehouseHistoryDialog({
  articleCode, description, requestedQuantity, matches, onConfirm, onSkip, onCancel,
}: Props) {
  const [selections, setSelections] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const match of matches) {
      if (isAutoSelected(match.level)) {
        m.set(match.item.id, Math.min(match.availableQty, requestedQuantity));
      }
    }
    return m;
  });

  const totalSelected = Array.from(selections.values()).reduce((s, q) => s + q, 0);
  const toOrder = Math.max(0, requestedQuantity - totalSelected);

  const handleToggle = (match: WarehouseMatch, checked: boolean) => {
    const next = new Map(selections);
    if (checked) next.set(match.item.id, Math.min(match.availableQty, requestedQuantity));
    else next.delete(match.item.id);
    setSelections(next);
  };

  const handleQty = (match: WarehouseMatch, qty: number) => {
    const next = new Map(selections);
    const clamped = Math.max(0, Math.min(qty, match.availableQty));
    if (clamped > 0) next.set(match.item.id, clamped);
    else next.delete(match.item.id);
    setSelections(next);
  };

  const handleConfirm = () => {
    const result: SelectedWarehouseMatch[] = [];
    for (const [itemId, qty] of selections.entries()) {
      const match = matches.find(m => m.item.id === itemId);
      if (match && qty > 0) {
        result.push({ warehouseItemId: itemId, articleCode: match.item.articleCode, boxName: match.item.boxName, quantity: qty, maxAvailable: match.availableQty });
      }
    }
    onConfirm(result);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 480, boxShadow: '0 20px 50px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#1e293b', color: 'white', padding: '14px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Articoli trovati in magazzino</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>{articleCode}</div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matches.map((match) => {
            const colors = WAREHOUSE_LEVEL_COLORS[match.level];
            const isSelected = selections.has(match.item.id);
            const qty = selections.get(match.item.id) ?? 0;

            return (
              <div key={match.item.id} style={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.accent}`, borderRadius: 8, padding: 12, background: isSelected ? colors.bg : 'white', transition: 'background 0.2s' }}>
                {/* Level badge + code */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={isSelected} onChange={e => handleToggle(match, e.target.checked)} style={{ accentColor: colors.accent, width: 14, height: 14 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: colors.bgMid, color: colors.accent }}>{WAREHOUSE_LEVEL_LABELS[match.level]}</span>
                </div>

                {/* Diff block */}
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', marginBottom: 8, border: `1px solid ${colors.border}` }}>
                  <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>Richiesto</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>{articleCode}</span>
                  <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>Trovato</span>
                  <span style={{ color: colors.accent, fontWeight: 700 }}>{match.item.articleCode}</span>
                </div>

                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  📦 {match.item.boxName} · <strong>{match.availableQty} pz</strong> disponibili
                </div>

                {isSelected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Usa:</span>
                    <button onClick={() => handleQty(match, qty - 1)} disabled={qty <= 1} style={{ width: 24, height: 24, border: `1px solid ${colors.border}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <input type="number" min={1} max={match.availableQty} value={qty} onChange={e => handleQty(match, Number(e.target.value))} style={{ width: 50, textAlign: 'center', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '2px 4px', fontSize: 12 }} />
                    <button onClick={() => handleQty(match, qty + 1)} disabled={qty >= match.availableQty} style={{ width: 24, height: 24, border: `1px solid ${colors.border}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>/ {match.availableQty}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          {totalSelected > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#065f46', display: 'flex', justifyContent: 'space-between' }}>
              <span>Da magazzino: <strong>{totalSelected} pz</strong></span>
              {toOrder > 0 && <span>Da ordinare: <strong>{toOrder} pz</strong></span>}
              {toOrder === 0 && <span>✓ Quantità coperta</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer', color: '#475569' }}>Annulla</button>
          <button onClick={onSkip} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#475569' }}>Aggiungi senza magazzino</button>
          <button onClick={handleConfirm} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {totalSelected > 0 ? `Aggiungi (${totalSelected} da mag.)` : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrare il dialog in `CustomerHistoryModal`**

Aggiungere il tipo e lo stato nel componente principale:

```typescript
// Stato per il dialog articolo singolo
type PendingDialogItem = {
  article: CustomerFullHistoryOrder['articles'][number];
  orderDiscountPercent: number;
  orderSource: 'orders' | 'fresis';
  matches: WarehouseMatch[];
};
const [pendingDialog, setPendingDialog] = useState<PendingDialogItem | null>(null);
```

- [ ] **Step 3: Modificare `handleAddSingle` per aprire il dialog**

Sostituire la logica di `handleAddSingle` (riga ~205):

```typescript
const handleAddSingle = useCallback(
  async (
    article: CustomerFullHistoryOrder['articles'][number],
    orderDiscountPercent: number,
    orderSource: 'orders' | 'fresis',
  ) => {
    const matches = warehouseMatchMap.get(article.articleCode) ?? [];
    if (matches.length > 0) {
      setPendingDialog({ article, orderDiscountPercent, orderSource, matches });
      return;
    }
    // Nessun match → aggiunta diretta come prima
    const substituteCode = orderSource === 'fresis' ? codeSubstitutions.get(article.articleCode) : undefined;
    const item = await buildPendingItem(article, orderDiscountPercent, substituteCode);
    onAddArticle(item, false);
    setAddedCount((c) => c + 1);
    setArticleBadges(/* ... come prima */);
    setFlashingArticles(/* ... come prima */);
  },
  [buildPendingItem, onAddArticle, codeSubstitutions, warehouseMatchMap],
);
```

- [ ] **Step 4: Handler di conferma dialog**

```typescript
const handleDialogConfirm = useCallback(
  async (selections: SelectedWarehouseMatch[]) => {
    if (!pendingDialog) return;
    const { article, orderDiscountPercent, orderSource } = pendingDialog;
    const substituteCode = orderSource === 'fresis' ? codeSubstitutions.get(article.articleCode) : undefined;
    const item = await buildPendingItem(article, orderDiscountPercent, substituteCode);
    const enriched: PendingOrderItem = {
      ...item,
      warehouseSources: selections.length > 0
        ? selections.map(s => ({ warehouseItemId: s.warehouseItemId, boxName: s.boxName, quantity: s.quantity }))
        : undefined,
      warehouseQuantity: selections.reduce((s, sel) => s + sel.quantity, 0) || undefined,
    };
    onAddArticle(enriched, false);
    setAddedCount((c) => c + 1);
    setArticleBadges((prev) => { const m = new Map(prev); m.set(article.articleCode, (m.get(article.articleCode) ?? 0) + 1); return m; });
    setFlashingArticles((prev) => new Set([...prev, article.articleCode]));
    setTimeout(() => setFlashingArticles((prev) => { const s = new Set(prev); s.delete(article.articleCode); return s; }), 1200);
    setPendingDialog(null);
  },
  [pendingDialog, buildPendingItem, onAddArticle, codeSubstitutions],
);
```

- [ ] **Step 5: Rendere il dialog nel JSX**

Nel `return` del componente, aggiungere prima di chiudere il frammento:

```tsx
{pendingDialog && (
  <WarehouseHistoryDialog
    articleCode={pendingDialog.article.articleCode}
    description={pendingDialog.article.articleDescription}
    requestedQuantity={pendingDialog.article.quantity}
    matches={pendingDialog.matches}
    onConfirm={handleDialogConfirm}
    onSkip={async () => {
      const { article, orderDiscountPercent, orderSource } = pendingDialog;
      const substituteCode = orderSource === 'fresis' ? codeSubstitutions.get(article.articleCode) : undefined;
      const item = await buildPendingItem(article, orderDiscountPercent, substituteCode);
      onAddArticle(item, false);
      setAddedCount((c) => c + 1);
      setPendingDialog(null);
    }}
    onCancel={() => setPendingDialog(null)}
  />
)}
```

- [ ] **Step 6: Type-check + build**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(history-modal): warehouse dialog for single article add flow"
```

---

### Task 6: Dialog post-copia ordine intero

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx`
- Modify: `archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx`

**Visual reference:** Tab 2 di `warehouse-v4.html` — dialog multi-riga con tutte le righe che hanno match. Exact/figambo pre-selezionati, figura/desc deselezionati.

- [ ] **Step 1: Estendere `WarehouseHistoryDialog` per la modalità multi-articolo**

Aggiungere un nuovo tipo props e componente `WarehouseOrderCopyDialog`:

```typescript
// Aggiungere in fondo a WarehouseHistoryDialog.tsx

type CopyOrderMatch = {
  articleCode: string;
  description: string;
  requestedQuantity: number;
  matches: WarehouseMatch[];
};

type CopyDialogProps = {
  articles: CopyOrderMatch[];
  onConfirm: (selectionsPerArticle: Map<string, SelectedWarehouseMatch[]>) => void;
  onCancel: () => void;
};

export function WarehouseOrderCopyDialog({ articles, onConfirm, onCancel }: CopyDialogProps) {
  // State: Map<articleCode, Map<warehouseItemId, quantity>>
  const [allSelections, setAllSelections] = useState<Map<string, Map<number, number>>>(() => {
    const outer = new Map<string, Map<number, number>>();
    for (const art of articles) {
      const inner = new Map<number, number>();
      for (const match of art.matches) {
        if (isAutoSelected(match.level)) {
          inner.set(match.item.id, Math.min(match.availableQty, art.requestedQuantity));
        }
      }
      outer.set(art.articleCode, inner);
    }
    return outer;
  });

  const handleConfirm = () => {
    const result = new Map<string, SelectedWarehouseMatch[]>();
    for (const art of articles) {
      const innerMap = allSelections.get(art.articleCode) ?? new Map();
      const sels: SelectedWarehouseMatch[] = [];
      for (const [itemId, qty] of innerMap.entries()) {
        const match = art.matches.find(m => m.item.id === itemId);
        if (match && qty > 0) sels.push({ warehouseItemId: itemId, articleCode: match.item.articleCode, boxName: match.item.boxName, quantity: qty, maxAvailable: match.availableQty });
      }
      result.set(art.articleCode, sels);
    }
    onConfirm(result);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ background: '#1e293b', color: 'white', padding: '14px 18px', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Articoli trovati in magazzino — ordine copiato</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Seleziona quali articoli usare dal magazzino</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {articles.map((art) => {
            const topMatch = art.matches[0];
            const colors = WAREHOUSE_LEVEL_COLORS[topMatch.level];
            const innerMap = allSelections.get(art.articleCode) ?? new Map();
            const isSelected = innerMap.size > 0;

            return (
              <div key={art.articleCode} style={{ border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.accent}`, borderRadius: 8, padding: 10, background: isSelected ? colors.bg : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <input type="checkbox" checked={isSelected}
                    onChange={e => {
                      const next = new Map(allSelections);
                      if (e.target.checked) {
                        const inner = new Map<number, number>();
                        inner.set(topMatch.item.id, Math.min(topMatch.availableQty, art.requestedQuantity));
                        next.set(art.articleCode, inner);
                      } else {
                        next.set(art.articleCode, new Map());
                      }
                      setAllSelections(next);
                    }}
                    style={{ accentColor: colors.accent }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{art.articleCode}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 10, background: colors.bgMid, color: colors.accent, fontWeight: 700 }}>{WAREHOUSE_LEVEL_LABELS[topMatch.level]}</span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  → {topMatch.item.articleCode} · 📦 {topMatch.item.boxName} · {topMatch.availableQty} pz
                  {topMatch.level !== 'exact' && <span style={{ color: colors.accent }}> · {topMatch.reason}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer' }}>Chiudi</button>
          <button onClick={handleConfirm} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Conferma selezione</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungere stato pending copy dialog in `CustomerHistoryModal`**

```typescript
type PendingCopyDialog = {
  order: CustomerFullHistoryOrder;
  builtItems: PendingOrderItem[];
  matchedArticles: Array<{ articleCode: string; description: string; requestedQuantity: number; matches: WarehouseMatch[] }>;
};
const [pendingCopyDialog, setPendingCopyDialog] = useState<PendingCopyDialog | null>(null);
```

- [ ] **Step 3: Modificare `handleCopyOrder` per mostrare il dialog**

Dopo aver costruito `validItems`, invece di chiamare `onAddOrder` direttamente: se ci sono articoli con matches in magazzino, aprire il dialog:

```typescript
const matchedForDialog = validPairs
  .map(p => ({
    articleCode: p.originalCode,
    description: order.articles.find(a => a.articleCode === p.originalCode)?.articleDescription ?? '',
    requestedQuantity: order.articles.find(a => a.articleCode === p.originalCode)?.quantity ?? 1,
    matches: warehouseMatchMap.get(p.originalCode) ?? [],
  }))
  .filter(x => x.matches.length > 0);

if (matchedForDialog.length > 0) {
  setPendingCopyDialog({ order, builtItems: validItems, matchedArticles: matchedForDialog });
} else {
  onAddOrder(validItems, false);
  // badge + counter update come prima
}
```

- [ ] **Step 4: Handler di conferma copy dialog**

```typescript
const handleCopyDialogConfirm = useCallback(
  (selectionsPerArticle: Map<string, SelectedWarehouseMatch[]>) => {
    if (!pendingCopyDialog) return;
    const enrichedItems = pendingCopyDialog.builtItems.map(item => {
      const sels = selectionsPerArticle.get(item.articleCode) ?? [];
      if (sels.length === 0) return item;
      return {
        ...item,
        warehouseSources: sels.map(s => ({ warehouseItemId: s.warehouseItemId, boxName: s.boxName, quantity: s.quantity })),
        warehouseQuantity: sels.reduce((s, sel) => s + sel.quantity, 0),
      };
    });
    onAddOrder(enrichedItems, false);
    setAddedCount(c => c + enrichedItems.length);
    setPendingCopyDialog(null);
    // badge + copied order IDs come nel handleCopyOrder originale
  },
  [pendingCopyDialog, onAddOrder],
);
```

- [ ] **Step 5: Rendere `WarehouseOrderCopyDialog` nel JSX**

```tsx
{pendingCopyDialog && (
  <WarehouseOrderCopyDialog
    articles={pendingCopyDialog.matchedArticles}
    onConfirm={handleCopyDialogConfirm}
    onCancel={() => {
      // copia comunque senza warehouse
      onAddOrder(pendingCopyDialog.builtItems, false);
      setPendingCopyDialog(null);
    }}
  />
)}
```

- [ ] **Step 6: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 7: Commit Phase 1**

```bash
git add archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
git commit -m "feat(history-modal): warehouse dialog for full-order copy flow — Phase 1 complete"
```

---

## ═══════════════ PHASE 2: Form /order Immersivo ═══════════════

---

### Task 7: WarehouseMatchAccordion — visual redesign 4-colori

**Files:**
- Modify: `archibald-web-app/frontend/src/components/WarehouseMatchAccordion.tsx`

**Visual reference:** `warehouse-immersive-v1.html` — sezione magazzino. Match row: checkbox + codice (diff highlight) + box·qty. Niente label level, niente % score, niente reason text verbose. Header mostra count badge colorato.

**Nuovo prop da aggiungere:**
```typescript
onMatchLevelChange?: (level: WarehouseThemeLevel) => void;
```

- [ ] **Step 1: Aggiungere import e prop**

```typescript
import { WAREHOUSE_LEVEL_COLORS, WAREHOUSE_LEVEL_LABELS, bestMatchLevel, isAutoSelected } from '../utils/warehouse-theme';
import type { WarehouseThemeLevel } from '../utils/warehouse-theme';

// In WarehouseMatchAccordionProps:
onMatchLevelChange?: (level: WarehouseThemeLevel) => void;
```

- [ ] **Step 2: Emettere il level quando i match cambiano**

Aggiungere un `useEffect` dopo quello che notifica `onSelect`:

```typescript
useEffect(() => {
  const level = bestMatchLevel(matches);
  onMatchLevelChange?.(level);
}, [matches, onMatchLevelChange]);
```

- [ ] **Step 3: Sostituire il rendering CSS con il sistema colori**

Determinare `currentColors` dalla best level:
```typescript
const currentLevel = bestMatchLevel(matches);
const currentColors = WAREHOUSE_LEVEL_COLORS[currentLevel];
```

- [ ] **Step 4: Ridisegnare l'header dell'accordion**

Sostituire la `<button className="warehouse-match-header">` con styling inline basato su `currentColors`:

```tsx
<button
  type="button"
  onClick={() => setExpanded(!expanded)}
  style={{
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', background: currentColors.bgMid, border: 'none', cursor: 'pointer',
    fontSize: '0.875em', fontWeight: 700, color: currentColors.accent,
    borderRadius: expanded ? '6px 6px 0 0' : 6, transition: 'background 0.3s',
  }}
>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>🏪</span>
    <span>{matches.length} {matches.length === 1 ? 'articolo trovato' : 'articoli trovati'} in magazzino</span>
    <span style={{ background: currentColors.accent, color: 'white', fontSize: '0.75em', padding: '1px 7px', borderRadius: 10 }}>{matches.length}</span>
  </div>
  <span style={{ fontSize: '0.75em' }}>{expanded ? '▲' : '▼'}</span>
</button>
```

- [ ] **Step 5: Ridisegnare ogni match item**

Sostituire il `<div className="match-item">` con:

```tsx
<div
  key={match.item.id}
  style={{
    background: isSelected ? colors.bg : 'white',
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${colors.accent}`,
    borderRadius: 6, padding: '8px 10px',
    display: 'flex', alignItems: 'center', gap: 10,
    transition: 'background 0.2s',
    opacity: isUnavailable ? 0.5 : 1,
    pointerEvents: isUnavailable ? 'none' : undefined,
  }}
>
  <input type="checkbox" checked={isSelected} disabled={isUnavailable}
    onChange={e => handleToggleMatch(match, e.target.checked)}
    style={{ accentColor: colors.accent, width: 14, height: 14, flexShrink: 0 }} />

  <div style={{ flex: 1, minWidth: 0 }}>
    {/* Codice con diff highlight se non exact */}
    <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#1e293b' }}>
      {match.level === 'exact'
        ? match.item.articleCode
        : <><span style={{ color: colors.accent }}>{match.item.articleCode}</span></>
      }
    </div>
    <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
      📦 {match.item.boxName} · {match.availableQty} pz
    </div>
  </div>

  {/* Qty selector se selezionato */}
  {isSelected && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => handleChangeQuantity(match, selectedQty - 1)} disabled={selectedQty <= 0}
        style={{ width: 22, height: 22, border: `1px solid ${colors.border}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>−</button>
      <input type="number" min={0} max={match.availableQty} value={selectedQty}
        onChange={e => handleChangeQuantity(match, Number.parseInt(e.target.value) || 0)}
        style={{ width: 40, textAlign: 'center', border: `1px solid ${colors.border}`, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
      <button type="button" onClick={() => handleChangeQuantity(match, selectedQty + 1)} disabled={selectedQty >= match.availableQty}
        style={{ width: 22, height: 22, border: `1px solid ${colors.border}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+</button>
    </div>
  )}
</div>
```

- [ ] **Step 6: Ridisegnare il summary**

```tsx
{totalSelectedQty > 0 && (
  <div style={{ background: currentColors.bgMid, border: `1px solid ${currentColors.border}`, borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: currentColors.accent }}>
      {totalSelectedQty} pz da magazzino{remainingToOrder > 0 ? ` · ${remainingToOrder} pz da ordinare` : ' · Quantità coperta ✓'}
    </span>
  </div>
)}
```

- [ ] **Step 7: Rimuovere il blocco `<style>` interno**

Eliminare il blocco `<style>{`...`}</style>` (riga ~355-612) — non è più necessario perché tutto è inline.

- [ ] **Step 8: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/frontend/src/components/WarehouseMatchAccordion.tsx
git commit -m "feat(warehouse): visual redesign WarehouseMatchAccordion with 4-level immersive colors"
```

---

### Task 8: OrderFormSimple — tema immersivo pagina intera

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Visual reference:** `warehouse-immersive-v1.html` — quando scatta un match, CSS custom properties su un wrapper div colorano l'intera card/sezione. Default: neutro grigio.

- [ ] **Step 1: Aggiungere import e stato `activeMatchLevel`**

In `OrderFormSimple.tsx`, aggiungere import:
```typescript
import { WAREHOUSE_LEVEL_COLORS } from '../utils/warehouse-theme';
import type { WarehouseThemeLevel } from '../utils/warehouse-theme';
```

Aggiungere stato:
```typescript
const [activeMatchLevel, setActiveMatchLevel] = useState<WarehouseThemeLevel>('none');
```

- [ ] **Step 2: Passare `onMatchLevelChange` e aggiungere reset automatico**

Trovare `<WarehouseMatchAccordion` (riga ~3768) e aggiungere:
```tsx
onMatchLevelChange={setActiveMatchLevel}
```

Aggiungere un `useEffect` per resettare automaticamente quando `selectedProduct` diventa null.
**Non** aggiornare manualmente i singoli handler che chiamano `setSelectedProduct(null)` — sono almeno 2 callsite e il `useEffect` è più robusto:

```typescript
useEffect(() => {
  if (!selectedProduct) setActiveMatchLevel('none');
}, [selectedProduct]);
```

- [ ] **Step 3: Sostituire il wrapper hardcoded verde con il tema dinamico**

Trovare il `<div>` wrapper della WarehouseMatchAccordion (riga ~3759-3776):
```tsx
// BEFORE:
<div style={{
  marginTop: "0.75rem", padding: ...,
  background: "#d1fae5",
  border: "1px solid #10b981",
  borderRadius: "6px",
}}>

// AFTER:
<div style={{
  marginTop: "0.75rem", padding: ...,
  background: activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].bgMid : '#f8fafc',
  border: `1px solid ${activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].border : '#e2e8f0'}`,
  borderRadius: "6px",
  transition: 'background 0.4s, border-color 0.4s',
}}>
```

- [ ] **Step 4: Colorare il bottone "Aggiungi all'Ordine"**

Trovare `handleAddItem` button (riga ~4044). Aggiungere colore dinamico:

```tsx
// Trovare il bottone CTA "Aggiungi all'Ordine"
// e aggiungere al suo style:
background: activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].btnBg : '#059669',
transition: 'background 0.4s',
```

- [ ] **Step 5: Colorare i due bottoni "I più venduti" e "Cerca nello Storico"**

Trovare i bottoni (ricerca con grep: `più venduti\|Storico`) e applicare tema:
```tsx
background: activeMatchLevel !== 'none' ? WAREHOUSE_LEVEL_COLORS[activeMatchLevel].accent : '#8b5cf6', // (o il colore originale)
transition: 'background 0.4s',
```

**Nota:** Non forzare tutti i colori — solo quelli che nel mockup approvato cambiano. Gli elementi neutri (input fields, layout) rimangono invariati.

- [ ] **Step 6: Type-check + build**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 7: Commit Phase 2**

```bash
git add archibald-web-app/frontend/src/components/OrderFormSimple.tsx
git commit -m "feat(order-form): immersive 4-color warehouse theme on article selection"
```

---

### Task 9: Verifica finale e type-check

- [ ] **Step 1: Eseguire tutti i test frontend**

```bash
npm test --prefix archibald-web-app/frontend
```
Expected: tutti i test PASS (inclusi i nuovi in `warehouse-theme.spec.ts` e `warehouse-matching.spec.ts`)

- [ ] **Step 2: Type-check completo**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 3: Test E2E manuale**

Seguendo i pattern del visual reference approvato:

1. Aprire `CustomerHistoryModal` → verificare che le righe si tingano al caricamento
2. Click "➕ Aggiungi" su articolo con match → dialog aperto con diff codice corretto
3. Click "➕ Aggiungi" su articolo senza match → aggiunta diretta senza dialog
4. Click "⊕ Copia tutto l'ordine" su ordine con match → dialog post-copia
5. Form `/order`: selezionare articolo con match esatto → pagina diventa verde
6. Form `/order`: articolo con fig+gambo → pagina diventa blu
7. Form `/order`: nessun articolo selezionato → pagina torna neutra

- [ ] **Step 4: Commit finale**

```bash
git add -A
git commit -m "feat(warehouse): Phase 1+2 complete — history modal warehouse check + immersive 4-color form"
```
