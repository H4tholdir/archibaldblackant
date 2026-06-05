import type { VisitOutcome } from '../../types/visit-planning';

type Props = { onOutcome: (outcome: VisitOutcome) => void };

const OUTCOMES: Array<{ outcome: VisitOutcome; label: string; bg: string; color: string }> = [
  { outcome: 'visited',       label: 'Visitato',        bg: '#dcfce7', color: '#166534' },
  { outcome: 'order_created', label: 'Ordine fatto',    bg: '#dbeafe', color: '#1e40af' },
  { outcome: 'no_order',      label: 'Nessun ordine',   bg: '#fef9c3', color: '#854d0e' },
  { outcome: 'closed',        label: 'Chiuso',          bg: '#fee2e2', color: '#991b1b' },
  { outcome: 'not_available', label: 'Non disponibile', bg: '#f3f4f6', color: '#374151' },
  { outcome: 'rescheduled',   label: 'Rinvia',          bg: '#ede9fe', color: '#5b21b6' },
];

export function VisitOutcomeButtons({ onOutcome }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {OUTCOMES.map(o => (
        <button
          key={o.outcome}
          onClick={() => onOutcome(o.outcome)}
          style={{
            background: o.bg, color: o.color, border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}
