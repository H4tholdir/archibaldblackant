import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import { CustomerSidebar } from '../components/CustomerSidebar';
import { CustomerInlineSection } from '../components/CustomerInlineSection';
import type { SectionField } from '../components/CustomerInlineSection';
import { checkCustomerCompleteness } from '../utils/customer-completeness';
import { getCustomerFullHistory } from '../api/customer-full-history';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

type Tab = 'dati' | 'ordini' | 'note' | 'indirizzi';

async function fetchCustomer(customerProfile: string): Promise<Customer> {
  const jwt = localStorage.getItem('archibald_jwt') ?? '';
  const res = await fetch(`/api/customers/${encodeURIComponent(customerProfile)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Errore nel caricamento del cliente');
  const body = (await res.json()) as { success: boolean; data: Customer };
  return body.data;
}

export function CustomerDetailPage() {
  const { customerProfile } = useParams<{ customerProfile: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dati');

  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!customerProfile) return;
    try {
      const data = await fetchCustomer(customerProfile);
      setCustomer(data);
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Errore nel caricamento del cliente');
    } finally {
      setLoading(false);
    }
  }, [customerProfile]);

  useEffect(() => { void loadCustomer(); }, [loadCustomer]);

  useEffect(() => {
    if (activeTab !== 'ordini' || !customer || ordersLoaded) return;
    setOrdersLoading(true);
    setOrdersError(null);
    getCustomerFullHistory({ customerProfileIds: [customer.customerProfile] })
      .then((data) => {
        setOrders(data.slice(0, 20));
        setOrdersLoaded(true);
      })
      .catch((e: unknown) => {
        setOrdersError(e instanceof Error ? e.message : 'Errore caricamento ordini');
        setOrdersLoaded(true);
      })
      .finally(() => setOrdersLoading(false));
  }, [activeTab, customer, ordersLoaded]);

  const isMobile = window.innerWidth < 641;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
        Caricamento...
      </div>
    );
  }

  if (fetchError || !customer) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '8px', padding: '16px', color: '#dc2626' }}>
          {fetchError ?? 'Cliente non trovato'}
        </div>
        <button onClick={() => navigate('/customers')} style={{ marginTop: '12px', fontSize: '13px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Torna ai clienti
        </button>
      </div>
    );
  }

  const completeness = checkCustomerCompleteness(customer);

  const anagraficaFields: SectionField[] = [
    { key: 'name',        label: 'Ragione Sociale',     value: customer.name },
    { key: 'nameAlias',   label: 'Alias (da ERP)',      value: customer.nameAlias ?? null, readOnly: true },
    { key: 'attentionTo', label: "All'attenzione di",   value: customer.attentionTo },
    { key: 'sector',      label: 'Settore',             value: customer.sector ?? null },
    { key: 'fiscalCode',  label: 'Codice Fiscale',      value: customer.fiscalCode },
  ];

  const fiscaleFields: SectionField[] = [
    { key: 'vatNumber',      label: 'P.IVA',          value: customer.vatNumber },
    { key: 'vatValidatedAt', label: 'IVA Validata',   value: customer.vatValidatedAt ? 'Sì ✓' : 'No', readOnly: true },
    { key: 'pec',            label: 'PEC',            value: customer.pec, type: 'email' },
    { key: 'sdi',            label: 'SDI',            value: customer.sdi },
  ];

  const contattiFields: SectionField[] = [
    { key: 'phone',  label: 'Telefono', value: customer.phone },
    { key: 'mobile', label: 'Mobile',   value: customer.mobile },
    { key: 'email',  label: 'Email',    value: customer.email, type: 'email' },
    { key: 'url',    label: 'Sito web', value: customer.url,   type: 'url' },
  ];

  const indirizzoFields: SectionField[] = [
    { key: 'street',     label: 'Indirizzo',          value: customer.street },
    { key: 'postalCode', label: 'CAP',                value: customer.postalCode },
    { key: 'city',       label: 'Città',              value: customer.city },
    { key: 'county',     label: 'Provincia (da CAP)', value: customer.county ?? null, readOnly: true },
    { key: 'state',      label: 'Regione (da CAP)',   value: customer.state ?? null,  readOnly: true },
    { key: 'country',    label: 'Nazione (da CAP)',   value: customer.country ?? null, readOnly: true },
  ];

  const commercialeFields: SectionField[] = [
    { key: 'deliveryTerms', label: 'Modalità consegna', value: customer.deliveryTerms },
    { key: 'paymentTerms',  label: 'Termini pagamento', value: customer.paymentTerms ?? null },
    { key: 'lineDiscount',  label: 'Sconto linea',      value: customer.lineDiscount ?? null },
    { key: 'priceGroup',    label: 'Gruppo prezzo',     value: customer.priceGroup ?? null, readOnly: true },
  ];

  const noteFields: SectionField[] = [
    { key: 'notes', label: 'Note (sincronizzate con ERP)', value: customer.notes ?? null, type: 'textarea' },
  ];

  const isFiscaleError = completeness.missingFields.some((f) =>
    ['vatNumber', 'vatValidatedAt', 'pec_or_sdi'].includes(f),
  );
  const isIndirizzoError = completeness.missingFields.some((f) =>
    ['street', 'postalCode', 'city'].includes(f),
  );

  const tabBtn = (id: Tab, label: string, badge?: number) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 12px', fontSize: '11px',
        fontWeight: activeTab === id ? 700 : 500,
        color: activeTab === id ? '#2563eb' : '#64748b',
        background: 'none', border: 'none',
        borderBottom: activeTab === id ? '2px solid #2563eb' : '2px solid transparent',
        cursor: 'pointer', whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}
    >
      {label}
      {badge ? (
        <span style={{ background: '#ef4444', color: 'white', borderRadius: '8px', padding: '0 5px', fontSize: '8px', lineHeight: '14px' }}>
          {badge}
        </span>
      ) : null}
    </button>
  );

  const mobileHeader = isMobile ? (
    <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '8px',
          background: '#2d4a6b', border: '2px solid #4a90d9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, color: '#93c5fd', fontSize: '14px', flexShrink: 0,
        }}>
          {customer.name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{customer.name}</div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>{customer.customerProfile}</div>
        </div>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '5px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Ordine
        </button>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #e5e7eb', marginTop: '8px' }}>
        {[
          { icon: '📞', label: 'Chiama',   fn: () => { const p = customer.mobile || customer.phone; if (p) window.location.href = `tel:${p}`; } },
          { icon: '💬', label: 'WhatsApp', fn: () => { const p = customer.mobile || customer.phone; if (p) window.open(`https://wa.me/${p.replace(/\D/g, '')}`, '_blank'); } },
          { icon: '✉',  label: 'Email',    fn: () => { if (customer.email) window.location.href = `mailto:${customer.email}`; } },
          { icon: '📍', label: 'Maps',     fn: () => { if (customer.street && customer.city) window.open(`https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`, '_blank'); } },
        ].map(({ icon, label, fn }) => (
          <button key={label} onClick={fn} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 4px', border: 'none', background: 'none', cursor: 'pointer' }}>
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <span style={{ fontSize: '8px', color: '#475569', marginTop: '2px' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Topbar */}
      <div style={{ background: '#1e293b', color: '#f8fafc', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
        <button onClick={() => navigate('/customers')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}>
          ← Clienti
        </button>
        <span style={{ marginLeft: '4px', fontWeight: 700 }}>{customer.name}</span>
        <span style={{ flex: 1 }} />
        {!completeness.ok && (
          <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '9px' }}>
            ⚠ {completeness.missingFields.length} mancanti
          </span>
        )}
      </div>

      {mobileHeader}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <CustomerSidebar customer={customer} onNewOrder={() => navigate('/')} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1.5px solid #e5e7eb', background: '#f8fafc', overflowX: 'auto' }}>
            {tabBtn('dati',      'Dati',          completeness.ok ? undefined : 1)}
            {tabBtn('ordini',    'Ordini')}
            {tabBtn('note',      'Note interne')}
            {tabBtn('indirizzi', 'Indirizzi alt.')}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {activeTab === 'dati' && (
              <>
                <CustomerInlineSection title="Anagrafica"         fields={anagraficaFields}   customerProfile={customer.customerProfile} customerName={customer.name} columns={2}       onSaved={loadCustomer} />
                <CustomerInlineSection title="Dati Fiscali"       fields={fiscaleFields}       customerProfile={customer.customerProfile} customerName={customer.name} columns={2} hasError={isFiscaleError} onSaved={loadCustomer} />
                <CustomerInlineSection title="Contatti"           fields={contattiFields}      customerProfile={customer.customerProfile} customerName={customer.name} columns={2}       onSaved={loadCustomer} />
                <CustomerInlineSection title="Indirizzo principale" fields={indirizzoFields}   customerProfile={customer.customerProfile} customerName={customer.name} columns={3} hasError={isIndirizzoError} onSaved={loadCustomer} />
                <CustomerInlineSection title="Commerciale"        fields={commercialeFields}   customerProfile={customer.customerProfile} customerName={customer.name} columns={2}       onSaved={loadCustomer} />
                <CustomerInlineSection title="Note ERP"           fields={noteFields}          customerProfile={customer.customerProfile} customerName={customer.name} columns={1}       onSaved={loadCustomer} />
              </>
            )}
            {activeTab === 'ordini' && (
              <div>
                {/* Stats strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'Ordini totali',      value: String(customer.actualOrderCount ?? 0) },
                    { label: 'Fatturato corrente', value: customer.actualSales ? `\u20ac ${customer.actualSales.toLocaleString('it-IT')}` : '\u2014' },
                    { label: 'Ultima attivit\u00e0',    value: customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('it-IT') : '\u2014' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '7px', padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Stato caricamento / errore */}
                {ordersLoading && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: '#64748b' }}>
                    Caricamento ordini...
                  </div>
                )}
                {ordersError && (
                  <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px', fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>
                    {ordersError}
                  </div>
                )}
                {!ordersLoading && !ordersError && orders.length === 0 && ordersLoaded && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: '13px', color: '#94a3b8' }}>
                    Nessun ordine trovato
                  </div>
                )}

                {/* Tabella ordini */}
                {orders.length > 0 && (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 60px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', padding: '8px 12px' }}>
                      {(['Data', 'N\u00b0 Ordine', 'Importo', 'Tipo'] as const).map((h) => (
                        <div key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</div>
                      ))}
                    </div>
                    {/* Righe */}
                    {orders.map((order) => (
                      <div
                        key={order.orderId}
                        style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 60px', padding: '9px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'default' }}
                      >
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(order.orderDate).toLocaleDateString('it-IT')}
                        </div>
                        <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.orderNumber || order.orderId.slice(0, 8)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#1e293b', fontWeight: 600 }}>
                          {order.totalAmount != null
                            ? `\u20ac ${order.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '\u2014'}
                        </div>
                        <div>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px',
                            background: order.source === 'fresis' ? '#eff6ff' : '#f0fdf4',
                            color: order.source === 'fresis' ? '#2563eb' : '#16a34a',
                          }}>
                            {order.source === 'fresis' ? 'FT' : 'KT'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'note' && (
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  Note private — visibili solo a te, non sincronizzate con Archibald ERP.
                </div>
                <textarea placeholder="Aggiungi note private su questo cliente..." rows={8}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #d1d5db', borderRadius: '7px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}
            {activeTab === 'indirizzi' && (
              <div style={{ fontSize: '13px', color: '#64748b', padding: '16px 0' }}>
                Gestione indirizzi alternativi disponibile tramite il form di modifica cliente.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
