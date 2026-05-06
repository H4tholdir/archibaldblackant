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

const {
  PWA_DONE_REL, ERP_DONE_REL,
  CH1_FRAME, CH2_FRAME, CH3_FRAME, CH4_FRAME,
  ERP_ORDER_START_FRAME, PWA_ORDER_START_FRAME,
  ERP_VIDEO_START_FROM, PWA_VIDEO_START_FROM,
} = C.V1;

const SUBTITLE_HEIGHT = 70;

// Entries per SubtitleBar — sincronizzate con i capitoli
const SUBTITLE_ENTRIES = [
  {
    showAtFrame: 0,
    hideAtFrame: CH1_FRAME,
    erpText: 'Recording from the beginning — timer starts at order creation',
    pwaText: 'Both systems recorded in full — no cuts',
  },
  {
    showAtFrame: CH1_FRAME,
    hideAtFrame: CH2_FRAME,
    erpText: 'Two identical records visible — active and archived side by side',
    pwaText: 'Stale customers can be hidden — cleaner selection, fewer errors ✓',
  },
  {
    showAtFrame: CH2_FRAME,
    hideAtFrame: CH3_FRAME,
    erpText: 'Search inconsistency — results vary by input format and punctuation',
    pwaText: 'Unified search — always finds the article, regardless of coding ✓',
  },
  {
    showAtFrame: CH3_FRAME,
    hideAtFrame: CH4_FRAME,
    erpText: '7 units of h129fsq.104.023 — agent must manually split packaging',
    pwaText: 'Auto-split calculated: 1 box of 5 + 2 singles — automatic ✓',
  },
  {
    showAtFrame: CH4_FRAME,
    hideAtFrame: PWA_DONE_REL,
    erpText: 'Promotional pricing — discount % must be pre-calculated and entered manually',
    pwaText: 'Enter target price → discount & VAT calculated in real time ✓',
  },
  {
    showAtFrame: PWA_DONE_REL,
    erpText: 'ERP submission in progress — agent must wait at the desk',
    pwaText: 'Order confirmed. Agent is already free to do anything else.',
  },
];

export function OrderSplitScreen() {
  const frame = useCurrentFrame();
  const isPwaDone = frame >= PWA_DONE_REL;

  // "Timer starts" label opacity
  const timerLabelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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
          <InsightCard showAtFrame={PWA_DONE_REL} pwaFinalTime="3:09" />
        )}
      </div>

      {/* Center divider */}
      <SplitDivider />

      {/* Timers */}
      <div style={{
        position: 'absolute', top: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        zIndex: 15,
      }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <SharedTimer
            startFrame={C.V1.ERP_ORDER_START_FRAME}
            doneAtFrame={ERP_DONE_REL}
            color={palette.textMuted}
            size={108}
            label="ERP"
          />
          <SharedTimer
            startFrame={C.V1.PWA_ORDER_START_FRAME}
            doneAtFrame={PWA_DONE_REL}
            color={palette.blue}
            size={108}
            label="Formicanera"
          />
        </div>
        <div style={{
          fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          opacity: timerLabelOpacity,
        }}>
          ⏱ Timer starts at "Start creating order"
        </div>
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

      {/* Confetti at PWA Done */}
      <Confetti
        triggerFrame={PWA_DONE_REL}
        count={80}
        duration={90}
        originX={0.75}
        originY={0.4}
      />

      {/* Subtitle Bar (Style B) */}
      <SubtitleBar entries={SUBTITLE_ENTRIES} height={SUBTITLE_HEIGHT} />
    </div>
  );
}
