import { useState, useEffect } from 'react';
import { fetchWithRetry } from '../utils/fetch-with-retry';

interface OrdersListProps {
  token: string;
  onViewOrder: (jobId: string) => void;
  onNewOrder: () => void;
}

interface UserOrder {
  jobId: string;
  status: string;
  orderData: {
    customerId: string;
    customerName: string;
    items: Array<{
      articleCode: string;
      quantity: number;
    }>;
  };
  createdAt: number;
  result?: {
    orderId: string;
    duration: number;
  };
  error?: string;
}

export default function OrdersList({ token, onViewOrder, onNewOrder }: OrdersListProps) {
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOrders = async () => {
    try {
      const response = await fetchWithRetry('/api/orders/my-orders', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setOrders(data.data);
        setError(null);
      } else {
        setError(data.error || 'Errore nel caricamento ordini');
      }
    } catch (err) {
      console.error('Errore durante il fetch degli ordini:', err);
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Polling ogni 5 secondi per aggiornare gli stati
    const interval = setInterval(fetchOrders, 5000);

    return () => clearInterval(interval);
  }, [token]);

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'waiting':
        return '⏳';
      case 'active':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'In attesa';
      case 'active':
        return 'In elaborazione';
      case 'completed':
        return 'Completato';
      case 'failed':
        return 'Fallito';
      default:
        return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'status-waiting';
      case 'active':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return '';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h fa`;
    } else if (minutes > 0) {
      return `${minutes}m fa`;
    } else {
      return `${seconds}s fa`;
    }
  };

  // Filtra ordini in base alla query di ricerca
  const filteredOrders = orders.filter((order) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const customerName = order.orderData.customerName.toLowerCase();
    const jobId = order.jobId.toLowerCase();
    const orderId = order.result?.orderId?.toLowerCase() || '';
    const status = getStatusText(order.status).toLowerCase();

    return (
      customerName.includes(query) ||
      jobId.includes(query) ||
      orderId.includes(query) ||
      status.includes(query)
    );
  });

  if (loading) {
    return (
      <div className="card">
        <h2 className="card-title">📊 I Miei Ordini</h2>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="spinner" style={{
            width: '40px',
            height: '40px',
            margin: '0 auto',
          }} />
          <p style={{ marginTop: '1rem', color: '#6b7280' }}>Caricamento...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2 className="card-title">📊 I Miei Ordini</h2>
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#dc2626',
        }}>
          <p>❌ {error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchOrders}
            style={{ marginTop: '1rem' }}
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2 className="card-title">📊 I Miei Ordini</h2>

        {orders.length > 0 && (
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">🔍 Cerca</label>
            <input
              type="text"
              className="form-input"
              placeholder="Cerca per cliente, job ID, ordine ID o stato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: '0.875rem' }}
            />
            {searchQuery && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                {filteredOrders.length} {filteredOrders.length === 1 ? 'risultato' : 'risultati'}
              </div>
            )}
          </div>
        )}

        {orders.length === 0 ? (
          <div style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#6b7280',
          }}>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</p>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              Nessun ordine ancora
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              Crea il tuo primo ordine per iniziare
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{
            padding: '2rem 1rem',
            textAlign: 'center',
            color: '#6b7280',
          }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</p>
            <p style={{ fontSize: '1rem' }}>
              Nessun ordine trovato per "{searchQuery}"
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredOrders.map((order) => (
              <div
                key={order.jobId}
                className="order-card"
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => onViewOrder(order.jobId)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '0.75rem',
                }}>
                  <div>
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      marginBottom: '0.25rem',
                    }}>
                      Job #{order.jobId}
                    </div>
                    <div style={{
                      fontSize: '1.125rem',
                      fontWeight: '600',
                      marginBottom: '0.5rem',
                    }}>
                      {order.orderData.customerName}
                    </div>
                  </div>
                  <div className={`status ${getStatusClass(order.status)}`} style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {getStatusEmoji(order.status)} {getStatusText(order.status)}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginBottom: '0.5rem',
                }}>
                  <div>
                    📦 {order.orderData.items.length} {order.orderData.items.length === 1 ? 'articolo' : 'articoli'}
                  </div>
                  <div>
                    🕐 {formatTime(order.createdAt)}
                  </div>
                </div>

                {order.result && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#f0fdf4',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                  }}>
                    <strong style={{ color: '#059669' }}>
                      Ordine Archibald: {order.result.orderId}
                    </strong>
                  </div>
                )}

                {order.error && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#fef2f2',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    color: '#dc2626',
                  }}>
                    {order.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary" onClick={onNewOrder}>
        ➕ Nuovo Ordine
      </button>
    </div>
  );
}
