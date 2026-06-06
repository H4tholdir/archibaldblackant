import { useState, useEffect } from 'react';
import type { ZoneSummary } from '../../types/visit-planning';
import { listZones, assignClientZone } from '../../services/visit-planning.service';

type Props = {
  sourceType:   'archibald' | 'arca';
  sourceId:     string;
  displayName:  string;
  currentZona?: string;
  currentProv?: string;
  onSaved:      () => void;
  onClose:      () => void;
};

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669', AV: '#d97706', CE: '#dc2626',
};
const PROV_ORDER = ['SA', 'NA', 'PZ', 'AV', 'CE'];
const PROV_LABELS: Record<string, string> = {
  SA: 'Salerno', NA: 'Napoli', PZ: 'Potenza', AV: 'Avellino', CE: 'Caserta',
};

export function ZonePickerModal({ sourceType, sourceId, displayName, currentZona, currentProv, onSaved, onClose }: Props) {
  const [zones, setZones]     = useState<ZoneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [selected, setSelected] = useState<{ zona: string; prov: string } | null>(
    currentZona && currentProv ? { zona: currentZona, prov: currentProv } : null
  );

  useEffect(() => {
    listZones().then(setZones).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await assignClientZone(sourceType, sourceId, selected.zona, selected.prov);
      onSaved();
    } catch {
      alert('Errore durante il salvataggio. Riprova.');
    } finally {
      setSaving(false);
    }
  };

  const byProv = zones.reduce<Record<string, ZoneSummary[]>>((acc, z) => {
    (acc[z.prov] ??= []).push(z);
    return acc;
  }, {});
  const sortedProvs = Object.keys(byProv).sort((a, b) => PROV_ORDER.indexOf(a) - PROV_ORDER.indexOf(b));

  const isCurrentZone = (z: ZoneSummary) => z.zona === currentZona && z.prov === currentProv;
  const isSelected    = (z: ZoneSummary) => selected?.zona === z.zona && selected?.prov === z.prov;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: '16px 16px 0 0',
        width: '100%', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>📍 Cambia zona</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{displayName}</div>
          {currentZona && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Zona attuale: <strong>{currentZona} {currentProv}</strong>
            </div>
          )}
        </div>

        {/* Zona list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Caricamento zone...</div>
          ) : (
            sortedProvs.map(prov => (
              <div key={prov}>
                <div style={{
                  padding: '6px 20px 4px',
                  fontSize: 10, fontWeight: 800, color: '#9ca3af',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>{PROV_LABELS[prov] ?? prov} — {prov}</div>
                {byProv[prov].map(z => {
                  const sel  = isSelected(z);
                  const curr = isCurrentZone(z);
                  const color = PROV_COLORS[prov] ?? '#6b7280';
                  return (
                    <div
                      key={`${z.zona}_${z.prov}`}
                      onClick={() => setSelected({ zona: z.zona, prov: z.prov })}
                      style={{
                        padding: '10px 20px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        cursor: 'pointer',
                        background: sel ? '#eff6ff' : 'white',
                        borderLeft: `3px solid ${sel ? '#2563eb' : 'transparent'}`,
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: color, color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 13, flexShrink: 0,
                      }}>{z.zona}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                          {z.label}
                          {curr && <span style={{ fontSize: 10, marginLeft: 6, color: '#9ca3af', fontWeight: 400 }}>attuale</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{z.totalClients} clienti · {z.activeThisYear} attivi</div>
                      </div>
                      {sel && <span style={{ color: '#2563eb', fontWeight: 700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: 12, fontSize: 14, cursor: 'pointer' }}
          >Annulla</button>
          <button
            onClick={() => void handleSave()}
            disabled={!selected || saving || (selected.zona === currentZona && selected.prov === currentProv)}
            style={{
              flex: 2,
              background: (!selected || saving || (selected.zona === currentZona && selected.prov === currentProv)) ? '#e5e7eb' : '#2563eb',
              color: (!selected || saving || (selected.zona === currentZona && selected.prov === currentProv)) ? '#9ca3af' : 'white',
              border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700,
              cursor: (!selected || saving) ? 'not-allowed' : 'pointer',
            }}
          >{saving ? 'Salvataggio...' : '📍 Sposta in questa zona'}</button>
        </div>
      </div>
    </div>
  );
}
