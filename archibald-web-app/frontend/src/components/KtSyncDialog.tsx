import { useState, useCallback, useEffect } from 'react';
import { performKtSync } from '../services/kt-sync-browser';
import type { KtSyncProgress } from '../services/kt-sync-browser';
import type { Order } from '../types/order';
import { getSubclients } from '../services/subclients.service';
import type { Subclient } from '../services/subclients.service';

type KtSyncDialogProps = {
  orders: Order[];
  onClose: () => void;
  onComplete: () => void;
};

// ─── Subclient Picker (reusable inline matcher) ──────────────────────

function SubclientPicker({
  orderName,
  currentIdx,
  total,
  onSelect,
  onSkip,
  onCancel,
}: {
  orderName: string;
  currentIdx: number;
  total: number;
  onSelect: (codice: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(orderName);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<Subclient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    getSubclients(debouncedQuery).then((r) => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '20px',
        maxWidth: '500px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            Collega sottocliente ({currentIdx + 1}/{total})
          </h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ fontSize: '13px', color: '#b45309', marginBottom: '4px', fontWeight: 600 }}>
          Cliente Archibald: {orderName}
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
          Cerca il sottocliente Arca corrispondente:
        </div>
        <input autoComplete="off"
          autoFocus
          type="search"
          placeholder="Cerca per nome, codice, P.IVA, indirizzo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', marginBottom: '8px',
          }}
        />
        <div style={{ flex: 1, overflow: 'auto', minHeight: '150px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '16px', color: '#999', fontSize: '13px' }}>Ricerca...</div>}
          {!loading && debouncedQuery.length >= 2 && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: '#999', fontSize: '13px' }}>Nessun risultato</div>
          )}
          {results.map((sc) => (
            <div
              key={sc.codice}
              onClick={() => onSelect(sc.codice)}
              style={{
                padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                marginBottom: '4px', border: '1px solid #eee',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f0f7ff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#fff'; }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#333' }}>{sc.ragioneSociale}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {sc.codice}{sc.partitaIva && ` · P.IVA: ${sc.partitaIva}`}
              </div>
              {(sc.indirizzo || sc.localita) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {sc.indirizzo}{sc.localita && `, ${sc.localita}`}{sc.prov && ` (${sc.prov})`}
                </div>
              )}
              {(sc.telefono || sc.email) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {sc.telefono}{sc.email && ` · ${sc.email}`}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd',
              backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', color: '#666',
            }}
          >
            Salta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main KtSyncDialog ──────────────────────────────────────────────

function KtSyncDialog({ orders, onClose, onComplete }: KtSyncDialogProps) {
  const [progress, setProgress] = useState<KtSyncProgress | null>(null);
  const [result, setResult] = useState<{ synced: number; errors: string[] } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Matching state
  const [unmatchedOrders, setUnmatchedOrders] = useState<Order[]>([]);
  const [matchingIdx, setMatchingIdx] = useState(-1); // -1 = not matching
  const [matchOverrides, setMatchOverrides] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);

  const checkMatches = useCallback(async () => {
    setChecking(true);
    try {
      const allSubclients = await getSubclients();
      const profileSet = new Set<string>();
      for (const sc of allSubclients) {
        if (sc.matchedCustomerProfileId) profileSet.add(sc.matchedCustomerProfileId);
      }
      const unmatched = orders.filter((o) => {
        const pid = (o as any).customerProfileId ?? (o as any).customer_profile_id;
        return !pid || !profileSet.has(pid);
      });
      setUnmatchedOrders(unmatched);

      if (unmatched.length > 0) {
        setMatchingIdx(0);
      } else {
        runSync({});
      }
    } catch {
      runSync({});
    } finally {
      setChecking(false);
    }
  }, [orders]);

  const handleMatchSelect = useCallback((codice: string) => {
    const order = unmatchedOrders[matchingIdx];
    if (order) {
      setMatchOverrides((prev) => ({ ...prev, [order.id]: codice }));
    }
    advanceMatching();
  }, [unmatchedOrders, matchingIdx]);

  const advanceMatching = useCallback(() => {
    const nextIdx = matchingIdx + 1;
    if (nextIdx >= unmatchedOrders.length) {
      setMatchingIdx(-1);
      // All matching done — run sync with overrides collected so far
      setMatchOverrides((current) => {
        runSync(current);
        return current;
      });
    } else {
      setMatchingIdx(nextIdx);
    }
  }, [matchingIdx, unmatchedOrders]);

  const runSync = useCallback(async (overrides: Record<string, string>) => {
    setIsRunning(true);
    setResult(null);
    try {
      const orderIds = orders.map((o) => o.id);
      const syncResult = await performKtSync(orderIds, overrides, (p) => setProgress(p));
      setResult({ synced: syncResult.synced, errors: syncResult.errors });
    } catch (err) {
      setResult({
        synced: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setIsRunning(false);
    }
  }, [orders]);

  const handleStart = useCallback(() => {
    checkMatches();
  }, [checkMatches]);

  const currentUnmatched = matchingIdx >= 0 ? unmatchedOrders[matchingIdx] : null;

  return (
    <>
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px',
        }}
        onClick={(e) => { if (e.target === e.currentTarget && !isRunning && matchingIdx < 0) onClose(); }}
      >
        <div style={{
          backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
          maxWidth: '420px', width: '100%', maxHeight: '80vh', overflow: 'auto',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>
            Sync KT con Arca
          </h3>

          <div style={{ marginBottom: '16px', fontSize: '14px', color: '#555' }}>
            {orders.length} ordini selezionati:
          </div>

          <div style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '16px' }}>
            {orders.map((order) => {
              const override = matchOverrides[order.id];
              return (
                <div key={order.id} style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{order.orderNumber || order.id}</div>
                      <div style={{ color: '#777' }}>{order.customerName}</div>
                    </div>
                    {override && (
                      <span style={{
                        fontSize: '10px', backgroundColor: '#dbeafe', color: '#2563EB',
                        padding: '2px 6px', borderRadius: '8px', fontWeight: 600,
                      }}>
                        {override}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {checking && (
            <div style={{ padding: '12px', backgroundColor: '#f0f7ff', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#2563EB' }}>
              Verifica match sottoclienti...
            </div>
          )}

          {matchingIdx >= 0 && !isRunning && (
            <div style={{ padding: '12px', backgroundColor: '#fffbeb', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
              Matching sottoclienti in corso ({matchingIdx + 1}/{unmatchedOrders.length})...
            </div>
          )}

          {progress && !result && matchingIdx < 0 && (
            <div style={{ padding: '12px', backgroundColor: '#f0f7ff', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#2563EB' }}>
              {progress.message || 'In corso...'}
            </div>
          )}

          {result && (
            <div style={{ marginBottom: '16px' }}>
              {result.synced > 0 && (
                <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', marginBottom: '8px', fontSize: '13px', color: '#16a34a' }}>
                  {result.synced} documenti KT generati con successo
                </div>
              )}
              {result.errors.length > 0 && (
                <div style={{ padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', fontSize: '13px', color: '#dc2626' }}>
                  {result.errors.map((err, i) => <div key={i}>{err}</div>)}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {!result ? (
              <>
                <button
                  onClick={onClose}
                  disabled={isRunning || checking || matchingIdx >= 0}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd',
                    backgroundColor: '#fff', cursor: isRunning ? 'not-allowed' : 'pointer', fontSize: '14px',
                  }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleStart}
                  disabled={isRunning || checking || matchingIdx >= 0}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    backgroundColor: '#2563EB', color: '#fff',
                    cursor: (isRunning || checking || matchingIdx >= 0) ? 'not-allowed' : 'pointer',
                    fontSize: '14px', fontWeight: 500,
                    opacity: (isRunning || checking || matchingIdx >= 0) ? 0.6 : 1,
                  }}
                >
                  {checking ? 'Verifica...' : isRunning ? 'Sync in corso...' : matchingIdx >= 0 ? 'Matching...' : 'Avvia Sync KT'}
                </button>
              </>
            ) : (
              <button
                onClick={() => { onComplete(); onClose(); }}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#2563EB', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
                }}
              >
                Chiudi
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subclient picker overlay */}
      {currentUnmatched && (
        <SubclientPicker
          orderName={currentUnmatched.customerName}
          currentIdx={matchingIdx}
          total={unmatchedOrders.length}
          onSelect={handleMatchSelect}
          onSkip={advanceMatching}
          onCancel={() => { setMatchingIdx(-1); }}
        />
      )}
    </>
  );
}

export default KtSyncDialog;
