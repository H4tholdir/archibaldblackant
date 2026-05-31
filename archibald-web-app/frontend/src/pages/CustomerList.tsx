import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { ErpViewerModal } from '../components/ErpViewerModal';
import { customerService } from '../services/customers.service';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import type { Customer } from '../types/customer';

type ExposureNavState = { exposureMode: 'scaduto' | 'aperto' | 'pendingWa' } | null;

type ExposureCustomer = {
  erpId: string;
  name: string;
  scaduto: number;
  aperto: number;
  isBlocked: boolean;
  blockedStatus: string | null;
};

function formatEurK(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(0)}k`;
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

const ERP_CUSTOMERS_URL = '/Archibald/CUSTTABLE_ListView_Agent/';

// ── Recenti ─────────────────────────────────────────────────────────────────
const RECENTS_KEY = 'customers_recents_v1';
function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]; }
  catch { return []; }
}
function addRecent(erpId: string): void {
  const updated = [erpId, ...getRecents().filter(id => id !== erpId)].slice(0, 5);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
}

// ── Badge ────────────────────────────────────────────────────────────────────
function parseOrderDate(d: string): number {
  if (d.includes('/')) {
    const [day, month, year] = d.split('/');
    return new Date(`${year}-${month}-${day}`).getTime();
  }
  return new Date(d).getTime();
}

export function formatRelativeTime(lastOrderDate: string | null): string {
  if (!lastOrderDate) return '—';
  const ms = parseOrderDate(lastOrderDate);
  if (isNaN(ms)) return '—';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 0) return '—';
  if (days < 30) return `${Math.max(1, days)} gg. fa`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} sett. fa`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months === 1 ? '1 mese fa' : `${months} mesi fa`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 anno fa' : `${years} anni fa`;
}

export function orderChipStyle(lastOrderDate: string | null): { bg: string; color: string } {
  if (!lastOrderDate) return { bg: '#f1f5f9', color: '#64748b' };
  const ms = parseOrderDate(lastOrderDate);
  if (isNaN(ms)) return { bg: '#f1f5f9', color: '#64748b' };
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 90)  return { bg: '#dcfce7', color: '#15803d' };
  if (days < 180) return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#fee2e2', color: '#b91c1c' };
}

type BadgeType = 'attivo' | 'inattivo' | null;
function customerBadge(c: Customer): BadgeType {
  if (!c.lastOrderDate) return null;
  const last = parseOrderDate(c.lastOrderDate);
  if (isNaN(last)) return null;
  const now = Date.now();
  const DAY = 86_400_000;
  if (now - last < 90 * DAY) return 'attivo';
  if (now - last > 180 * DAY) return 'inattivo';
  return null;
}

const SEARCH_STORAGE_KEY = 'customers_search_v1';

// Cache foto in memoria — persiste tra rimontaggio del componente nella stessa sessione
const photoCache = new Map<string, string | null>();

// ── Component ────────────────────────────────────────────────────────────────
export function CustomerList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [exposureState, setExposureState] = useState<ExposureNavState>(
    (location.state as ExposureNavState) ?? null
  );
  const [exposureCustomers, setExposureCustomers] = useState<ExposureCustomer[] | null>(null);
  const [loadingExposure, setLoadingExposure] = useState(false);
  const initialSearch = searchParams.get('search') ?? sessionStorage.getItem(SEARCH_STORAGE_KEY) ?? '';
  const [search, setSearch] = useState(initialSearch);
  // Inizializzato con lo stesso valore di search per evitare flash della lista completa al ritorno
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [myCustomers, setMyCustomers] = useState<Customer[]>([]);
  const [hiddenCustomers, setHiddenCustomers] = useState<Customer[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loadingHidden, setLoadingHidden] = useState(false);
  const [searchCustomers, setSearchCustomers] = useState<Customer[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [customerPhotos, setCustomerPhotos] = useState<Record<string, string | null>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingCreationJobId, setPendingCreationJobId] = useState<string | null>(null);
  const [erpModalOpen, setErpModalOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>(getRecents());
  const { subscribe } = useWebSocketContext();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showOnlyBlocked, setShowOnlyBlocked] = useState(
    () => searchParams.get('filter') === 'blocked'
  );

  useEffect(() => {
    function handleResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Persist search in sessionStorage
  useEffect(() => { sessionStorage.setItem(SEARCH_STORAGE_KEY, search); }, [search]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch "I miei clienti" once on mount
  const fetchMyCustomers = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    setLoadingMine(true);
    const res = await fetch('/api/customers?mine=true', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoadingMine(false); return; }
    const body = await res.json();
    if (body.success) setMyCustomers(body.data.customers);
    setLoadingMine(false);
  }, []);

  useEffect(() => { void fetchMyCustomers(); }, [fetchMyCustomers]);

  // Fetch clienti nascosti quando il toggle è attivo
  useEffect(() => {
    if (!showHidden) { setHiddenCustomers([]); return; }
    setLoadingHidden(true);
    customerService.getHiddenCustomers()
      .then(data => setHiddenCustomers(data as unknown as Customer[]))
      .catch(() => setHiddenCustomers([]))
      .finally(() => setLoadingHidden(false));
  }, [showHidden]);

  // Refresh list when customer creation job completes
  useEffect(() => {
    if (!pendingCreationJobId) return;
    const jobId = pendingCreationJobId;
    return subscribe('JOB_COMPLETED', (payload: unknown) => {
      const p = (payload ?? {}) as Record<string, unknown>;
      if (p.jobId === jobId) {
        void fetchMyCustomers();
        setPendingCreationJobId(null);
      }
    });
  }, [pendingCreationJobId, subscribe, fetchMyCustomers]);

  // Fetch search results
  const fetchSearch = useCallback(async () => {
    if (!debouncedSearch) { setSearchCustomers([]); return; }
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    setLoadingSearch(true);
    const params = new URLSearchParams({ search: debouncedSearch, limit: '100' });
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoadingSearch(false); return; }
    const body = await res.json();
    if (body.success) setSearchCustomers(body.data.customers);
    setLoadingSearch(false);
  }, [debouncedSearch]);

  useEffect(() => { void fetchSearch(); }, [fetchSearch]);

  // Fetch esposizione quando si entra in exposure mode
  const isExposureMode = exposureState !== null || showOnlyBlocked;
  useEffect(() => {
    if (!isExposureMode) { setExposureCustomers(null); return; }
    setLoadingExposure(true);
    const token = localStorage.getItem('archibald_jwt') ?? '';

    if (exposureState?.exposureMode === 'pendingWa') {
      // Modalità WA pending: mostra clienti con messaggi WA in attesa
      fetch('/api/notification-settings/pending-wa/all', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json() as Promise<{ data: Array<{ customerErpId: string; phoneTo: string; invoiceNumbers: string[]; totalAmount: number | null }> }>)
        .then(body => {
          const waData = body.data ?? [];
          // Raggruppa per cliente e crea ExposureCustomer sintetico
          const byCustomer = new Map<string, ExposureCustomer>();
          for (const wa of waData) {
            if (!byCustomer.has(wa.customerErpId)) {
              // Cerca nome dai myCustomers se disponibile
              const existing = myCustomers.find(c => c.erpId === wa.customerErpId);
              byCustomer.set(wa.customerErpId, {
                erpId: wa.customerErpId,
                name: existing?.name ?? wa.customerErpId,
                scaduto: 0,
                aperto: wa.totalAmount ?? 0,
                isBlocked: false,
                blockedStatus: null,
              });
            }
          }
          setExposureCustomers(Array.from(byCustomer.values()));
        })
        .catch(() => setExposureCustomers([]))
        .finally(() => setLoadingExposure(false));
    } else {
      fetch('/api/ledger/customers-exposure', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json() as Promise<{ data: ExposureCustomer[] }>)
        .then(body => setExposureCustomers(body.data ?? []))
        .catch(() => setExposureCustomers([]))
        .finally(() => setLoadingExposure(false));
    }
  }, [isExposureMode, exposureState?.exposureMode, myCustomers]);

  // Lazy-load foto for visible customers
  const visibleCustomers = debouncedSearch ? searchCustomers : myCustomers;
  useEffect(() => {
    if (visibleCustomers.length === 0) return;

    // Applica subito i valori già in cache (sincrono, nessun flash)
    const cachedNow: Record<string, string | null> = {};
    const toFetch = visibleCustomers.filter(c => {
      if (photoCache.has(c.erpId)) {
        cachedNow[c.erpId] = photoCache.get(c.erpId) ?? null;
        return false;
      }
      return customerPhotos[c.erpId] === undefined;
    });
    if (Object.keys(cachedNow).length > 0) {
      setCustomerPhotos(prev => ({ ...prev, ...cachedNow }));
    }
    if (toFetch.length === 0) return;

    let cancelled = false;
    const CONCURRENCY = 5;
    const BATCH_DELAY_MS = 150;
    const load = async () => {
      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async c => {
            const url = await customerService.getPhotoUrl(c.erpId).catch(() => null);
            photoCache.set(c.erpId, url);
            if (!cancelled) setCustomerPhotos(prev => ({ ...prev, [c.erpId]: url }));
          })
        );
        if (!cancelled && i + CONCURRENCY < toFetch.length) {
          await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [visibleCustomers]);

  const handleClick = (erpId: string) => {
    addRecent(erpId);
    setRecents(getRecents());
    navigate(`/customers/${erpId}`);
  };

  const recentCustomers = recents
    .map(id => myCustomers.find(c => c.erpId === id))
    .filter((c): c is Customer => c !== undefined);
  const recentIds = new Set(recents);
  const nonRecentMyCustomers = myCustomers.filter(c => !recentIds.has(c.erpId));

  // Smart groups (solo su "I miei clienti", non sulla ricerca)
  const groupDaContattare = nonRecentMyCustomers.filter(c => customerBadge(c) === 'inattivo');
  const groupDaTenereDocchio = nonRecentMyCustomers.filter(c => {
    if (!c.lastOrderDate || customerBadge(c) !== null) return false;
    return true; // badge null = 90-180 giorni
  });
  const groupAttivi = nonRecentMyCustomers.filter(c => customerBadge(c) === 'attivo');
  const groupSenzaOrdini = nonRecentMyCustomers.filter(c => !c.lastOrderDate);

  const displayedSearchCustomers = (() => {
    let list = searchCustomers;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  const displayedRecentCustomers = (() => {
    let list = recentCustomers;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  const displayedGroupDaContattare = (() => {
    let list = groupDaContattare;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  const displayedGroupDaTenereDocchio = (() => {
    let list = groupDaTenereDocchio;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  const displayedGroupAttivi = (() => {
    let list = groupAttivi;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  const displayedGroupSenzaOrdini = (() => {
    let list = groupSenzaOrdini;
    if (showOnlyBlocked) list = list.filter(c => c.blocked_status != null);

    return list;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Clienti</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{myCustomers.length} clienti</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setErpModalOpen(true)}
            style={{ background: 'transparent', color: '#475569', border: '1.5px solid #cbd5e1', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          >{'🔗'} ERP</button>
          <button
            onClick={() => setCreateModalOpen(true)}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          ><span style={{ fontSize: '18px', lineHeight: 1 }}>+</span> Nuovo Cliente</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>🔍</span>
            <input
              type="search"
              name="customer-search-field"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca in tutti i clienti…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-form-type="other"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#374151', outline: 'none' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            )}
          </div>
          <button
            onClick={() => { setShowOnlyBlocked(v => !v); setExposureState(null); }}
            style={{
              background: showOnlyBlocked ? '#fef2f2' : 'transparent',
              color: showOnlyBlocked ? '#dc2626' : '#64748b',
              border: '1.5px solid',
              borderColor: showOnlyBlocked ? '#fecaca' : '#e2e8f0',
              borderRadius: '8px', padding: '7px 12px', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            🔒 Bloccati
          </button>
          <button
            onClick={() => setShowHidden(v => !v)}
            style={{
              background: showHidden ? '#f1f5f9' : 'transparent',
              color: showHidden ? '#475569' : '#94a3b8',
              border: '1.5px solid',
              borderColor: showHidden ? '#cbd5e1' : '#e2e8f0',
              borderRadius: '8px', padding: '7px 12px', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            🙈 Nascosti
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isExposureMode ? (
          <>
            {/* Exposure mode header */}
            <div style={{
              padding: '8px 12px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: showOnlyBlocked ? '#fef2f2' : exposureState?.exposureMode === 'aperto' ? '#fffbeb' : exposureState?.exposureMode === 'pendingWa' ? '#f0fdf4' : '#fef2f2',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>
                  {showOnlyBlocked ? '🔒' : exposureState?.exposureMode === 'aperto' ? '📊' : exposureState?.exposureMode === 'pendingWa' ? '💬' : '⚠️'}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: showOnlyBlocked ? '#dc2626' : (exposureState?.exposureMode === 'aperto' ? '#d97706' : exposureState?.exposureMode === 'pendingWa' ? '#16a34a' : '#dc2626') }}>
                  {showOnlyBlocked
                    ? 'Clienti bloccati ERP'
                    : exposureState?.exposureMode === 'aperto'
                      ? 'Credito aperto per cliente'
                      : exposureState?.exposureMode === 'pendingWa'
                        ? 'Clienti con messaggi WA in attesa'
                        : 'Scaduto per cliente'}
                </span>
                {exposureCustomers && (
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                    ({(showOnlyBlocked ? exposureCustomers.filter(c => c.isBlocked) : exposureCustomers).length})
                  </span>
                )}
              </div>
              <button
                onClick={() => { setExposureState(null); setShowOnlyBlocked(false); }}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
                aria-label="Esci dalla vista esposizione"
              >×</button>
            </div>

            {loadingExposure && (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento esposizione…</div>
            )}

            {!loadingExposure && exposureCustomers !== null && (() => {
              const list = showOnlyBlocked
                ? exposureCustomers.filter(c => c.isBlocked)
                : exposureState?.exposureMode === 'aperto'
                  ? [...exposureCustomers].sort((a, b) => b.aperto - a.aperto)
                  : exposureCustomers;

              if (list.length === 0) {
                return (
                  <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                      {showOnlyBlocked ? 'Nessun cliente bloccato' : 'Nessuna esposizione'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      {showOnlyBlocked ? 'Nessun cliente ha blocco ERP attivo' : 'Tutti i clienti sono in regola'}
                    </div>
                  </div>
                );
              }

              return list.map(c => (
                <ExposureRow
                  key={c.erpId}
                  customer={c}
                  mode={exposureState?.exposureMode === 'aperto' ? 'aperto' : 'scaduto'}
                  onClick={() => navigate(`/customers/${c.erpId}?scroll=partitario`)}
                />
              ));
            })()}
          </>
        ) : debouncedSearch ? (
          <>
            {loadingSearch && (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Ricerca…</div>
            )}
            {!loadingSearch && (
              <>
                <SectionLabel count={displayedSearchCustomers.length}>Risultati</SectionLabel>
                {displayedSearchCustomers.map(c => (
                  <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                ))}
                {displayedSearchCustomers.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Nessun cliente trovato
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {loadingMine && (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento…</div>
            )}
            {!loadingMine && (
              <>
                {displayedRecentCustomers.length > 0 && (
                  <>
                    <SectionLabel>Recenti</SectionLabel>
                    {displayedRecentCustomers.map(c => (
                      <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                    ))}
                  </>
                )}
                {displayedGroupDaContattare.length > 0 && (
                  <>
                    <SectionLabel icon="🔴" count={displayedGroupDaContattare.length} hint="Nessun ordine negli ultimi 6 mesi">Da contattare</SectionLabel>
                    {displayedGroupDaContattare.map(c => (
                      <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                    ))}
                  </>
                )}
                {displayedGroupDaTenereDocchio.length > 0 && (
                  <>
                    <SectionLabel icon="🟡" count={displayedGroupDaTenereDocchio.length} hint="Ultimo ordine tra 3 e 6 mesi fa">Da tenere d'occhio</SectionLabel>
                    {displayedGroupDaTenereDocchio.map(c => (
                      <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                    ))}
                  </>
                )}
                {displayedGroupAttivi.length > 0 && (
                  <>
                    <SectionLabel icon="🟢" count={displayedGroupAttivi.length} hint="Ordine negli ultimi 3 mesi">Attivi</SectionLabel>
                    {displayedGroupAttivi.map(c => (
                      <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                    ))}
                  </>
                )}
                {displayedGroupSenzaOrdini.length > 0 && (
                  <>
                    <SectionLabel icon="⚪" count={displayedGroupSenzaOrdini.length} hint="Nessun ordine registrato">Nuovi clienti</SectionLabel>
                    {displayedGroupSenzaOrdini.map(c => (
                      <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                    ))}
                  </>
                )}
                {/* Sezione clienti nascosti */}
                {showHidden && (
                  <>
                    {loadingHidden && (
                      <div style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Caricamento nascosti…</div>
                    )}
                    {!loadingHidden && hiddenCustomers.length > 0 && (
                      <>
                        <SectionLabel icon="🙈" count={hiddenCustomers.length} hint="Clienti nascosti dalla lista">Nascosti</SectionLabel>
                        {hiddenCustomers.map(c => (
                          <CustomerRow key={`hidden-${c.erpId}`} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                        ))}
                      </>
                    )}
                    {!loadingHidden && hiddenCustomers.length === 0 && (
                      <div style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nessun cliente nascosto</div>
                    )}
                  </>
                )}

                {myCustomers.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Nessun cliente trovato
                  </div>
                )}
                {myCustomers.length > 0 && (
                  <div style={{ padding: '12px 16px', textAlign: 'center', color: '#cbd5e1', fontSize: 11 }}>
                    Cerca per trovare qualsiasi cliente
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {isMobile && (
        <button
          onClick={() => setCreateModalOpen(true)}
          style={{
            position: 'fixed', bottom: '24px', right: '24px',
            width: '56px', height: '56px',
            background: '#2563eb', color: 'white',
            border: 'none', borderRadius: '50%',
            fontSize: '28px', lineHeight: 1,
            boxShadow: '0 4px 16px rgba(37,99,235,.4)',
            cursor: 'pointer', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Nuovo Cliente"
        >
          ＋
        </button>
      )}

      <CustomerCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSaved={() => { setCreateModalOpen(false); void fetchMyCustomers(); }}
        onJobDispatched={(taskId) => setPendingCreationJobId(taskId)}
      />
      <ErpViewerModal
        isOpen={erpModalOpen}
        onClose={() => setErpModalOpen(false)}
        title="Archibald ERP — Clienti"
        url={ERP_CUSTOMERS_URL}
      />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ExposureRow({ customer: c, mode, onClick }: {
  customer: ExposureCustomer;
  mode: 'scaduto' | 'aperto';
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const primaryAmount = mode === 'aperto' ? c.aperto : c.scaduto;
  const secondaryAmount = mode === 'aperto' ? c.scaduto : c.aperto;
  const initials = c.name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  const bg = avatarGradient(c.erpId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        background: hovered ? '#f8fafc' : '#fff',
        borderBottom: '1px solid #f1f5f9',
        transition: 'background 0.12s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
      }}>
        {initials}
      </div>

      {/* Name + blocked badge */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.name}
          </div>
          {c.isBlocked && (
            <span style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '6px', padding: '1px 5px',
              fontSize: '9px', fontWeight: 700, color: '#dc2626', flexShrink: 0,
            }}>
              🔒 BLOCCATO
            </span>
          )}
        </div>
        {secondaryAmount > 0 && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
            {mode === 'aperto' ? 'scaduto' : 'totale aperto'}: {formatEurK(secondaryAmount)}
          </div>
        )}
      </div>

      {/* Primary amount + arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: mode === 'aperto' ? '#d97706' : '#dc2626' }}>
            {formatEurK(primaryAmount)}
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {mode === 'aperto' ? 'aperto' : 'scaduto'}
          </div>
        </div>
        <span style={{ fontSize: 14, color: '#cbd5e1' }}>›</span>
      </div>
    </div>
  );
}

function OrderChip({ lastOrderDate }: { lastOrderDate: string | null }) {
  const { bg, color } = orderChipStyle(lastOrderDate);
  const label = formatRelativeTime(lastOrderDate);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
      flexShrink: 0, borderRadius: 8, padding: '4px 8px', minWidth: 72,
      background: bg,
    }}>
      <span style={{ fontSize: 8, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', lineHeight: 1, marginBottom: 2 }}>
        Ult. ordine
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color, lineHeight: 1.2 }}>
        {label}
      </span>
    </div>
  );
}

function SectionLabel({ children, icon, count, hint }: { children: React.ReactNode; icon?: string; count?: number; hint?: string }) {
  return (
    <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }} title={hint}>
      {icon && <span style={{ fontSize: 10 }}>{icon}</span>}
      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{children}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>({count})</span>
      )}
    </div>
  );
}

function CustomerRow({ customer: c, photo, onClick }: { customer: Customer; photo: string | null; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: photo ? undefined : avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
        {photo ? <img src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : customerInitials(c.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
          {c.blocked_status != null && (
            <div style={{
              background: '#7f1d1d', border: '1px solid #ef4444',
              borderRadius: '6px', padding: '2px 6px',
              fontSize: '8px', fontWeight: 700, color: '#fca5a5',
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              flexShrink: 0,
            }}>
              💀 BLOCCATO
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[c.phone ?? c.mobile, c.city, `ID: ${c.erpId}`].filter(Boolean).join(' · ')}
        </div>
      </div>
      <OrderChip lastOrderDate={c.lastOrderDate ?? null} />
    </div>
  );
}
