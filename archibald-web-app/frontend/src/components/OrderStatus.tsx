import { useState, useEffect } from 'react';
import { fetchWithRetry } from '../utils/fetch-with-retry';

interface OrderStatusProps {
  jobId: string;
  onNewOrder: () => void;
}

interface JobStatus {
  state: string;
  progress?: number;
  result?: {
    success: boolean;
    data?: {
      orderId: string;
    };
    duration: number;
  };
  failedReason?: string;
}

export default function OrderStatus({ jobId, onNewOrder }: OrderStatusProps) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetchWithRetry(`/api/operations/${jobId}/status`);
        const data = await response.json();

        if (data.success) {
          setStatus(data.job);

          if (data.job.state === 'completed' || data.job.state === 'failed') {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Errore durante il fetch dello stato:', error);
      }
    };

    fetchStatus();

    const interval = setInterval(() => {
      if (loading) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, loading]);

  const getStatusClass = () => {
    if (!status) return 'status-waiting';

    switch (status.state) {
      case 'waiting':
      case 'delayed':
        return 'status-waiting';
      case 'active':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return 'status-waiting';
    }
  };

  const getStatusText = () => {
    if (!status) return 'Caricamento...';

    switch (status.state) {
      case 'waiting':
      case 'delayed':
        return 'In attesa...';
      case 'active':
        return 'In elaborazione...';
      case 'completed':
        return 'Ordine creato!';
      case 'failed':
        return 'Errore';
      case 'not_found':
        return 'Job non trovato';
      default:
        return status.state;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const resultOrderId = status?.result?.data?.orderId;
  const resultDuration = status?.result?.duration;

  return (
    <div>
      <div className="card">
        <h2 className="card-title">Stato Ordine</h2>

        <div className={`status ${getStatusClass()}`}>
          {getStatusText()}
        </div>

        <div className="form-group">
          <label className="form-label">Job ID</label>
          <input autoComplete="off"
            type="text"
            className="form-input"
            value={jobId}
            readOnly
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
          />
        </div>

        {status?.progress !== undefined && (
          <div className="form-group">
            <label className="form-label">Progresso</label>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${typeof status.progress === 'number' ? status.progress : 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ textAlign: 'right', marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              {typeof status.progress === 'number' ? `${status.progress}%` : 'N/A'}
            </div>
          </div>
        )}

        {resultOrderId && (
          <div>
            <div className="form-group">
              <label className="form-label">ID Ordine Archibald</label>
              <input autoComplete="off"
                type="text"
                className="form-input"
                value={resultOrderId}
                readOnly
                style={{
                  fontWeight: 'bold',
                  fontSize: '1.25rem',
                  textAlign: 'center',
                  color: '#059669',
                }}
              />
            </div>

            {resultDuration !== undefined && (
              <div className="form-group">
                <label className="form-label">Tempo Elaborazione</label>
                <input autoComplete="off"
                  type="text"
                  className="form-input"
                  value={formatDuration(resultDuration)}
                  readOnly
                  style={{ textAlign: 'center' }}
                />
              </div>
            )}
          </div>
        )}

        {status?.failedReason && (
          <div className="form-group">
            <label className="form-label">Errore</label>
            <textarea autoComplete="off"
              className="form-textarea"
              value={status.failedReason}
              readOnly
              style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <div className="spinner" style={{
              width: '40px',
              height: '40px',
              borderColor: '#e5e7eb',
              borderTopColor: '#667eea',
              margin: '0 auto 1rem',
            }} />
            <p>Elaborazione in corso...</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Questo potrebbe richiedere 2-3 minuti
            </p>
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary" onClick={onNewOrder}>
        Nuovo Ordine
      </button>
    </div>
  );
}
