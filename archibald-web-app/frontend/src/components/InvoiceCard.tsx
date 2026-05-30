import { useNavigate } from 'react-router-dom';
import type { LedgerInvoice } from '../types/customer-ledger';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Math.abs(n));
}

type StatusStyle = { bg: string; color: string; label: string };

function statusStyle(invoice: LedgerInvoice): StatusStyle {
  if (invoice.isNc) return { bg: '#f5f3ff', color: '#7c3aed', label: 'Credito aperto' };
  if (invoice.status === 'overdue') return { bg: '#fef2f2', color: '#dc2626', label: 'Scaduta' };
  if (invoice.status === 'due_soon') return { bg: '#fffbeb', color: '#d97706', label: 'In scadenza' };
  if (invoice.status === 'paid') return { bg: '#f0fdf4', color: '#16a34a', label: 'Saldato' };
  return { bg: '#eff6ff', color: '#2563eb', label: 'Aperta' };
}

type Props = { invoice: LedgerInvoice };

export function InvoiceCard({ invoice }: Props) {
  const navigate = useNavigate();
  const ss = statusStyle(invoice);

  // Per le fatture pagate mostra l'importo originale, non il residuo (che sarebbe 0)
  const displayAmount = invoice.status === 'paid' ? invoice.invoiceAmount : invoice.remainingAmount;

  // Se abbiamo l'orderId, usiamo ?highlight= che auto-espande l'ordine nella lista
  // Come fa il sistema di notifiche consegna (pattern esistente nella PWA)
  const handleClick = () => {
    if (invoice.orderId) {
      navigate(`/orders?highlight=${encodeURIComponent(invoice.orderId)}`);
    } else {
      navigate(`/orders?highlight=${encodeURIComponent(invoice.invoiceNumber)}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: invoice.status === 'paid' ? '#f8fafc' : '#ffffff',
        border: '1px solid #e8eef4',
        borderRadius: '10px',
        padding: '10px 14px',
        marginBottom: '6px',
        cursor: 'pointer',
        opacity: invoice.status === 'paid' ? 0.75 : 1,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
            {invoice.invoiceNumber}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {invoice.isNc ? (
              <span style={{ fontSize: '12px', color: '#64748b' }}>Credito disponibile</span>
            ) : invoice.status === 'paid' ? (
              <span style={{ fontSize: '12px', color: '#16a34a' }}>
                ✓ Saldato{invoice.lastSettlementDate ? ` ${invoice.lastSettlementDate}` : ''}
              </span>
            ) : invoice.dueDate ? (
              <span style={{ fontSize: '12px', color: invoice.status === 'overdue' ? '#dc2626' : '#64748b' }}>
                {invoice.status === 'overdue'
                  ? `⚠ Scad. ${invoice.dueDate} · +${invoice.daysPastDue}gg`
                  : `Scad. ${invoice.dueDate}`}
              </span>
            ) : null}
            {invoice.invoiceDate && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{invoice.invoiceDate}</span>
            )}
          </div>
          {invoice.settledAmount > 0 && !invoice.isNc && invoice.status !== 'paid' && (
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
              Saldato parzialmente: <strong>{formatEur(invoice.settledAmount)}</strong>
              {invoice.lastPaymentId ? ` · ${invoice.lastPaymentId}` : ''}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: ss.color }}>
            {invoice.isNc ? '− ' : ''}{formatEur(displayAmount)}
          </div>
          <div style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
            background: ss.bg, color: ss.color,
          }}>
            {ss.label}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '5px', fontSize: '11px', color: '#94a3b8' }}>
        Tocca per cercare l&apos;ordine associato
      </div>
    </div>
  );
}
