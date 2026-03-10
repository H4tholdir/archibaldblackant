import { useState, useCallback } from 'react';
import type { SyncProgress } from '../services/arca-sync-browser';
import { performBrowserArcaSync, isFileSystemAccessSupported } from '../services/arca-sync-browser';

interface ArcaSyncButtonProps {
  onSyncComplete?: () => void;
  onGoToSubclients?: () => void;
}

const STAGE_MESSAGES: Record<string, string> = {
  'requesting-access': 'Accesso cartella...',
  'reading-files': 'Lettura DBF...',
  'uploading': 'Upload file...',
  'syncing': 'Sincronizzazione...',
  'writing-vbs': 'Scrittura script...',
  'done': 'Completato!',
};

export function ArcaSyncButton({ onSyncComplete, onGoToSubclients }: ArcaSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    exported: number;
    ktExported: number;
    ktNeedingMatch: Array<{ orderId: string; customerName: string }>;
    ktMissingArticles: number;
    errors: string[];
    hasVbs: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const syncResult = await performBrowserArcaSync(setProgress);
      setResult({
        imported: syncResult.sync.imported,
        skipped: syncResult.sync.skipped,
        exported: syncResult.sync.exported,
        ktExported: syncResult.sync.ktExported ?? 0,
        ktNeedingMatch: syncResult.sync.ktNeedingMatch ?? [],
        ktMissingArticles: syncResult.sync.ktMissingArticles?.length ?? 0,
        errors: syncResult.sync.errors,
        hasVbs: syncResult.vbsScript !== null,
      });
      onSyncComplete?.();
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Selezione cartella annullata');
      } else {
        setError(e.message || 'Errore durante la sincronizzazione');
      }
    } finally {
      setSyncing(false);
    }
  }, [onSyncComplete]);

  if (!isFileSystemAccessSupported()) {
    return null;
  }

  const stageMsg = progress ? STAGE_MESSAGES[progress.stage] || 'Sincronizzazione...' : 'Sincronizzazione...';

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          border: 'none',
          borderRadius: 6,
          cursor: syncing ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 13,
          background: syncing ? '#94a3b8' : '#7c3aed',
          color: '#fff',
          opacity: syncing ? 0.7 : 1,
        }}
        title="Sincronizza documenti FT/KT tra PWA e ArcaPro"
      >
        {syncing && (
          <span style={{
            display: 'inline-block', width: 14, height: 14,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {syncing ? stageMsg : 'Sync Arca'}
      </button>

      {(result || error) && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.5,
          background: error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
          color: error ? '#991b1b' : '#166534',
          maxWidth: 320,
        }}>
          {error && <div>{error}</div>}
          {result && (
            <>
              <div>Importati: <strong>{result.imported}</strong> documenti da Arca</div>
              {result.skipped > 0 && <div>Esistenti: {result.skipped} (saltati)</div>}
              {(result.exported > 0 || result.ktExported > 0) && (
                <div>
                  Esportati:{' '}
                  {result.exported > 0 && <strong>{result.exported} FT</strong>}
                  {result.exported > 0 && result.ktExported > 0 && ' + '}
                  {result.ktExported > 0 && <strong>{result.ktExported} KT</strong>}
                  {' '}verso Arca
                  {result.hasVbs && (
                    <div style={{ marginTop: 4, fontWeight: 600, color: '#7c3aed' }}>
                      Il watcher eseguira sync_arca.vbs automaticamente
                    </div>
                  )}
                </div>
              )}
              {result.ktMissingArticles > 0 && (
                <div style={{ marginTop: 4, color: '#6d28d9' }}>
                  {result.ktMissingArticles} ordini KT in attesa sync articoli (avviata automaticamente)
                </div>
              )}
              {result.ktNeedingMatch.length > 0 && (
                <div style={{ marginTop: 4, color: '#b45309' }}>
                  {result.ktNeedingMatch.length} ordini KT richiedono match sottocliente:
                  <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {result.ktNeedingMatch.slice(0, 10).map((o) => (
                      <li key={o.orderId}>{o.customerName}</li>
                    ))}
                  </ul>
                  {onGoToSubclients && (
                    <button
                      onClick={onGoToSubclients}
                      style={{
                        marginTop: 4, padding: '4px 10px', borderRadius: 6,
                        border: '1px solid #d97706', backgroundColor: '#fffbeb',
                        color: '#92400e', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}
                    >
                      Vai a Sottoclienti per collegare
                    </button>
                  )}
                </div>
              )}
              {result.exported === 0 && result.imported === 0 && result.skipped > 0 && (
                <div style={{ color: '#666' }}>Nessun nuovo documento da sincronizzare</div>
              )}
              {result.errors.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer' }}>{result.errors.length} avvisi</summary>
                  <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
