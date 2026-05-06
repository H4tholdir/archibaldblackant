// src/components/CalloutBubble.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';

type Props = {
  label: string;
  side: 'left' | 'right';
  accentColor?: string;
  showAtFrame: number;
  hideAtFrame?: number;
  verticalPosition?: number;
};

export function CalloutBubble({
  label,
  side,
  accentColor,
  showAtFrame,
  hideAtFrame,
  verticalPosition = 0.5,
}: Props) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const color = accentColor ?? (side === 'left' ? palette.orange : palette.green);
  const relFrame = Math.max(0, frame - showAtFrame);
  const isHiding = hideAtFrame !== undefined && frame >= hideAtFrame;

  if (frame < showAtFrame) return null;

  const enterProgress = spring({ frame: relFrame, fps, config: springBounce, from: 0, to: 1 });
  const opacity = isHiding
    ? Math.max(0, 1 - (frame - hideAtFrame) / 10)
    : enterProgress;

  return (
    <div style={{
      position: 'absolute',
      top: height * verticalPosition,
      ...(side === 'left' ? { left: 20 } : { right: 20 }),
      transform: `translateY(-50%) scale(${0.85 + enterProgress * 0.15})`,
      opacity,
      zIndex: 20,
      maxWidth: 340,
    }}>
      <div style={{
        background: palette.bgDark,
        borderLeft: side === 'left' ? `4px solid ${color}` : undefined,
        borderRight: side === 'right' ? `4px solid ${color}` : undefined,
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: `0 4px 20px rgba(0,0,0,0.30), 0 0 12px ${color}30`,
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: palette.textWhite, fontFamily, lineHeight: 1.4 }}>
          {label}
        </div>
        <div style={{ width: 32, height: 3, borderRadius: 2, background: color, marginTop: 8 }} />
      </div>
    </div>
  );
}
