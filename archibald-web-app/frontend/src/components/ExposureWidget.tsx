import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type TopDebtor = {
  name: string;
  erpId: string;
  scaduto: number;
  isBlocked: boolean;
};

export type ExposureData = {
  totalScaduto: number;
  totalAperto: number;
  blockedCount: number;
  topDebtors: Array<TopDebtor>;
  pendingWaCount: number;
};

async function fetchExposureSummary(): Promise<ExposureData> {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch('/api/ledger/dashboard-summary', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Exposure fetch failed');
  return (await res.json() as { data: ExposureData }).data;
}

function formatEurK(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(0)}k`;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export function ExposureWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState<ExposureData | null>(null);
  const [hoveredKpi, setHoveredKpi] = useState<string | null>(null);
  const [hoveredDebtor, setHoveredDebtor] = useState<string | null>(null);

  useEffect(() => {
    fetchExposureSummary().then(setData).catch(() => null);
  }, []);

  if (!data) return null;

  if (data.totalScaduto === 0 && data.totalAperto === 0 && data.blockedCount === 0) {
    return (
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '20px',
        border: '2px solid #86efac', boxShadow: '0 4px 16px rgba(34,197,94,0.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '28px', marginBottom: '6px' }}>✅</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Nessuna esposizione critica</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Tutti i clienti sono in regola</div>
      </div>
    );
  }

  const kpiCards = [
    {
      key: 'scaduto',
      label: 'Scaduto',
      value: formatEurK(data.totalScaduto),
      subtitle: 'crediti scaduti',
      bg: '#fef2f2',
      border: '#fecaca',
      color: '#dc2626',
      onClick: () => navigate('/customers', { state: { exposureMode: 'scaduto' as const, topDebtors: data.topDebtors } }),
    },
    {
      key: 'aperto',
      label: 'Aperto',
      value: formatEurK(data.totalAperto),
      subtitle: 'totale aperto',
      bg: '#fffbeb',
      border: '#fde68a',
      color: '#d97706',
      onClick: () => navigate('/customers', { state: { exposureMode: 'aperto' as const, topDebtors: data.topDebtors } }),
    },
    {
      key: 'bloccati',
      label: '🔒 Bloccati',
      value: String(data.blockedCount),
      subtitle: data.blockedCount === 1 ? '1 cliente' : `${data.blockedCount} clienti`,
      bg: data.blockedCount > 0 ? '#fef2f2' : '#f0fdf4',
      border: data.blockedCount > 0 ? '#fecaca' : '#bbf7d0',
      color: data.blockedCount > 0 ? '#dc2626' : '#16a34a',
      onClick: () => navigate('/customers?filter=blocked'),
    },
  ];

  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      padding: '20px',
      border: '2px solid #fecaca',
      boxShadow: '0 4px 16px rgba(239,68,68,0.08)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>💰 Esposizione Clienti</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Riepilogo crediti aperti</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        {kpiCards.map(c => (
          <div
            key={c.key}
            role="button"
            tabIndex={0}
            onClick={c.onClick}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.onClick(); } }}
            onMouseEnter={() => setHoveredKpi(c.key)}
            onMouseLeave={() => setHoveredKpi(null)}
            style={{
              background: hoveredKpi === c.key ? c.border : c.bg,
              border: `1.5px solid ${c.border}`,
              borderRadius: '12px',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              transform: hoveredKpi === c.key ? 'translateY(-2px)' : 'none',
              boxShadow: hoveredKpi === c.key ? `0 4px 12px rgba(0,0,0,0.08)` : 'none',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              {c.label}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: c.color, lineHeight: 1 }}>
              {c.value}
            </div>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
              {c.subtitle}
            </div>
          </div>
        ))}
      </div>

      {/* Top Debtors */}
      {data.topDebtors.slice(0, 3).map(d => (
        <div
          key={d.erpId}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/customers/${d.erpId}?scroll=partitario`)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate(`/customers/${d.erpId}?scroll=partitario`);
            }
          }}
          onMouseEnter={() => setHoveredDebtor(d.erpId)}
          onMouseLeave={() => setHoveredDebtor(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: hoveredDebtor === d.erpId ? '#f1f5f9' : '#fafafa',
            border: '1px solid #f1f5f9',
            borderRadius: '10px',
            padding: '10px 12px',
            marginBottom: '6px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{d.isBlocked ? '🔒' : '⚠️'}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '13px', fontWeight: 600, color: '#0f172a',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {d.name}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                {d.isBlocked ? 'Bloccato ERP' : 'Scaduto'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: d.isBlocked ? '#dc2626' : '#d97706' }}>
              {formatEurK(d.scaduto)}
            </div>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>›</span>
          </div>
        </div>
      ))}

      {/* WA pending */}
      {data.pendingWaCount > 0 && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px',
          padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px',
        }}>
          <span style={{ fontSize: '16px' }}>💬</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
              {data.pendingWaCount} messaggi WA pronti
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Da inviare oggi</div>
          </div>
        </div>
      )}

      {/* Footer */}
      <button
        onClick={() => navigate('/customers')}
        onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#93c5fd'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        style={{
          width: '100%',
          marginTop: '12px',
          background: 'transparent',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '8px',
          fontSize: '12px',
          color: '#3b82f6',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        Vedi tutti i clienti →
      </button>
    </div>
  );
}
