import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerCreateModal } from '../components/CustomerCreateModal';
import { customerService } from '../services/customers.service';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';
import type { Customer } from '../types/customer';

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

const BADGE_STYLE: Record<'attivo' | 'inattivo', React.CSSProperties> = {
  attivo:   { background: '#dcfce7', color: '#166534', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
  inattivo: { background: '#fef9c3', color: '#854d0e', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 },
};

// ── Component ────────────────────────────────────────────────────────────────
export function CustomerList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [customerPhotos, setCustomerPhotos] = useState<Record<string, string | null>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreationMinimized, setIsCreationMinimized] = useState(false);
  const [minimizedCreationName, setMinimizedCreationName] = useState('');
  const [recents, setRecents] = useState<string[]>(getRecents());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    function handleResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    params.append('limit', debouncedSearch ? '100' : '200');
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const body = await res.json();
    if (body.success) setCustomers(body.data.customers);
    setLoading(false);
  }, [debouncedSearch]);

  useEffect(() => { void fetchCustomers(); }, [fetchCustomers]);

  // Lazy-load foto
  useEffect(() => {
    if (customers.length === 0) return;
    let cancelled = false;
    const load = async () => {
      for (const c of customers) {
        if (cancelled || customerPhotos[c.erpId] !== undefined) continue;
        const url = await customerService.getPhotoUrl(c.erpId).catch(() => null);
        if (!cancelled) setCustomerPhotos(prev => ({ ...prev, [c.erpId]: url }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [customers]);

  const handleClick = (erpId: string) => {
    addRecent(erpId);
    setRecents(getRecents());
    navigate(`/customers/${erpId}`);
  };

  const recentCustomers = recents
    .map(id => customers.find(c => c.erpId === id))
    .filter((c): c is Customer => c !== undefined);
  const recentIds = new Set(recents);
  const nonRecentCustomers = customers.filter(c => !recentIds.has(c.erpId));

  // Smart groups — solo quando non c'è ricerca attiva
  const groupDaContattare = nonRecentCustomers.filter(c => customerBadge(c) === 'inattivo' || !c.lastOrderDate);
  const groupDaTenereDocchio = nonRecentCustomers.filter(c => {
    if (!c.lastOrderDate || customerBadge(c) !== null) return false;
    return true; // badge null = 90-180 giorni
  });
  const groupAttivi = nonRecentCustomers.filter(c => customerBadge(c) === 'attivo');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Clienti</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{customers.length} clienti</div>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
        ><span style={{ fontSize: '18px', lineHeight: 1 }}>+</span> Nuovo Cliente</button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nome, telefono, P.IVA…"
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
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento…</div>
        )}

        {!debouncedSearch ? (
          <>
            {recentCustomers.length > 0 && (
              <>
                <SectionLabel>Recenti</SectionLabel>
                {recentCustomers.map(c => (
                  <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                ))}
              </>
            )}

            {groupDaContattare.length > 0 && (
              <>
                <SectionLabel icon="🔴" count={groupDaContattare.length} hint="Nessun ordine o ultimo ordine oltre 6 mesi fa">Da contattare</SectionLabel>
                {groupDaContattare.map(c => (
                  <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                ))}
              </>
            )}

            {groupDaTenereDocchio.length > 0 && (
              <>
                <SectionLabel icon="🟡" count={groupDaTenereDocchio.length} hint="Ultimo ordine tra 3 e 6 mesi fa">Da tenere d'occhio</SectionLabel>
                {groupDaTenereDocchio.map(c => (
                  <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                ))}
              </>
            )}

            {groupAttivi.length > 0 && (
              <>
                <SectionLabel icon="🟢" count={groupAttivi.length} hint="Ultimo ordine negli ultimi 3 mesi">Attivi</SectionLabel>
                {groupAttivi.map(c => (
                  <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
                ))}
              </>
            )}

            {!loading && customers.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Nessun cliente trovato
              </div>
            )}

            {!loading && customers.length > 0 && (
              <div style={{ padding: '12px 16px', textAlign: 'center', color: '#cbd5e1', fontSize: 11 }}>
                Cerca per trovare qualsiasi cliente
              </div>
            )}
          </>
        ) : (
          <>
            <SectionLabel count={nonRecentCustomers.length}>Risultati</SectionLabel>
            {nonRecentCustomers.map(c => (
              <CustomerRow key={c.erpId} customer={c} photo={customerPhotos[c.erpId] ?? null} onClick={() => handleClick(c.erpId)} />
            ))}
          </>
        )}
      </div>

      {isCreationMinimized && createModalOpen && (
        <div
          onClick={() => setIsCreationMinimized(false)}
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: '#1976d2',
            color: '#fff',
            borderRadius: 12,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            cursor: 'pointer',
            minWidth: 220,
            maxWidth: '90vw',
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#90caf9', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {minimizedCreationName ? `Creazione ${minimizedCreationName} in corso…` : 'Creazione cliente in corso…'}
          </span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Tocca per riaprire</span>
        </div>
      )}

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
        isMinimized={isCreationMinimized}
        onClose={() => { setCreateModalOpen(false); setIsCreationMinimized(false); }}
        onSaved={() => { setCreateModalOpen(false); setIsCreationMinimized(false); void fetchCustomers(); }}
        onMinimize={(name) => { setIsCreationMinimized(true); setMinimizedCreationName(name); }}
      />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
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
  const badge = customerBadge(c);
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: photo ? undefined : avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
        {photo ? <img src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : customerInitials(c.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[c.phone ?? c.mobile, c.city].filter(Boolean).join(' · ')}
        </div>
      </div>
      {badge && <span style={BADGE_STYLE[badge]}>{badge}</span>}
    </div>
  );
}
