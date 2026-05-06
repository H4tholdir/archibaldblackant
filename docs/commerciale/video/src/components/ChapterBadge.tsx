// src/components/ChapterBadge.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  label: string;
  showAtFrame: number;
  hideAtFrame: number;
};

export function ChapterBadge({ label, showAtFrame, hideAtFrame }: Props) {
  const frame = useCurrentFrame();

  if (frame < showAtFrame || frame > hideAtFrame) return null;

  const duration = hideAtFrame - showAtFrame;
  const fadeIn = Math.min(15, Math.floor(duration * 0.4));
  const fadeOut = Math.min(10, Math.floor(duration * 0.3));

  const opacity = interpolate(
    frame,
    [showAtFrame, showAtFrame + fadeIn, hideAtFrame - fadeOut, hideAtFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 30,
      opacity,
    }}>
      <div style={{
        background: 'rgba(28,28,30,0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: 50,
        padding: '14px 32px',
        border: `1px solid ${palette.dividerDark}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.30)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: palette.textWhite, fontFamily, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
          {label}
        </div>
      </div>
    </div>
  );
}
