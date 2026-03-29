import { useState, useEffect, useCallback, useRef } from 'react';
import { getMatchesForSubClient, getMatchesForCustomer, addCustomerMatch, removeCustomerMatch, addSubClientMatch, removeSubClientMatch, upsertSkipModal } from '../services/sub-client-matches.service';
import { getSubclients } from '../services/subclients.service';
import { customerService } from '../services/customers.service';
import type { Customer } from '../types/local-customer';
import type { Subclient } from '../services/subclients.service';

type MatchIds = { customerErpIds: string[]; subClientCodices: string[] };

type Props =
  | {
      mode: 'subclient';
      subClientCodice: string;
      entityName: string;
      forceShow?: boolean;
      onConfirm: (ids: MatchIds) => void;
      onSkip: (matches?: MatchIds) => void;
      onClose: () => void;
    }
  | {
      mode: 'customer';
      erpId: string;
      entityName: string;
      forceShow?: boolean;
      onConfirm: (ids: MatchIds) => void;
      onSkip: (matches?: MatchIds) => void;
      onClose: () => void;
    };

type MatchState = {
  customerErpIds: string[];
  subClientCodices: string[];
};

export function MatchingManagerModal(props: Props) {
  const { mode, entityName, onConfirm, onSkip, onClose } = props;
  const forceShow = props.forceShow ?? false;

  const [initialMatch, setInitialMatch] = useState<MatchState>({ customerErpIds: [], subClientCodices: [] });
  const [currentMatch, setCurrentMatch] = useState<MatchState>({ customerErpIds: [], subClientCodices: [] });
  const [skipModal, setSkipModal] = useState(false);
  const [initialSkipModal, setInitialSkipModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [customerQuery, setCustomerQuery] = useState('');
  const [subclientQuery, setSubclientQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [subclientResults, setSubclientResults] = useState<Subclient[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showSubclientSearch, setShowSubclientSearch] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [subclientSearchLoading, setSubclientSearchLoading] = useState(false);
  // City+name of already-matched customer IDs, resolved at load time for chip labels
  const [resolvedCustomers, setResolvedCustomers] = useState<Map<string, { name: string; city: string }>>(new Map());

  const entityId = mode === 'subclient' ? props.subClientCodice : props.erpId;
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;

  useEffect(() => {
    const load = async () => {
      try {
        const result = mode === 'subclient'
          ? await getMatchesForSubClient(entityId)
          : await getMatchesForCustomer(entityId);
        const state = { customerErpIds: result.customerProfileIds, subClientCodices: result.subClientCodices };
        setInitialMatch(state);
        setCurrentMatch(state);
        setSkipModal(result.skipModal);
        setInitialSkipModal(result.skipModal);

        if (result.skipModal && !forceShow) {
          onSkipRef.current(state);
          return;
        }

        // Resolve city+name for already-matched customer IDs so chips show "ID · city"
        if (state.customerErpIds.length > 0) {
          const resolved = new Map<string, { name: string; city: string }>();
          await Promise.all(
            state.customerErpIds.map(async (id) => {
              try {
                const results = await customerService.searchCustomers(id);
                const match = results.find((c) => c.id === id);
                if (match) resolved.set(id, { name: match.name, city: match.city });
              } catch { /* non critico: chip mostra solo ID */ }
            })
          );
          setResolvedCustomers(resolved);
        }
      } catch {
        setError('Errore nel caricamento dei match');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entityId]);

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerResults([]); setCustomerSearchLoading(false); return; }
    setCustomerSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await customerService.searchCustomers(customerQuery);
        setCustomerResults(res.slice(0, 8));
      } catch { /* ignore */ } finally {
        setCustomerSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    if (!subclientQuery.trim()) { setSubclientResults([]); setSubclientSearchLoading(false); return; }
    setSubclientSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const all = await getSubclients(subclientQuery);
        setSubclientResults(all.slice(0, 8));
      } catch { /* ignore */ } finally {
        setSubclientSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [subclientQuery]);

  const addCustomer = useCallback((profileId: string) => {
    if (currentMatch.customerErpIds.includes(profileId)) return;
    setCurrentMatch((prev) => ({ ...prev, customerErpIds: [...prev.customerErpIds, profileId] }));
    setCustomerQuery('');
    setShowCustomerSearch(false);
  }, [currentMatch.customerErpIds]);

  const removeCustomer = useCallback((profileId: string) => {
    setCurrentMatch((prev) => ({ ...prev, customerErpIds: prev.customerErpIds.filter((id) => id !== profileId) }));
  }, []);

  const addSubclient = useCallback((codice: string) => {
    if (mode === 'subclient' && codice === entityId) return;
    if (currentMatch.subClientCodices.includes(codice)) return;
    setCurrentMatch((prev) => ({ ...prev, subClientCodices: [...prev.subClientCodices, codice] }));
    setSubclientQuery('');
    setShowSubclientSearch(false);
  }, [mode, entityId, currentMatch.subClientCodices]);

  const removeSubclient = useCallback((codice: string) => {
    setCurrentMatch((prev) => ({ ...prev, subClientCodices: prev.subClientCodices.filter((c) => c !== codice) }));
  }, []);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const addedCustomers = currentMatch.customerErpIds.filter((id) => !initialMatch.customerErpIds.includes(id));
      const removedCustomers = initialMatch.customerErpIds.filter((id) => !currentMatch.customerErpIds.includes(id));
      const addedSubs = currentMatch.subClientCodices.filter((c) => !initialMatch.subClientCodices.includes(c));
      const removedSubs = initialMatch.subClientCodices.filter((c) => !currentMatch.subClientCodices.includes(c));

      const ops: Promise<void>[] = [];

      if (mode === 'subclient') {
        const codice = (props as { mode: 'subclient'; subClientCodice: string }).subClientCodice;
        for (const id of addedCustomers) ops.push(addCustomerMatch(codice, id));
        for (const id of removedCustomers) ops.push(removeCustomerMatch(codice, id));
        for (const c of addedSubs) ops.push(addSubClientMatch(codice, c));
        for (const c of removedSubs) ops.push(removeSubClientMatch(codice, c));
      } else {
        const profileId = (props as { mode: 'customer'; erpId: string }).erpId;
        for (const c of addedSubs) ops.push(addCustomerMatch(c, profileId));
        for (const c of removedSubs) ops.push(removeCustomerMatch(c, profileId));
        // mode=customer non gestisce subclient-subclient match
      }

      if (skipModal !== initialSkipModal) ops.push(upsertSkipModal(mode, entityId, skipModal));

      await Promise.all(ops);
      onConfirm({ customerErpIds: currentMatch.customerErpIds, subClientCodices: currentMatch.subClientCodices });
    } catch {
      setError('Errore nel salvataggio dei match. Riprova.');
      setSaving(false);
    }
  }, [currentMatch, initialMatch, mode, entityId, skipModal, initialSkipModal, onConfirm, props]);

  // Non renderizzare nulla durante il caricamento iniziale (a meno che forceShow):
  // evita il flash visivo quando skipModal=true e la modale viene chiusa immediatamente.
  if (loading && !forceShow) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ background: '#1e293b', color: 'white', padding: '14px 18px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Collega a storico</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{entityName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Clienti Archibald — solo per mode='subclient' (un sottocliente → N clienti Archibald).
                Per mode='customer' la relazione inversa è gestita tramite subClientCodices. */}
            {mode === 'subclient' && (
              <Section
                title="Clienti Archibald collegati"
                chips={currentMatch.customerErpIds.map((id) => {
                  const fromSearch = customerResults.find((c) => c.id === id);
                  const city = fromSearch?.city ?? resolvedCustomers.get(id)?.city;
                  return { id, label: city ? `${id} · ${city}` : id };
                })}
                onRemoveChip={removeCustomer}
                searchValue={customerQuery}
                onSearchChange={setCustomerQuery}
                showSearch={showCustomerSearch}
                onToggleSearch={() => setShowCustomerSearch((v) => !v)}
                searchPlaceholder="Cerca cliente Archibald..."
                searchResults={customerResults.map((c) => ({
                  id: c.id,
                  label: c.name,
                  sublabel: `${c.id}${c.city ? ` · ${c.city}` : ''}`,
                }))}
                onSelectResult={(id) => addCustomer(id)}
                isLoading={customerSearchLoading}
              />
            )}

            {/* Sottoclienti Fresis — per entrambi i mode */}
            <Section
              title="Sottoclienti Fresis collegati"
              chips={currentMatch.subClientCodices.map((c) => {
                const match = subclientResults.find((s) => s.codice === c);
                return { id: c, label: match ? `${c} · ${match.ragioneSociale}` : c };
              })}
              onRemoveChip={removeSubclient}
              searchValue={subclientQuery}
              onSearchChange={setSubclientQuery}
              showSearch={showSubclientSearch}
              onToggleSearch={() => setShowSubclientSearch((v) => !v)}
              searchPlaceholder="Cerca sottocliente..."
              searchResults={subclientResults
                .filter((s) => !(mode === 'subclient' && s.codice === entityId))
                .map((s) => ({ id: s.codice, label: `${s.codice} · ${s.ragioneSociale}` }))}
              onSelectResult={(id) => addSubclient(id)}
              isLoading={subclientSearchLoading}
            />
          </div>
        )}

        {error && <div style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>{error}</div>}

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            <input autoComplete="off"
              type="checkbox"
              checked={skipModal}
              onChange={(e) => setSkipModal(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Non mostrare più per questo cliente
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onSkip(currentMatch)}
              style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Salta — apri storico senza matching
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || loading}
              style={{
                flex: 2, background: saving ? '#86efac' : '#059669', color: 'white', border: 'none',
                padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Salvataggio...' : '✓ Conferma e apri storico'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type SearchResult = { id: string; label: string; sublabel?: string };

function Section(props: {
  title: string;
  chips: SearchResult[];
  onRemoveChip: (id: string) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  searchPlaceholder: string;
  searchResults: SearchResult[];
  onSelectResult: (id: string) => void;
  isLoading?: boolean;
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => { setHighlightedIndex(-1); }, [props.searchResults]);
  useEffect(() => { if (!props.showSearch) setHighlightedIndex(-1); }, [props.showSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!props.searchResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, props.searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < props.searchResults.length) {
        props.onSelectResult(props.searchResults[highlightedIndex].id);
        setHighlightedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      props.onToggleSearch();
    }
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{props.title}</span>
        <button onClick={props.onToggleSearch} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {props.showSearch ? '✕ Chiudi' : '+ Aggiungi'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
        {props.chips.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nessuno</span>}
        {props.chips.map((chip) => (
          <span key={chip.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
            {chip.label}
            <button onClick={() => props.onRemoveChip(chip.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      {props.showSearch && (
        <div style={{ marginTop: 8, position: 'relative' }}>
          <input autoComplete="off"
            type="text"
            autoFocus
            placeholder={props.searchPlaceholder}
            value={props.searchValue}
            onChange={(e) => props.onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}
          />
          {props.isLoading && (
            <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>Ricerca in corso...</div>
          )}
          {!props.isLoading && props.searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 240, overflowY: 'auto' }}>
              {props.searchResults.map((r, i) => (
                <button
                  key={r.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { props.onSelectResult(r.id); setHighlightedIndex(-1); }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', border: 'none',
                    borderBottom: i < props.searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                    background: i === highlightedIndex ? '#bfdbfe' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.label}</div>
                  {r.sublabel && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{r.sublabel}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
