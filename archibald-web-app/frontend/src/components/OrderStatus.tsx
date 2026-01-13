import { useState, useEffect, useRef } from 'react';

interface OrderStatusProps {
  jobId: string;
  onNewOrder: () => void;
}

interface JobStatus {
  status: string;
  progress?: number | {
    percent: number;
    step: string;
    message: string;
    estimatedRemainingSeconds: number;
  };
  result?: {
    orderId: string;
    duration: number;
    timestamp: number;
  };
  error?: string;
}

export default function OrderStatus({ jobId, onNewOrder }: OrderStatusProps) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Fetch initial status via HTTP
    const fetchInitialStatus = async () => {
      try {
        const response = await fetch(`/api/orders/status/${jobId}`);
        const data = await response.json();

        if (data.success) {
          setStatus(data.data);

          // Update progress info if available
          if (data.data.progress && typeof data.data.progress === 'object') {
            setProgressPercent(data.data.progress.percent || 0);
            setProgressMessage(data.data.progress.message || '');
            setEstimatedTime(data.data.progress.estimatedRemainingSeconds || null);
          } else if (typeof data.data.progress === 'number') {
            setProgressPercent(data.data.progress);
          }

          // If completed or failed, stop loading
          if (data.data.status === 'completed' || data.data.status === 'failed') {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Error fetching initial status:', error);
      }
    };

    fetchInitialStatus();

    // Connect to WebSocket for real-time progress updates
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/sync?jobId=${jobId}`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected for job:', jobId);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', message);

        if (message.type === 'order_progress') {
          // Update status from WebSocket message
          const progressData = message.data;

          // Handle progress updates
          if (progressData.progress && typeof progressData.progress === 'object') {
            setProgressPercent(progressData.progress.percent || 0);
            setProgressMessage(progressData.progress.message || '');
            setEstimatedTime(progressData.progress.estimatedRemainingSeconds || null);
          } else if (typeof progressData.progress === 'number') {
            setProgressPercent(progressData.progress);
          }

          // Update full status
          setStatus(progressData);

          // If completed or failed, stop loading and close WebSocket
          if (progressData.status === 'completed' || progressData.status === 'failed') {
            setLoading(false);
            ws.close();
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected for job:', jobId);
    };

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [jobId]);

  const getStatusClass = () => {
    if (!status) return 'status-waiting';

    switch (status.status) {
      case 'waiting':
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

    switch (status.status) {
      case 'waiting':
        return '⏳ In attesa...';
      case 'active':
        return '🔄 In elaborazione...';
      case 'completed':
        return '✅ Ordine creato!';
      case 'failed':
        return '❌ Errore';
      case 'not_found':
        return '❓ Job non trovato';
      default:
        return status.status;
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

  return (
    <div>
      <div className="card">
        <h2 className="card-title">📊 Stato Ordine</h2>

        <div className={`status ${getStatusClass()}`}>
          {getStatusText()}
        </div>

        <div className="form-group">
          <label className="form-label">Job ID</label>
          <input
            type="text"
            className="form-input"
            value={jobId}
            readOnly
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
          />
        </div>

        {(status?.progress !== undefined || progressPercent > 0) && (
          <div className="form-group">
            <label className="form-label">Progresso</label>

            {progressMessage && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '0.5rem',
                background: '#f3f4f6',
                borderRadius: '4px',
                fontSize: '0.875rem',
                color: '#374151'
              }}>
                {progressMessage}
              </div>
            )}

            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              <div>
                {progressPercent > 0 ? `${progressPercent}%` : 'N/A'}
              </div>
              {estimatedTime !== null && estimatedTime > 0 && (
                <div>
                  ⏱️ ~{estimatedTime}s rimanenti
                </div>
              )}
            </div>
          </div>
        )}

        {status?.result && (
          <div>
            <div className="form-group">
              <label className="form-label">✅ ID Ordine Archibald</label>
              <input
                type="text"
                className="form-input"
                value={status.result.orderId}
                readOnly
                style={{
                  fontWeight: 'bold',
                  fontSize: '1.25rem',
                  textAlign: 'center',
                  color: '#059669',
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">⏱️ Tempo Elaborazione</label>
              <input
                type="text"
                className="form-input"
                value={formatDuration(status.result.duration)}
                readOnly
                style={{ textAlign: 'center' }}
              />
            </div>
          </div>
        )}

        {status?.error && (
          <div className="form-group">
            <label className="form-label">❌ Errore</label>
            <textarea
              className="form-textarea"
              value={status.error}
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
        ➕ Nuovo Ordine
      </button>
    </div>
  );
}
