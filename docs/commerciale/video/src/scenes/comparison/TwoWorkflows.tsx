// src/scenes/comparison/TwoWorkflows.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springText, springBounce, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { WorkflowTimeline } from '../../components/WorkflowTimeline';
import { AntAnimation } from '../../components/AntAnimation';

type Props = {
  variant?: 'order' | 'customer-order';
};

const ERP_STEPS_ORDER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '⌨️', label: 'Enter order 4:08' },
  { icon: '✓', label: 'ERP', highlight: true as const },
];

const PWA_STEPS_ORDER = [
  { icon: '☎️', label: 'Meeting + order 3:09', highlight: true as const },
  { icon: '🚗', label: 'Drive / batch' },
  { icon: '✓', label: 'ERP in background', highlight: true as const },
];

const ERP_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '👤', label: 'Create customer' },
  { icon: '⌨️', label: 'Enter order' },
  { icon: '✓', label: 'ERP', highlight: true as const },
];

const PWA_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Meeting + customer + order', highlight: true as const },
  { icon: '🚗', label: 'Drive' },
  { icon: '✓', label: 'ERP in background', highlight: true as const },
];

export function TwoWorkflows({ variant = 'order' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const erpSteps = variant === 'order' ? ERP_STEPS_ORDER : ERP_STEPS_CUSTOMER;
  const pwaSteps = variant === 'order' ? PWA_STEPS_ORDER : PWA_STEPS_CUSTOMER;

  const headlineProgress = spring({ frame: Math.max(0, frame - 5), fps, config: springText, from: 0, to: 1 });
  const lineWidth = interpolate(frame, [8, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const dividerOpacity = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const boxProgress = spring({ frame: Math.max(0, frame - 340), fps, config: springBounce, from: 0, to: 1 });
  const quoteOpacity = interpolate(frame, [340, 380], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const fadeOut = interpolate(frame, [585, 600], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: palette.bg,
      display: 'flex',
      opacity: fadeOut,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ants background */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.15, zIndex: 0, pointerEvents: 'none' }}>
        <AntAnimation width={1920} height={1080} count={4} />
      </div>

      {/* Left column: text */}
      <div style={{
        width: 520, background: 'rgba(255,255,255,0.70)', borderRight: `1px solid ${palette.divider}`,
        padding: '60px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: palette.textMuted, letterSpacing: 3,
          textTransform: 'uppercase', fontFamily, marginBottom: 18,
          opacity: headlineProgress,
        }}>
          Two tools. Two moments.
        </div>

        <div style={{
          fontSize: 56, fontWeight: 900, color: palette.textPrimary, letterSpacing: -2,
          lineHeight: 1.05, fontFamily,
          opacity: headlineProgress,
          transform: `translateY(${(1 - headlineProgress) * 16}px)`,
        }}>
          Before we<br />start the <span style={{ color: palette.blue }}>clock</span>
        </div>

        <div style={{
          height: 4, background: palette.blue, borderRadius: 2,
          marginTop: 16, width: `${lineWidth * 280}px`,
          boxShadow: `0 0 10px ${palette.blue}60`,
        }} />

        <div style={{
          fontSize: 18, fontWeight: 400, color: palette.textMuted,
          lineHeight: 1.7, fontFamily, marginTop: 24,
          opacity: interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          The real advantage isn't measured in seconds.<br />
          It's measured in <strong style={{ color: palette.textSecondary }}>when</strong> the deal is actually closed.
        </div>

        {/* Green paradigm shift box */}
        <div style={{
          background: '#F0FFF4', borderRadius: 14, padding: '18px 20px',
          border: '1px solid #BBF7D0', marginTop: 32,
          opacity: boxProgress, transform: `translateY(${(1 - boxProgress) * 12}px) scale(${0.97 + boxProgress * 0.03})`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#16A34A', letterSpacing: 2, textTransform: 'uppercase', fontFamily, marginBottom: 6 }}>
            The paradigm shift
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.textPrimary, fontFamily, lineHeight: 1.45 }}>
            The difference isn't speed.<br />
            It's <em>when the deal was closed.</em>
          </div>
        </div>
      </div>

      {/* Right column: timelines */}
      <div style={{ flex: 1, padding: '60px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40, position: 'relative', zIndex: 1 }}>
        <WorkflowTimeline
          title="Archibald ERP — Traditional workflow"
          steps={erpSteps}
          color={palette.textMuted}
          delay={20}
        />

        <div style={{ height: 1, background: palette.divider, opacity: dividerOpacity }} />

        <WorkflowTimeline
          title="Formicanera — Field-first workflow"
          steps={pwaSteps}
          color={palette.blue}
          delay={80}
        />

        <div style={{
          fontSize: 18, fontWeight: 500, color: palette.textMuted, fontFamily,
          fontStyle: 'italic', opacity: quoteOpacity, marginTop: 8,
          paddingLeft: 16, borderLeft: `3px solid ${palette.divider}`,
        }}>
          "The submission to ERP? In the car. At the office.<br />Before bed. Whenever — automatically."
        </div>
      </div>
    </div>
  );
}
