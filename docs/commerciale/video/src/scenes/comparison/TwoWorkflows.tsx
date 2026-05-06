// src/scenes/comparison/TwoWorkflows.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, easingApple } from '../../lib/springs';
import { palette } from '../../lib/palette';
import { fontFamily } from '../../font';
import { WorkflowTimeline } from '../../components/WorkflowTimeline';

type Props = {
  variant?: 'order' | 'customer-order';
};

const ERP_STEPS_ORDER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '⌨️', label: 'Enter order 4:22' },
  { icon: '✓',  label: 'ERP', highlight: true as const },
];

const PWA_STEPS_ORDER = [
  { icon: '☎️', label: 'Meeting + order 3:15', highlight: true as const },
  { icon: '🚗', label: 'Drive / batch' },
  { icon: '✓',  label: 'ERP in background', highlight: true as const },
];

const ERP_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Client meeting' },
  { icon: '🚗', label: 'Drive back' },
  { icon: '💻', label: 'Open desk' },
  { icon: '👤', label: 'Create customer' },
  { icon: '⌨️', label: 'Enter order' },
  { icon: '✓',  label: 'ERP', highlight: true as const },
];

const PWA_STEPS_CUSTOMER = [
  { icon: '☎️', label: 'Meeting + customer + order', highlight: true as const },
  { icon: '🚗', label: 'Drive' },
  { icon: '✓',  label: 'ERP in background', highlight: true as const },
];

export function TwoWorkflows({ variant = 'order' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const erpSteps = variant === 'order' ? ERP_STEPS_ORDER : ERP_STEPS_CUSTOMER;
  const pwaSteps = variant === 'order' ? PWA_STEPS_ORDER : PWA_STEPS_CUSTOMER;

  const headlineProgress = spring({ frame: Math.max(0, frame - 10), fps, config: springCard, from: 0, to: 1 });

  const subtitleOpacity = interpolate(frame, [220, 260], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const fadeOut = interpolate(frame, [345, 360], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: palette.bgDark,
      display: 'flex',
      flexDirection: 'column',
      padding: '60px 120px',
      gap: 48,
      opacity: fadeOut,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 32,
        fontWeight: 800,
        color: palette.textWhite,
        fontFamily,
        letterSpacing: -0.5,
        opacity: headlineProgress,
        transform: `translateY(${(1 - headlineProgress) * 12}px)`,
      }}>
        Before we start the clock —{' '}
        <span style={{ color: palette.blue }}>two different workflows.</span>
      </div>

      <WorkflowTimeline
        title="Archibald ERP"
        steps={erpSteps}
        color={palette.textMuted}
        delay={20}
      />

      <div style={{
        height: 1,
        background: palette.dividerDark,
        opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }} />

      <WorkflowTimeline
        title="Formicanera"
        steps={pwaSteps}
        color={palette.blue}
        delay={80}
      />

      <div style={{
        fontSize: 18,
        fontWeight: 400,
        color: palette.textWhiteDim,
        fontFamily,
        fontStyle: 'italic',
        opacity: subtitleOpacity,
      }}>
        "The clock matters. But so does when it starts."
      </div>
    </div>
  );
}
