import type { CSSProperties } from 'react';
import type { TrackedOperation } from '../contexts/OperationTrackingContext';

type QueueDrawerProps = {
  isOpen: boolean;
  userOperations: TrackedOperation[];
  bgOperations: TrackedOperation[];
  onClose: () => void;
  onCancel: (jobId: string) => Promise<void>;
  onNavigate: (path: string) => void;
};

const BG_SYNC_LABELS: Record<string, string> = {
  'sync-customers': 'Sync clienti',
  'sync-orders': 'Sync ordini',
  'sync-ddt': 'Sync DDT',
  'sync-invoices': 'Sync fatture',
  'sync-products': 'Sync prodotti',
  'sync-prices': 'Sync prezzi',
  'sync-customer-addresses': 'Sync indirizzi',
  'sync-order-articles': 'Sync articoli ordine',
};

const USER_OP_LABELS: Record<string, string> = {
  'submit-order': 'Invio ordine',
  'send-to-verona': 'Invio a Verona',
  'edit-order': 'Modifica ordine',
  'delete-order': 'Eliminazione ordine',
  'batch-send-to-verona': 'Invio a Verona',
  'batch-delete-orders': 'Eliminazione ordini',
  'create-customer': 'Creazione cliente',
  'update-customer': 'Aggiornamento cliente',
  'read-vat-status': 'Verifica P.IVA',
  'refresh-customer': 'Aggiornamento scheda cliente',
  'download-ddt-pdf': 'Download DDT',
  'download-invoice-pdf': 'Download fattura',
};

const STATUS_ICON: Record<string, string> = {
  queued: '⏳',
  active: '⚙',
  completed: '✓',
  failed: '⚠',
  cancelled: '✕',
};

const DRAWER_BASE: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: '#fff',
  borderRadius: '16px 16px 0 0',
  boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
  zIndex: 1150,
  maxHeight: '65vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div style={{ width: '100%', height: '3px', background: '#e5e7eb', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${progress}%`, background: '#2563eb', borderRadius: '2px', transition: 'width 0.3s ease' }} />
    </div>
  );
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 20px 6px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

export function QueueDrawer({ isOpen, userOperations, bgOperations, onClose, onCancel, onNavigate }: QueueDrawerProps) {
  if (!isOpen) return null;

  const hasUserOps = userOperations.length > 0;
  const hasBgOps = bgOperations.length > 0;

  return (
    <div style={DRAWER_BASE} role="dialog" aria-label="Coda di lavoro">
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '2px' }}>
        <div style={{ width: '36px', height: '4px', background: '#d1d5db', borderRadius: '2px' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>Operazioni</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }} aria-label="Chiudi">▼</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {hasUserOps && (
          <>
            <SectionHeader color="#3182ce" label="Richieste da te" />
            {userOperations.map(op => (
              <div
                key={op.jobId}
                onClick={() => op.navigateTo && onNavigate(op.navigateTo)}
                style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 20px', borderBottom: '1px solid #f9fafb', cursor: op.navigateTo ? 'pointer' : 'default', gap: '10px' }}
              >
                <span style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>{STATUS_ICON[op.status] ?? '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {op.customerName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {USER_OP_LABELS[op.operationType ?? ''] ?? op.label}
                  </div>
                  {op.status === 'active' && <ProgressBar progress={op.progress} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {op.status === 'active' && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>{op.progress}%</span>
                  )}
                  {op.status === 'queued' && (
                    <button
                      aria-label="Annulla operazione"
                      onClick={(e) => { e.stopPropagation(); void onCancel(op.jobId); }}
                      style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Annulla
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {hasBgOps && (
          <>
            <SectionHeader color="#48bb78" label="Automatiche" />
            {bgOperations.map(op => (
              <div key={op.jobId} style={{ display: 'flex', alignItems: 'center', padding: '9px 20px', borderBottom: '1px solid #f9fafb', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#48bb78', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '12px', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {BG_SYNC_LABELS[op.operationType ?? ''] ?? op.label}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>
                  {op.status === 'active' ? `${op.progress}%` : op.status === 'completed' ? '✓' : 'in coda'}
                </span>
              </div>
            ))}
          </>
        )}

        {!hasUserOps && !hasBgOps && (
          <div style={{ padding: '24px', textAlign: 'center' as const, color: '#9ca3af', fontSize: '14px' }}>
            Nessuna operazione in corso
          </div>
        )}
      </div>
    </div>
  );
}
