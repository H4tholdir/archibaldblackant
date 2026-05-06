// src/components/SplitDivider.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  delay?: number;
};

export function SplitDivider({ delay = 0 }: Props) {
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
    </div>
  );
}
