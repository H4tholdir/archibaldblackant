// src/scenes/comparison/OrderSplitScreen.tsx
import { useCurrentFrame, OffthreadVideo, staticFile } from 'remotion';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { C } from '../../lib/comparison-timing';
import { SplitDivider } from '../../components/SplitDivider';
import { SharedTimer } from '../../components/SharedTimer';
import { CalloutBubble } from '../../components/CalloutBubble';
import { ChapterBadge } from '../../components/ChapterBadge';
import { InsightCard } from '../../components/InsightCard';
import { TabletMockupWithLabel } from '../../components/TabletMockup';
import { Confetti } from '../../components/Confetti';

const { PWA_DONE_REL, CH1_FRAME, CH2_FRAME, CH3_FRAME, CH4_FRAME } = C.V1;

export function OrderSplitScreen() {
  const frame = useCurrentFrame();
  const isPwaDone = frame >= PWA_DONE_REL;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', position: 'relative' }}>

      {/* ── PANNELLO SINISTRO: ERP ─────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('komet-comparison/1-erp-order.mp4')}
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

      {/* ── PANNELLO DESTRO: PWA ──────────────────────────── */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: palette.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!isPwaDone ? (
          <TabletMockupWithLabel width={860} height={640}>
            <OffthreadVideo
              src={staticFile('komet-comparison/2-pwa-order.mp4')}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </TabletMockupWithLabel>
        ) : (
          <InsightCard showAtFrame={PWA_DONE_REL} />
        )}
      </div>

      {/* ── DIVIDER ───────────────────────────────────────── */}
      <SplitDivider />

      {/* ── TIMERS ────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 20, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', gap: 32, alignItems: 'flex-start', zIndex: 15,
      }}>
        <SharedTimer
          doneAtFrame={C.V1.ERP_DONE_REL}
          color={palette.textMuted}
          size={110}
          label="ERP"
        />
        <SharedTimer
          doneAtFrame={PWA_DONE_REL}
          color={palette.blue}
          size={110}
          label="Formicanera"
        />
      </div>

      {/* ── CONFETTI al PWA Done ──────────────────────────── */}
      <Confetti
        triggerFrame={PWA_DONE_REL}
        count={80}
        duration={90}
        originX={0.75}
        originY={0.4}
      />

      {/* ── CHAPTER 1: Customer Selection (~28s) ─────────── */}
      <ChapterBadge
        label="Chapter 1 — Customer Selection"
        showAtFrame={CH1_FRAME - 30}
        hideAtFrame={CH1_FRAME}
      />
      <CalloutBubble
        label="Two identical records — which is active?"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH1_FRAME}
        hideAtFrame={CH1_FRAME + 180}
        verticalPosition={0.5}
      />
      <CalloutBubble
        label="Inactive customers automatically hidden ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH1_FRAME + 30}
        hideAtFrame={CH1_FRAME + 180}
        verticalPosition={0.5}
      />

      {/* ── CHAPTER 2: Article Search (~78s) ─────────────── */}
      <ChapterBadge
        label="Chapter 2 — Article Search"
        showAtFrame={CH2_FRAME - 30}
        hideAtFrame={CH2_FRAME}
      />
      <CalloutBubble
        label="Dual search mechanism — inconsistent results"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH2_FRAME}
        hideAtFrame={CH2_FRAME + 180}
        verticalPosition={0.45}
      />
      <CalloutBubble
        label="Unified intelligent search ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH2_FRAME + 30}
        hideAtFrame={CH2_FRAME + 180}
        verticalPosition={0.45}
      />

      {/* ── CHAPTER 3: Packaging (~126s) ──────────────────── */}
      <ChapterBadge
        label="Chapter 3 — Packaging"
        showAtFrame={CH3_FRAME - 30}
        hideAtFrame={CH3_FRAME}
      />
      <CalloutBubble
        label="7 units — manual calculation required"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH3_FRAME}
        hideAtFrame={CH3_FRAME + 180}
        verticalPosition={0.55}
      />
      <CalloutBubble
        label="Auto-split: 1×5 + 2×1 ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH3_FRAME + 30}
        hideAtFrame={CH3_FRAME + 180}
        verticalPosition={0.55}
      />

      {/* ── CHAPTER 4: Discount & VAT (~173s) ────────────── */}
      <ChapterBadge
        label="Chapter 4 — Discount & VAT"
        showAtFrame={CH4_FRAME - 30}
        hideAtFrame={CH4_FRAME}
      />
      <CalloutBubble
        label="Manual discount % entry required"
        side="left"
        accentColor={palette.orange}
        showAtFrame={CH4_FRAME}
        hideAtFrame={CH4_FRAME + 180}
        verticalPosition={0.5}
      />
      <CalloutBubble
        label="Promotion applied automatically ✓"
        side="right"
        accentColor={palette.green}
        showAtFrame={CH4_FRAME + 30}
        hideAtFrame={CH4_FRAME + 180}
        verticalPosition={0.5}
      />
    </div>
  );
}
