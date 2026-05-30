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
