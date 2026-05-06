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
  ERP_CUSTOMER_START, ERP_ARTICLE_START, ERP_PACKAGING, ERP_SAVE,
  PWA_AGENT_DONE_REL, PWA_BOT_DONE,
  ERP_ORDER_START_FRAME, PWA_ORDER_START_FRAME,
  ERP_VIDEO_START_FROM, PWA_VIDEO_START_FROM,
} = C.V1;

const SUBTITLE_HEIGHT = 70;

// Entries per SubtitleBar — sincronizzate con i timestamp calibrati
const SUBTITLE_ENTRIES = [
  {
    showAtFrame: 0,
    hideAtFrame: ERP_CUSTOMER_START,
    erpText: 'Timer starts at order creation — recording is unedited',
    pwaText: 'Both systems recorded in full — no cuts, real time',
  },
  {
    showAtFrame: ERP_CUSTOMER_START,
    hideAtFrame: ERP_ARTICLE_START,
    erpText: 'Customer selection — active and archived records mixed together',
    pwaText: 'Customer found in 4 seconds — stale records can be hidden ✓',
  },
  {
    showAtFrame: ERP_ARTICLE_START,
    hideAtFrame: ERP_PACKAGING,
    erpText: 'Article search — 68 seconds to find the article code',
    pwaText: 'Article found in 7 seconds — already at packaging stage ✓',
  },
  {
    showAtFrame: ERP_PACKAGING,
    hideAtFrame: PWA_BOT_DONE,
    erpText: 'Quantity & packaging — manual calculation required',
    pwaText: 'Agent pressed confirm 38 seconds ago — bot syncing to ERP',
  },
  {
    showAtFrame: PWA_BOT_DONE,
    hideAtFrame: ERP_SAVE,
    erpText: 'ERP: still filling in fields...',
    pwaText: '✓ Order already visible on ERP — 2 min 46 sec total',
  },
  {
    showAtFrame: ERP_SAVE,
    erpText: 'ERP: saving and submitting — 4 minutes 3 seconds total',
    pwaText: 'Agent has been free for 2 minutes 48 seconds',
  },
];

export function OrderSplitScreen() {
  const frame = useCurrentFrame();
  const isPwaDone = frame >= C.V1.PWA_AGENT_DONE_REL;

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
          <InsightCard showAtFrame={C.V1.PWA_AGENT_DONE_REL} pwaFinalTime="1:15" />
        )}
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
          doneAtFrame={C.V1.PWA_AGENT_DONE_REL}
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

      {/* Confetti at PWA agent done */}
      <Confetti
        triggerFrame={PWA_AGENT_DONE_REL}
        count={80}
        duration={90}
        originX={0.75}
        originY={0.4}
      />

      {/* Confetti at bot places order on ERP */}
      <Confetti
        triggerFrame={C.V1.PWA_BOT_DONE}
        count={100}
        duration={120}
        originX={0.75}
        originY={0.4}
      />

      {/* Subtitle Bar (Style B) */}
      <SubtitleBar entries={SUBTITLE_ENTRIES} height={SUBTITLE_HEIGHT} />
    </div>
  );
}
