import { useState, useCallback } from 'react';
import { performKtSync } from '../services/kt-sync-browser';
import type { KtSyncProgress } from '../services/kt-sync-browser';
import type { Order } from '../types/order';

type KtSyncDialogProps = {
  orders: Order[];
  onClose: () => void;
  onComplete: () => void;
};

function KtSyncDialog({ orders, onClose, onComplete }: KtSyncDialogProps) {
  const [progress, setProgress] = useState<KtSyncProgress | null>(null);
  const [result, setResult] = useState<{ synced: number; errors: string[] } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleSync = useCallback(async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const orderIds = orders.map((o) => o.id);
      const syncResult = await performKtSync(orderIds, {}, (p) => setProgress(p));
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isRunning) onClose(); }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '420px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>
          Sync KT con Arca
        </h3>

        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#555' }}>
          {orders.length} ordini selezionati:
        </div>

        <div style={{ maxHeight: '200px', overflow: 'auto', marginBottom: '16px' }}>
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #eee',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 500 }}>{order.orderNumber || order.id}</div>
              <div style={{ color: '#777' }}>{order.customerName}</div>
            </div>
          ))}
        </div>

        {progress && !result && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f0f7ff',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#2563EB',
            }}
          >
            {progress.message || 'In corso...'}
          </div>
        )}

        {result && (
          <div style={{ marginBottom: '16px' }}>
            {result.synced > 0 && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  fontSize: '13px',
                  color: '#16a34a',
                }}
              >
                {result.synced} documenti KT generati con successo
              </div>
            )}
            {result.errors.length > 0 && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#dc2626',
                }}
              >
                {result.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          {!result ? (
            <>
              <button
                onClick={onClose}
                disabled={isRunning}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  backgroundColor: '#fff',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleSync}
                disabled={isRunning}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#fff',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: isRunning ? 0.6 : 1,
                }}
              >
                {isRunning ? 'Sync in corso...' : 'Avvia Sync KT'}
              </button>
            </>
          ) : (
            <button
              onClick={() => { onComplete(); onClose(); }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563EB',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default KtSyncDialog;
