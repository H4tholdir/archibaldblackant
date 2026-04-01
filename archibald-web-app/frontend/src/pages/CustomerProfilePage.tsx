import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getCustomerAddresses, addCustomerAddress, deleteCustomerAddress } from '../services/customer-addresses';
import { customerService } from '../services/customers.service';
import { CustomerListSidebar } from '../components/CustomerListSidebar';
import { PhotoCropModal } from '../components/PhotoCropModal';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';
import { useOperationTracking } from '../contexts/OperationTrackingContext';

type PendingEdits = {
  name?: string;
  vatNumber?: string;
  fiscalCode?: string;
  pec?: string;
  sdi?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  attentionTo?: string;
  street?: string;
  postalCode?: string;
  postalCodeCity?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  lineDiscount?: string;
  sector?: string;
  notes?: string;
  addresses?: AddressEntry[];
};

async function fetchCustomer(erpId: string): Promise<Customer> {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch(`/api/customers/${encodeURIComponent(erpId)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Errore nel caricamento del cliente');
  const body = (await res.json()) as { success: boolean; data: Customer };
  return body.data;
}

export function CustomerProfilePage() {
  const { erpId = '' } = useParams<{ erpId: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdits>({});
  const [saving, setSaving] = useState(false);
  const [storicoFilter, setStoricoFilter] = useState<'mese' | 'trimestre' | 'anno' | 'anno_prec' | 'tutto'>('anno');

  const { trackOperation } = useOperationTracking();

  const [deleteAddrConfirmId, setDeleteAddrConfirmId] = useState<number | null>(null);
  const [addAddrForm, setAddAddrForm] = useState<AddressEntry | null>(null);

  const [photoCropSrc, setPhotoCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!erpId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchCustomer(erpId),
      customerService.getPhotoUrl(erpId),
      getCustomerFullHistory({ customerErpIds: [erpId] }),
      getCustomerAddresses(erpId),
    ])
      .then(([customerData, photo, ordersData, addressesData]) => {
        if (cancelled) return;
        setCustomer(customerData);
        setPhotoUrl(photo);
        setOrders(ordersData);
        setAddresses(addressesData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [erpId]);

  const pendingCount = Object.keys(pendingEdits).length;

  function enterEditMode() {
    setEditMode(true);
  }

  function exitEditMode() {
    setEditMode(false);
    setPendingEdits({});
  }

  function setField(key: keyof PendingEdits, value: string) {
    setPendingEdits(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (pendingCount === 0 || saving || !customer) return;
    setSaving(true);
    try {
      const { jobId } = await enqueueOperation('update-customer', { erpId, name: customer.name, ...pendingEdits });
      trackOperation(erpId, jobId, customer.name, `Aggiornamento ${customer.name}`);
      await pollJobUntilDone(jobId, {
        onProgress: (_p, _label) => { /* handled by GlobalOperationBanner */ },
      });
      toastService.success('Cliente aggiornato');
      setEditMode(false);
      setPendingEdits({});
      const reloaded = await fetchCustomer(erpId);
      setCustomer(reloaded);
    } catch {
      toastService.error('Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  }

  function filterOrders(allOrders: CustomerFullHistoryOrder[], filter: 'mese' | 'trimestre' | 'anno' | 'anno_prec' | 'tutto'): CustomerFullHistoryOrder[] {
    if (filter === 'tutto') return allOrders;
    const now = new Date();
    const year = now.getFullYear();
    return allOrders.filter(o => {
      const d = new Date(o.orderDate);
      if (filter === 'anno') return d.getFullYear() === year;
      if (filter === 'anno_prec') return d.getFullYear() === year - 1;
      const diffMs = now.getTime() - d.getTime();
      const DAY = 86_400_000;
      if (filter === 'mese') return diffMs < 30 * DAY;
      if (filter === 'trimestre') return diffMs < 90 * DAY;
      return true;
    });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span>Caricamento…</span>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div style={{ padding: 24 }}>
        <span>{error ?? 'Cliente non trovato'}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {!isMobile && (
        <CustomerListSidebar activeErpId={customer.erpId} />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Edit mode banner ─────────────────────────────────────────────── */}
        {editMode && (
          <div style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>✎ Modalità modifica attiva — clicca qualsiasi campo per modificarlo</span>
            <span style={{ flex: 1 }} />
            <button onClick={exitEditMode} style={{ border: 'none', background: 'none', fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>Annulla modifiche</button>
          </div>
        )}

        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          {isMobile && (
            <button onClick={() => navigate('/customers')} style={{ border: 'none', background: 'none', fontSize: 22, color: '#2563eb', cursor: 'pointer', lineHeight: 1 }}>‹</button>
          )}
          <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</div>
          <button
            onClick={editMode ? exitEditMode : enterEditMode}
            style={{ padding: '5px 12px', background: editMode ? '#fff' : '#2563eb', color: editMode ? '#2563eb' : 'white', border: editMode ? '1.5px solid #2563eb' : 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {editMode ? 'Modifica' : '✎ Modifica'}
          </button>
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', padding: '20px 16px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <div style={{
              width: isMobile ? 80 : 72,
              height: isMobile ? 80 : 72,
              borderRadius: isMobile ? '50%' : 16,
              background: photoUrl ? undefined : avatarGradient(erpId),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isMobile ? 28 : 26, fontWeight: 700, color: 'white',
              border: `2px solid ${editMode ? '#f59e0b' : '#fff'}`,
              boxShadow: `0 0 0 2px ${editMode ? '#f59e0b' : '#3b82f6'}`,
              overflow: 'hidden',
            }}>
              {photoUrl
                ? <img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : customerInitials(customer.name)
              }
            </div>
            <button
              onClick={() => photoInputRef.current?.click()}
              aria-label="📷"
              style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, background: '#2563eb', border: '2px solid #fff', borderRadius: '50%', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
            >📷</button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => { if (ev.target?.result) setPhotoCropSrc(ev.target.result as string); };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Nome + meta */}
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 3, textAlign: 'center' }}>{customer.name}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, textAlign: 'center' }}>
            {[customer.vatNumber && `P.IVA ${customer.vatNumber}`, customer.city].filter(Boolean).join(' · ')}
          </div>

          {/* Quick actions primarie */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <QuickAction icon="📋" label="Ordine" color="#eff6ff" onClick={() => navigate('/')} />
            <QuickAction icon="📞" label="Chiama" color="#dcfce7" onClick={() => { const p = customer.mobile ?? customer.phone; if (p) window.location.href = `tel:${p}`; }} />
            {customer.mobile && (
              <QuickAction icon="💬" label="WhatsApp" color="#fef9c3" onClick={() => window.open(`https://wa.me/${customer.mobile!.replace(/\D/g, '')}`, '_blank')} />
            )}
            <QuickAction icon="🕐" label="Storico" color="#f1f5f9" onClick={() => document.getElementById('storico-section')?.scrollIntoView({ behavior: 'smooth' })} />
          </div>

          {/* Quick actions secondarie (condizionali) */}
          {(customer.email || (customer.street && customer.city)) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {customer.email && (
                <QuickAction icon="✉" label="Email" color="#f1f5f9" onClick={() => { window.location.href = `mailto:${customer.email}`; }} />
              )}
              {customer.street && customer.city && (
                <QuickAction icon="📍" label="Maps" color="#f1f5f9" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`, '_blank')} />
              )}
            </div>
          )}
        </div>

        {/* ── Area sezioni (scrollabile) ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

          {/* Contatti */}
          <SectionCard
            title="Contatti"
            editMode={editMode}
            pendingKeys={['phone', 'mobile', 'email', 'pec', 'sdi', 'url']}
            pendingEdits={pendingEdits}
          >
            <FieldCell label="Telefono" value={pendingEdits.phone ?? customer.phone} originalValue={customer.phone} editKey="phone" editMode={editMode} setField={setField} />
            <FieldCell label="Mobile" value={pendingEdits.mobile ?? customer.mobile} originalValue={customer.mobile} editKey="mobile" editMode={editMode} setField={setField} />
            <FieldCell label="Email" value={pendingEdits.email ?? customer.email} originalValue={customer.email} editKey="email" editMode={editMode} setField={setField} />
            <FieldCell label="PEC" value={pendingEdits.pec ?? customer.pec} originalValue={customer.pec} editKey="pec" editMode={editMode} setField={setField} />
            <FieldCell label="SDI" value={pendingEdits.sdi ?? customer.sdi} originalValue={customer.sdi} editKey="sdi" editMode={editMode} setField={setField} />
            <FieldCell label="URL" value={pendingEdits.url ?? customer.url} originalValue={customer.url} editKey="url" editMode={editMode} setField={setField} />
          </SectionCard>

          {/* Indirizzo */}
          <SectionCard
            title="Indirizzo"
            editMode={editMode}
            pendingKeys={['street', 'postalCode', 'postalCodeCity']}
            pendingEdits={pendingEdits}
          >
            <FieldCell label="Via" value={pendingEdits.street ?? customer.street} originalValue={customer.street} editKey="street" editMode={editMode} setField={setField} />
            <FieldCell label="CAP" value={pendingEdits.postalCode ?? customer.postalCode} originalValue={customer.postalCode} editKey="postalCode" editMode={editMode} setField={setField} />
            <FieldCell label="Città" value={pendingEdits.postalCodeCity ?? customer.city} originalValue={customer.city} editKey="postalCodeCity" editMode={editMode} setField={setField} />
            <FieldCell label="Provincia" value={customer.county ?? null} readOnly />
            <FieldCell label="Regione" value={customer.state ?? null} readOnly />
            <FieldCell label="Paese" value={customer.country ?? null} readOnly />
          </SectionCard>

          {/* Commerciale */}
          <SectionCard
            title="Commerciale"
            editMode={editMode}
            pendingKeys={['deliveryMode', 'paymentTerms', 'lineDiscount']}
            pendingEdits={pendingEdits}
          >
            <FieldCell label="Sconto linea" value={pendingEdits.lineDiscount ?? customer.lineDiscount ?? null} originalValue={customer.lineDiscount ?? null} editKey="lineDiscount" editMode={editMode} setField={setField} />
            <FieldCell label="Pagamento" value={pendingEdits.paymentTerms ?? customer.paymentTerms ?? null} originalValue={customer.paymentTerms ?? null} editKey="paymentTerms" editMode={editMode} setField={setField} />
            <FieldCell label="Consegna" value={pendingEdits.deliveryMode ?? customer.deliveryTerms} originalValue={customer.deliveryTerms} editKey="deliveryMode" editMode={editMode} setField={setField} />
          </SectionCard>

          {/* Anagrafica */}
          <SectionCard
            title="Anagrafica"
            editMode={editMode}
            pendingKeys={['name', 'vatNumber', 'fiscalCode', 'sector', 'attentionTo', 'notes']}
            pendingEdits={pendingEdits}
          >
            <FieldCell label="Ragione sociale" value={pendingEdits.name ?? customer.name} originalValue={customer.name} editKey="name" editMode={editMode} setField={setField} />
            <FieldCell label="P.IVA" value={customer.vatNumber} readOnly />
            <FieldCell label="Cod. Fiscale" value={pendingEdits.fiscalCode ?? customer.fiscalCode} originalValue={customer.fiscalCode} editKey="fiscalCode" editMode={editMode} setField={setField} />
            <FieldCell label="Settore" value={pendingEdits.sector ?? customer.sector ?? null} originalValue={customer.sector ?? null} editKey="sector" editMode={editMode} setField={setField} />
            <FieldCell label="Att.ne" value={pendingEdits.attentionTo ?? customer.attentionTo} originalValue={customer.attentionTo} editKey="attentionTo" editMode={editMode} setField={setField} />
            <FieldCell label="Note" value={pendingEdits.notes ?? customer.notes ?? null} originalValue={customer.notes ?? null} editKey="notes" editMode={editMode} setField={setField} isTextarea />
          </SectionCard>

          {/* Indirizzi alternativi */}
          <div style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Indirizzi alternativi
              <button
                onClick={() => setAddAddrForm({ tipo: 'Consegna' })}
                style={{ border: 'none', background: '#eff6ff', color: '#2563eb', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
              >+ Aggiungi</button>
            </div>

            {addresses.length === 0 && !addAddrForm && (
              <div style={{ padding: '8px 14px 14px', fontSize: 12, color: '#94a3b8' }}>Nessun indirizzo alternativo</div>
            )}

            {addresses.map(addr => (
              <div key={addr.id} style={{ padding: '8px 14px', borderTop: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{addr.nome ?? addr.tipo}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{[addr.via, addr.citta].filter(Boolean).join(', ')}</div>
                </div>
                {deleteAddrConfirmId === addr.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      aria-label="Conferma eliminazione"
                      onClick={async () => {
                        await deleteCustomerAddress(erpId, addr.id);
                        setAddresses(prev => prev.filter(a => a.id !== addr.id));
                        setDeleteAddrConfirmId(null);
                      }}
                      style={{ padding: '3px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >Conferma</button>
                    <button onClick={() => setDeleteAddrConfirmId(null)} style={{ padding: '3px 8px', background: '#f1f5f9', border: 'none', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>Annulla</button>
                  </div>
                ) : (
                  <button
                    aria-label={`Elimina ${addr.nome ?? addr.tipo}`}
                    onClick={() => setDeleteAddrConfirmId(addr.id)}
                    style={{ padding: '3px 8px', background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}
                  >Elimina</button>
                )}
              </div>
            ))}

            {addAddrForm && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid #f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['via', 'citta', 'cap', 'nome'] as const).map(field => (
                  <input
                    key={field}
                    placeholder={field === 'nome' ? 'Descrizione (es. Magazzino)' : field === 'via' ? 'Via' : field === 'citta' ? 'Città' : 'CAP'}
                    value={(addAddrForm as Record<string, string>)[field] ?? ''}
                    onChange={e => setAddAddrForm(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                    style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', outline: 'none' }}
                  />
                ))}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={async () => {
                      const created = await addCustomerAddress(erpId, addAddrForm);
                      setAddresses(prev => [...prev, created]);
                      setAddAddrForm(null);
                    }}
                    style={{ padding: '5px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >Salva indirizzo</button>
                  <button onClick={() => setAddAddrForm(null)} style={{ padding: '5px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Annulla</button>
                </div>
              </div>
            )}
          </div>

          {/* Storico ordini */}
          <div id="storico-section" style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Storico ordini
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{filterOrders(orders, storicoFilter).length} ordini</span>
            </div>

            {/* Filtri chip */}
            <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap' }}>
              {([
                { key: 'mese', label: 'Questo mese' },
                { key: 'trimestre', label: 'Ultimi 3m' },
                { key: 'anno', label: "Quest'anno" },
                { key: 'anno_prec', label: 'Anno scorso' },
                { key: 'tutto', label: 'Tutto' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStoricoFilter(key)}
                  style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: storicoFilter === key ? 700 : 400, border: `1px solid ${storicoFilter === key ? '#2563eb' : '#e2e8f0'}`, background: storicoFilter === key ? '#eff6ff' : '#fff', color: storicoFilter === key ? '#1d4ed8' : '#64748b', cursor: 'pointer' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Lista ordini */}
            {(() => {
              const filteredOrders = filterOrders(orders, storicoFilter);
              return filteredOrders.length === 0 ? (
                <div style={{ padding: '8px 14px 14px', fontSize: 12, color: '#94a3b8' }}>Nessun ordine nel periodo selezionato</div>
              ) : (
                filteredOrders.map(o => (
                  <div
                    key={o.orderId}
                    onClick={() => navigate(`/orders?highlight=${encodeURIComponent(o.orderId)}`)}
                    style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #f8fafc', cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>N° {o.orderNumber}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(o.orderDate).toLocaleDateString('it-IT')}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                      €{o.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 8 }}>›</span>
                  </div>
                ))
              );
            })()}
          </div>
        </div>

        {/* Save FAB */}
        {editMode && pendingCount > 0 && (
          <button
            disabled={saving}
            onClick={() => { void handleSave(); }}
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              padding: '12px 24px',
              borderRadius: 28,
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {saving ? 'Salvataggio…' : `Salva (${pendingCount})`}
          </button>
        )}
      </div>

      {photoCropSrc !== null && (
        <PhotoCropModal
          imageSrc={photoCropSrc}
          onConfirm={async (blob) => {
            const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
            await customerService.uploadPhoto(erpId, file);
            const newUrl = await customerService.getPhotoUrl(erpId);
            setPhotoUrl(newUrl);
            setPhotoCropSrc(null);
          }}
          onCancel={() => setPhotoCropSrc(null)}
        />
      )}

    </div>
  );
}

function QuickAction({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 40, background: color, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
    </button>
  );
}

function SectionCard({ title, editMode, pendingKeys, pendingEdits, children }: {
  title: string;
  editMode: boolean;
  pendingKeys: string[];
  pendingEdits: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const modifiedCount = pendingKeys.filter(k => pendingEdits[k] !== undefined).length;
  const hasChanges = modifiedCount > 0;
  return (
    <div style={{ background: '#fff', borderRadius: 12, marginBottom: 10, border: `1px solid ${hasChanges ? '#fde68a' : '#f1f5f9'}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', background: hasChanges ? '#fffbeb' : undefined, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        {editMode && hasChanges && (
          <span style={{ background: '#f59e0b', color: 'white', fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>{modifiedCount} modif{modifiedCount === 1 ? 'a' : 'iche'}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {children}
      </div>
    </div>
  );
}

function FieldCell({ label, value, originalValue, editKey, editMode, setField, readOnly, isTextarea }: {
  label: string;
  value: string | null | undefined;
  originalValue?: string | null | undefined;
  editKey?: keyof PendingEdits;
  editMode?: boolean;
  setField?: (key: keyof PendingEdits, value: string) => void;
  readOnly?: boolean;
  isTextarea?: boolean;
}) {
  const isModified = editMode && !readOnly && value !== originalValue && originalValue !== undefined;
  const canEdit = editMode && !readOnly && editKey && setField;
  const displayVal = value ?? '—';

  return (
    <div style={{ padding: '8px 14px', borderTop: '1px solid #f8fafc', background: isModified ? '#fffbeb' : undefined }}>
      <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {isModified && <span style={{ width: 5, height: 5, background: '#f59e0b', borderRadius: '50%', display: 'inline-block' }} />}
      </div>
      {canEdit ? (
        isTextarea ? (
          <textarea
            value={value ?? ''}
            onChange={e => setField!(editKey!, e.target.value)}
            style={{ fontSize: 12, border: `1.5px solid ${value !== undefined ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, padding: '3px 7px', width: '100%', background: value !== undefined ? '#fef9c3' : '#f8fafc', outline: 'none', resize: 'vertical', minHeight: 48, fontFamily: 'inherit', color: '#1e293b' }}
          />
        ) : (
          <input
            value={value ?? ''}
            onChange={e => setField!(editKey!, e.target.value)}
            style={{ fontSize: 12, border: `1.5px solid ${value !== undefined ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 5, padding: '3px 7px', width: '100%', boxSizing: 'border-box', background: value !== undefined ? '#fef9c3' : '#f8fafc', outline: 'none', color: '#1e293b' }}
          />
        )
      ) : (
        <div style={{ fontSize: 12, color: readOnly ? '#94a3b8' : '#1e293b', fontWeight: readOnly ? 400 : 500 }}>{displayVal}</div>
      )}
    </div>
  );
}
