import type { LedgerSummary as LedgerSummaryType } from '../types/customer-ledger';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

type Props = { summary: LedgerSummaryType };

export function LedgerSummary({ summary }: Props) {
  const cards = [
    {
      label: 'SCADUTO',
      value: formatEur(summary.totalScaduto),
      sub: summary.maxDaysPastDue > 0 ? `max +${summary.maxDaysPastDue} giorni` : 'Nessuna scadenza',
      note: 'data scadenza < oggi',
      bg: '#fef2f2', border: '#fecaca', color: '#dc2626',
    },
    {
      label: 'DA SALDARE',
      value: formatEur(summary.totalDaSaldare),
      sub: `${summary.openInvoices.length} fattur${summary.openInvoices.length === 1 ? 'a' : 'e'} aperte`,
      note: 'importo lordo · NC escluse',
      bg: '#fffbeb', border: '#fde68a', color: '#d97706',
    },
    {
      label: 'INCASSATO (su aperte)',
      value: formatEur(summary.totalIncassatoAperte),
      sub: 'pagamenti ricevuti',
      note: 'solo fatture ancora aperte',
      bg: '#f8fafc', border: '#e2e8f0', color: '#475569',
    },
    {
      label: 'NOTE DI CREDITO',
      value: formatEur(summary.totalNcAperte),
      sub: `${summary.ncInvoices.length} NC da applicare`,
      note: 'non scalate dal lordo',
      bg: '#faf5ff', border: '#e9d5ff', color: '#7c3aed',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
      {cards.map(c => (
        <div
          key={c.label}
          style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: '10px',
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '4px' }}>
            {c.label}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: c.color, lineHeight: 1.1, marginBottom: '4px' }}>
            {c.value}
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>{c.sub}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{c.note}</div>
        </div>
      ))}
    </div>
  );
}
