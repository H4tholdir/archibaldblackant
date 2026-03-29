import { useRef, useState } from 'react';
import type { Customer } from '../types/customer';
import { customerService } from '../services/customers.service';

type CustomerSidebarProps = {
  customer: Customer;
  onNewOrder: () => void;
  photoUrl?: string | null;
  onPhotoChange?: () => void;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) return '—';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  return `${days}gg`;
}

export function CustomerSidebar({ customer, onNewOrder, photoUrl, onPhotoChange }: CustomerSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  if (window.innerWidth < 641) return null;

  const handlePhotoClick = () => {
    if (!photoUploading) fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPhotoUploading(true);
    try {
      await customerService.uploadPhoto(customer.erpId, file);
      onPhotoChange?.();
    } catch {
      // silenzioso
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    if (!window.confirm('Rimuovere la foto del cliente?')) return;
    setPhotoUploading(true);
    try {
      await customerService.deletePhoto(customer.erpId);
      onPhotoChange?.();
    } catch {
      // silenzioso
    } finally {
      setPhotoUploading(false);
    }
  };

  const sidebarWidth = window.innerWidth >= 1024 ? '32%' : '36%';
  const phone = customer.mobile || customer.phone;

  const handleCall = () => {
    if (phone) window.location.href = `tel:${phone}`;
  };
  const handleWhatsApp = () => {
    if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  };
  const handleEmail = () => {
    if (customer.email) window.location.href = `mailto:${customer.email}`;
  };
  const handleMaps = () => {
    if (customer.street && customer.city) {
      window.open(
        `https://maps.google.com/?q=${encodeURIComponent(`${customer.street}, ${customer.city}`)}`,
        '_blank',
      );
    }
  };

  const actionBtn = (
    testid: string,
    bg: string,
    color: string,
    icon: string,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={testid}
      data-testid={testid}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 8px', background: bg, border: 'none',
        borderRadius: '6px', cursor: 'pointer', fontSize: '10px',
        color, width: '100%', textAlign: 'left', overflow: 'hidden',
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );

  return (
    <div
      data-testid="customer-sidebar"
      style={{
        width: sidebarWidth, background: '#1e293b',
        padding: '16px', display: 'flex', flexDirection: 'column',
        gap: '10px', flexShrink: 0,
      }}
    >
      {/* Photo / initials */}
      <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '1px solid #334155' }}>
        {/* Input file nascosto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => void handleFileSelected(e)}
          style={{ display: 'none' }}
        />

        {/* Avatar cliccabile */}
        <div
          style={{ position: 'relative', width: '52px', height: '52px', margin: '0 auto 8px', cursor: 'pointer' }}
          onClick={handlePhotoClick}
          title={photoUrl ? 'Clicca per cambiare foto' : 'Clicca per aggiungere foto'}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={customer.name}
              style={{ width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #4a90d9', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '52px', height: '52px', borderRadius: '10px',
              background: '#2d4a6b', border: '2px solid #4a90d9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: '#93c5fd', fontSize: '18px',
            }}>
              {getInitials(customer.name)}
            </div>
          )}
          {/* Overlay 📷 */}
          <div style={{
            position: 'absolute', bottom: '2px', right: '2px',
            background: 'rgba(15,23,42,0.75)', borderRadius: '50%',
            width: '18px', height: '18px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '10px',
          }}>
            {photoUploading ? '⏳' : '📷'}
          </div>
        </div>

        {/* Bottone elimina foto */}
        {photoUrl && !photoUploading && (
          <button
            onClick={(e) => { e.stopPropagation(); void handlePhotoDelete(); }}
            style={{ fontSize: '9px', color: '#fca5a5', background: 'none', border: 'none', cursor: 'pointer', display: 'block', margin: '0 auto 4px' }}
          >
            × Rimuovi foto
          </button>
        )}
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>{customer.name}</div>
        <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>{customer.erpId}</div>
        {customer.sector && (
          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{customer.sector}</div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {phone && actionBtn('sidebar-call',     '#253346', '#93c5fd', '📞', phone,          handleCall)}
        {phone && actionBtn('sidebar-whatsapp', '#1a3a27', '#86efac', '💬', 'WhatsApp',     handleWhatsApp)}
        {customer.email && actionBtn('sidebar-email', '#1e3058', '#93c5fd', '✉', customer.email, handleEmail)}
        {customer.street && customer.city && actionBtn(
          'sidebar-maps', '#3a1a1a', '#fca5a5', '📍',
          `${customer.street}, ${customer.city}`,
          handleMaps,
        )}
      </div>

      {/* Stats */}
      <div style={{ height: '1px', background: '#334155' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <div style={{ background: '#253346', borderRadius: '6px', padding: '7px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
            {customer.actualOrderCount ?? 0}
          </div>
          <div style={{ fontSize: '7px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Ordini
          </div>
        </div>
        <div style={{ background: '#253346', borderRadius: '6px', padding: '7px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: customer.lastOrderDate ? '#fbbf24' : '#64748b' }}>
            {daysSince(customer.lastOrderDate)}
          </div>
          <div style={{ fontSize: '7px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Attività
          </div>
        </div>
      </div>

      {/* New order button */}
      <div style={{ marginTop: 'auto' }}>
        <button
          data-testid="sidebar-new-order"
          onClick={onNewOrder}
          style={{
            width: '100%', padding: '8px', background: '#7c3aed',
            color: 'white', border: 'none', borderRadius: '6px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Nuovo Ordine
        </button>
      </div>
    </div>
  );
}
