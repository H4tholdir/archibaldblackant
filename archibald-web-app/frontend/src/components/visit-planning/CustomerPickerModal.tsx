import { useState } from 'react';
import { fetchWithRetry } from '../../utils/fetch-with-retry';
import { addStop } from '../../services/visit-planning.service';

type Customer = {
  erpId: string;
  name:  string;
  city:  string | null;
};

type Props = {
  sessionId: string;
  stopDate:  string;
  onAdded:   () => void;
  onClose:   () => void;
};

export function CustomerPickerModal({ sessionId, stopDate, onAdded, onClose }: Props) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding]   = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        // L'API restituisce { success: true, data: { customers: [...] } }
        const raw = data?.data?.customers ?? data?.customers ?? data;
        const list: Customer[] = (Array.isArray(raw) ? raw : []).slice(0, 10);
        setResults(list);
      }
    } catch {
      // silenzioso — l'utente può continuare a cercare
    } finally {
      setLoading(false);
    }
  };

  const add = async (c: Customer) => {
    setAdding(c.erpId);
    try {
      await addStop(sessionId, {
        sourceType:   'archibald',
        sourceId:     c.erpId,
        displayName:  c.name,
        stopDate,
        status:       'planned',
        visitMinutes: 30,
      });
      onAdded();
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px 16px 0 0',
          padding: 20, width: '100%', maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
          ➕ Aggiungi cliente al giro
        </div>

        <input
          type="text"
          placeholder="Cerca cliente per nome o città..."
          value={query}
          onChange={e => search(e.target.value)}
          autoFocus
          style={{
            width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
            padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        {loading && (
          <div style={{ color: '#6b7280', fontSize: 13, padding: 8 }}>Ricerca...</div>
        )}

        {results.map(c => (
          <div key={c.erpId} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid #f1f5f9',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{c.city ?? '—'} · {c.erpId}</div>
            </div>
            <button
              disabled={adding === c.erpId}
              onClick={() => add(c)}
              style={{
                background: adding === c.erpId ? '#e5e7eb' : '#2563eb',
                color: adding === c.erpId ? '#9ca3af' : 'white',
                border: 'none', borderRadius: 6,
                padding: '5px 12px', fontSize: 13, cursor: 'pointer',
              }}
            >
              {adding === c.erpId ? '...' : '+ Aggiungi'}
            </button>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            marginTop: 16, width: '100%', padding: '10px 0',
            border: '1px solid #d1d5db', borderRadius: 8,
            background: 'white', cursor: 'pointer', fontSize: 14,
          }}
        >Annulla</button>
      </div>
    </div>
  );
}
