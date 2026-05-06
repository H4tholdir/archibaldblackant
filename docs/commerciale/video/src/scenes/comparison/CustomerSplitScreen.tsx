// src/scenes/comparison/CustomerSplitScreen.tsx
import { useCurrentFrame, OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { CalloutBubble } from '../../components/CalloutBubble';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { Confetti } from '../../components/Confetti';

const { CUST_PWA_DONE_REL, CUST_ERP_DONE_REL, DEVICE_FRAME, FORM_FRAME } = C.V2;

export function CustomerSplitScreen() {
  const frame = useCurrentFrame();
  const isPwaDone = frame >= CUST_PWA_DONE_REL;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ERP panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/3-erp-customer.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
            src={staticFile('komet-comparison/5-pwa-customer.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </TabletMockupWithLabel>
      </div>

      <SplitDivider />

      {/* Timers */}
      <div style={{
        position: 'absolute', top: 20, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 32, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer
          doneAtFrame={CUST_ERP_DONE_REL}
          color={palette.textMuted}
          size={110}
          label="ERP"
        />
        <SharedTimer
          doneAtFrame={CUST_PWA_DONE_REL}
          color={palette.blue}
          size={110}
          label="Formicanera"
        />
      </div>

      {/* Confetti when PWA customer done */}
      <Confetti
        triggerFrame={CUST_PWA_DONE_REL}
        count={60}
        duration={90}
        originX={0.75}
        originY={0.4}
      />

      {/* Callout: On tablet — in front of the client */}
      <CalloutBubble
        label="On tablet — in front of the client 📱"
        side="right"
        accentColor={palette.blue}
        showAtFrame={DEVICE_FRAME}
        hideAtFrame={DEVICE_FRAME + 180}
        verticalPosition={0.45}
      />

      {/* Callout: Multiple screens vs single form */}
      <CalloutBubble
        label="Multiple screens, manual navigation"
        side="left"
        accentColor={palette.orange}
        showAtFrame={FORM_FRAME}
        hideAtFrame={FORM_FRAME + 180}
        verticalPosition={0.55}
      />
      <CalloutBubble
        label="Single guided form ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={FORM_FRAME + 30}
        hideAtFrame={FORM_FRAME + 180}
        verticalPosition={0.55}
      />
    </div>
  );
}
