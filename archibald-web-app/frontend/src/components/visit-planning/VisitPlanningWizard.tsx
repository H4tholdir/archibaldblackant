import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { CreateSessionInput, VisitHorizon, VisitMode } from '../../types/visit-planning';
import { VISIT_MODE_LABELS } from '../../types/visit-planning';

type Props = {
  onSubmit: (input: CreateSessionInput) => Promise<void>;
  onCancel: () => void;
};

const HORIZONS: Array<{ value: VisitHorizon; label: string }> = [
  { value: 'day',  label: '📅 Singola giornata' },
  { value: 'week', label: '🗓️ Settimana' },
];

const MODES: VisitMode[] = ['balanced', 'profitability', 'coverage', 'constrained', 'manual_assist'];

export function VisitPlanningWizard({ onSubmit, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep]           = useState(0);
  const [horizon, setHorizon]     = useState<VisitHorizon>('day');
  const [mode, setMode]           = useState<VisitMode>('balanced');
  const [startDate, setStartDate] = useState(today);
  const formatTitleDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const wd = d.toLocaleDateString('it-IT', { weekday: 'long' });
    const dm = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`;
  };
  const [title, setTitle] = useState(() => `Giro — ${formatTitleDate(today)}`);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [loading, setLoading]     = useState(false);

  const [useCustomStart, setUseCustomStart] = useState(false);
  const [startLat, setStartLat]             = useState<number | null>(null);
  const [startLng, setStartLng]             = useState<number | null>(null);
  const [geoLoading, setGeoLoading]         = useState(false);
  const [geoMsg, setGeoMsg]                 = useState<string | null>(null);
  const [addressDraft, setAddressDraft]         = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);

  useEffect(() => {
    if (!titleManuallyEdited) {
      setTitle(`Giro — ${formatTitleDate(startDate)}`);
    }
  }, [startDate, titleManuallyEdited]);

  const isValid = title.trim().length > 0 && startDate.length === 10;

  const handleDetectPosition = () => {
    if (!navigator.geolocation) { setGeoMsg('Geolocalizzazione non supportata.'); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartLat(pos.coords.latitude);
        setStartLng(pos.coords.longitude);
        setGeoMsg(`📍 ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setGeoLoading(false);
      },
      () => { setGeoMsg('❌ Permesso negato.'); setGeoLoading(false); },
      { timeout: 8000 },
    );
  };

  const handleSaveByAddress = async () => {
    if (!addressDraft.trim()) return;
    setSearchingAddress(true);
    setGeoMsg(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressDraft)}&countrycodes=it`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Formicanera/1.0' } });
      const results = await resp.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!results.length) { setGeoMsg('❌ Indirizzo non trovato.'); return; }
      setStartLat(parseFloat(results[0].lat));
      setStartLng(parseFloat(results[0].lon));
      setGeoMsg(`📍 ${results[0].display_name.slice(0, 60)}...`);
      setAddressDraft('');
    } catch {
      setGeoMsg('❌ Errore ricerca indirizzo.');
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const endDate = horizon === 'day' ? startDate : (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 4);
        return d.toISOString().slice(0, 10);
      })();
      await onSubmit({
        title: title.trim(), horizon, mode, startDate, endDate,
        ...(useCustomStart && startLat != null && startLng != null ? { startLat, startLng } : {}),
      });
    } finally {
      setLoading(false);
    }
  };

  const LABEL: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };
  const INPUT: CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' };
  const PILL = (active: boolean): CSSProperties => ({
    padding: '6px 16px', borderRadius: 20, border: active ? '2px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#eff6ff' : 'white', color: active ? '#1d4ed8' : '#374151',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 13,
  });

  const steps = [
    <div key={0}>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>Che tipo di giro vuoi pianificare?</p>
      <div style={{ display: 'flex', gap: 10 }}>
        {HORIZONS.map(h => (
          <button key={h.value} style={PILL(horizon === h.value)} onClick={() => setHorizon(h.value)}>{h.label}</button>
        ))}
      </div>
    </div>,

    <div key={1}>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>Modalità di ottimizzazione:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MODES.map(m => (
          <button key={m} style={PILL(mode === m)} onClick={() => setMode(m)}>{VISIT_MODE_LABELS[m]}</button>
        ))}
      </div>
    </div>,

    <div key={2}>
      <label style={LABEL}>Data inizio *</label>
      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...INPUT, marginBottom: 12 }} />
      <label style={LABEL}>Nome del giro *</label>
      <input
        type="text" value={title} maxLength={100}
        placeholder="Es: Giro SA7 — Lunedì 09/06"
        onChange={e => { setTitle(e.target.value); setTitleManuallyEdited(true); }}
        style={INPUT}
      />
      <div style={{ marginTop: 12 }}>
        <label style={LABEL}>
          Punto di partenza{' '}
          <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opzionale — default: indirizzo di casa)</span>
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setUseCustomStart(v => !v); if (useCustomStart) { setStartLat(null); setStartLng(null); setGeoMsg(null); } }}
            style={{ ...PILL(useCustomStart), fontSize: 12 }}
          >
            {useCustomStart ? '✓ Partenza personalizzata' : '+ Partenza personalizzata'}
          </button>
        </div>
        {useCustomStart && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleDetectPosition}
                disabled={geoLoading || searchingAddress}
                style={{ background: geoLoading ? '#e5e7eb' : '#2563eb', color: geoLoading ? '#9ca3af' : 'white', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: (geoLoading || searchingAddress) ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
              >
                {geoLoading ? '⏳ Rilevamento...' : '📍 Usa posizione attuale'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 11 }}>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} /> oppure <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Es: Via Roma 10, Napoli"
                  value={addressDraft}
                  onChange={e => setAddressDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveByAddress()}
                  disabled={geoLoading || searchingAddress}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleSaveByAddress}
                  disabled={!addressDraft.trim() || geoLoading || searchingAddress}
                  style={{ background: (!addressDraft.trim() || geoLoading || searchingAddress) ? '#e5e7eb' : '#059669', color: (!addressDraft.trim() || geoLoading || searchingAddress) ? '#9ca3af' : 'white', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: (!addressDraft.trim() || geoLoading || searchingAddress) ? 'not-allowed' : 'pointer' }}
                >
                  {searchingAddress ? '🔍' : '🔍'}
                </button>
              </div>
              {geoMsg && <div style={{ fontSize: 12, color: geoMsg.startsWith('❌') ? '#dc2626' : '#374151', marginTop: 2 }}>{geoMsg}</div>}
            </div>
          </div>
        )}
      </div>
    </div>,
  ];

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,.12)', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Nuovo giro visite</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? '#2563eb' : '#e5e7eb' }} />
        ))}
      </div>

      {steps[step]}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>Annulla</button>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>← Indietro</button>
        )}
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Avanti →</button>
        ) : (
          <button onClick={handleSubmit} disabled={!isValid || loading} style={{ flex: 2, padding: '9px 0', borderRadius: 8, background: isValid ? '#2563eb' : '#e5e7eb', color: isValid ? 'white' : '#9ca3af', border: 'none', cursor: isValid ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 14 }}>
            {loading ? 'Creazione...' : '✓ Crea giro'}
          </button>
        )}
      </div>
    </div>
  );
}
