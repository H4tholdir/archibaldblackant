import { useState, useEffect, type CSSProperties } from 'react';
import type { VisitBrief, VisitOutcome } from '../../types/visit-planning';
import { SOURCE_BADGE } from '../../types/visit-planning';
import { VisitOutcomeButtons } from './VisitOutcomeButtons';
import {
  getVisitPreferences, updateVisitPreferences, type VisitPreferences,
} from '../../services/visit-planning.service';

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

  const [prefs, setPrefs]         = useState<VisitPreferences | null>(null);
  const [editPrefs, setEditPrefs] = useState(false);
  const [prefsForm, setPrefsForm] = useState<VisitPreferences>({
    typicalVisitMinutes: 30, preferredTimeStart: null, preferredTimeEnd: null,
    requiresAppointment: false, notes: null,
  });

  useEffect(() => {
    getVisitPreferences(brief.sourceType, brief.sourceId)
      .then(p => { setPrefs(p); setPrefsForm(p); })
      .catch(() => {});
  }, [brief.sourceType, brief.sourceId]);

  const savePrefs = async () => {
    try {
      await updateVisitPreferences(brief.sourceType, brief.sourceId, prefsForm);
      setPrefs(prefsForm);
      setEditPrefs(false);
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

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

      {/* ── Orari preferiti ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={SECTION_TITLE}>⏰ Orari preferiti</div>
          <button
            onClick={() => setEditPrefs(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2563eb' }}
          >
            {editPrefs ? 'Annulla' : 'Modifica'}
          </button>
        </div>
        {editPrefs ? (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Dalle</div>
                <input type="time" value={prefsForm.preferredTimeStart ?? '08:00'}
                  onChange={e => setPrefsForm(f => ({ ...f, preferredTimeStart: e.target.value }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Alle</div>
                <input type="time" value={prefsForm.preferredTimeEnd ?? '18:00'}
                  onChange={e => setPrefsForm(f => ({ ...f, preferredTimeEnd: e.target.value }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Durata (min)</div>
                <input type="number" min={5} max={240} value={prefsForm.typicalVisitMinutes}
                  onChange={e => setPrefsForm(f => ({ ...f, typicalVisitMinutes: Number(e.target.value) }))}
                  style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 6px', fontSize: 13, width: 70 }} />
              </div>
            </div>
            <button
              onClick={savePrefs}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
            >Salva</button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#374151' }}>
            {prefs
              ? `${prefs.preferredTimeStart ?? '08:00'} – ${prefs.preferredTimeEnd ?? '18:00'} · ${prefs.typicalVisitMinutes} min`
              : '08:00 – 18:00 · 30 min (default)'
            }
          </div>
        )}
      </div>

      <div style={CARD}>
        <div style={SECTION_TITLE}>✅ Esito visita</div>
        <VisitOutcomeButtons onOutcome={onOutcome} />
      </div>

    </div>
  );
}
