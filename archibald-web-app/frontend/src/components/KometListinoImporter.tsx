import { useState, useRef } from 'react';
import { importKometListino } from '../api/komet-listino';
import { toastService } from '../services/toast.service';
import type { KometListinoResult } from '../api/komet-listino';

type StatBadgeProps = { label: string; value: number; color: string };

function StatBadge({ label, value, color }: StatBadgeProps) {
  return (
    <div style={{
      background: 'white', border: `2px solid ${color}`, borderRadius: '8px',
      padding: '0.5rem 1rem', textAlign: 'center', minWidth: '120px',
    }}>
      <div style={{ fontSize: '1.25rem', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
    </div>
  );
}

export function KometListinoImporter() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KometListinoResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await importKometListino(file);
      setResult(res);
      toastService.success(
        `Listino importato: ${res.ivaUpdated} IVA aggiornate, ${res.scontiUpdated} sconti Fresis aggiornati`,
      );
    } catch (err) {
      toastService.error(`Errore importazione: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ padding: '1.5rem', background: '#f9fafb', borderRadius: '8px', marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.25rem' }}>
        📊 Importa Listino Komet
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>
        Carica il file Excel aggiornato da Komet. Il sistema aggiorna automaticamente
        l'IVA dei prodotti e le percentuali di sconto Fresis.
      </p>

      {/* Box formato file */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px',
        padding: '1rem', marginBottom: '1.25rem', fontSize: '0.8125rem',
      }}>
        <div style={{ fontWeight: '600', color: '#1d4ed8', marginBottom: '0.5rem' }}>
          📋 Formato file atteso
        </div>
        <div style={{ color: '#374151', marginBottom: '0.5rem' }}>
          File:{' '}
          <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: '3px' }}>
            Listino 2026 vendita e acquisto.xlsx
          </code>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#dbeafe' }}>
              {['Colonna', 'Uso', 'Esempio'].map(h => (
                <th key={h} style={{ padding: '0.375rem 0.5rem', textAlign: 'left', fontWeight: '600' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['ID', 'Codice articolo (chiave match)', '001627K0'],
                ['Codice Articolo', 'Riferimento articolo', '1.204.005'],
                ['IVA', 'Aliquota IVA (%)', '22'],
                ['Prezzo di listino unit.', 'Prezzo di vendita', '1.957'],
                ['Prezzo KP unit.', 'Prezzo acquisto Fresis', '0.724'],
              ] as [string, string, string][]
            ).map(([col, uso, esempio]) => (
              <tr key={col} style={{ borderBottom: '1px solid #bfdbfe' }}>
                <td style={{ padding: '0.375rem 0.5rem', fontFamily: 'monospace', fontWeight: '500' }}>{col}</td>
                <td style={{ padding: '0.375rem 0.5rem', color: '#4b5563' }}>{uso}</td>
                <td style={{ padding: '0.375rem 0.5rem', color: '#6b7280' }}>{esempio}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div style={{ color: '#4b5563', lineHeight: '1.6' }}>
          <div>
            • Sconto Fresis calcolato automaticamente:{' '}
            <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: '3px' }}>
              round((1 − KP / listino) × 100)
            </code>
          </div>
          <div>• IVA valori supportati: <strong>4%</strong> e <strong>22%</strong></div>
          <div>• Articoli non trovati nel DB vengono loggati senza bloccare l'import</div>
          <div>• Formato file: <strong>.xlsx</strong> o <strong>.xls</strong></div>
        </div>
      </div>

      {/* Upload area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 1.25rem',
          background: loading ? '#9ca3af' : '#2563eb',
          color: 'white', borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem', fontWeight: '600',
        }}>
          {loading ? '⏳ Importazione in corso...' : '📂 Scegli file Excel'}
          <input autoComplete="off"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
            style={{ display: 'none' }}
          />
        </label>
        {loading && (
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Aggiornamento IVA e sconti in corso...
          </span>
        )}
      </div>

      {/* Risultato import */}
      {result !== null && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.75rem', color: '#111827' }}>
            ✅ Import completato — {result.totalRows} righe elaborate
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <StatBadge label="IVA aggiornate" value={result.ivaUpdated} color="#059669" />
            <StatBadge label="Sconti Fresis" value={result.scontiUpdated} color="#2563eb" />
            <StatBadge
              label="Non abbinati"
              value={result.unmatched}
              color={result.unmatched > 0 ? '#d97706' : '#9ca3af'}
            />
          </div>

          {result.errors.length > 0 && (
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px',
              padding: '0.75rem', fontSize: '0.8125rem', color: '#92400e', marginBottom: '0.75rem',
            }}>
              <strong>Avvisi ({result.errors.length}):</strong>
              <ul style={{ margin: '0.25rem 0 0 1rem', paddingLeft: 0 }}>
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 5 && (
                  <li>...e altri {result.errors.length - 5}</li>
                )}
              </ul>
            </div>
          )}

          {result.unmatchedProducts.length > 0 && (
            <>
              <button
                onClick={() => setShowUnmatched(v => !v)}
                style={{
                  fontSize: '0.8125rem', background: 'none', border: '1px solid #d1d5db',
                  borderRadius: '4px', padding: '0.25rem 0.75rem',
                  cursor: 'pointer', color: '#374151',
                }}
              >
                {showUnmatched ? '▲ Nascondi' : '▼ Mostra'} articoli non abbinati ({result.unmatchedProducts.length})
              </button>
              {showUnmatched && (
                <div style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>ID</th>
                        <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>Codice Articolo</th>
                        <th style={{ padding: '0.375rem 0.5rem', textAlign: 'left' }}>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.unmatchedProducts.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.375rem 0.5rem', fontFamily: 'monospace' }}>{p.excelId}</td>
                          <td style={{ padding: '0.375rem 0.5rem' }}>{p.excelCodiceArticolo}</td>
                          <td style={{ padding: '0.375rem 0.5rem', color: '#6b7280' }}>{p.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
