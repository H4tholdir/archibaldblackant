# Last Order Chip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un chip a due righe "ULT. ORDINE / X mesi fa" sul lato destro di ogni riga cliente nella `CustomerList`, colorato per urgenza, che sostituisce il badge generico `attivo`/`inattivo`.

**Architecture:** Due funzioni pure esportate (`formatRelativeTime`, `orderChipStyle`) e un componente interno `OrderChip`, tutto in `CustomerList.tsx`. Nessun cambiamento backend — `customer.lastOrderDate` è già disponibile.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, `vi.setSystemTime` per isolare i test da `Date.now()`.

---

## File modificati

- **Modify:** `archibald-web-app/frontend/src/pages/CustomerList.tsx`
  - Aggiunge `export function formatRelativeTime(lastOrderDate: string | null): string`
  - Aggiunge `export function orderChipStyle(lastOrderDate: string | null): { bg: string; color: string }`
  - Aggiunge componente interno `OrderChip`
  - `CustomerRow`: sostituisce badge con `<OrderChip>`, rimuove `BADGE_STYLE`

- **Modify:** `archibald-web-app/frontend/src/pages/CustomerList.spec.tsx`
  - Aggiunge `describe('formatRelativeTime', ...)` con `test.each` su 8 casi
  - Aggiunge `describe('orderChipStyle', ...)` con `test.each` su 7 casi
  - Aggiorna il test `badge "inattivo"` che si romperà (il badge scompare)

---

## Task 1 — `formatRelativeTime` e `orderChipStyle`: test + implementazione (TDD)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.spec.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`

- [ ] **Step 1.1: Aggiungi i test a `CustomerList.spec.tsx`**

  In cima al file, dopo gli import esistenti, aggiungi:

  ```ts
  import { formatRelativeTime, orderChipStyle } from './CustomerList';
  ```

  Poi in fondo al file (dopo tutti i `describe` esistenti) aggiungi:

  ```ts
  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26'));
    });
    afterEach(() => { vi.useRealTimers(); });

    test.each([
      ['null',            null,         '—'],
      ['oggi (0 gg)',     '26/04/2026', '1 gg. fa'],
      ['15 giorni fa',    '11/04/2026', '15 gg. fa'],
      ['6 settimane fa',  '15/03/2026', '6 sett. fa'],
      ['5 mesi fa',       '2025-11-01', '5 mesi fa'],
      ['1 mese fa',       '25/02/2026', '1 mese fa'],
      ['1 anno fa',       '2025-04-25', '1 anno fa'],
      ['2 anni fa',       '2024-01-01', '2 anni fa'],
      ['data invalida',   'xyz',        '—'],
    ])('%s → %s', (_label, input, expected) => {
      expect(formatRelativeTime(input)).toBe(expected);
    });
  });

  describe('orderChipStyle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26'));
    });
    afterEach(() => { vi.useRealTimers(); });

    test.each([
      ['null → grigio',       null,         '#f1f5f9', '#64748b'],
      ['data invalida → grigio', 'xyz',     '#f1f5f9', '#64748b'],
      ['oggi → verde',        '26/04/2026', '#dcfce7', '#15803d'],
      ['89 gg → verde',       '27/01/2026', '#dcfce7', '#15803d'],
      ['90 gg → ambra',       '26/01/2026', '#fef3c7', '#92400e'],
      ['179 gg → ambra',      '2025-10-29', '#fef3c7', '#92400e'],
      ['180 gg → rosso',      '2025-10-28', '#fee2e2', '#b91c1c'],
      ['> 1 anno → rosso',    '2025-04-25', '#fee2e2', '#b91c1c'],
    ])('%s', (_label, input, expectedBg, expectedColor) => {
      const style = orderChipStyle(input);
      expect(style).toEqual({ bg: expectedBg, color: expectedColor });
    });
  });
  ```

- [ ] **Step 1.2: Esegui i test per verificare che falliscano**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerList
  ```

  Atteso: errori `formatRelativeTime is not exported` / `orderChipStyle is not exported`.

- [ ] **Step 1.3: Implementa le funzioni in `CustomerList.tsx`**

  Aggiungi dopo la funzione `parseOrderDate` esistente (riga ~27):

  ```ts
  export function formatRelativeTime(lastOrderDate: string | null): string {
    if (!lastOrderDate) return '—';
    const ms = parseOrderDate(lastOrderDate);
    if (isNaN(ms)) return '—';
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days < 0) return '—';
    if (days < 30) return `${Math.max(1, days)} gg. fa`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks} sett. fa`;
    const months = Math.floor(days / 30.44);
    if (months < 12) return months === 1 ? '1 mese fa' : `${months} mesi fa`;
    const years = Math.floor(months / 12);
    return years === 1 ? '1 anno fa' : `${years} anni fa`;
  }

  export function orderChipStyle(lastOrderDate: string | null): { bg: string; color: string } {
    if (!lastOrderDate) return { bg: '#f1f5f9', color: '#64748b' };
    const ms = parseOrderDate(lastOrderDate);
    if (isNaN(ms)) return { bg: '#f1f5f9', color: '#64748b' };
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days < 90)  return { bg: '#dcfce7', color: '#15803d' };
    if (days < 180) return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#fee2e2', color: '#b91c1c' };
  }
  ```

- [ ] **Step 1.4: Esegui i test e verifica che passino**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerList
  ```

  Atteso: tutti i casi `formatRelativeTime` e `orderChipStyle` PASS. I test di `CustomerList` esistenti possono fallire sul badge — verrà fixato nel Task 2.

- [ ] **Step 1.5: Commit**

  ```bash
  git add archibald-web-app/frontend/src/pages/CustomerList.tsx archibald-web-app/frontend/src/pages/CustomerList.spec.tsx
  git commit -m "feat(customers): formatRelativeTime + orderChipStyle puri con test"
  ```

---

## Task 2 — Componente `OrderChip` + aggiornamento `CustomerRow`

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.tsx`
- Modify: `archibald-web-app/frontend/src/pages/CustomerList.spec.tsx`

- [ ] **Step 2.1: Aggiungi `OrderChip` e aggiorna `CustomerRow` in `CustomerList.tsx`**

  **2.1a** — Aggiungi `OrderChip` prima della funzione `CustomerRow` (riga ~363):

  ```tsx
  function OrderChip({ lastOrderDate }: { lastOrderDate: string | null }) {
    const { bg, color } = orderChipStyle(lastOrderDate);
    const label = formatRelativeTime(lastOrderDate);
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        flexShrink: 0, borderRadius: 8, padding: '4px 8px', minWidth: 72,
        background: bg,
      }}>
        <span style={{ fontSize: 8, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', lineHeight: 1, marginBottom: 2 }}>
          Ult. ordine
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color, lineHeight: 1.2 }}>
          {label}
        </span>
      </div>
    );
  }
  ```

  **2.1b** — Nella funzione `CustomerRow`, rimuovi `const badge = customerBadge(c);` (diventa inutilizzata) e sostituisci l'ultima riga del JSX:

  Rimuovi:
  ```tsx
  {badge && <span style={BADGE_STYLE[badge]}>{badge}</span>}
  ```

  Inserisci al suo posto:
  ```tsx
  <OrderChip lastOrderDate={c.lastOrderDate ?? null} />
  ```

  **2.1c** — Rimuovi la costante `BADGE_STYLE` (non più usata). Cerca il blocco:

  ```ts
  const BADGE_STYLE: Record<'attivo' | 'inattivo', React.CSSProperties> = {
    attivo:   { background: '#dcfce7', color: '#166534', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
    inattivo: { background: '#fef9c3', color: '#854d0e', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
  };
  ```

  ed eliminalo.

- [ ] **Step 2.2: Aggiorna il test rotto in `CustomerList.spec.tsx`**

  Il test attuale:
  ```ts
  test('badge "inattivo" per cliente con lastOrderDate > 180gg', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    expect(screen.getByText('inattivo')).toBeInTheDocument();
  });
  ```

  Sostituiscilo con:
  ```ts
  test('chip "Ult. ordine" visibile per ogni cliente', async () => {
    render(<MemoryRouter><CustomerList /></MemoryRouter>);
    await waitFor(() => screen.getByText('Rossi Mario'));
    // Due chip — uno per cliente
    const chips = screen.getAllByText('Ult. ordine');
    expect(chips).toHaveLength(2);
  });
  ```

- [ ] **Step 2.3: Esegui i test e verifica che passino**

  ```bash
  npm test --prefix archibald-web-app/frontend -- --reporter=verbose CustomerList
  ```

  Atteso: tutti i test PASS (inclusi quelli di Task 1 e il test aggiornato).

- [ ] **Step 2.4: Type-check**

  ```bash
  npm run type-check --prefix archibald-web-app/frontend
  ```

  Atteso: nessun errore TypeScript.

- [ ] **Step 2.5: Commit**

  ```bash
  git add archibald-web-app/frontend/src/pages/CustomerList.tsx archibald-web-app/frontend/src/pages/CustomerList.spec.tsx
  git commit -m "feat(customers): chip Ult. ordine a due righe nella lista clienti"
  ```

---

## Task 3 — Test suite completa

**Files:** nessun file modificato

- [ ] **Step 3.1: Esegui l'intera suite frontend**

  ```bash
  npm test --prefix archibald-web-app/frontend
  ```

  Atteso: tutti i test PASS, nessuna regressione.

- [ ] **Step 3.2: Verifica visiva in browser**

  Avvia il dev server:
  ```bash
  npm run dev --prefix archibald-web-app/frontend
  ```

  Apri `http://localhost:5173/customers` e verifica:
  - Ogni riga cliente mostra il chip "Ult. ordine / X mesi fa" a destra
  - Il chip è verde per clienti attivi, ambra per 3–6 mesi, rosso per > 6 mesi
  - I clienti senza ordini mostrano "—" su sfondo grigio
  - Su mobile (DevTools → responsive) i nomi lunghi sono troncati con ellipsis, il chip non va a capo
