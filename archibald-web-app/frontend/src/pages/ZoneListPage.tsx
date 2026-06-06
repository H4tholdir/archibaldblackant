import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ZoneSummary } from '../types/visit-planning';
import { listZones } from '../services/visit-planning.service';

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669',
  AV: '#d97706', CE: '#dc2626',
};
function provColor(prov: string): string { return PROV_COLORS[prov] ?? '#6b7280'; }

const PROV_ORDER = ['SA', 'NA', 'PZ', 'AV', 'CE'];
function provSort(prov: string): number { const i = PROV_ORDER.indexOf(prov); return i < 0 ? 99 : i; }

const PROV_LABELS: Record<string, string> = {
  SA: 'Salerno — SA', NA: 'Napoli — NA', PZ: 'Potenza — PZ', AV: 'Avellino — AV', CE: 'Caserta — CE',
};

export function ZoneListPage() {
  const navigate = useNavigate();
  const [zones, setZones]       = useState<ZoneSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key: `${zona}_${prov}`

  useEffect(() => {
    listZones().then(setZones).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSfoglia = () => {
    if (selected.size === 0) return;
    const params = [...selected].join(',');
    navigate(`/giri/zone/clienti?z=${encodeURIComponent(params)}`);
  };

  // Raggruppa per provincia
  const byProv = zones.reduce<Record<string, ZoneSummary[]>>((acc, z) => {
    (acc[z.prov] ??= []).push(z);
    return acc;
  }, {});
  const sortedProvs = Object.keys(byProv).sort((a, b) => provSort(a) - provSort(b));

  const totalSelected = zones
    .filter(z => selected.has(`${z.zona}_${z.prov}`))
    .reduce((s, z) => s + z.totalClients, 0);

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

      {sortedProvs.map(prov => (
        <div key={prov}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>
            {PROV_LABELS[prov] ?? prov}
          </div>
          {byProv[prov].map(z => {
            const key   = `${z.zona}_${z.prov}`;
            const isSel = selected.has(key);
            const isSmall = z.totalClients < 30;
            const activePct = z.totalClients > 0 ? (z.activeThisYear / z.totalClients) * 100 : 0;
            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                style={{
                  ...CARD,
                  borderColor: isSel ? '#2563eb' : '#e5e7eb',
                  background: isSel ? '#eff6ff' : 'white',
                  opacity: isSmall ? 0.85 : 1,
                  padding: isSmall ? '9px 14px' : '12px 14px',
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
                  borderRadius: 9, background: provColor(prov),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isSmall ? 13 : 15, fontWeight: 800, color: 'white', flexShrink: 0,
                }}>{z.zona}</div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{z.label}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {z.topCities.slice(0, 3).map(c => (
                      <span key={c} style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 6,
                        background: isSel ? '#dbeafe' : '#f1f5f9',
                        color: isSel ? '#1d4ed8' : '#475569',
                      }}>{c.charAt(0) + c.slice(1).toLowerCase()}</span>
                    ))}
                  </div>
                  <div style={{ width: 40, height: 3, background: '#e5e7eb', borderRadius: 2, marginTop: 6 }}>
                    <div style={{ width: `${activePct}%`, height: 3, background: '#16a34a', borderRadius: 2 }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: isSmall ? 15 : 18, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{z.totalClients}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>clienti</div>
                  <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>{z.activeThisYear} attivi</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

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
                <strong style={{ color: '#2563eb' }}>{selected.size} {selected.size === 1 ? 'zona selezionata' : 'zone selezionate'}</strong>
                {' '}· {totalSelected} clienti totali
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {[...selected].map(k => {
                  const z = zones.find(z => `${z.zona}_${z.prov}` === k);
                  return z?.label ?? k;
                }).join(' + ')}
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
