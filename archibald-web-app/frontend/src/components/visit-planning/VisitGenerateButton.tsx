import { useState } from 'react';
import { generateRoute } from '../../services/visit-planning.service';

type Props = {
  sessionId:   string;
  stopDate:    string;
  onGenerated: (count: number) => void;
  onError:     (msg: string) => void;
};

export function VisitGenerateButton({ sessionId, stopDate, onGenerated, onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const result = await generateRoute(sessionId, stopDate);
      onGenerated(result.generated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Errore generazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Nessuna tappa nel giro</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Il sistema analizzerà lo storico clienti e genererà un giro ottimizzato in base a valore commerciale, probabilità di riordino e zona.
      </div>
      <button
        onClick={handle}
        disabled={loading}
        style={{
          background: loading ? '#e5e7eb' : '#2563eb',
          color: loading ? '#9ca3af' : 'white',
          border: 'none', borderRadius: 10,
          padding: '12px 28px',
          fontWeight: 700, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        {loading ? '⏳ Generazione in corso...' : '🎯 Genera giro automaticamente'}
      </button>
    </div>
  );
}
