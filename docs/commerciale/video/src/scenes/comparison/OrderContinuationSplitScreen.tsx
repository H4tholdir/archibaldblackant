// src/scenes/comparison/OrderContinuationSplitScreen.tsx
import { OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { Confetti } from '../../components/Confetti';

// Legacy file — superseded by CustomerOrderSplitScreen. Constants inlined to avoid V2 type errors.
const ORD_PWA_DONE_REL = 1950;
const ORD_ERP_DONE_REL = 2760;
const CUST_ERP_DURATION_S = 178;
const CUST_PWA_DURATION_S = 122;

export function OrderContinuationSplitScreen() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ERP panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/4-erp-customer-order.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
        <div style={{
          position: 'absolute', top: 16, left: 20,
          fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.50)',
          fontFamily, letterSpacing: 1, textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.40)', borderRadius: 6, padding: '4px 10px',
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
        <TabletMockupWithLabel width={860} height={640}>
          <OffthreadVideo
            src={staticFile('komet-comparison/6-pwa-customer-order.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'fill' }}
          />
        </TabletMockupWithLabel>
      </div>

      <SplitDivider />

      {/* Cumulative timers (show total time customer + order) */}
      <div style={{
        position: 'absolute', top: 20, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 32, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer
          doneAtFrame={ORD_ERP_DONE_REL}
          offsetSeconds={CUST_ERP_DURATION_S}
          color={palette.textMuted}
          size={110}
          label="ERP total"
        />
        <SharedTimer
          doneAtFrame={ORD_PWA_DONE_REL}
          offsetSeconds={CUST_PWA_DURATION_S}
          color={palette.blue}
          size={110}
          label="Formicanera total"
        />
      </div>

      {/* Confetti when PWA order done */}
      <Confetti
        triggerFrame={ORD_PWA_DONE_REL}
        count={80}
        duration={90}
        originX={0.75}
        originY={0.4}
      />
    </div>
  );
}
