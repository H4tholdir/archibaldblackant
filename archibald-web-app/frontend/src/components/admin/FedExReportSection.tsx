import { useEffect, useState } from 'react';
import {
  getTrackingStats,
  getTrackingExceptions,
  updateClaimStatus,
  downloadClaimPdf,
  exportExceptionsCsv,
} from '../../services/fedex-report.service';
import type { TrackingStats, TrackingException } from '../../services/fedex-report.service';

const CLAIM_LABELS: Record<string, string> = {
  open: 'Aperto',
  submitted: 'Inviato',
  resolved: 'Risolto',
};
const CLAIM_COLORS: Record<string, { bg: string; color: string }> = {
  open:      { bg: '#fff3e0', color: '#e65100' },
  submitted: { bg: '#e3f2fd', color: '#1565c0' },
  resolved:  { bg: '#e8f5e9', color: '#1b5e20' },
};

export function FedExReportSection() {
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [exceptions, setExceptions] = useState<TrackingException[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('3m');
  const [loading, setLoading] = useState(true);

  function getPeriodDates(): { from: string; to: string } {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date();
    if (periodFilter === '3m') from.setMonth(from.getMonth() - 3);
    else if (periodFilter === '6m') from.setMonth(from.getMonth() - 6);
    else from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10), to };
  }

  async function load() {
    setLoading(true);
    try {
      const { from, to } = getPeriodDates();
      const filters = { userId: agentFilter || undefined, from, to };
      const [s, e] = await Promise.all([getTrackingStats(filters), getTrackingExceptions({ ...filters, status: 'all' })]);
      setStats(s);
      setExceptions(e);
    } catch {
      // errore silenzioso — loading viene comunque resettato
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [agentFilter, periodFilter]);

  async function handleClaimUpdate(id: number, status: 'open' | 'submitted' | 'resolved') {
    await updateClaimStatus(id, status);
    setExceptions((prev) => prev.map((e) => e.id === id ? { ...e, claimStatus: status } : e));
  }

  const maxCount = Math.max(...(stats?.byCode.map((b) => b.count) ?? [1]), 1);

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '16px' }}>

      {/* Header + filtri */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1a1a2e' }}>📦 Report Spedizioni FedEx</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Eccezioni, reclami e statistiche</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            placeholder="ID agente..."
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', width: '140px', minWidth: 0 }}
          />
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}
            style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
            <option value="3m">Ultimi 3 mesi</option>
            <option value="6m">Ultimi 6 mesi</option>
            <option value="1y">Ultimo anno</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ color: '#aaa', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Caricamento...</div>}

      {!loading && stats && (
        <>
          {/* Stat boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { num: stats.delivered, label: 'Consegnati', color: '#1b5e20' },
              { num: stats.exceptionActive + stats.held + stats.returning, label: 'Con eccezioni', color: '#cc0066' },
              { num: stats.claimsSummary.open + stats.claimsSummary.submitted, label: 'Reclami aperti', color: '#1565c0' },
              { num: stats.exceptionActive, label: 'In eccezione ora', color: '#e65100' },
            ].map(({ num, label, color }) => (
              <div key={label} style={{ background: '#f8f9fa', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1px', color }}>{num}</div>
                <div style={{ fontSize: '10px', color: '#888', fontWeight: 700, textTransform: 'uppercase', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Chart eccezioni per codice */}
          {stats.byCode.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', marginBottom: '10px' }}>Eccezioni per tipo</div>
              {stats.byCode.slice(0, 6).map((b) => (
                <div key={b.code ?? 'other'} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                  <div style={{ fontSize: '11px', color: '#555', flex: '0 1 180px', minWidth: 0 }}>
                    {b.code ? `${b.code} — ` : ''}{b.description}
                  </div>
                  <div style={{ flex: 1, height: '18px', background: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((b.count / maxCount) * 100)}%`, height: '100%', background: '#cc0066', borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>{b.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tabella eccezioni */}
      {!loading && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Lista eccezioni</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => exportExceptionsCsv(exceptions)}
                style={{ background: '#e8f5e9', color: '#1b5e20', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                ⬇ Export CSV
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Tracking', 'Ordine', 'Tipo', 'Motivo', 'Data', 'Stato reclamo', 'Azioni'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', background: '#f5f5f5', color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exceptions.map((ex) => {
                  const cs = ex.claimStatus;
                  const colors = cs ? CLAIM_COLORS[cs] : null;
                  return (
                    <tr key={ex.id}>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', borderBottom: '1px solid #f5f5f5' }}>{ex.trackingNumber}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>{ex.orderNumber}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#cc0066', fontWeight: 600 }}>{ex.exceptionType}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>{ex.exceptionCode ? `${ex.exceptionCode}: ` : ''}{ex.exceptionDescription}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' }}>{new Date(ex.occurredAt).toLocaleDateString('it-IT')}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                        {cs && colors ? (
                          <span style={{ background: colors.bg, color: colors.color, borderRadius: '10px', padding: '2px 8px', fontSize: '10px', fontWeight: 700 }}>
                            {CLAIM_LABELS[cs]}
                          </span>
                        ) : <span style={{ color: '#bbb', fontSize: '11px' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!cs && (
                            <button onClick={() => handleClaimUpdate(ex.id, 'open')}
                              style={{ background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              Apri reclamo
                            </button>
                          )}
                          {cs === 'open' && (
                            <button onClick={() => handleClaimUpdate(ex.id, 'submitted')}
                              style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              Segna inviato
                            </button>
                          )}
                          <button onClick={() => downloadClaimPdf(ex.id, ex.trackingNumber)}
                            style={{ background: '#1565c0', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                            📄 PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {exceptions.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '13px' }}>Nessuna eccezione nel periodo selezionato</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
