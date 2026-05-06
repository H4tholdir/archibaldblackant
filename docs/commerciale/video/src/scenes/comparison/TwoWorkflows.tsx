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
  { icon: '⌨️', label: 'Enter order 4:03' },
  { icon: '✓', label: 'ERP', highlight: true as const },
];

const PWA_STEPS_ORDER = [
  { icon: '☎️', label: 'Meeting + order 1:15', highlight: true as const },
  { icon: '🚗', label: 'Drive / batch / home', highlight: true as const },
  { icon: '✓', label: 'ERP — background', highlight: true as const },
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
  { icon: '✓', label: 'ERP — background', highlight: true as const },
];

export function TwoWorkflows({ variant = 'order' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const erpSteps = variant === 'order' ? ERP_STEPS_ORDER : ERP_STEPS_CUSTOMER;
  const pwaSteps = variant === 'order' ? PWA_STEPS_ORDER : PWA_STEPS_CUSTOMER;

  const eyebrowOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headlineProgress = spring({ frame: Math.max(0, frame - 10), fps, config: springText, from: 0, to: 1 });
  const lineWidth = interpolate(frame, [20, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const paraOpacity = interpolate(frame, [50, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dividerOpacity = interpolate(frame, [90, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const boxProgress = spring({ frame: Math.max(0, frame - 360), fps, config: springBounce, from: 0, to: 1 });
  const fadeOut = interpolate(frame, [585, 600], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '50px 120px',
      gap: 32,
      opacity: fadeOut,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Ants background */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.15, zIndex: 0, pointerEvents: 'none' }}>
        <AntAnimation width={1920} height={1080} count={4} />
      </div>

      {/* Eyebrow */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: palette.textMuted, letterSpacing: 3,
        textTransform: 'uppercase', fontFamily, textAlign: 'center',
        opacity: eyebrowOpacity, position: 'relative', zIndex: 1,
      }}>
        Two tools. Two moments.
      </div>

      {/* Headline */}
      <div style={{
        fontSize: 68, fontWeight: 900, color: palette.textPrimary, letterSpacing: -2.5,
        lineHeight: 1.05, fontFamily, textAlign: 'center',
        opacity: headlineProgress, transform: `translateY(${(1 - headlineProgress) * 20}px)`,
        position: 'relative', zIndex: 1,
      }}>
        Before we start the <span style={{ color: palette.blue }}>clock</span>
      </div>

      {/* Underline */}
      <div style={{
        height: 5, background: palette.blue, borderRadius: 3,
        width: `${lineWidth * 320}px`, boxShadow: `0 0 14px ${palette.blue}60`,
        position: 'relative', zIndex: 1, marginTop: -16,
      }} />

      {/* Paragrapho */}
      <div style={{
        fontSize: 20, fontWeight: 400, color: palette.textSecondary,
        lineHeight: 1.7, fontFamily, textAlign: 'center', maxWidth: 880,
        opacity: paraOpacity, position: 'relative', zIndex: 1,
      }}>
        The real advantage isn't measured in seconds.<br />
        It's measured in <strong style={{ color: palette.textPrimary }}>when</strong> the deal is actually closed — and <strong style={{ color: palette.textPrimary }}>when</strong> the submission happens.
      </div>

      {/* Divider */}
      <div style={{
        height: 1, background: palette.divider, width: '100%',
        opacity: dividerOpacity, position: 'relative', zIndex: 1,
      }} />

      {/* Timelines side by side */}
      <div style={{
        display: 'flex', gap: 80, alignItems: 'flex-start', width: '100%',
        justifyContent: 'center', position: 'relative', zIndex: 1,
      }}>
        <div style={{ flex: 1, maxWidth: 700 }}>
          <WorkflowTimeline
            title="Archibald ERP — Traditional"
            steps={erpSteps}
            color={palette.textMuted}
            delay={100}
            theme="light"
            stepSize={80}
          />
        </div>
        <div style={{ width: 1, background: palette.divider, alignSelf: 'stretch', opacity: dividerOpacity }} />
        <div style={{ flex: 1, maxWidth: 700 }}>
          <WorkflowTimeline
            title="Formicanera — Field-first"
            steps={pwaSteps}
            color={palette.blue}
            delay={160}
            theme="light"
            stepSize={80}
          />
        </div>
      </div>

      {/* Green paradigm box */}
      <div style={{
        background: '#F0FFF4', borderRadius: 16, padding: '20px 40px',
        border: '1px solid #BBF7D0', width: '100%', maxWidth: 900,
        opacity: boxProgress, transform: `translateY(${(1 - boxProgress) * 14}px) scale(${0.97 + boxProgress * 0.03})`,
        position: 'relative', zIndex: 1, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#16A34A', letterSpacing: 2, textTransform: 'uppercase', fontFamily, marginBottom: 8 }}>
          The paradigm shift
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: palette.textPrimary, fontFamily, lineHeight: 1.5 }}>
          "The submission to ERP? In the car. At the office. Before bed.<br />
          <em>Whenever — completely in the background.</em>"
        </div>
      </div>
    </div>
  );
}
