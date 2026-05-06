// src/scenes/comparison/OrderSplitScreen.tsx
import { useCurrentFrame, OffthreadVideo, staticFile, interpolate } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { InsightCard } from '../../components/InsightCard';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { Confetti } from '../../components/Confetti';
import { SubtitleBar } from '../../components/SubtitleBar';

const { ERP_DONE_REL, ERP_VIDEO_START_FROM, PWA_VIDEO_START_FROM } = C.V1;

const SUBTITLE_HEIGHT = 70;

// Entries per SubtitleBar — note informative spread lungo tutto il video
const SUBTITLE_ENTRIES = [
  // Apertura
  {
    showAtFrame: 0,
    hideAtFrame: 420,
    erpText: 'Timer starts at order creation — unedited recording',
    pwaText: 'Real time. No cuts. No edits.',
  },
  // FEATURE NOTE 1: Customer (comp ~0:50 = split 450f)
  {
    showAtFrame: 450,
    hideAtFrame: 1080,
    erpText: 'Duplicate records — active and archived both selectable',
    pwaText: 'Stale customers can be hidden — cleaner selection ✓',
    isFeatureNote: true,
  },
  // FEATURE NOTE 2: Article search (comp ~1:40 = split 1950f)
  {
    showAtFrame: 1950,
    hideAtFrame: 2580,
    erpText: 'Search inconsistency — results vary by input format',
    pwaText: 'One search, always consistent ✓',
    isFeatureNote: true,
  },
  // PWA Agent DONE (split 2700f = 90s)
  {
    showAtFrame: 2700,
    hideAtFrame: 3060,
    erpText: 'ERP: agent still working...',
    pwaText: '✓ Agent done — 1:30 from creation. Order is pending.',
  },
  // FEATURE NOTE 3: Packaging (comp ~2:28 = split 3390f) - durante lavoro manuale ERP
  {
    showAtFrame: 3390,
    hideAtFrame: 4020,
    erpText: '7 units — agent must manually split packaging',
    pwaText: 'Auto-split: 1×5 + 2×1 — calculated automatically ✓',
    isFeatureNote: true,
  },
  // Async phase note
  {
    showAtFrame: 4020,
    hideAtFrame: 4800,
    erpText: 'ERP: entering data manually...',
    pwaText: 'Pending order syncing — agent is free to do anything else',
  },
  // FEATURE NOTE 4: Discount (comp ~3:15 = split 4800f)
  {
    showAtFrame: 4800,
    hideAtFrame: 5430,
    erpText: 'Promotional pricing — manual % calculation required',
    pwaText: 'Enter target price → discount & VAT in real time ✓',
    isFeatureNote: true,
  },
  // Order on ERP (split 5580f = 186s)
  {
    showAtFrame: 5580,
    hideAtFrame: 7290,
    erpText: 'ERP: agent still filling in fields...',
    pwaText: '✓ Order already on Archibald ERP — 3:06 from creation',
  },
  // ERP Done (split 7290f = 243s)
  {
    showAtFrame: 7290,
    erpText: '✓ ERP — 4:03 from creation. Order confirmed.',
    pwaText: 'Agent has been free for 2 minutes 33 seconds',
  },
];

export function OrderSplitScreen() {
  const frame = useCurrentFrame();
  const isPwaDone = frame >= C.V1.PWA_AGENT_DONE_REL;  // 2700f = 90s

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ERP panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0D1117' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/1-erp-order.mp4')}
          startFrom={ERP_VIDEO_START_FROM}
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
        {!isPwaDone ? (
          <TabletMockupWithLabel width={860} height={630}>
            <OffthreadVideo
              src={staticFile('komet-comparison/2-pwa-order.mp4')}
              startFrom={PWA_VIDEO_START_FROM}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </TabletMockupWithLabel>
        ) : (
          <InsightCard showAtFrame={C.V1.PWA_AGENT_DONE_REL} pwaFinalTime="1:30" />
        )}

        {/* Confetti clipped to PWA panel */}
        <Confetti
          triggerFrame={C.V1.PWA_AGENT_DONE_REL}
          count={70}
          duration={90}
          originX={0.5}
          originY={0.4}
        />
        <Confetti
          triggerFrame={C.V1.PWA_BOT_DONE}
          count={100}
          duration={120}
          originX={0.5}
          originY={0.4}
        />
      </div>

      {/* Center divider */}
      <SplitDivider />

      {/* Timers */}
      <div style={{
        position: 'absolute', top: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 28, alignItems: 'flex-start',
        zIndex: 15,
      }}>
        <SharedTimer
          startFrame={C.V1.ERP_ORDER_START_FRAME}
          doneAtFrame={ERP_DONE_REL}
          color={palette.textMuted}
          size={108}
          label="ERP"
        />
        <SharedTimer
          startFrame={C.V1.PWA_ORDER_START_FRAME}
          pendingAtFrame={C.V1.PWA_AGENT_DONE_REL}
          doneAtFrame={C.V1.PWA_BOT_DONE}
          color={palette.blue}
          size={108}
          label="Formicanera"
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
          opacity: interpolate(frame % 30, [0, 15, 30], [1, 0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily, letterSpacing: 1 }}>REAL TIME</span>
      </div>

      {/* Subtitle Bar (Style B) */}
      <SubtitleBar entries={SUBTITLE_ENTRIES} height={SUBTITLE_HEIGHT} />
    </div>
  );
}
