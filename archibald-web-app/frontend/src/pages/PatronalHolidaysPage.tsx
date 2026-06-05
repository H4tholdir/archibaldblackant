import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listSystemHolidays, listHolidayOverrides,
  createHolidayOverride, deleteHolidayOverride,
  type SystemHoliday, type HolidayOverride,
} from '../services/visit-planning.service';

const MONTHS = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export function PatronalHolidaysPage() {
  const navigate = useNavigate();
  const [holidays, setHolidays]   = useState<SystemHoliday[]>([]);
  const [overrides, setOverrides] = useState<HolidayOverride[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({
    comune: '', provincia: '', dateMonth: 1, dateDay: 1,
    holidayName: '', isClosed: true, note: '',
  });

  const load = () => {
    setLoading(true);
    Promise.all([listSystemHolidays(), listHolidayOverrides()])
      .then(([sys, ov]) => { setHolidays(sys); setOverrides(ov); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createHolidayOverride({
        comune: form.comune, provincia: form.provincia || null,
        dateMonth: form.dateMonth, dateDay: form.dateDay,
        holidayName: form.holidayName || null,
        isClosed: form.isClosed, note: form.note || null,
      });
      setShowForm(false);
      setForm({ comune: '', provincia: '', dateMonth: 1, dateDay: 1, holidayName: '', isClosed: true, note: '' });
      load();
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo override?')) return;
    try { await deleteHolidayOverride(id); load(); }
    catch (err) { alert('Errore: ' + (err instanceof Error ? err.message : String(err))); }
  };

  const INPUT = {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13,
  } as const;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎉 Feste Patronali</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Caricamento...</div>
      ) : (
        <>
          {/* Override agente */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Le mie personalizzazioni ({overrides.length})</div>
              <button
                onClick={() => setShowForm(v => !v)}
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
              >+ Aggiungi</button>
            </div>

            {showForm && (
              <form onSubmit={handleCreate} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input placeholder="Comune *" required value={form.comune}
                    onChange={e => setForm(f => ({ ...f, comune: e.target.value }))} style={INPUT} />
                  <input placeholder="Provincia (es. NA)" value={form.provincia}
                    onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} style={INPUT} />
                  <select value={form.dateMonth}
                    onChange={e => setForm(f => ({ ...f, dateMonth: Number(e.target.value) }))} style={INPUT}>
                    {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <input type="number" placeholder="Giorno *" required min={1} max={31}
                    value={form.dateDay} onChange={e => setForm(f => ({ ...f, dateDay: Number(e.target.value) }))}
                    style={INPUT} />
                  <input placeholder="Nome festa" value={form.holidayName}
                    onChange={e => setForm(f => ({ ...f, holidayName: e.target.value }))} style={INPUT} />
                  <input placeholder="Note" value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={INPUT} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Salva</button>
                  <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
                </div>
              </form>
            )}

            {overrides.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Nessuna personalizzazione. Puoi aggiungere feste specifiche della tua zona.</div>
            ) : (
              overrides.map(ov => (
                <div key={ov.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span><b>{ov.comune}</b>{ov.provincia ? ` (${ov.provincia})` : ''} — {MONTHS[ov.dateMonth]} {ov.dateDay}{ov.holidayName ? ` · ${ov.holidayName}` : ''}</span>
                  <button onClick={() => handleDelete(ov.id)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>Elimina</button>
                </div>
              ))
            )}
          </div>

          {/* Feste standard */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Feste standard ({holidays.length})</div>
            {holidays.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                <span><b>{h.comune}</b> ({h.provincia}) — {MONTHS[h.dateMonth]} {h.dateDay}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{h.holidayName}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
