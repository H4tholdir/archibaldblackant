# Partitario — Piano 2: Frontend (Tab + Lista + Widget + Order Card)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare i 3 entry point del partitario nella PWA (tab nella CustomerProfilePage, badge/filtri nella lista clienti, widget nella Dashboard) e il banner "cliente bloccato" sull'order card.

**Architecture:** Componenti React 19 che consumano `/api/ledger/:erpId`. Stile inline `style={{}}` come da codebase. I mockup in `.superpowers/brainstorm/*/partitario-ui-v2.html` e `section4-templates-pwa.html` sono il contratto 1:1 pixel-perfect.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library, CSS inline.

**Dipende da:** Piano 1 (endpoint `/api/ledger` attivo).

**Spec di riferimento:** `docs/superpowers/specs/2026-05-30-partitario-clienti-notifiche-design.md` §4

---

## File Map

**Nuovi:**
- `frontend/src/types/customer-ledger.ts`
- `frontend/src/api/customer-ledger.ts`
- `frontend/src/components/LedgerSummary.tsx`
- `frontend/src/components/InvoiceCard.tsx`
- `frontend/src/components/PartitarioTab.tsx`
- `frontend/src/components/ExposureWidget.tsx`
- `frontend/src/components/PartitarioTab.spec.tsx`

**Modificati:**
- `frontend/src/pages/CustomerProfilePage.tsx` (aggiunta tab Partitario)
- `frontend/src/pages/CustomerList.tsx` (badge esposizione + filtri)
- `frontend/src/pages/Dashboard.tsx` (widget esposizione)
- `frontend/src/components/OrderCardNew.tsx` (banner cliente bloccato)

---

## Task 1: Tipi e client API

**Files:**
- Create: `frontend/src/types/customer-ledger.ts`
- Create: `frontend/src/api/customer-ledger.ts`

- [ ] **Step 1: Crea i tipi**

```typescript
// frontend/src/types/customer-ledger.ts
export type InvoiceStatus = 'overdue' | 'due_soon' | 'open' | 'paid';

export type LedgerInvoice = {
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: number;
  remainingAmount: number;
  settledAmount: number;
  dueDate: string | null;
  daysPastDue: number;
  lastPaymentId: string | null;
  lastSettlementDate: string | null;
  status: InvoiceStatus;
  isNc: boolean;
};

export type LedgerSummary = {
  totalDaSaldare: number;
  totalScaduto: number;
  totalIncassatoAperte: number;
  totalNcAperte: number;
  maxDaysPastDue: number;
  openInvoices: LedgerInvoice[];
  ncInvoices: LedgerInvoice[];
  paidInvoices: LedgerInvoice[];
  blockedStatus: string | null;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};
```

- [ ] **Step 2: Crea il client API**

```typescript
// frontend/src/api/customer-ledger.ts
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';

function jwt(): string {
  return localStorage.getItem('archibald_jwt') ?? '';
}

export async function fetchCustomerLedger(erpId: string): Promise<LedgerSummary> {
  const res = await fetch(`/api/ledger/${encodeURIComponent(erpId)}`, {
    headers: { Authorization: `Bearer ${jwt()}` },
  });
  if (!res.ok) throw new Error(`Ledger fetch failed: ${res.status}`);
  const body = await res.json() as { success: boolean; data: LedgerSummary };
  return body.data;
}

export async function fetchCustomerLedgerHistory(erpId: string): Promise<LedgerInvoice[]> {
  const res = await fetch(`/api/ledger/${encodeURIComponent(erpId)}/history`, {
    headers: { Authorization: `Bearer ${jwt()}` },
  });
  if (!res.ok) throw new Error(`Ledger history fetch failed: ${res.status}`);
  const body = await res.json() as { success: boolean; data: LedgerInvoice[] };
  return body.data;
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/types/customer-ledger.ts
git add archibald-web-app/frontend/src/api/customer-ledger.ts
git commit -m "feat(ledger): tipi LedgerSummary e client API fetchCustomerLedger"
```

---

## Task 2: Componente `LedgerSummary` (4 KPI card)

**Files:**
- Create: `frontend/src/components/LedgerSummary.tsx`

Mockup di riferimento: `partitario-ui-v2.html` — griglia 2×2, colori specifici per ogni KPI.

- [ ] **Step 1: Implementa il componente**

```typescript
// frontend/src/components/LedgerSummary.tsx
import type { LedgerSummary as LedgerSummaryType } from '../types/customer-ledger';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

type Props = { summary: LedgerSummaryType };

export function LedgerSummary({ summary }: Props) {
  const cards = [
    {
      label: 'Scaduto',
      value: formatEur(summary.totalScaduto),
      sub: summary.maxDaysPastDue > 0 ? `max +${summary.maxDaysPastDue} giorni` : 'Nessuna fattura scaduta',
      clarify: 'due_date < oggi',
      bg: '#1c0a0a', border: '1px solid #7f1d1d', color: '#ef4444',
    },
    {
      label: 'Da saldare (lordo)',
      value: formatEur(summary.totalDaSaldare),
      sub: `${summary.openInvoices.length} fatture aperte`,
      clarify: 'Non include NC',
      bg: '#1c1200', border: '1px solid #78350f', color: '#f59e0b',
    },
    {
      label: 'Incassato (aperte)',
      value: formatEur(summary.totalIncassatoAperte),
      sub: 'settled su fatture aperte',
      clarify: 'Non è il totale storico',
      bg: '#1e293b', border: 'none', color: '#e2e8f0',
    },
    {
      label: 'Note di credito aperte',
      value: formatEur(summary.totalNcAperte),
      sub: `${summary.ncInvoices.length} NC · da applicare`,
      clarify: 'Non scalate dal lordo',
      bg: '#1a0e2e', border: '1px solid #6d28d9', color: '#c4b5fd',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: c.bg, border: c.border, borderRadius: '8px', padding: '9px 10px' }}>
          <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.7px', color: '#64748b', marginBottom: '2px' }}>
            {c.label}
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>{c.sub}</div>
          <div style={{ fontSize: '7px', color: '#475569', marginTop: '1px', fontStyle: 'italic' }}>{c.clarify}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/LedgerSummary.tsx
git commit -m "feat(ledger): componente LedgerSummary con 4 KPI card"
```

---

## Task 3: Componente `InvoiceCard`

**Files:**
- Create: `frontend/src/components/InvoiceCard.tsx`

- [ ] **Step 1: Implementa il componente**

```typescript
// frontend/src/components/InvoiceCard.tsx
import type { LedgerInvoice } from '../types/customer-ledger';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Math.abs(n));
}

function statusColor(invoice: LedgerInvoice): { border: string; amountColor: string } {
  if (invoice.isNc) return { border: '#6d28d9', amountColor: '#c4b5fd' };
  if (invoice.status === 'overdue') return { border: '#ef4444', amountColor: '#ef4444' };
  if (invoice.status === 'due_soon') return { border: '#f59e0b', amountColor: '#f59e0b' };
  if (invoice.status === 'paid') return { border: '#22c55e', amountColor: '#86efac' };
  return { border: '#3b82f6', amountColor: '#93c5fd' };
}

function statusBadge(invoice: LedgerInvoice): { label: string; bg: string; color: string } {
  if (invoice.isNc) return { label: 'Credito aperto', bg: '#2e1065', color: '#ddd6fe' };
  if (invoice.status === 'overdue') return { label: 'Scaduta', bg: '#7f1d1d', color: '#fca5a5' };
  if (invoice.status === 'due_soon') return { label: 'In scadenza', bg: '#78350f', color: '#fcd34d' };
  if (invoice.status === 'paid') return { label: 'Chiusa', bg: '#14532d', color: '#86efac' };
  return { label: 'Aperta', bg: '#1e3a5f', color: '#93c5fd' };
}

type Props = { invoice: LedgerInvoice };

export function InvoiceCard({ invoice }: Props) {
  const { border, amountColor } = statusColor(invoice);
  const badge = statusBadge(invoice);

  const dueLabel = (() => {
    if (invoice.status === 'paid') return invoice.lastSettlementDate ? `✓ Saldato ${invoice.lastSettlementDate}` : '✓ Saldato';
    if (!invoice.dueDate) return null;
    if (invoice.status === 'overdue') return `⚠ Scad. ${invoice.dueDate} · +${invoice.daysPastDue}gg`;
    return `Scad. ${invoice.dueDate}`;
  })();

  const dueColor = invoice.status === 'overdue' ? '#ef4444' : invoice.status === 'paid' ? '#22c55e' : '#64748b';

  return (
    <div style={{
      background: '#1e293b', borderRadius: '8px', padding: '9px 12px',
      marginBottom: '5px', borderLeft: `3px solid ${border}`,
      opacity: invoice.status === 'paid' ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#e2e8f0' }}>
          {invoice.invoiceNumber}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 800, color: amountColor }}>
          {invoice.isNc ? '− ' : ''}{formatEur(invoice.remainingAmount)}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
        {dueLabel && (
          <div style={{ fontSize: '9px', color: dueColor }}>{dueLabel}</div>
        )}
        <div style={{
          fontSize: '7px', padding: '1px 5px', borderRadius: '3px',
          fontWeight: 700, background: badge.bg, color: badge.color,
          marginLeft: 'auto',
        }}>
          {badge.label}
        </div>
      </div>

      {invoice.settledAmount > 0 && !invoice.isNc && invoice.status !== 'paid' && (
        <div style={{ fontSize: '8px', color: '#64748b', marginTop: '3px' }}>
          Saldato parzialmente: <span style={{ color: '#94a3b8' }}>{formatEur(invoice.settledAmount)}</span>
          {invoice.lastPaymentId ? ` · ${invoice.lastPaymentId}` : ''}
          {invoice.lastSettlementDate ? ` (${invoice.lastSettlementDate})` : ''}
        </div>
      )}

      {invoice.isNc && (
        <div style={{ fontSize: '8px', color: '#a78bfa', marginTop: '3px' }}>
          Credito disponibile — non ancora applicato a fattura
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check e commit**

```bash
npm run type-check --prefix archibald-web-app/frontend
git add archibald-web-app/frontend/src/components/InvoiceCard.tsx
git commit -m "feat(ledger): componente InvoiceCard con stati overdue/due_soon/open/paid/NC"
```

---

## Task 4: Componente `PartitarioTab`

**Files:**
- Create: `frontend/src/components/PartitarioTab.tsx`
- Create: `frontend/src/components/PartitarioTab.spec.tsx`

- [ ] **Step 1: Scrivi test failing**

```typescript
// frontend/src/components/PartitarioTab.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PartitarioTab } from './PartitarioTab';

const mockLedger = {
  totalDaSaldare: 3277.57,
  totalScaduto: 3277.57,
  totalIncassatoAperte: 1092.51,
  totalNcAperte: 0,
  maxDaysPastDue: 90,
  openInvoices: [{
    invoiceNumber: 'CF1/26001415', invoiceDate: '2026-02-27',
    invoiceAmount: 2185.06, remainingAmount: 2185.06, settledAmount: 0,
    dueDate: '2026-03-31', daysPastDue: 59, lastPaymentId: null,
    lastSettlementDate: null, status: 'overdue' as const, isNc: false,
  }],
  ncInvoices: [], paidInvoices: [],
  blockedStatus: 'Completo',
  effectiveEmail: 'amministrazione@maco.it',
  effectiveWhatsapp: '+39 390 829 58044',
};

vi.mock('../api/customer-ledger', () => ({
  fetchCustomerLedger: vi.fn().mockResolvedValue(mockLedger),
  fetchCustomerLedgerHistory: vi.fn().mockResolvedValue([]),
}));

describe('PartitarioTab', () => {
  it('mostra alert blocco quando blockedStatus è Completo', async () => {
    render(<PartitarioTab erpId="55.226" />);
    expect(await screen.findByText(/cliente bloccato/i)).toBeTruthy();
  });

  it('mostra il totale da saldare', async () => {
    render(<PartitarioTab erpId="55.226" />);
    expect(await screen.findByText(/3\.277/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che fallisce**

```bash
npm test --prefix archibald-web-app/frontend -- PartitarioTab
```

Expected: FAIL — "PartitarioTab is not a function"

- [ ] **Step 3: Implementa il componente**

```typescript
// frontend/src/components/PartitarioTab.tsx
import { useState, useEffect } from 'react';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
import { fetchCustomerLedger, fetchCustomerLedgerHistory } from '../api/customer-ledger';
import { LedgerSummary as LedgerSummaryComponent } from './LedgerSummary';
import { InvoiceCard } from './InvoiceCard';

type Props = { erpId: string };

export function PartitarioTab({ erpId }: Props) {
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [history, setHistory] = useState<LedgerInvoice[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCustomerLedger(erpId)
      .then(setLedger)
      .catch(() => setError('Impossibile caricare il partitario'))
      .finally(() => setLoading(false));
  }, [erpId]);

  const handleShowHistory = async () => {
    if (history.length === 0) {
      const h = await fetchCustomerLedgerHistory(erpId).catch(() => []);
      setHistory(h);
    }
    setShowHistory(v => !v);
  };

  if (loading) {
    return <div style={{ padding: '16px', color: '#64748b', fontSize: '12px' }}>Caricamento partitario...</div>;
  }
  if (error || !ledger) {
    return <div style={{ padding: '16px', color: '#ef4444', fontSize: '12px' }}>{error ?? 'Errore sconosciuto'}</div>;
  }

  const nettingAmount = ledger.totalDaSaldare - ledger.totalNcAperte;

  return (
    <div style={{ padding: '12px 16px' }}>

      {/* Banner bloccato */}
      {ledger.blockedStatus && (
        <div style={{
          background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '10px',
          padding: '10px 12px', marginBottom: '10px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '18px' }}>💀</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#fca5a5' }}>Cliente bloccato dall'ERP</div>
            <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '1px' }}>
              Ordini in lavorazione sospesi · Insoluti da {ledger.maxDaysPastDue} giorni
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <LedgerSummaryComponent summary={ledger} />

      {/* Netting NC (solo se NC > 0) */}
      {ledger.totalNcAperte > 0 && (
        <div style={{
          background: '#1e293b', borderRadius: '8px', padding: '8px 12px',
          marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>Esposizione netta indicativa</div>
            <div style={{ fontSize: '7px', color: '#475569', fontStyle: 'italic' }}>Se applicate le NC disponibili</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(ledger.totalDaSaldare)}
              {' − '}
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(ledger.totalNcAperte)}
              {' NC ='}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(nettingAmount)}
            </div>
          </div>
        </div>
      )}

      {/* NC aperte */}
      {ledger.ncInvoices.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
              🟣 Note di credito aperte ({ledger.ncInvoices.length})
            </span>
          </div>
          {ledger.ncInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </>
      )}

      {/* Fatture aperte */}
      {ledger.openInvoices.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', marginTop: '10px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
              ⚠ Fatture aperte ({ledger.openInvoices.length})
            </span>
          </div>
          {ledger.openInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </>
      )}

      {ledger.openInvoices.length === 0 && ledger.ncInvoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>
          ✅ Nessuna fattura aperta
        </div>
      )}

      {/* Storico */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '5px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
          ✅ Storico saldato
        </span>
        <button
          onClick={handleShowHistory}
          style={{ fontSize: '9px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {showHistory ? 'Nascondi ▲' : `Mostra (${history.length || '...'}) ▼`}
        </button>
      </div>
      {showHistory && history.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
      {showHistory && history.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: '9px', color: '#64748b', padding: '8px' }}>Nessuno storico disponibile</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Esegui i test**

```bash
npm test --prefix archibald-web-app/frontend -- PartitarioTab
```

Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/PartitarioTab.tsx
git add archibald-web-app/frontend/src/components/PartitarioTab.spec.tsx
git commit -m "feat(ledger): PartitarioTab con KPI, fatture aperte, NC, storico, banner blocco"
```

---

## Task 5: Integrazione in CustomerProfilePage

**Files:**
- Modify: `frontend/src/pages/CustomerProfilePage.tsx`

- [ ] **Step 1: Aggiungi la tab Partitario**

In `CustomerProfilePage.tsx`, cerca l'array/lista delle tab (dove appaiono "Contatti", "Storico", "Agenda", "Promemoria") e aggiungi `'💰 Partitario'` e `'🔔 Notifiche'`.

Aggiungi import in cima:
```typescript
import { PartitarioTab } from '../components/PartitarioTab';
```

Nella sezione dove viene renderizzata la tab attiva, aggiungi il case per il partitario:
```tsx
{activeTab === '💰 Partitario' && (
  <PartitarioTab erpId={erpId} />
)}
```

La tab `'🔔 Notifiche'` è un placeholder vuoto per ora (viene completata nel Piano 3).

- [ ] **Step 2: Type-check**

```bash
npm run type-check --prefix archibald-web-app/frontend
```

Expected: 0 errori

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/pages/CustomerProfilePage.tsx
git commit -m "feat(ledger): aggiunta tab Partitario in CustomerProfilePage"
```

---

## Task 6: Badge esposizione nella CustomerList

**Files:**
- Modify: `frontend/src/pages/CustomerList.tsx`

- [ ] **Step 1: Aggiungi fetch ledger aggregato e badge**

In `CustomerList.tsx`, aggiungi un fetch in background per i clienti con scaduti. L'endpoint `/api/ledger/:erpId` è per-cliente — usa un fetch separato lazy quando si visualizza la lista.

Alternativa più semplice (raccomandata): aggiungi una query al backend `/api/ledger/summary` che restituisce solo i totali per tutti i clienti. Per ora, mostra il badge `blocked_status` che arriva già da `/api/customers`.

```tsx
// Nel componente della card cliente, aggiungi badge blocco:
{customer.blocked_status === 'Completo' && (
  <div style={{
    background: '#7f1d1d', border: '1px solid #ef4444',
    borderRadius: '6px', padding: '2px 6px',
    fontSize: '8px', fontWeight: 700, color: '#fca5a5',
    display: 'flex', alignItems: 'center', gap: '3px',
  }}>
    💀 BLOCCATO
  </div>
)}
```

Aggiungi filtro rapido nella barra superiore:
```tsx
{/* Filtro "Bloccati" */}
<button
  onClick={() => setFilter(f => f === 'blocked' ? 'all' : 'blocked')}
  style={{
    background: filter === 'blocked' ? '#7f1d1d' : '#1e293b',
    color: filter === 'blocked' ? '#fca5a5' : '#64748b',
    border: '1px solid', borderColor: filter === 'blocked' ? '#ef4444' : '#334155',
    borderRadius: '4px', padding: '3px 8px', fontSize: '9px', fontWeight: 700,
    cursor: 'pointer',
  }}
>
  💀 Bloccati
</button>
```

Filtra la lista quando `filter === 'blocked'`:
```typescript
const filteredCustomers = filter === 'blocked'
  ? customers.filter(c => c.blocked_status != null)
  : customers;
```

- [ ] **Step 2: Assicurati che `customers` includa `blocked_status`**

Controlla che l'endpoint `/api/customers` restituisca `blocked_status`. Se non è presente nel tipo `Customer`:

```typescript
// frontend/src/types/customer.ts — aggiungi al tipo Customer:
blocked_status?: string | null;
```

- [ ] **Step 3: Type-check e commit**

```bash
npm run type-check --prefix archibald-web-app/frontend
git add archibald-web-app/frontend/src/pages/CustomerList.tsx
git add archibald-web-app/frontend/src/types/customer.ts
git commit -m "feat(ledger): badge bloccato e filtro nella CustomerList"
```

---

## Task 7: Widget Dashboard

**Files:**
- Create: `frontend/src/components/ExposureWidget.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Crea ExposureWidget**

```typescript
// frontend/src/components/ExposureWidget.tsx
import { useState, useEffect } from 'react';

type ExposureData = {
  totalScaduto: number;
  totalAperto: number;
  blockedCount: number;
  topDebtors: Array<{ name: string; erpId: string; scaduto: number; isBlocked: boolean }>;
  pendingWaCount: number;
};

async function fetchExposureSummary(jwt: string): Promise<ExposureData> {
  // Endpoint da creare nel Piano 3; per ora placeholder
  const res = await fetch('/api/ledger/dashboard-summary', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Exposure fetch failed');
  return (await res.json() as { data: ExposureData }).data;
}

function formatEurK(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(0)}k`;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export function ExposureWidget() {
  const [data, setData] = useState<ExposureData | null>(null);

  useEffect(() => {
    const jwt = localStorage.getItem('archibald_jwt') ?? '';
    fetchExposureSummary(jwt).then(setData).catch(() => null);
  }, []);

  if (!data) return null;

  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '14px', border: '1px solid #1e293b', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>💰 Esposizione Clienti</div>
        <a href="/customers?filter=blocked" style={{ fontSize: '9px', color: '#3b82f6', textDecoration: 'none' }}>Vedi tutto →</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
        {[
          { label: 'Scaduto', value: formatEurK(data.totalScaduto), bg: '#1c0a0a', border: '#7f1d1d', color: '#ef4444' },
          { label: 'Aperto', value: formatEurK(data.totalAperto), bg: '#1c1200', border: '#78350f', color: '#f59e0b' },
          { label: '💀 Bloccati', value: String(data.blockedCount), bg: '#1c0a0a', border: '#7f1d1d', color: '#ef4444' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '8px', color: '#94a3b8' }}>{c.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {data.topDebtors.slice(0, 3).map(d => (
        <div key={d.erpId} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1e293b', borderRadius: '6px', padding: '7px 10px', marginBottom: '5px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px' }}>{d.isBlocked ? '💀' : '⚠'}</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: d.isBlocked ? '#fca5a5' : '#fcd34d' }}>{d.name}</div>
              <div style={{ fontSize: '8px', color: '#64748b' }}>{d.isBlocked ? 'Bloccato · ' : ''}{d.scaduto > 0 ? `+${Math.round(d.scaduto / 365 * 365)}gg scaduto` : 'in scadenza'}</div>
            </div>
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: d.isBlocked ? '#ef4444' : '#f59e0b' }}>
            {formatEurK(d.scaduto)}
          </div>
        </div>
      ))}

      {data.pendingWaCount > 0 && (
        <div style={{
          background: '#0d2818', border: '1px solid #22c55e', borderRadius: '8px',
          padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '5px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>💬</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#4ade80' }}>{data.pendingWaCount} messaggi WhatsApp pronti</div>
              <div style={{ fontSize: '8px', color: '#86efac' }}>Da inviare oggi</div>
            </div>
          </div>
          <a href="/pending-whatsapp" style={{
            background: '#166534', color: '#86efac', fontSize: '9px',
            fontWeight: 700, padding: '4px 10px', borderRadius: '6px', textDecoration: 'none',
          }}>Apri →</a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi il widget alla Dashboard**

In `Dashboard.tsx`, aggiungi import e renderizza `<ExposureWidget />` nella posizione appropriata (prima degli ordini recenti):

```typescript
import { ExposureWidget } from '../components/ExposureWidget';
// ...
<ExposureWidget />
```

**Nota:** Il widget richiede l'endpoint `/api/ledger/dashboard-summary` che viene creato nel Piano 3. Fino ad allora, il widget non renderizza (early return su null se fetch fallisce).

- [ ] **Step 3: Type-check e commit**

```bash
npm run type-check --prefix archibald-web-app/frontend
git add archibald-web-app/frontend/src/components/ExposureWidget.tsx
git add archibald-web-app/frontend/src/pages/Dashboard.tsx
git commit -m "feat(ledger): ExposureWidget nella Dashboard con KPI aggregati e top debitori"
```

---

## Task 8: Banner cliente bloccato su OrderCardNew

**Files:**
- Modify: `frontend/src/components/OrderCardNew.tsx`

⚠ `OrderCardNew.tsx` è 140KB. Modifica chirurgica: cerca il punto dove viene renderizzato il top della card e inserisci il banner.

- [ ] **Step 1: Trova l'inizio del rendering della card**

```bash
grep -n "customer_name\|customerName\|blocked\|isBlocked" archibald-web-app/frontend/src/components/OrderCardNew.tsx | head -20
```

- [ ] **Step 2: Aggiungi la prop `blockedStatus` alla card**

Trova il tipo props della card (cerca `type.*Props` o `interface.*Props`) e aggiungi:
```typescript
blockedStatus?: string | null;
```

- [ ] **Step 3: Aggiungi il banner nella card**

Prima del contenuto principale della card, aggiungi:
```tsx
{blockedStatus === 'Completo' && (
  <div style={{
    background: '#7f1d1d', padding: '5px 12px',
    display: 'flex', alignItems: 'center', gap: '6px',
    borderBottom: '1px solid #ef4444',
  }}>
    <span style={{ fontSize: '12px' }}>💀</span>
    <span style={{ fontSize: '9px', fontWeight: 700, color: '#fca5a5', flex: 1 }}>
      CLIENTE BLOCCATO — Ordine in attesa
    </span>
    <a
      href={`/customers/${orderCustomerErpId}?tab=partitario`}
      style={{ fontSize: '8px', color: '#f87171', textDecoration: 'underline' }}
    >
      Vedi partitario →
    </a>
  </div>
)}
```

- [ ] **Step 4: Passa `blockedStatus` dall'ordine**

In `OrderHistory.tsx` o dove vengono passate le props alla card, aggiungi `blockedStatus={order.customer?.blocked_status}`.

- [ ] **Step 5: Type-check e build**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
```

Expected: 0 errori

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/OrderCardNew.tsx
git commit -m "feat(ledger): banner bloccato su OrderCardNew con link a partitario"
```

---

## Self-Review

**Spec coverage:**
- ✅ Tab `💰 Partitario` in CustomerProfilePage
- ✅ Badge bloccato + filtro in CustomerList
- ✅ Widget Dashboard (placeholder fino a Piano 3 per summary endpoint)
- ✅ Order card con banner bloccato e link partitario
- ✅ KPI con semantica locked (Da saldare lordo, NC separate, netting indicativo)
- ✅ Mockup binding rispettato (partitario-ui-v2.html)

**Non in questo piano (Piano 3):**
- `/api/ledger/dashboard-summary` endpoint
- Tab `🔔 Notifiche` nella ProfilePage
- Gestione pending WhatsApp nella PWA
