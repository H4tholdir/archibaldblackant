import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import type { Customer } from '../types/customer';
import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { getCustomerFullHistory } from '../api/customer-full-history';
import { getCustomerAddresses } from '../services/customer-addresses';
import { customerService } from '../services/customers.service';
import { CustomerListSidebar } from '../components/CustomerListSidebar';
import { PhotoCropModal } from '../components/PhotoCropModal';

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

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdits>({});
  const [saving, setSaving] = useState(false);

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

  const hasPendingEdits = Object.keys(pendingEdits).length > 0;

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

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <h1 style={{ margin: 0 }}>{customer.name}</h1>

        {editMode && hasPendingEdits && (
          <button
            disabled={saving}
            onClick={() => {
              setSaving(true);
            }}
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
            {saving ? 'Salvataggio…' : 'Salva'}
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

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setPhotoCropSrc(reader.result as string);
          reader.readAsDataURL(file);
        }}
      />

      {/* Suppress unused variable warnings for state setters used by child components in later tasks */}
      {false && JSON.stringify({ photoUrl, orders, addresses, editMode, pendingEdits, saving, setEditMode, setPendingEdits, setSaving, setPhotoCropSrc, photoInputRef })}
    </div>
  );
}
