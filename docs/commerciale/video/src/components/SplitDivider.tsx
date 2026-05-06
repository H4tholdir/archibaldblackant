// src/components/SplitDivider.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  leftLabel?: string;
  rightLabel?: string;
  delay?: number;
};

export function SplitDivider({
  leftLabel = 'Archibald ERP',
  rightLabel = 'Formicanera',
  delay = 0,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: 0,
      bottom: 0,
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: 2,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <div style={{
        width: 2,
        flex: 1,
        background: `linear-gradient(to bottom, transparent, ${palette.divider} 15%, ${palette.divider} 85%, transparent)`,
        opacity: progress,
      }} />
      <div style={{
        position: 'absolute',
        top: 40,
        right: 16,
        fontSize: 13,
        fontWeight: 600,
        color: palette.textMuted,
        fontFamily,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: progress,
        whiteSpace: 'nowrap',
      }}>
        {leftLabel}
      </div>
      <div style={{
        position: 'absolute',
        top: 40,
        left: 16,
        fontSize: 13,
        fontWeight: 700,
        color: palette.blue,
        fontFamily,
        letterSpacing: 1,
        textTransform: 'uppercase',
        opacity: progress,
        whiteSpace: 'nowrap',
      }}>
        {rightLabel}
      </div>
    </div>
  );
}
