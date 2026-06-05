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

  const handleToggleLock = async (stop: VisitPlanningStop) => {
    if (!sessionId) return;
    await vpService.toggleStopLock(sessionId, stop.id, !stop.locked);
    load();
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

  const activeStop = session?.activeStopId
    ? stops.find(s => s.id === session.activeStopId) ?? null
    : null;

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>Caricamento...</div>;
  if (error)   return <div style={{ padding: 24, color: '#ef4444' }}>{error}</div>;
  if (!session) return null;

  const visibleStops = stops.filter(s => s.status !== 'removed');

  const listPanel = (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: isDesktop ? '0 8px 0 0' : 0 }}>
      {visibleStops.length === 0 ? (
        <>
          <VisitGenerateButton
            sessionId={sessionId!}
            stopDate={session.startDate}
            onGenerated={(_count) => { setGenerateError(null); load(); }}
            onError={(msg) => setGenerateError(msg)}
          />
          {generateError && (
            <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', padding: '0 16px 8px' }}>
              {generateError}
            </div>
          )}
        </>
      ) : (
        visibleStops.map(stop => (
          <VisitStopCard
            key={stop.id}
            stop={stop}
            onStatusChange={(id, status) => { vpService.updateStop(sessionId!, id, { status }).then(load); }}
            onNavigate={handleNavigate}
            onOpenBrief={handleOpenBrief}
            onConfirmWithAppointment={handleConfirmWithAppointment}
            onToggleLock={handleToggleLock}
          />
        ))
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: isDesktop ? 1280 : undefined, margin: '0 auto', padding: isMobile ? '8px 12px' : '16px 24px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{session.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {session.startDate} · {VISIT_MODE_LABELS[session.mode]} · {visibleStops.length} tappe
          </div>
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
          <VisitMap stops={visibleStops} height={600} onStopClick={handleOpenBrief} />
          {showBriefFor && brief && (
            <div style={{ overflowY: 'auto' }}>
              <VisitBriefPanel brief={brief} onOutcome={handleOutcome} />
            </div>
          )}
        </div>
      ) : isTablet ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {listPanel}
          <VisitMap stops={visibleStops} height={400} onStopClick={handleOpenBrief} />
        </div>
      ) : (
        <>
          {showMap && <VisitMap stops={visibleStops} height={220} onStopClick={handleOpenBrief} />}
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

      {/* Pulsante aggiungi cliente manuale */}
      <div style={{ textAlign: 'center', marginTop: 12, paddingBottom: 80 }}>
        <button
          onClick={() => setShowPicker(true)}
          style={{
            background: '#f1f5f9', color: '#374151',
            border: '1px solid #d1d5db', borderRadius: 8,
            padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >➕ Aggiungi cliente manualmente</button>
      </div>

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
