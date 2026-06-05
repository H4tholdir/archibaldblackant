import type { CSSProperties } from 'react';
import type { VisitBrief, VisitOutcome } from '../../types/visit-planning';
import { SOURCE_BADGE } from '../../types/visit-planning';
import { VisitOutcomeButtons } from './VisitOutcomeButtons';

type Props = {
  brief:     VisitBrief;
  onOutcome: (outcome: VisitOutcome) => void;
};

const SECTION_TITLE: CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  color: '#9ca3af', letterSpacing: '0.05em', marginBottom: 6,
};

const CARD: CSSProperties = {
  background: 'white', borderRadius: 8, padding: '10px 12px', marginBottom: 8,
  boxShadow: '0 1px 2px rgba(0,0,0,.05)',
};

export function VisitBriefPanel({ brief, onOutcome }: Props) {
  const hasSuggestions = brief.suggestedCategories.length > 0 || brief.activePromotions.length > 0;
  const primaryBadge = brief.matchedSources.length > 1 ? '[A+F]' : `[${SOURCE_BADGE[brief.sourceType]}]`;

  const buildNavUrl = () => {
    if (brief.lat && brief.lng) return `https://maps.google.com/maps?daddr=${brief.lat},${brief.lng}`;
    const addr = [brief.street, brief.postalCode, brief.city, 'Italy'].filter(Boolean).join(', ');
    return `https://maps.google.com/maps?daddr=${encodeURIComponent(addr)}`;
  };

  return (
    <div style={{ padding: '0 0 80px' }}>

      <div style={{ background: '#1e293b', color: 'white', padding: '14px 16px', borderRadius: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{brief.displayName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {brief.city}{brief.postalCode ? ` · ${brief.postalCode}` : ''} &nbsp;
              <span style={{ background: '#334155', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{primaryBadge}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {brief.phone && (
              <a href={`tel:${brief.phone}`} title="Chiama" style={{ background: '#2563eb', color: 'white', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', fontSize: 13 }}>📞</a>
            )}
            <a href={buildNavUrl()} target="_blank" rel="noopener noreferrer" style={{ background: '#16a34a', color: 'white', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', fontSize: 13 }}>🧭</a>
          </div>
        </div>
      </div>

      {hasSuggestions && (
        <div style={{ ...CARD, borderLeft: '4px solid #2563eb', background: '#eff6ff' }}>
          <div style={{ ...SECTION_TITLE, color: '#1d4ed8' }}>🎯 Da proporre oggi</div>
          {brief.activePromotions.map(p => (
            <div key={p.id} style={{ fontSize: 13, color: '#1e40af', marginBottom: 3 }}>
              ↗ <b>{p.name}</b>{p.tagline ? ` — ${p.tagline}` : ''} <span style={{ fontSize: 11, color: '#16a34a' }}>scade {p.validTo.slice(0, 10)}</span>
            </div>
          ))}
          {brief.suggestedCategories.map(cat => (
            <div key={cat} style={{ fontSize: 13, color: '#0891b2', marginBottom: 2 }}>↗ {cat} <span style={{ fontSize: 11, color: '#6b7280' }}>(mai acquistato)</span></div>
          ))}
          {brief.reorderProbability === 'high' && (
            <div style={{ fontSize: 12, color: '#15803d', marginTop: 4, fontWeight: 600 }}>
              🔄 Probabilità riordino alta {brief.reorderCycleDays ? `(ciclo ~${brief.reorderCycleDays}gg)` : ''}
            </div>
          )}
        </div>
      )}

      {brief.lastOrders.length > 0 && (
        <div style={CARD}>
          <div style={SECTION_TITLE}>📦 Ultimi ordini</div>
          {brief.lastOrders.map((o, i) => (
            <div key={i} style={{ borderBottom: i < brief.lastOrders.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: 6, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#0891b2', fontWeight: 600 }}>{o.docRef}</span>
                <span>€{o.amountImponibile.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {o.date.slice(0, 10)} · {o.source === 'fresis' ? 'Fresis' : 'Archibald'} ·{' '}
                {o.items.slice(0, 2).map(it => it.description).join(', ')}
                {o.items.length > 2 ? ` +${o.items.length - 2}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {brief.openReminders.length > 0 && (
        <div style={CARD}>
          <div style={SECTION_TITLE}>📌 Reminder aperti</div>
          {brief.openReminders.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: '#374151', marginBottom: 3 }}>
              {r.note ?? '—'} <span style={{ color: '#ef4444', fontSize: 11 }}>scade {r.dueAt.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={CARD}>
        <div style={SECTION_TITLE}>✅ Esito visita</div>
        <VisitOutcomeButtons onOutcome={onOutcome} />
      </div>

    </div>
  );
}
