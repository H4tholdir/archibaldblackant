import { useState, useEffect } from 'react';
import { pendingOrdersService } from '../services/pending-orders-service';
import type { PendingOrder } from '../db/schema';

interface GroupedOrders {
  today: PendingOrder[];
  thisWeek: PendingOrder[];
  older: PendingOrder[];
}

export function PendingOrdersView() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [counts, setCounts] = useState({ pending: 0, syncing: 0, error: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadOrders = async () => {
    try {
      const result = await pendingOrdersService.getPendingOrdersWithCounts();
      setOrders(result.orders);
      setCounts(result.counts);
    } catch (error) {
      console.error('[PendingOrdersView] Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Group orders by temporal periods
  const groupOrdersByTime = (orders: PendingOrder[]): GroupedOrders => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const grouped: GroupedOrders = {
      today: [],
      thisWeek: [],
      older: [],
    };

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      if (orderDate >= todayStart) {
        grouped.today.push(order);
      } else if (orderDate >= weekStart) {
        grouped.thisWeek.push(order);
      } else {
        grouped.older.push(order);
      }
    });

    return grouped;
  };

  const handleSync = async () => {
    const jwt = localStorage.getItem('archibald_jwt');
    if (!jwt) {
      setToast({ message: '⚠️ Token non trovato, rifare login', type: 'error' });
      return;
    }

    setSyncing(true);
    setSyncProgress({ current: 0, total: counts.pending });

    try {
      const result = await pendingOrdersService.syncPendingOrders(jwt, (current, total) => {
        setSyncProgress({ current, total });
      });

      if (result.success > 0) {
        setToast({
          message: `✅ ${result.success} ordini sincronizzati con successo`,
          type: 'success',
        });
      }

      if (result.failed > 0) {
        setToast({
          message: `⚠️ ${result.failed} ordini non sincronizzati, riprova più tardi`,
          type: 'error',
        });
      }

      // Reload orders after sync
      await loadOrders();
    } catch (error) {
      console.error('[PendingOrdersView] Sync failed:', error);
      setToast({ message: '⚠️ Errore durante la sincronizzazione', type: 'error' });
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0 });
    }
  };

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const getStatusBadgeStyle = (status: string) => {
    const baseStyle = {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
    };

    switch (status) {
      case 'pending':
        return { ...baseStyle, backgroundColor: '#2196f3', color: '#fff' };
      case 'syncing':
        return { ...baseStyle, backgroundColor: '#ff9800', color: '#fff' };
      case 'error':
        return { ...baseStyle, backgroundColor: '#f44336', color: '#fff' };
      default:
        return { ...baseStyle, backgroundColor: '#9e9e9e', color: '#fff' };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} min fa`;
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} ore fa`;
    }

    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateTotal = (order: PendingOrder) => {
    return order.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  };

  const renderOrderCard = (order: PendingOrder) => (
    <div
      key={order.id}
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
            {order.customerName}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {order.items.length} {order.items.length === 1 ? 'articolo' : 'articoli'} • €{calculateTotal(order).toFixed(2)}
          </div>
        </div>
        <span style={getStatusBadgeStyle(order.status)}>
          {order.status === 'pending' ? 'In attesa' : order.status === 'syncing' ? 'Sincronizzando' : 'Errore'}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: '#999' }}>
        {formatDate(order.createdAt)}
      </div>
      {order.errorMessage && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#f44336' }}>
          {order.errorMessage}
        </div>
      )}
    </div>
  );

  const renderGroup = (title: string, orders: PendingOrder[]) => {
    if (orders.length === 0) return null;

    return (
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#666', marginBottom: '12px' }}>
          {title}
        </h3>
        {orders.map(renderOrderCard)}
      </div>
    );
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <p style={{ color: '#666' }}>Caricamento coda...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '18px', color: '#666' }}>Nessun ordine in coda</p>
        </div>
      </div>
    );
  }

  const grouped = groupOrdersByTime(orders);
  const totalPending = counts.pending;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        padding: '24px',
      }}
    >
      {/* Summary Stats */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
          📋 Coda Ordini
        </h2>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div>
            <span style={getStatusBadgeStyle('pending')}>{counts.pending} In attesa</span>
          </div>
          {counts.syncing > 0 && (
            <div>
              <span style={getStatusBadgeStyle('syncing')}>{counts.syncing} Sincronizzando</span>
            </div>
          )}
          {counts.error > 0 && (
            <div>
              <span style={getStatusBadgeStyle('error')}>{counts.error} Errore</span>
            </div>
          )}
        </div>

        {/* Sync Button */}
        {totalPending > 0 && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            style={{
              backgroundColor: syncing ? '#ccc' : '#2196f3',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {syncing
              ? `Sincronizzazione in corso... (${syncProgress.current}/${syncProgress.total})`
              : 'Sincronizza Ora'}
          </button>
        )}
      </div>

      {/* Order List */}
      {renderGroup('Oggi', grouped.today)}
      {renderGroup('Questa settimana', grouped.thisWeek)}
      {renderGroup('Più vecchi', grouped.older)}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: toast.type === 'success' ? '#4caf50' : '#f44336',
            color: '#fff',
            padding: '16px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
            zIndex: 1000,
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
