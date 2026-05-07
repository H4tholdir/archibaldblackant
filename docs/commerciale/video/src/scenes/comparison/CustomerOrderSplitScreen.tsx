// src/scenes/comparison/CustomerOrderSplitScreen.tsx
import { useCurrentFrame, OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { Confetti } from '../../components/Confetti';
import { SubtitleBar } from '../../components/SubtitleBar';
import { PwaCompletionOverlay } from '../../components/PwaCompletionOverlay';
import { MilestoneSparkle } from '../../components/MilestoneSparkle';
import { MilestoneTracker } from '../../components/MilestoneTracker';

const { V2 } = C;

const SUBTITLE_ENTRIES = [
  {
    showAtFrame: 0,
    hideAtFrame: V2.CH1_FRAME,
    erpText: 'Timer starts at customer creation — unedited recording',
    pwaText: 'Real time. No cuts. No edits.',
  },
  // FEATURE NOTE 1: IVA auto-fill (~15s)
  {
    showAtFrame: V2.CH1_FRAME,
    hideAtFrame: V2.CH1_FRAME + 900,
    erpText: 'IVA lookup shows client data — fields must be typed manually',
    pwaText: 'IVA validated → all fields auto-filled from tax registry ✓',
    isFeatureNote: true,
  },
  // FEATURE NOTE 2: Discount defaults (~60s, spread)
  {
    showAtFrame: V2.CH2_FRAME,
    hideAtFrame: V2.CH2_FRAME + 900,
    erpText: 'Street price discount auto-selected — removed manually every time',
    pwaText: 'All defaults managed automatically — no cleanup required ✓',
    isFeatureNote: true,
  },
  // FEATURE NOTE 3: Error handling / wizard (~100s)
  {
    showAtFrame: V2.CH3_FRAME,
    hideAtFrame: V2.CH3_FRAME + 900,
    erpText: 'Inline errors — agent must identify and fix mandatory fields',
    pwaText: 'Multi-step wizard guides completion — trained patterns handle edge cases ✓',
    isFeatureNote: true,
  },
  // PWA Client confirmed (53s = 1590f)
  {
    showAtFrame: V2.PWA_CLIENT_CONFIRMED,
    hideAtFrame: V2.PWA_ERP_SAVED,
    erpText: 'ERP: client creation ongoing...',
    pwaText: '✓ 0:53 — Client confirmed. Background sync to ERP starting. Agent is free.',
  },
  // PWA ERP saved (102s = 3060f)
  {
    showAtFrame: V2.PWA_ERP_SAVED,
    hideAtFrame: V2.CH4_FRAME,
    erpText: 'ERP: still filling in client form...',
    pwaText: '✓ 1:42 — Client now on Archibald ERP. Background sync complete.',
  },
  // FEATURE NOTE 4: Order continuity (~170s)
  {
    showAtFrame: V2.CH4_FRAME,
    hideAtFrame: V2.CH4_FRAME + 900,
    erpText: 'New order — full customer search must start over from scratch',
    pwaText: 'One tap from the client card — customer already selected ✓',
    isFeatureNote: true,
  },
  // PWA Agent DONE (123s = 3690f)
  {
    showAtFrame: V2.PWA_AGENT_DONE_REL,
    hideAtFrame: V2.CH5_FRAME,
    erpText: 'ERP: agent still at the desk...',
    pwaText: '✓ 2:03 — Order queued. ERP sync in background.',
  },
  // ERP timer paused — agent demo (160s = 4800f)
  {
    showAtFrame: V2.ERP_PAUSE_FROM,
    hideAtFrame: V2.ERP_PAUSE_TO,
    erpText: '→ Agent demonstrates new client record (time paused)',
    pwaText: '',
  },
  // FEATURE NOTE 5: Discount bug (~220s)
  {
    showAtFrame: V2.CH5_FRAME,
    hideAtFrame: V2.CH5_FRAME + 900,
    erpText: 'Discount option did not save — agent discovers and re-fixes manually',
    pwaText: 'Order validated automatically — no silent errors ✓',
    isFeatureNote: true,
  },
  // PWA Bot done (168s = 5040f)
  {
    showAtFrame: V2.PWA_BOT_DONE,
    hideAtFrame: V2.ERP_DONE_REL,
    erpText: 'ERP: agent still filling in order fields...',
    pwaText: '✓ Order on Archibald ERP — 2:48 from creation',
  },
  // ERP Done
  {
    showAtFrame: V2.ERP_DONE_REL,
    erpText: '✓ ERP — 3:51 from creation (excl. demo). Order confirmed.',
    pwaText: 'Agent has been free for 1 minute 3 seconds',
  },
];

export function CustomerOrderSplitScreen() {
  const frame = useCurrentFrame();

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ERP panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/v2-erp-client-order.mp4')}
          startFrom={V2.ERP_VIDEO_START_FROM}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <div style={{
          position: 'absolute', top: 14, left: 16,
          fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.60)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '4px 10px',
        }}>
          Archibald ERP — Desktop
        </div>
      </div>

      {/* PWA panel */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: palette.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <TabletMockupWithLabel width={860} height={630}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <OffthreadVideo
              src={staticFile('komet-comparison/v2-pwa-client-order.mp4')}
              startFrom={V2.PWA_VIDEO_START_FROM}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <PwaCompletionOverlay showAtFrame={V2.PWA_DONE_REL} completionTime="2:48" />
          </div>
        </TabletMockupWithLabel>

        {/* Confetti clipped to PWA panel */}
        <Confetti triggerFrame={V2.PWA_AGENT_DONE_REL} count={60} duration={90} originX={0.5} originY={0.4} />
        <Confetti triggerFrame={V2.PWA_BOT_DONE} count={90} duration={120} originX={0.5} originY={0.4} />
      </div>

      {/* Divider */}
      <SplitDivider />

      {/* Container 1: Timer principali — posizione FISSA al centro */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 20,
        alignItems: 'flex-start',
        zIndex: 15,
      }}>
        {/* ERP Timer */}
        <SharedTimer
          startFrame={V2.ERP_ORDER_START_FRAME}
          pauseFrom={V2.ERP_PAUSE_FROM}
          pauseTo={V2.ERP_PAUSE_TO}
          doneAtFrame={V2.ERP_DONE_REL}
          color={palette.textMuted}
          size={108}
          label="ERP"
        />

        {/* Formicanera Timer con sparkle */}
        <div style={{ position: 'relative' }}>
          <SharedTimer
            startFrame={V2.PWA_ORDER_START_FRAME}
            pendingAtFrame={V2.PWA_AGENT_DONE_REL}
            doneAtFrame={V2.PWA_BOT_DONE}
            color={palette.blue}
            size={108}
            label="Formicanèra"
          />
          <MilestoneSparkle triggerFrame={C.V2.PWA_CLIENT_CONFIRMED} duration={55} color={palette.green} count={8} />
          <MilestoneSparkle triggerFrame={C.V2.PWA_ERP_SAVED} duration={55} color={palette.blue} count={10} />
          <MilestoneSparkle triggerFrame={C.V2.PWA_AGENT_DONE_REL} duration={55} color={palette.green} count={12} />
        </div>
      </div>

      {/* Container 2: Milestone circles — ancorati a destra del timer Formicanera, crescono verso destra */}
      {/* Il timer Formicanera è il secondo di due timer da 108px con gap 20px */}
      {/* Bordo destro: 50% + (108+20+108)/2 + piccolo gap = 50% + 118 + 12 = 50% + 130px */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 'calc(50% + 130px)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        zIndex: 15,
      }}>
        <div style={{
          width: 1,
          height: 120,
          background: 'rgba(255,255,255,0.15)',
          marginTop: 8,
          flexShrink: 0,
        }} />
        <MilestoneTracker
          milestones={[
            { frame: C.V2.PWA_CLIENT_CONFIRMED, time: '0:53', label: 'Client\nconfirmed', color: palette.green },
            { frame: C.V2.PWA_ERP_SAVED,        time: '1:42', label: 'Client\non ERP',    color: palette.blue },
            { frame: C.V2.PWA_AGENT_DONE_REL,   time: '2:03', label: 'Order\nqueued',     color: palette.green },
          ]}
          size={72}
        />
      </div>

      {/* REC badge */}
      <div style={{
        position: 'absolute', top: 14, right: 16,
        background: 'rgba(255,59,48,0.90)', borderRadius: 6,
        padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6, zIndex: 20,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', background: '#fff',
          opacity: (frame % 30) < 15 ? 1 : 0.3,
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily, letterSpacing: 1 }}>REAL TIME</span>
      </div>

      {/* Subtitle Bar */}
      <SubtitleBar entries={SUBTITLE_ENTRIES} height={70} />
    </div>
  );
}
