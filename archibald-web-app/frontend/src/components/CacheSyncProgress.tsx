import { useState, useEffect } from 'react';
import { cachePopulationService, type CachePopulationProgress } from '../services/cache-population';

export function CacheSyncProgress() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<CachePopulationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);

  useEffect(() => {
    // Get JWT from localStorage
    const token = localStorage.getItem('archibald_jwt');
    setJwt(token);

    // Check if cache needs refresh
    if (token) {
      checkCacheStatus(token);
    }
  }, []);

  async function checkCacheStatus(token: string) {
    const needsRefresh = await cachePopulationService.needsRefresh();

    if (needsRefresh) {
      // Auto-start sync on first run or stale cache
      await startSync(token);
    }
  }

  async function startSync(token: string) {
    setSyncing(true);
    setError(null);

    const result = await cachePopulationService.populateCache(
      token,
      (prog) => setProgress(prog)
    );

    setSyncing(false);

    if (!result.success) {
      setError(result.error || 'Errore durante sincronizzazione');
    } else {
      console.log('[CacheSync] Complete:', result.recordCounts, `${result.durationMs}ms`);
    }
  }

  async function handleManualSync() {
    if (!jwt) {
      setError('Nessun token di autenticazione trovato');
      return;
    }

    await startSync(jwt);
  }

  if (!syncing && !progress) {
    return null; // No sync in progress, no UI
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#f5f5f5',
      borderTop: '1px solid #ddd',
      padding: '8px 16px',
      zIndex: 1000
    }}>
      {error ? (
        <div style={{ color: '#d32f2f', fontSize: '14px' }}>
          ⚠️ {error}
          <button
            onClick={handleManualSync}
            style={{ marginLeft: '12px', padding: '4px 8px', fontSize: '12px' }}
          >
            Riprova
          </button>
        </div>
      ) : syncing && progress ? (
        <div>
          <div style={{
            fontSize: '12px',
            color: '#666',
            marginBottom: '4px'
          }}>
            {progress.message}
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            backgroundColor: '#e0e0e0',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress.percentage}%`,
              height: '100%',
              backgroundColor: '#4caf50',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
