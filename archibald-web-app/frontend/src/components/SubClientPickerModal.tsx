import { useState, useEffect, useCallback } from 'react';
import { getSubclients, setSubclientMatch, type Subclient } from '../services/subclients.service';
import { normalizeSubClientCode } from '../utils/fresisHistoryFilters';

type Props = {
  customerProfileId: string;
  customerName: string;
  onMatched: (subClient: Subclient) => void;
  onClose: () => void;
};

export function SubClientPickerModal({ customerProfileId, customerName, onMatched, onClose }: Props) {
  const [subclients, setSubclientsList] = useState<Subclient[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSubclients()
      .then(setSubclientsList)
      .catch(() => setError('Errore nel caricamento sottoclienti'))
      .finally(() => setLoading(false));
  }, []);

  const normalizedQuery = normalizeSubClientCode(query);
  const isCodeLike = /^C\d{5}$/.test(normalizedQuery);
  const filtered = subclients
    .filter(
      (s) =>
        s.ragioneSociale.toLowerCase().includes(query.toLowerCase()) ||
        s.codice.toLowerCase().includes(query.toLowerCase()) ||
        (isCodeLike && normalizeSubClientCode(s.codice) === normalizedQuery),
    )
    .sort((a, b) => {
      if (!isCodeLike) return 0;
      const aExact = normalizeSubClientCode(a.codice) === normalizedQuery ? 0 : 1;
      const bExact = normalizeSubClientCode(b.codice) === normalizedQuery ? 0 : 1;
      return aExact - bExact;
    });

  const handleSelect = useCallback(
    async (sub: Subclient) => {
      setSaving(true);
      setError(null);
      try {
        await setSubclientMatch(sub.codice, customerProfileId);
        onMatched({ ...sub, matchedCustomerProfileId: customerProfileId, matchConfidence: 'manual' });
      } catch {
        setError('Errore nel salvataggio del collegamento');
        setSaving(false);
      }
    },
    [customerProfileId, onMatched],
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 10, width: '100%', maxWidth: 520,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          background: '#1e293b', color: 'white', padding: '14px 18px',
          borderRadius: '10px 10px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Collega a un sottocliente Fresis</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cliente: {customerName}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
            width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 15,
          }}>✕</button>
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <input autoComplete="off"
            type="text"
            placeholder="Cerca sottocliente per nome o codice..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '8px 12px',
              border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Caricamento...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Nessun sottocliente trovato
            </div>
          )}
          {filtered.map((sub) => (
            <button
              key={sub.codice}
              onClick={() => handleSelect(sub)}
              disabled={saving}
              style={{
                display: 'flex', width: '100%', textAlign: 'left',
                padding: '10px 16px', border: 'none', borderBottom: '1px solid #f1f5f9',
                background: 'white', cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {sub.ragioneSociale}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {sub.codice}
                  {sub.matchedCustomerProfileId && (
                    <span style={{ marginLeft: 8, color: '#ef4444' }}>&#9888; già collegato</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
