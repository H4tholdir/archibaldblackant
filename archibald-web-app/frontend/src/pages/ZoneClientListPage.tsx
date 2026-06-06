import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ZoneClient } from '../types/visit-planning';
import { listZoneClients, archiveCustomer } from '../services/visit-planning.service';
import * as vpService from '../services/visit-planning.service';

type SortBy = 'distance' | 'ytd' | 'lifetime' | 'lastOrder';

const SORT_LABELS: Record<SortBy, string> = {
  distance:  'Distanza da casa',
  ytd:       "Fatturato quest'anno",
  lifetime:  'Fatturato storico',
  lastOrder: 'Ultimo ordine',
};

const PROV_COLORS: Record<string, string> = {
  SA: '#2563eb', NA: '#7c3aed', PZ: '#059669', AV: '#d97706', CE: '#dc2626',
};

export function ZoneClientListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parsing zone dal query param z=7_SA,8_SA
  const zParam = searchParams.get('z') ?? '';
  const zones  = zParam.split(',').filter(Boolean).map(s => {
    const parts = s.split('_');
    const prov  = parts[parts.length - 1];
    const zona  = parts.slice(0, -1).join('_');
    return { zona, prov };
  });

  const [sortBy, setSortBy]       = useState<SortBy>('distance');
  const [search, setSearch]       = useState('');
  const [active, setActive]       = useState<ZoneClient[]>([]);
  const [inactive, setInactive]   = useState<ZoneClient[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listZoneClients(zones, sortBy, search || undefined)
      .then(r => { setActive(r.active); setInactive(r.inactive); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [zParam, sortBy, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleArchive = async (c: ZoneClient) => {
    if (!confirm(`Archiviare "${c.displayName}"? Scomparirà dalle liste e dal generatore giri.`)) return;
    setArchiving(c.sourceId);
    try {
      await archiveCustomer(c.sourceType, c.sourceId);
      load();
    } catch { alert('Errore durante archiviazione.'); }
    finally { setArchiving(null); }
  };

  const handleCreaGiro = async (date: string) => {
    const firstZone = zones[0];
    const zoneLabel = `Zona ${firstZone.zona} ${firstZone.prov}`;
    const d = new Date(date + 'T00:00:00');
    const weekday = d.toLocaleDateString('it-IT', { weekday: 'long' });
    const dayMonth = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const title = `Giro ${zoneLabel} — ${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${dayMonth}`;

    const session = await vpService.createSession({ title, horizon: 'day', mode: 'balanced', startDate: date, endDate: date });

    const selectedClients = [...active, ...inactive].filter(c => selected.has(c.sourceId));
    for (const c of selectedClients) {
      await vpService.addStop(session.id, {
        sourceType:   c.sourceType,
        sourceId:     c.sourceId,
        displayName:  c.displayName,
        stopDate:     date,
        status:       'to_call',
        visitMinutes: 30,
      });
    }
    navigate(`/giri/${session.id}`);
  };

  const zonePills = zones.map(z => ({
    key: `${z.zona}_${z.prov}`,
    label: `Zona ${z.zona} ${z.prov}`,
    color: PROV_COLORS[z.prov] ?? '#6b7280',
  }));

  const ClientCard = ({ c, isInactive }: { c: ZoneClient; isInactive?: boolean }) => {
    const isSel = selected.has(c.sourceId);
    return (
      <div
        onClick={() => !isInactive ? toggleSelect(c.sourceId) : undefined}
        style={{
          background: isSel ? '#eff6ff' : isInactive ? '#fafafa' : 'white',
          borderBottom: '1px solid #f1f5f9',
          borderLeft: isSel ? '3px solid #2563eb' : isInactive ? '3px solid #fee2e2' : '3px solid transparent',
          padding: '13px 16px',
          display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'start',
          cursor: isInactive ? 'default' : 'pointer',
          opacity: isInactive ? 0.65 : 1,
        }}
      >
        {/* Checkbox */}
        <div style={{
          width: 20, height: 20, borderRadius: 5, marginTop: 2, flexShrink: 0,
          border: isSel ? 'none' : '2px solid #d1d5db',
          background: isSel ? '#2563eb' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 12,
        }}>{isSel ? '✓' : ''}</div>

        {/* Corpo */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {c.displayName}
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 3,
              background: c.sourceType === 'archibald' ? '#dbeafe' : '#d1fae5',
              color: c.sourceType === 'archibald' ? '#1e40af' : '#065f46',
            }}>{c.sourceType === 'archibald' ? 'Archibald' : 'Fresis'}</span>
            {isInactive && c.daysSinceOrder != null && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 4 }}>
                Inattivo da {c.daysSinceOrder} giorni
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            {c.address ? `${c.address} · ` : ''}{c.city ?? ''}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: isInactive ? '#dc2626' : '#16a34a' }}>
              💶 €{c.ytdRevenue.toLocaleString('it-IT', { maximumFractionDigits: 0 })} quest&apos;anno
            </span>
            {c.daysSinceOrder != null && !isInactive && (
              <span style={{ fontSize: 12, color: '#374151' }}>🕐 {c.daysSinceOrder} giorni fa</span>
            )}
          </div>
          {c.phone ? (
            <button
              onClick={e => { e.stopPropagation(); window.location.href = `tel:${c.phone}`; }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >📞 {c.phone}</button>
          ) : (
            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, display: 'inline-block' }}>📵 Nessun telefono registrato</span>
          )}
        </div>

        {/* Destra */}
        <div style={{ textAlign: 'right' }}>
          {c.distanceKm != null ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>📍 {c.distanceKm.toLocaleString('it-IT')} km</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>da casa</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#d1d5db' }}>📍 —</div>
          )}
          <div style={{ fontSize: 14, fontWeight: 800, color: isInactive ? '#9ca3af' : '#111827', marginTop: 4 }}>
            €{c.ytdRevenue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af' }}>quest&apos;anno</div>
          {isInactive && (
            <button
              onClick={e => { e.stopPropagation(); void handleArchive(c); }}
              disabled={archiving === c.sourceId}
              style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', display: 'block', width: '100%' }}
            >{archiving === c.sourceId ? '...' : 'Archivia'}</button>
          )}
        </div>
      </div>
    );
  };

  // Date picker: prossimi 7 giorni lavorativi
  const workDays: string[] = [];
  const startDay = new Date(); startDay.setDate(startDay.getDate() + 1);
  while (workDays.length < 7) {
    if (startDay.getDay() !== 0 && startDay.getDay() !== 6)
      workDays.push(startDay.toISOString().slice(0, 10));
    startDay.setDate(startDay.getDate() + 1);
  }
  const [selectedDate, setSelectedDate] = useState(workDays[0]);
  const fmtDate = (iso: string) => {
    const dt = new Date(iso + 'T00:00:00');
    const s = dt.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 130 }}>
      {/* Header sticky */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => navigate('/giri/zone')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Clienti zone selezionate</div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginLeft: 30, marginBottom: 6 }}>Seleziona i clienti da includere nel giro</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {zonePills.map(p => (
            <span key={p.key} style={{ fontSize: 11, fontWeight: 700, color: 'white', padding: '3px 10px', borderRadius: 20, background: p.color }}>{p.label}</span>
          ))}
        </div>
      </div>

      {/* Sort tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {(Object.keys(SORT_LABELS) as SortBy[]).map(k => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            border: `1.5px solid ${sortBy === k ? '#2563eb' : '#d1d5db'}`,
            background: sortBy === k ? '#2563eb' : 'white',
            color: sortBy === k ? 'white' : '#6b7280', cursor: 'pointer',
          }}>
            {sortBy === k ? '↑ ' : ''}{SORT_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Ricerca */}
      <div style={{ padding: '10px 16px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Cerca per nome, città, telefono..."
          style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Riepilogo */}
      <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
        <span>{total} clienti · {active.length} attivi quest&apos;anno</span>
        {selected.size > 0 && <span style={{ fontWeight: 700, color: '#2563eb' }}>{selected.size} selezionati</span>}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Caricamento clienti...</div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', background: '#f1f5f9', borderBottom: '1px solid #e5e7eb', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#16a34a' }}>
                ✅ Clienti attivi — {active.length} — ordinati per {SORT_LABELS[sortBy].toLowerCase()}
              </div>
              {active.map(c => <ClientCard key={`${c.sourceType}:${c.sourceId}`} c={c} />)}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 4px', background: '#fef9f0', borderBottom: '1px solid #fed7aa', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c2410c' }}>
                ⚠️ Clienti inattivi — nessun ordine nell&apos;anno — {inactive.length}
              </div>
              {inactive.map(c => <ClientCard key={`${c.sourceType}:${c.sourceId}`} c={c} isInactive />)}
            </>
          )}
        </>
      )}

      {/* Sticky bar footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: `2px solid ${selected.size > 0 ? '#2563eb' : '#e5e7eb'}`,
        boxShadow: '0 -4px 20px rgba(37,99,235,.1)', padding: '12px 20px', zIndex: 100,
      }}>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
          {selected.size > 0 ? (
            <><strong style={{ color: '#2563eb' }}>{selected.size} clienti selezionati</strong>
              <small style={{ color: '#9ca3af', marginLeft: 6 }}>Le tappe saranno &quot;da chiamare&quot;</small></>
          ) : (
            <span style={{ color: '#9ca3af' }}>Seleziona i clienti da includere nel giro</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Giro per:</span>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#374151', background: '#f9fafb' }}
          >
            {workDays.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
          <button
            disabled={selected.size === 0}
            onClick={() => void handleCreaGiro(selectedDate)}
            style={{
              background: selected.size > 0 ? '#2563eb' : '#e5e7eb',
              color: selected.size > 0 ? 'white' : '#9ca3af',
              border: 'none', borderRadius: 10, padding: '10px 22px',
              fontWeight: 700, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >Crea giro →</button>
        </div>
      </div>
    </div>
  );
}
