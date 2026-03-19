import { useState, useCallback, useRef, useEffect } from 'react';
import type { SyncProgress, KtSyncStatus, ArcaSyncResponse } from '../services/arca-sync-browser';
import {
  performBrowserArcaSync,
  isFileSystemAccessSupported,
  fetchKtStatus,
  finalizeKtExport,
  getOrRequestDirectoryHandle,
  writeVbsToDirectory,
} from '../services/arca-sync-browser';
import { setSubclientMatch, getSubclients } from '../services/subclients.service';
import type { Subclient } from '../services/subclients.service';

type DeletionWarning = ArcaSyncResponse['sync']['deletionWarnings'] extends Array<infer T> | undefined ? T : never;

interface ArcaSyncButtonProps {
  onSyncComplete?: (deletionWarnings?: DeletionWarning[]) => void;
}

type SyncPhase =
  | 'idle'
  | 'phase1'          // import + FT + ANAGRAFE
  | 'matching'        // user matching unmatched subclients
  | 'waiting-articles' // polling for article sync
  | 'finalizing-kt'   // generating KT VBS
  | 'done';

const STAGE_MESSAGES: Record<string, string> = {
  'requesting-access': 'Accesso cartella...',
  'reading-files': 'Lettura DBF...',
  'uploading': 'Upload file...',
  'syncing': 'Sincronizzazione...',
  'done': 'Completato!',
};

// ─── Inline Customer Picker (for matching during sync) ───────────────

function InlineMatcher({
  items,
  onMatchComplete,
  onSkip,
}: {
  items: Array<{ orderId: string; customerName: string; customerProfileId: string | null }>;
  onMatchComplete: () => void;
  onSkip: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<Subclient[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);

  const current = items[currentIdx];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    getSubclients(debouncedQuery).then((r) => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  useEffect(() => {
    if (current) {
      setQuery(current.customerName);
      setResults([]);
    }
  }, [current]);

  if (!current) { onMatchComplete(); return null; }

  const handleSelect = async (subclient: Subclient) => {
    if (!current.customerProfileId) { moveNext(); return; }
    setMatching(true);
    try {
      await setSubclientMatch(subclient.codice, current.customerProfileId);
    } catch {
      // continue anyway
    }
    setMatching(false);
    moveNext();
  };

  const moveNext = () => {
    if (currentIdx + 1 >= items.length) {
      onMatchComplete();
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: '16px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '20px',
        maxWidth: '500px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            Collega sottocliente ({currentIdx + 1}/{items.length})
          </h3>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <div style={{ fontSize: '13px', color: '#b45309', marginBottom: '4px', fontWeight: 600 }}>
          Cliente Archibald: {current.customerName}
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
          Cerca il sottocliente Arca corrispondente:
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Cerca per nome, codice, P.IVA, indirizzo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', marginBottom: '8px',
          }}
        />
        <div style={{ flex: 1, overflow: 'auto', minHeight: '150px' }}>
          {loading && <div style={{ textAlign: 'center', padding: '16px', color: '#999', fontSize: '13px' }}>Ricerca...</div>}
          {!loading && debouncedQuery.length >= 2 && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px', color: '#999', fontSize: '13px' }}>Nessun risultato</div>
          )}
          {results.map((sc) => (
            <div
              key={sc.codice}
              onClick={() => !matching && handleSelect(sc)}
              style={{
                padding: '8px 10px', borderRadius: '8px', cursor: matching ? 'not-allowed' : 'pointer',
                marginBottom: '4px', border: '1px solid #eee', opacity: matching ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!matching) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f0f7ff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#fff'; }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#333' }}>{sc.ragioneSociale}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {sc.codice}
                {sc.partitaIva && ` · P.IVA: ${sc.partitaIva}`}
              </div>
              {(sc.indirizzo || sc.localita) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {sc.indirizzo}{sc.localita && `, ${sc.localita}`}{sc.prov && ` (${sc.prov})`}
                </div>
              )}
              {(sc.telefono || sc.email) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {sc.telefono}{sc.email && ` · ${sc.email}`}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={moveNext}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd',
              backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', color: '#666',
            }}
          >
            Salta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ArcaSyncButton ─────────────────────────────────────────────

export function ArcaSyncButton({ onSyncComplete }: ArcaSyncButtonProps) {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [phase1Result, setPhase1Result] = useState<{
    imported: number; skipped: number; exported: number;
    errors: string[];
  } | null>(null);
  const [ktStatus, setKtStatus] = useState<KtSyncStatus | null>(null);
  const [ktFinalExported, setKtFinalExported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showMatcher, setShowMatcher] = useState(false);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const ftExportRecordsRef = useRef<Array<{ invoiceNumber: string; arcaData: unknown }>>([]);
  const deletionWarningsRef = useRef<DeletionWarning[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSync = useCallback(async () => {
    setPhase('phase1');
    setError(null);
    setPhase1Result(null);
    setKtStatus(null);
    setKtFinalExported(0);

    try {
      // Get directory handle early (reuse for later VBS writes)
      dirHandleRef.current = await getOrRequestDirectoryHandle();

      const syncResult = await performBrowserArcaSync(setProgress);

      // Salva ftExportRecords per usarli nel finalize
      ftExportRecordsRef.current = syncResult.ftExportRecords ?? [];
      deletionWarningsRef.current = syncResult.sync.deletionWarnings ?? [];

      setPhase1Result({
        imported: syncResult.sync.imported,
        skipped: syncResult.sync.skipped,
        exported: syncResult.sync.exported,
        errors: syncResult.sync.errors,
      });

      // Fetch KT status per decidere il prossimo step
      const status = await fetchKtStatus();
      setKtStatus(status);

      if (status.unmatched.length > 0) {
        // Ci sono KT senza sottocliente → mostra matcher
        setPhase('matching');
        setShowMatcher(true);
      } else if (status.articlesPending > 0) {
        // Ci sono KT con articoli non pronti → polling
        startArticlePolling();
      } else {
        // Tutto pronto → genera VBS subito
        await finalizeKt();
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Selezione cartella annullata');
      } else {
        setError(e.message || 'Errore durante la sincronizzazione');
      }
      setPhase('idle');
    }
  }, [onSyncComplete]);

  const handleMatchingDone = useCallback(() => {
    setShowMatcher(false);
    startArticlePolling();
  }, []);

  const startArticlePolling = useCallback(() => {
    setPhase('waiting-articles');

    const poll = async () => {
      try {
        const status = await fetchKtStatus();
        setKtStatus(status);

        if (status.articlesPending === 0) {
          // All articles ready — finalize KT
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          await finalizeKt();
        }
      } catch {
        // retry on next poll
      }
    };

    // Check immediately, then every 5s
    poll();
    pollRef.current = setInterval(poll, 5000);
  }, []);

  const finalizeKt = useCallback(async () => {
    setPhase('finalizing-kt');
    try {
      const result = await finalizeKtExport(ftExportRecordsRef.current);
      setKtFinalExported(result.ktExported);

      if (result.vbsScript && dirHandleRef.current) {
        await writeVbsToDirectory(dirHandleRef.current, result.vbsScript);
      }

      setPhase('done');
      onSyncComplete?.(deletionWarningsRef.current);
    } catch (e: any) {
      setError(e.message || 'Errore nel finalizzare KT');
      setPhase('done');
    }
  }, [onSyncComplete]);

  if (!isFileSystemAccessSupported()) return null;

  const syncing = phase !== 'idle' && phase !== 'done';
  const stageMsg = progress ? STAGE_MESSAGES[progress.stage] || 'Sincronizzazione...' : '';

  const phaseLabel = (() => {
    switch (phase) {
      case 'phase1': return stageMsg || 'Sincronizzazione...';
      case 'matching': return 'Matching sottoclienti...';
      case 'waiting-articles': return `Sync articoli (${ktStatus?.articlesPending ?? '?'} in attesa)...`;
      case 'finalizing-kt': return 'Export KT verso Arca...';
      default: return 'Sincronizza con Arca';
    }
  })();

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', border: 'none', borderRadius: 6,
          cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
          background: syncing ? '#94a3b8' : '#7c3aed', color: '#fff',
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
        {syncing ? phaseLabel : 'Sincronizza con Arca'}
      </button>

      {(phase1Result || error) && phase !== 'phase1' && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.5,
          background: error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
          color: error ? '#991b1b' : '#166534', maxWidth: 320,
        }}>
          {error && <div>{error}</div>}
          {phase1Result && (
            <>
              <div>Importati: <strong>{phase1Result.imported}</strong> documenti da Arca</div>
              {phase1Result.skipped > 0 && <div>Esistenti: {phase1Result.skipped} (saltati)</div>}
              {phase1Result.exported > 0 && (
                <div>Esportati: <strong>{phase1Result.exported} FT</strong> verso Arca</div>
              )}
              {ktFinalExported > 0 && (
                <div>
                  Esportati: <strong>{ktFinalExported} KT</strong> verso Arca
                </div>
              )}
              {phase === 'waiting-articles' && ktStatus && (
                <div style={{ marginTop: 4, color: '#6d28d9', fontWeight: 600 }}>
                  Sync articoli: {ktStatus.articlesReady}/{ktStatus.total} pronti...
                </div>
              )}
              {phase === 'finalizing-kt' && (
                <div style={{ marginTop: 4, color: '#6d28d9', fontWeight: 600 }}>
                  Generazione KT in corso...
                </div>
              )}
              {phase1Result.errors.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer' }}>{phase1Result.errors.length} avvisi</summary>
                  <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {phase1Result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* Inline customer matcher modal */}
      {showMatcher && ktStatus && ktStatus.unmatched.length > 0 && (
        <InlineMatcher
          items={ktStatus.unmatched}
          onMatchComplete={handleMatchingDone}
          onSkip={handleMatchingDone}
        />
      )}
    </div>
  );
}
