import { useState, useEffect, useRef, useMemo } from 'react';
import type { RefObject, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getCustomerAddresses, addCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../services/customer-addresses';
import { customerService } from '../services/customers.service';
import { CustomerListSidebar } from '../components/CustomerListSidebar';
import { PhotoCropModal } from '../components/PhotoCropModal';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';
import { useOperationTracking } from '../contexts/OperationTrackingContext';
import { CustomerRemindersSection } from '../components/CustomerRemindersSection';

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
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveLabel, setSaveLabel] = useState('');
  const [vatValidating, setVatValidating] = useState(false);
  const [vatValidated, setVatValidated] = useState(false);

  const { trackOperation } = useOperationTracking();

  const [deleteAddrConfirmId, setDeleteAddrConfirmId] = useState<number | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [addAddrForm, setAddAddrForm] = useState<AddressEntry | null>(null);

  const [photoCropSrc, setPhotoCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [activeRemindersCount] = useState(0);
  const [_isNewReminderOpen, setIsNewReminderOpen] = useState(false);
  const [_isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const urgentRemindersText: string | null = null;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 641 && window.innerWidth < 1024);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 641 && window.innerWidth < 1024);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sectionRefs = {
    contacts: useRef<HTMLDivElement>(null),
    address: useRef<HTMLDivElement>(null),
    anagrafica: useRef<HTMLDivElement>(null),
    fiscal: useRef<HTMLDivElement>(null),
    commercial: useRef<HTMLDivElement>(null),
    notes: useRef<HTMLDivElement>(null),
    agentNotes: useRef<HTMLDivElement>(null),
    addresses: useRef<HTMLDivElement>(null),
    storico: useRef<HTMLDivElement>(null),
    reminders: useRef<HTMLDivElement>(null),
  };

  function scrollToSection(key: keyof typeof sectionRefs) {
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
    setVatValidated(false);
  }

  function exitEditMode() {
    setEditMode(false);
    setPendingEdits({});
    setVatValidated(false);
  }

  function handleFieldChange(key: string, val: string) {
    setPendingEdits((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (pendingCount === 0 || saving || !customer) return;
    setSaving(true);
    setSaveProgress(5);
    setSaveLabel('Connessione...');
    try {
      const { jobId } = await enqueueOperation('update-customer', { erpId, name: customer.name, ...pendingEdits });
      trackOperation(erpId, jobId, customer.name, `Aggiornamento ${customer.name}`);
      setSaveProgress(15);
      setSaveLabel('Operazione in coda...');
      await pollJobUntilDone(jobId, {
        onProgress: (p, label) => {
          setSaveProgress(p);
          if (label) setSaveLabel(label);
        },
      });
      setSaveProgress(100);
      setSaveLabel('Completato');
      toastService.success('Cliente aggiornato');
      setEditMode(false);
      setPendingEdits({});
      setVatValidated(false);
      const reloaded = await fetchCustomer(erpId);
      setCustomer(reloaded);
    } catch {
      toastService.error('Errore durante il salvataggio');
    } finally {
      setSaving(false);
      setSaveProgress(0);
      setSaveLabel('');
    }
  }

  async function handleVatValidation() {
    if (!customer) return;
    setVatValidating(true);
    try {
      const jwt = localStorage.getItem('archibald_jwt') ?? '';
      const res = await fetch('/api/customers/interactive/start-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          customerProfile: customer.erpId,
          vatNumber: pendingEdits.vatNumber ?? customer.vatNumber,
        }),
      });
      if (res.ok) {
        setVatValidated(true);
      }
    } catch {
      // silent
    } finally {
      setVatValidating(false);
    }
  }

  const quickStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const thisYearOrders = orders.filter(
      (o) => new Date(o.orderDate).getFullYear() === currentYear,
    );
    const totalOrders = orders.length;
    const revenueThisYear = thisYearOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const lastOrderDate = orders[0]?.orderDate ?? null;
    return { totalOrders, revenueThisYear, lastOrderDate };
  }, [orders]);

  const completenessFields = [
    customer?.name,
    customer?.vatNumber,
    customer?.vatValidatedAt,
    (customer?.pec ?? customer?.sdi),
    customer?.street,
    customer?.postalCode,
    customer?.city,
  ];
  const completedFields = completenessFields.filter(Boolean).length;
  const totalCompletenessFields = completenessFields.length;
  const completenessPercent = Math.round((completedFields / totalCompletenessFields) * 100);
  const missingCount = totalCompletenessFields - completedFields;
  const isComplete = missingCount === 0;

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
          {!editMode ? (
            <button
              onClick={enterEditMode}
              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
            >
              ✎ Modifica
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { void handleSave(); }}
                disabled={saving}
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontSize: 12 }}
              >
                💾 Salva
              </button>
              <button
                onClick={exitEditMode}
                style={{ background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
              >
                ✕ Annulla
              </button>
            </div>
          )}
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 0' }}>
            {/* Avatar con completeness ring */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <div
                style={{
                  width: isMobile ? 180 : 160, height: isMobile ? 180 : 160, borderRadius: '50%',
                  border: isComplete ? '3px solid #22c55e' : '3px dashed #f59e0b',
                  overflow: 'hidden',
                  background: photoUrl ? 'transparent' : avatarGradient(erpId),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onClick={() => photoInputRef.current?.click()}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: isMobile ? '64px' : '56px', fontWeight: 800, color: 'white' }}>
                    {customerInitials(customer.name)}
                  </span>
                )}
              </div>
              {!isComplete && (
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  background: '#f59e0b', color: 'white',
                  borderRadius: '20px', padding: '2px 8px',
                  fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {missingCount} mancanti
                </div>
              )}
              <button
                onClick={() => photoInputRef.current?.click()}
                aria-label="Cambia foto"
                style={{
                  position: 'absolute', bottom: 4, right: 4,
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'white', border: '2px solid #1e293b',
                  cursor: 'pointer', fontSize: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
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

            {/* Nome + bell reminder */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>
                {customer.name}
              </h1>
              {activeRemindersCount > 0 && (
                <button
                  onClick={() => scrollToSection('reminders')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, position: 'relative' }}
                >
                  <span style={{ fontSize: '18px' }}>🔔</span>
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#ef4444', color: 'white', borderRadius: '50%',
                    width: '16px', height: '16px', fontSize: '10px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{activeRemindersCount}</span>
                </button>
              )}
            </div>

            <div style={{ fontSize: 12, color: '#64748b', marginBottom: '12px', textAlign: 'center' }}>
              {[customer.vatNumber && `P.IVA ${customer.vatNumber}`, customer.city].filter(Boolean).join(' · ')}
            </div>

            {urgentRemindersText && (
              <div style={{ fontSize: '12px', color: '#f97316', fontWeight: 600, marginBottom: '8px' }}>
                ⏰ {urgentRemindersText}
              </div>
            )}

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{quickStats.totalOrders}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>ordini</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {quickStats.revenueThisYear.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>fatturato anno</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {quickStats.lastOrderDate
                    ? new Date(quickStats.lastOrderDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                    : '—'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>ultimo ordine</div>
              </div>
            </div>

            {/* Banner completezza */}
            {!isComplete && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
                padding: '8px 12px', marginBottom: '12px', width: '100%', maxWidth: '380px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                    Profilo {completenessPercent}%
                  </span>
                  <span
                    style={{ fontSize: '12px', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => setEditMode(true)}
                  >
                    Completa →
                  </span>
                </div>
                <div style={{ height: '4px', background: '#fde68a', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: `${completenessPercent}%`, background: '#f59e0b', borderRadius: '2px' }} />
                </div>
              </div>
            )}

            {/* Quick actions — 7 pulsanti */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
              {([
                { icon: '📋', label: 'Ordine', bg: '#1d4ed8', color: '#bfdbfe',
                  onClick: () => navigate(`/order?customerId=${customer.erpId}`) },
                { icon: '📞', label: 'Chiama', bg: '#166534', color: '#86efac',
                  disabled: !(customer.mobile ?? customer.phone),
                  onClick: () => { const p = customer.mobile ?? customer.phone; if (p) window.open(`tel:${p}`); } },
                { icon: '💬', label: 'WhatsApp', bg: '#15803d', color: '#bbf7d0',
                  disabled: !customer.mobile,
                  onClick: () => { if (customer.mobile) window.open(`https://wa.me/${customer.mobile.replace(/\D/g, '')}`); } },
                { icon: '✉', label: 'Email', bg: '#7e22ce', color: '#d8b4fe',
                  disabled: !customer.email,
                  onClick: () => { if (customer.email) window.open(`mailto:${customer.email}`); } },
                { icon: '📍', label: 'Indicazioni', bg: '#92400e', color: '#fde68a',
                  disabled: !customer.street,
                  onClick: () => { if (customer.street) window.open(`https://maps.google.com/?daddr=${encodeURIComponent(`${customer.street},${customer.city ?? ''}`)}&travelmode=driving`); } },
                { icon: '🔔', label: 'Allerta',
                  bg: activeRemindersCount > 0 ? '#7f1d1d' : '#1e293b',
                  color: '#fca5a5',
                  badgeCount: activeRemindersCount > 0 ? activeRemindersCount : undefined,
                  onClick: () => setIsNewReminderOpen(true) },
                { icon: '📊', label: 'Analisi', bg: '#1e3a5f', color: '#93c5fd',
                  onClick: () => setIsAnalysisOpen(true) },
              ] as Array<{ icon: string; label: string; bg: string; color: string; onClick: () => void; disabled?: boolean; badgeCount?: number }>).map(({ icon, label, bg, color: _color, onClick, disabled, badgeCount }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={onClick}
                    disabled={!!disabled}
                    style={{
                      width: '44px', height: '44px', background: disabled ? '#94a3b8' : bg,
                      borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer',
                      fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    {icon}
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        background: '#ef4444', color: 'white', borderRadius: '8px',
                        padding: '0 4px', fontSize: '9px', fontWeight: 800,
                      }}>{badgeCount}</span>
                    )}
                  </button>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── VAT Track B banner ────────────────────────────────────────── */}
        {editMode && !vatValidated && !customer.vatValidatedAt && (
          <div style={{
            background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px',
            padding: '10px 14px', margin: '0 16px 12px',
            display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
          }}>
            <span style={{ color: '#92400e', fontWeight: 700, flex: 1, fontSize: '12px' }}>
              ⚠ P.IVA non validata — Devi validarla prima di poter salvare.
            </span>
            {vatValidating ? (
              <span style={{ fontSize: '12px', color: '#92400e' }}>Verifica in corso (~30s)...</span>
            ) : (
              <button
                onClick={() => { void handleVatValidation(); }}
                style={{
                  background: '#fbbf24', border: 'none', borderRadius: '6px',
                  padding: '4px 10px', fontWeight: 700, cursor: 'pointer', fontSize: '12px',
                }}
              >Valida ora →</button>
            )}
          </div>
        )}

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        {saving && (
          <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              {saveLabel || 'Aggiornamento in corso...'}
            </div>
            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${saveProgress}%`, background: '#2563eb', borderRadius: '2px', transition: 'width .3s ease' }} />
            </div>
          </div>
        )}

        {/* ── Area sezioni (scrollabile) ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr',
            gap: '16px',
            padding: isMobile ? '16px' : '24px',
          }}>

            {/* 1. Contatti */}
            <SectionCard refProp={sectionRefs.contacts} title="Contatti" isEditMode={editMode}>
              <FieldRow label="Telefono" value={pendingEdits.phone ?? customer.phone} fieldKey="phone" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Mobile" value={pendingEdits.mobile ?? customer.mobile} fieldKey="mobile" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Email" value={pendingEdits.email ?? customer.email} fieldKey="email" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="PEC" value={pendingEdits.pec ?? customer.pec} fieldKey="pec" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="SDI" value={pendingEdits.sdi ?? customer.sdi} fieldKey="sdi" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Sito web" value={pendingEdits.url ?? customer.url} fieldKey="url" isEditing={editMode} onChange={handleFieldChange} />
            </SectionCard>

            {/* 2. Indirizzo */}
            <SectionCard refProp={sectionRefs.address} title="Indirizzo principale" isEditMode={editMode}>
              <FieldRow label="Via" value={pendingEdits.street ?? customer.street} fieldKey="street" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="CAP" value={pendingEdits.postalCode ?? customer.postalCode} fieldKey="postalCode" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Città" value={pendingEdits.postalCodeCity ?? customer.city} fieldKey="postalCodeCity" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Provincia" value={customer.county ?? null} />
              <FieldRow label="Regione" value={customer.state ?? null} />
              <FieldRow label="Paese" value={customer.country ?? null} />
            </SectionCard>

            {/* 3. Anagrafica */}
            <SectionCard refProp={sectionRefs.anagrafica} title="Anagrafica" isEditMode={editMode}>
              <FieldRow label="Ragione sociale" value={pendingEdits.name ?? customer.name} fieldKey="name" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Alias" value={customer.nameAlias ?? null} />
              <FieldRow label="Attenzione a" value={pendingEdits.attentionTo ?? customer.attentionTo} fieldKey="attentionTo" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Settore" value={pendingEdits.sector ?? customer.sector ?? null} fieldKey="sector" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Cod. Fiscale" value={pendingEdits.fiscalCode ?? customer.fiscalCode} fieldKey="fiscalCode" isEditing={editMode} onChange={handleFieldChange} />
            </SectionCard>

            {/* 4. Dati Fiscali */}
            <SectionCard refProp={sectionRefs.fiscal} title="Dati Fiscali" isEditMode={editMode}>
              {customer.vatValidatedAt ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0, marginRight: '8px', minWidth: '100px' }}>P.IVA</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#1e293b' }}>{customer.vatNumber ?? '—'}</span>
                    <span style={{ fontSize: '10px', background: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '1px 5px', fontWeight: 700 }}>✓ Validata</span>
                  </div>
                </div>
              ) : (
                <FieldRow label="P.IVA" value={pendingEdits.vatNumber ?? customer.vatNumber} fieldKey="vatNumber" isEditing={editMode} onChange={handleFieldChange} />
              )}
              <FieldRow label="PEC" value={pendingEdits.pec ?? customer.pec} fieldKey="pec" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="SDI" value={pendingEdits.sdi ?? customer.sdi} fieldKey="sdi" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Validata" value={customer.vatValidatedAt ? '✓ Validata' : '✗ Non validata'} />
            </SectionCard>

            {/* 5. Commerciale */}
            <SectionCard refProp={sectionRefs.commercial} title="Commerciale" isEditMode={editMode}>
              <FieldRow label="Listino" value={customer.priceGroup ?? null} />
              <FieldRow label="Sconto linea" value={pendingEdits.lineDiscount ?? customer.lineDiscount ?? null} fieldKey="lineDiscount" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Pagamento" value={pendingEdits.paymentTerms ?? customer.paymentTerms ?? null} fieldKey="paymentTerms" isEditing={editMode} onChange={handleFieldChange} />
              <FieldRow label="Modalità consegna" value={pendingEdits.deliveryMode ?? customer.deliveryTerms ?? null} fieldKey="deliveryMode" isEditing={editMode} onChange={handleFieldChange} />
            </SectionCard>

            {/* 6. Note */}
            <SectionCard refProp={sectionRefs.notes} title="Note" isEditMode={editMode}>
              {editMode ? (
                <textarea
                  value={pendingEdits.notes ?? customer.notes ?? ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  rows={4}
                  style={{ width: '100%', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 8px', fontSize: '13px', background: '#eff6ff', color: '#1e293b', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              ) : (
                <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' }}>
                  {(pendingEdits.notes ?? customer.notes) || <span style={{ color: '#94a3b8' }}>Nessuna nota</span>}
                </div>
              )}
            </SectionCard>

            {/* 7. Note interne agente */}
            <SectionCard refProp={sectionRefs.agentNotes} title="Note interne" isEditMode={editMode}>
              <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' }}>
                {customer.agentNotes || <span style={{ color: '#94a3b8' }}>Nessuna nota interna</span>}
              </div>
            </SectionCard>

            {/* 8. Indirizzi alternativi */}
            <SectionCard refProp={sectionRefs.addresses} title="Indirizzi alternativi" isEditMode={editMode}>
              <div>
                {/* Header: bottone aggiungi visibile solo in edit mode */}
                {editMode && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button
                      onClick={() => setAddAddrForm({ tipo: 'Consegna' })}
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}
                    >+ Aggiungi</button>
                  </div>
                )}

                {/* Lista indirizzi esistenti */}
                {addresses.length === 0 && !addAddrForm && (
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>Nessun indirizzo alternativo</span>
                )}
                {addresses.map(addr => (
                  <div key={addr.id} style={{ marginBottom: '8px', borderBottom: '1px solid #f8fafc', paddingBottom: '8px' }}>
                    {editingAddressId === addr.id ? (
                      <AddressInlineEditForm
                        value={{ tipo: addr.tipo, nome: addr.nome ?? undefined, via: addr.via ?? undefined, cap: addr.cap ?? undefined, citta: addr.citta ?? undefined }}
                        onSave={async (draft) => {
                          const updated = await updateCustomerAddress(erpId, addr.id, draft);
                          setAddresses(prev => prev.map(a => a.id === addr.id ? updated : a));
                          setEditingAddressId(null);
                        }}
                        onCancel={() => setEditingAddressId(null)}
                      />
                    ) : (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{addr.nome ?? addr.tipo}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {[addr.via, addr.cap, addr.citta].filter(Boolean).join(', ')}
                          </div>
                          {(addr.via ?? addr.citta) && (
                            <a
                              href={`https://maps.google.com/?daddr=${encodeURIComponent([addr.via, addr.citta].filter(Boolean).join(', '))}&travelmode=driving`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '11px', color: '#2563eb' }}
                            >Indicazioni</a>
                          )}
                        </div>
                        {editMode && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              aria-label={`Modifica ${addr.nome ?? addr.tipo}`}
                              onClick={() => { setEditingAddressId(addr.id); setDeleteAddrConfirmId(null); }}
                              style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}
                            >Modifica</button>
                            <button
                              aria-label={`Elimina ${addr.nome ?? addr.tipo}`}
                              onClick={() => { setDeleteAddrConfirmId(addr.id); setEditingAddressId(null); }}
                              style={{ border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', borderRadius: '4px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' }}
                            >Elimina</button>
                          </div>
                        )}
                      </div>
                    )}
                    {deleteAddrConfirmId === addr.id && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#dc2626' }}>Rimuovere questo indirizzo?</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                          <button
                            aria-label="Conferma eliminazione"
                            onClick={async () => {
                              await deleteCustomerAddress(erpId, addr.id);
                              setAddresses(prev => prev.filter(a => a.id !== addr.id));
                              setDeleteAddrConfirmId(null);
                            }}
                            style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}
                          >Elimina</button>
                          <button
                            onClick={() => setDeleteAddrConfirmId(null)}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}
                          >Annulla</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Form per nuovo indirizzo */}
                {addAddrForm && (
                  <AddressInlineEditForm
                    value={addAddrForm}
                    onSave={async (draft) => {
                      const created = await addCustomerAddress(erpId, draft);
                      setAddresses(prev => [...prev, created]);
                      setAddAddrForm(null);
                    }}
                    onCancel={() => setAddAddrForm(null)}
                  />
                )}
              </div>
            </SectionCard>

            {/* 9. Storico ordini — full width */}
            <div ref={sectionRefs.storico} style={{ gridColumn: isTablet ? '1 / -1' : 'auto' }}>
              <SectionCard title="Storico ordini" isEditMode={false}>
                <StoricoOrdiniSection orders={orders} customerName={customer.name} navigate={navigate} />
              </SectionCard>
            </div>

            {/* 10. Promemoria — full width */}
            <div ref={sectionRefs.reminders} id="reminders-section" style={{ gridColumn: isTablet ? '1 / -1' : 'auto' }}>
              <SectionCard title="Promemoria" isEditMode={false}>
                <CustomerRemindersSection
                  customerProfile={customer.erpId}
                  openNewForm={_isNewReminderOpen}
                  onNewFormClose={() => setIsNewReminderOpen(false)}
                />
              </SectionCard>
            </div>

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


function AddressInlineEditForm({ value, onSave, onCancel }: {
  value: AddressEntry;
  onSave: (v: AddressEntry) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AddressEntry>(value);
  const [saving, setSaving] = useState(false);
  const fields: { key: keyof AddressEntry; label: string; placeholder: string }[] = [
    { key: 'nome', label: 'Descrizione', placeholder: 'es. Magazzino' },
    { key: 'via', label: 'Via', placeholder: 'Via e numero civico' },
    { key: 'cap', label: 'CAP', placeholder: '00000' },
    { key: 'citta', label: 'Città', placeholder: 'Città' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {fields.map(({ key, label, placeholder }) => (
        <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', minWidth: '80px', flexShrink: 0 }}>{label}</span>
          <input
            value={draft[key] ?? ''}
            placeholder={placeholder}
            onChange={(e) => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
            style={{ flex: 1, border: '1px solid #bfdbfe', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', background: '#eff6ff', outline: 'none' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await onSave(draft); } finally { setSaving(false); }
          }}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >{saving ? 'Salvataggio…' : 'Salva'}</button>
        <button
          onClick={onCancel}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
        >Annulla</button>
      </div>
    </div>
  );
}

function SectionCard({
  refProp, title, children, isEditMode,
}: {
  refProp?: RefObject<HTMLDivElement | null>;
  title: string;
  children: ReactNode;
  isEditMode?: boolean;
}) {
  return (
    <div
      ref={refProp}
      style={{
        background: isEditMode ? '#eff6ff' : 'white',
        border: '1px solid #f1f5f9',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '0',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {children}
      </div>
    </div>
  );
}


function FieldRow({ label, value, fieldKey, isEditing, onChange }: {
  label: string;
  value: string | null | undefined;
  fieldKey?: string;
  isEditing?: boolean;
  onChange?: (key: string, val: string) => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0, marginRight: '8px', minWidth: '100px' }}>{label}</span>
      {isEditing && fieldKey && onChange ? (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          style={{ flex: 1, border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', background: '#eff6ff', color: '#1e293b', outline: 'none' }}
        />
      ) : (
        <span style={{ fontSize: '13px', color: value ? '#1e293b' : '#e2e8f0', fontWeight: value ? 400 : 300 }}>
          {value ?? '—'}
        </span>
      )}
    </div>
  );
}

function MonthlyBarChart({ orders }: { orders: CustomerFullHistoryOrder[] }) {
  const now = new Date();
  const months = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
    return { label: d.toLocaleDateString('it-IT', { month: 'short' }), month: d.getMonth(), year: d.getFullYear() };
  });
  const monthlyRevenues = months.map((m) =>
    orders
      .filter((o) => {
        const d = new Date(o.orderDate);
        return d.getMonth() === m.month && d.getFullYear() === m.year;
      })
      .reduce((s, o) => s + o.totalAmount, 0)
  );
  const maxRevenue = Math.max(...monthlyRevenues, 1);
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '60px', padding: '8px 0' }}>
      {months.map((m, i) => {
        const revenue = monthlyRevenues[i];
        const h = Math.max(4, Math.round((revenue / maxRevenue) * 52));
        return (
          <div key={`${m.year}-${m.month}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ width: '100%', height: `${h}px`, background: revenue > 0 ? '#1d4ed8' : '#334155', borderRadius: '2px 2px 0 0' }} />
            <span style={{ fontSize: '9px', color: '#94a3b8' }}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StoricoOrdiniSection({ orders, customerName: _customerName, navigate }: { orders: CustomerFullHistoryOrder[]; customerName: string; navigate: (path: string) => void }) {
  const [filter, setFilter] = useState<'tutto' | 'anno' | '3mesi' | 'mese'>('tutto');
  const now = new Date();

  const filtered = orders.filter((o) => {
    const d = new Date(o.orderDate);
    if (filter === 'anno') return d.getFullYear() === now.getFullYear();
    if (filter === '3mesi') return d >= new Date(now.getTime() - 90 * 86400000);
    if (filter === 'mese') return d >= new Date(now.getTime() - 30 * 86400000);
    return true;
  });

  const revenueThisYear = orders
    .filter((o) => new Date(o.orderDate).getFullYear() === now.getFullYear())
    .reduce((s, o) => s + o.totalAmount, 0);
  const avgPerOrder = filtered.length > 0 ? filtered.reduce((s, o) => s + o.totalAmount, 0) / filtered.length : 0;
  const lastOrder = orders[0];

  return (
    <div style={{ margin: '-12px -16px' }}>
      <MonthlyBarChart orders={orders} />
      <div style={{ display: 'flex', gap: '16px', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { value: revenueThisYear.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), label: 'Fatturato anno' },
          { value: avgPerOrder.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), label: 'Media/ordine' },
          { value: lastOrder ? new Date(lastOrder.orderDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—', label: 'Ultimo ordine' },
        ].map(({ value, label }) => (
          <div key={label} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 800 }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px', flexWrap: 'wrap' }}>
        {(['tutto', 'anno', '3mesi', 'mese'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
            border: filter === f ? '2px solid #2563eb' : '1px solid #e2e8f0',
            background: filter === f ? '#eff6ff' : '#f8fafc',
            color: filter === f ? '#1d4ed8' : '#64748b',
            fontWeight: filter === f ? 700 : 400, fontSize: '12px',
          }}>
            {{ tutto: 'Tutto', anno: "Quest'anno", '3mesi': '3 mesi', mese: 'Mese' }[f]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', alignSelf: 'center' }}>{filtered.length} ordini</span>
      </div>
      <div>
        {filtered.map((o) => {
          const isRecent = new Date(o.orderDate) >= new Date(now.getTime() - 30 * 86400000);
          return (
            <div
              key={o.orderId}
              onClick={() => navigate(`/orders?highlight=${encodeURIComponent(o.orderId)}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isRecent ? '#1d4ed8' : '#94a3b8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>N° {o.orderNumber}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(o.orderDate).toLocaleDateString('it-IT')}</div>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                {o.totalAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </div>
              <span style={{ color: '#94a3b8', fontSize: '16px' }}>›</span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            Nessun ordine nel periodo selezionato
          </div>
        )}
      </div>
    </div>
  );
}
