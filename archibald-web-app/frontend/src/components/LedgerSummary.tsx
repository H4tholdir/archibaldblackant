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
