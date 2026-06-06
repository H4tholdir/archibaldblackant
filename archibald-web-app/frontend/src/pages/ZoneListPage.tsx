import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ZoneSummary } from '../types/visit-planning';
import { listZones } from '../services/visit-planning.service';

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669',
  AV: '#d97706', CE: '#dc2626',
};
function provColor(prov: string): string { return PROV_COLORS[prov] ?? '#6b7280'; }


export function ZoneListPage() {
  const navigate = useNavigate();
  const [zones, setZones]       = useState<ZoneSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key: `${zona}_${prov}`

  useEffect(() => {
    listZones().then(setZones).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSfoglia = () => {
    if (selected.size === 0) return;
    const params = [...selected].join(',');
    navigate(`/giri/zone/clienti?z=${encodeURIComponent(params)}`);
  };

  // Merge per numero zona — combina tutte le province con lo stesso numero
  const ALLOWED = new Set(['SA', 'NA', 'PZ', 'AV', 'CE']);
  type MergedZone = { zona: string; label: string; totalClients: number; activeThisYear: number; keys: string[]; primaryProv: string };
  const mergedMap = new Map<string, MergedZone>();
  for (const z of zones.filter(z => ALLOWED.has(z.prov))) {
    const key = `${z.zona}_${z.prov}`;
    const existing = mergedMap.get(z.zona);
    if (existing) {
      existing.totalClients   += z.totalClients;
      existing.activeThisYear += z.activeThisYear;
      existing.keys.push(key);
      if (z.totalClients > zones.find(x => `${x.zona}_${x.prov}` === `${z.zona}_${existing.primaryProv}`)!.totalClients) {
        existing.label       = z.label;
        existing.primaryProv = z.prov;
      }
    } else {
      mergedMap.set(z.zona, { zona: z.zona, label: z.label, totalClients: z.totalClients, activeThisYear: z.activeThisYear, keys: [key], primaryProv: z.prov });
    }
  }
  const mergedZones = [...mergedMap.values()].sort((a, b) => b.totalClients - a.totalClients);

  // Toggle: seleziona/deseleziona TUTTE le chiavi di una zona merged
  const toggleMerged = (mz: MergedZone) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = mz.keys.every(k => next.has(k));
      if (allSelected) mz.keys.forEach(k => next.delete(k));
      else mz.keys.forEach(k => next.add(k));
      return next;
    });
  };

  const totalSelected = zones
    .filter(z => selected.has(`${z.zona}_${z.prov}`))
    .reduce((s, z) => s + z.totalClients, 0);

  const selectedLabels = mergedZones
    .filter(mz => mz.keys.some(k => selected.has(k)))
    .map(mz => mz.label);

  const CARD: React.CSSProperties = {
    background: 'white', border: '2px solid #e5e7eb', borderRadius: 12,
    padding: '12px 14px', marginBottom: 8, display: 'flex',
    alignItems: 'center', gap: 12, cursor: 'pointer',
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Caricamento zone...</div>;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px 16px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#111827' }}>📍 Esplora Zone Clienti</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, paddingLeft: 30 }}>
        Seleziona una o più zone per sfogliare i clienti
      </div>
      <div style={{ fontSize: 12, color: '#2563eb', background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
        💡 Tocca per selezionare · puoi combinare più zone · poi "Sfoglia clienti"
      </div>

      <div style={{
        background: 'white', borderRadius: 12,
        padding: '16px 0', marginBottom: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        {mergedZones.map(mz => {
              const isSel = mz.keys.some(k => selected.has(k));
              const isSmall = mz.totalClients < 30;
              const activePct = mz.totalClients > 0 ? (mz.activeThisYear / mz.totalClients) * 100 : 0;
              return (
                <div
                  key={mz.zona}
                  onClick={() => toggleMerged(mz)}
                  style={{
                    ...CARD,
                    borderColor: isSel ? '#2563eb' : '#e5e7eb',
                    background: isSel ? '#eff6ff' : 'white',
                    opacity: isSmall ? 0.85 : 1,
                    padding: isSmall ? '9px 14px' : '12px 14px',
                    margin: '0 14px 8px',
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: isSel ? 'none' : '2px solid #d1d5db',
                    background: isSel ? '#2563eb' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 13,
                  }}>{isSel ? '✓' : ''}</div>

                  {/* Badge zona */}
                  <div style={{
                    width: isSmall ? 34 : 40, height: isSmall ? 34 : 40,
                    borderRadius: 9, background: provColor(mz.primaryProv),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isSmall ? 13 : 15, fontWeight: 800, color: 'white', flexShrink: 0,
                  }}>{mz.zona}</div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{mz.label}</div>
                    <div style={{ width: 40, height: 3, background: '#e5e7eb', borderRadius: 2, marginTop: 6 }}>
                      <div style={{ width: `${activePct}%`, height: 3, background: '#16a34a', borderRadius: 2 }} />
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: isSmall ? 15 : 18, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{mz.totalClients}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af' }}>clienti</div>
                    <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{mz.activeThisYear} attivi</div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Sticky bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 16px rgba(0,0,0,.12)', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100,
      }}>
        <div>
          {selected.size > 0 ? (
            <>
              <div style={{ fontSize: 13, color: '#374151' }}>
                <strong style={{ color: '#2563eb' }}>{selectedLabels.length} {selectedLabels.length === 1 ? 'zona selezionata' : 'zone selezionate'}</strong>
                {' '}· {totalSelected} clienti totali
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {selectedLabels.join(' + ')}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Seleziona almeno una zona</div>
          )}
        </div>
        <button
          disabled={selected.size === 0}
          onClick={handleSfoglia}
          style={{
            background: selected.size > 0 ? '#2563eb' : '#e5e7eb',
            color: selected.size > 0 ? 'white' : '#9ca3af',
            border: 'none', borderRadius: 10, padding: '10px 20px',
            fontWeight: 700, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
          }}
        >Sfoglia clienti →</button>
      </div>
    </div>
  );
}
