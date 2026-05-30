import { useState, useEffect } from 'react';

type TopDebtor = {
  name: string;
  erpId: string;
  scaduto: number;
  isBlocked: boolean;
};

type ExposureData = {
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

type StatCard = {
  label: string;
  value: string;
  bg: string;
  border: string;
  color: string;
};

export function ExposureWidget() {
  const [data, setData] = useState<ExposureData | null>(null);

  useEffect(() => {
    fetchExposureSummary().then(setData).catch(() => null);
  }, []);

  if (!data) return null;

  const statCards: StatCard[] = [
    { label: 'Scaduto',    value: formatEurK(data.totalScaduto), bg: '#1c0a0a', border: '#7f1d1d', color: '#ef4444' },
    { label: 'Aperto',     value: formatEurK(data.totalAperto),  bg: '#1c1200', border: '#78350f', color: '#f59e0b' },
    { label: '💀 Bloccati', value: String(data.blockedCount),    bg: '#1c0a0a', border: '#7f1d1d', color: '#ef4444' },
  ];

  return (
    <div style={{ background: '#0f172a', borderRadius: '12px', padding: '14px', border: '1px solid #1e293b', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>💰 Esposizione Clienti</div>
        <a href="/customers?filter=blocked" style={{ fontSize: '9px', color: '#3b82f6', textDecoration: 'none' }}>Vedi tutto →</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
        {statCards.map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '8px', color: '#94a3b8' }}>{c.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {data.topDebtors.slice(0, 3).map(d => (
        <div
          key={d.erpId}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1e293b', borderRadius: '6px', padding: '7px 10px', marginBottom: '5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px' }}>{d.isBlocked ? '💀' : '⚠'}</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: d.isBlocked ? '#fca5a5' : '#fcd34d' }}>{d.name}</div>
              <div style={{ fontSize: '8px', color: '#64748b' }}>{d.isBlocked ? 'Bloccato' : 'Scaduto'}</div>
            </div>
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: d.isBlocked ? '#ef4444' : '#f59e0b' }}>
            {formatEurK(d.scaduto)}
          </div>
        </div>
      ))}

      {data.pendingWaCount > 0 && (
        <div style={{
          background: '#0d2818', border: '1px solid #22c55e', borderRadius: '8px',
          padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '5px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>💬</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#4ade80' }}>{data.pendingWaCount} messaggi WA pronti</div>
              <div style={{ fontSize: '8px', color: '#86efac' }}>Da inviare oggi</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
