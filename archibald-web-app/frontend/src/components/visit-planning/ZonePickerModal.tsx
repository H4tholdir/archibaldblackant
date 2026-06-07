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
// Solo le province del territorio dell'agente
const ALLOWED_PROVS = new Set(['SA', 'NA', 'PZ', 'AV', 'CE']);

type MergedZone = { zona: string; label: string; totalClients: number; activeThisYear: number; primaryProv: string };

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

  // Merge per numero zona — stessa logica di ZoneListPage
  const mergedMap = new Map<string, MergedZone>();
  for (const z of zones.filter(zz => ALLOWED_PROVS.has(zz.prov))) {
    const existing = mergedMap.get(z.zona);
    if (existing) {
      existing.totalClients   += z.totalClients;
      existing.activeThisYear += z.activeThisYear;
      if (z.totalClients > (mergedMap.get(z.zona)?.totalClients ?? 0) - z.totalClients) {
        existing.label       = z.label;
        existing.primaryProv = z.prov;
      }
    } else {
      mergedMap.set(z.zona, { zona: z.zona, label: z.label, totalClients: z.totalClients, activeThisYear: z.activeThisYear, primaryProv: z.prov });
    }
  }
  const mergedZones = [...mergedMap.values()].sort((a, b) => {
    const na = parseInt(a.zona, 10), nb = parseInt(b.zona, 10);
    if (na < 0 && nb >= 0) return 1;
    if (nb < 0 && na >= 0) return -1;
    return na - nb;
  });

  const isCurrentZone = (mz: MergedZone) => mz.zona === currentZona;
  const isSelected    = (mz: MergedZone) => selected?.zona === mz.zona;
  const isChanged     = selected != null && !(selected.zona === currentZona && selected.prov === currentProv);

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
              Zona attuale: <strong>Zona {currentZona}</strong>
            </div>
          )}
        </div>

        {/* Zona list — mergiata per numero */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Caricamento zone...</div>
          ) : mergedZones.map(mz => {
            const sel  = isSelected(mz);
            const curr = isCurrentZone(mz);
            return (
              <div
                key={mz.zona}
                onClick={() => setSelected({ zona: mz.zona, prov: mz.primaryProv })}
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
                  background: PROV_COLORS[mz.primaryProv] ?? '#6b7280', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                }}>{mz.zona}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {mz.label}
                    {curr && <span style={{ fontSize: 10, marginLeft: 6, color: '#9ca3af', fontWeight: 400 }}>attuale</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{mz.totalClients} clienti · {mz.activeThisYear} attivi</div>
                </div>
                {sel && <span style={{ color: '#2563eb', fontWeight: 700 }}>✓</span>}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: 12, fontSize: 14, cursor: 'pointer' }}
          >Annulla</button>
          <button
            onClick={() => void handleSave()}
            disabled={!selected || saving || !isChanged}
            style={{
              flex: 2,
              background: (!selected || saving || !isChanged) ? '#e5e7eb' : '#2563eb',
              color: (!selected || saving || !isChanged) ? '#9ca3af' : 'white',
              border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700,
              cursor: (!selected || saving) ? 'not-allowed' : 'pointer',
            }}
          >{saving ? 'Salvataggio...' : '📍 Sposta in questa zona'}</button>
        </div>
      </div>
    </div>
  );
}
