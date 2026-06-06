import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { VisitPlanningSession, VisitPlanningStop, VisitBrief, VisitOutcome } from '../types/visit-planning';
import { VISIT_MODE_LABELS } from '../types/visit-planning';
import * as vpService from '../services/visit-planning.service';
import { VisitStopCard } from '../components/visit-planning/VisitStopCard';
import { VisitMap } from '../components/visit-planning/VisitMap';
import { ArrivalBanner } from '../components/visit-planning/ArrivalBanner';
import { VisitBriefPanel } from '../components/visit-planning/VisitBriefPanel';
import { VisitGenerateButton } from '../components/visit-planning/VisitGenerateButton';
import { CustomerPickerModal } from '../components/visit-planning/CustomerPickerModal';
import { IntentDetectionModal } from '../components/visit-planning/IntentDetectionModal';
import type { IntentDetection } from '../services/visit-planning.service';

export function VisitPlanningSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession]           = useState<VisitPlanningSession | null>(null);
  const [stops, setStops]               = useState<VisitPlanningStop[]>([]);
  const [brief, setBrief]               = useState<VisitBrief | null>(null);
  const [showBriefFor, setShowBriefFor] = useState<VisitPlanningStop | null>(null);
  const [showMap, setShowMap]           = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showArrival, setShowArrival]   = useState(true);
  const [showPicker, setShowPicker]       = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [regenerating, setRegenerating]   = useState(false);
  const [intentDetection, setIntentDetection]         = useState<IntentDetection | null>(null);
  const [pendingGenerateDate, setPendingGenerateDate] = useState<string | null>(null);
  const [mapStats, setMapStats] = useState<{ totalKm: number; geocodedCount: number; totalStops: number } | null>(null);

  const isMobile  = window.innerWidth < 768;
  const isTablet  = window.innerWidth >= 768 && window.innerWidth < 1280;
  const isDesktop = window.innerWidth >= 1280;

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const [s, st] = await Promise.all([
        vpService.getSession(sessionId),
        vpService.listStops(sessionId),
      ]);
      setSession(s);
      setStops(st.filter(stop => stop.status !== 'removed'));
    } catch {
      setError('Impossibile caricare il giro.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const handleNavigate = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    await vpService.notifyNavigationStarted(sessionId, stop.id);
    setSession(prev => prev ? { ...prev, navigationStartedAt: new Date().toISOString(), activeStopId: stop.id } : prev);
    window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(stop.displayName)}`, '_blank');
  };

  const handleOpenBrief = async (stop: VisitPlanningStop) => {
    setShowBriefFor(stop);
    try {
      const b = await vpService.getVisitBrief(stop.sourceType, stop.sourceId);
      setBrief(b);
    } catch {
      setBrief(null);
    }
  };

  const handleConfirmWithAppointment = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    try {
      await vpService.confirmWithAppointment(sessionId, stop.id);
      load();
    } catch (err) {
      console.error('confirmWithAppointment error', err);
    }
  };

  const handleRegenerate = async () => {
    if (!sessionId) return;
    if (!confirm('Vuoi rigenerare il giro? Le tappe non bloccate verranno sostituite.')) return;
    setRegenerating(true);
    try {
      await vpService.regenerateRoute(sessionId);
      load();
    } catch (err) {
      setGenerateError('Impossibile rigenerare il giro. Riprova.');
      console.error('regenerate error', err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleToggleLock = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    await vpService.toggleStopLock(sessionId, stop.id, !stop.locked);
    load();
  };

  const handleIntentDetected = (detection: IntentDetection) => {
    setIntentDetection(detection);
    setPendingGenerateDate(session?.startDate ?? null);
  };

  const handleIntentConfirm = async () => {
    if (!sessionId || !pendingGenerateDate) return;
    setIntentDetection(null);
    try {
      const result = await vpService.generateRoute(sessionId, pendingGenerateDate);
      setGenerateError(null);
      void result; // trigger load
      load();
    } catch {
      setGenerateError('Impossibile generare il giro. Riprova.');
    }
  };

  const handleIntentIgnore = async () => {
    if (!sessionId || !pendingGenerateDate) return;
    setIntentDetection(null);
    try {
      await vpService.generateRoute(sessionId, pendingGenerateDate, true); // skipIntent=true
      setGenerateError(null);
      load();
    } catch {
      setGenerateError('Impossibile generare il giro. Riprova.');
    }
  };

  const handleOutcome = async (outcome: VisitOutcome) => {
    if (!sessionId || !showBriefFor) return;
    if (outcome === 'visited' || outcome === 'order_created') {
      await vpService.markVisited(sessionId, showBriefFor.id);
    } else if (outcome === 'rescheduled') {
      await vpService.skipStop(sessionId, showBriefFor.id, outcome);
    }
    setShowBriefFor(null);
    setBrief(null);
    load();
  };

  const handleAvviaNavi = () => {
    if (!session) return;
    const stopsOrdered = visibleStops
      .filter(s => s.status !== 'removed' && s.status !== 'skipped')
      .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));
    if (stopsOrdered.length === 0) return;

    const MAX_WAYPOINTS = 9;
    const finalStops = stopsOrdered.length > MAX_WAYPOINTS
      ? [...stopsOrdered.slice(0, MAX_WAYPOINTS - 1), stopsOrdered[stopsOrdered.length - 1]]
      : stopsOrdered;

    const homeCoord = (session.startLat != null && session.startLng != null)
      ? `${session.startLat},${session.startLng}`
      : null;

    const waypoints = finalStops.map(s =>
      (s.lat != null && s.lng != null) ? `${s.lat},${s.lng}` : encodeURIComponent(s.displayName)
    );

    const parts = homeCoord ? [homeCoord, ...waypoints] : waypoints;
    window.open(`https://www.google.com/maps/dir/${parts.join('/')}`, '_blank');
  };

  const activeStop = session?.activeStopId
    ? stops.find(s => s.id === session.activeStopId) ?? null
    : null;

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>Caricamento...</div>;
  if (error)   return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;
  if (!session) return null;

  const visibleStops = stops.filter(s => s.status !== 'removed');

  const addButton = (
    <div style={{ textAlign: 'center', marginTop: 10 }}>
      <button
        onClick={() => setShowPicker(true)}
        style={{
          background: '#f1f5f9', color: '#374151',
          border: '1px solid #d1d5db', borderRadius: 8,
          padding: '7px 16px', fontSize: 13, cursor: 'pointer',
        }}
      >➕ Aggiungi cliente manualmente</button>
    </div>
  );

  const listPanel = (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: isDesktop ? '0 8px 0 0' : 0 }}>
      {visibleStops.length === 0 ? (
        <>
          <VisitGenerateButton
            sessionId={sessionId!}
            stopDate={session.startDate}
            onGenerated={(_count) => { setGenerateError(null); load(); }}
            onError={(msg) => setGenerateError(msg)}
            onIntentDetected={handleIntentDetected}
          />
          {generateError && (
            <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', padding: '0 16px 8px' }}>
              {generateError}
            </div>
          )}
          {addButton}
        </>
      ) : (
        <>
          {visibleStops.map(stop => (
            <VisitStopCard
              key={stop.id}
              stop={stop}
              onStatusChange={(id, status) => { vpService.updateStop(sessionId!, id, { status }).then(load); }}
              onNavigate={handleNavigate}
              onOpenBrief={handleOpenBrief}
              onConfirmWithAppointment={handleConfirmWithAppointment}
              onToggleLock={handleToggleLock}
            />
          ))}
          {addButton}
        </>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: isDesktop ? 1280 : undefined, margin: '0 auto', padding: isMobile ? '8px 12px' : '16px 24px', backgroundColor: '#f9fafb', minHeight: '100%', borderRadius: isMobile ? 0 : 12 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{session.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {session.startDate} · {VISIT_MODE_LABELS[session.mode]} · {visibleStops.length} tappe
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {([
              { status: 'visited',   label: 'visitati',    bg: '#dcfce7', color: '#166534', icon: '✅' },
              { status: 'confirmed', label: 'confermati',  bg: '#dbeafe', color: '#1e40af', icon: '📅' },
              { status: 'to_call',   label: 'da chiamare', bg: '#fef3c7', color: '#92400e', icon: '📞' },
              { status: 'suggested', label: 'suggeriti',   bg: '#f1f5f9', color: '#475569', icon: '⚪' },
            ] as const).map(({ status, label, bg, color, icon }) => {
              const n = visibleStops.filter(s => s.status === status).length;
              if (n === 0) return null;
              return (
                <span key={status} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: bg, color }}>
                  {icon} {n} {label}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={handleAvviaNavi}
            title="Avvia navigazione completa in Google Maps"
            style={{
              background: '#16a34a', color: 'white', border: 'none',
              borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >▶ Navi</button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Rigenera giro (mantiene tappe bloccate)"
            style={{
              background: regenerating ? '#e5e7eb' : '#eff6ff',
              color: regenerating ? '#9ca3af' : '#2563eb',
              border: '1px solid #bfdbfe', borderRadius: 8,
              padding: '5px 12px', fontSize: 12, cursor: 'pointer',
            }}
          >{regenerating ? '⏳' : '🔄 Rigenera'}</button>
        </div>
      </div>

      {isMobile && (
        <button
          onClick={() => setShowMap(v => !v)}
          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 14px', fontSize: 13, width: '100%', marginBottom: 10, cursor: 'pointer' }}
        >{showMap ? '🗺️ Nascondi mappa' : '🗺️ Mostra percorso'}</button>
      )}

      {isDesktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 16 }}>
          {listPanel}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mapStats && (
              <div style={{
                background: '#1e293b', color: 'white', padding: '10px 16px',
                display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
                borderRadius: '8px 8px 0 0',
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {mapStats.geocodedCount < mapStats.totalStops ? '≥' : ''}
                    {mapStats.totalKm.toLocaleString('it-IT', { maximumFractionDigits: 1 })} km
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>
                    percorso totale{mapStats.geocodedCount < mapStats.totalStops
                      ? ` (${mapStats.geocodedCount}/${mapStats.totalStops} tappe localizzate)` : ''}
                  </div>
                </div>
                <div style={{ width: 1, height: 28, background: '#334155' }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                    {visibleStops.filter(s => s.status === 'visited').length} ✅
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>visite completate</div>
                </div>
              </div>
            )}
            <VisitMap stops={visibleStops} height={mapStats ? 572 : 600} onStopClick={handleOpenBrief} onStatsUpdate={setMapStats} />
            <div style={{ background: 'white', borderTop: '1px solid #e5e7eb', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 8px 8px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                <strong style={{ color: '#374151', display: 'block' }}>Apri in Google Maps</strong>
                {visibleStops.length > 9 ? 'Fermate 1–8 + destinazione finale' : 'Tutte le tappe in sequenza'}
              </div>
              <button
                onClick={handleAvviaNavi}
                style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >🗺️ Google Maps</button>
            </div>
          </div>
          {showBriefFor && brief && (
            <div style={{ overflowY: 'auto' }}>
              <VisitBriefPanel brief={brief} onOutcome={handleOutcome} />
            </div>
          )}
        </div>
      ) : isTablet ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {listPanel}
          <VisitMap stops={visibleStops} height={400} onStopClick={handleOpenBrief} onStatsUpdate={setMapStats} />
        </div>
      ) : (
        <>
          {showMap && <VisitMap stops={visibleStops} height={220} onStopClick={handleOpenBrief} onStatsUpdate={setMapStats} />}
          {listPanel}
        </>
      )}

      {!isDesktop && showBriefFor && brief && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }} onClick={() => setShowBriefFor(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#f8fafc', borderRadius: '16px 16px 0 0', padding: 16, maxHeight: '80vh', overflowY: 'auto' }}
          >
            <VisitBriefPanel brief={brief} onOutcome={handleOutcome} />
          </div>
        </div>
      )}

      {intentDetection && pendingGenerateDate && (
        <IntentDetectionModal
          date={pendingGenerateDate}
          detection={intentDetection}
          onConfirm={() => void handleIntentConfirm()}
          onIgnore={() => void handleIntentIgnore()}
        />
      )}

      {showArrival && session.navigationStartedAt && activeStop && (
        <ArrivalBanner
          customerName={activeStop.displayName}
          navigationStartedAt={session.navigationStartedAt}
          minMinutesBeforePrompt={5}
          onConfirm={async () => {
            await vpService.markVisited(sessionId!, activeStop.id);
            setShowArrival(false);
            load();
          }}
          onDismiss={() => setShowArrival(false)}
        />
      )}

      {showPicker && (
        <CustomerPickerModal
          sessionId={sessionId!}
          stopDate={session.startDate}
          onAdded={() => { setShowPicker(false); load(); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
