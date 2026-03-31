// src/components/NotifCard.tsx
import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  icon: string;
  title?: string;
  /** @deprecated use title instead */
  text?: string;
  body?: string;
  time: string;
  accentColor: string;
  delay?: number;
  stackOffset?: number;
  highlight?: boolean;
};

export function NotifCard({
  icon,
  title,
  text,
  body = '',
  time,
  accentColor,
  delay = 0,
  stackOffset = 0,
  highlight = false,
}: Props) {
  const resolvedTitle = title ?? text ?? '';
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  const highlightDelay = delay + 40;
  const highlightCycle = Math.max(0, frame - highlightDelay);
  const pulseOpacity = highlight && highlightCycle < 90
    ? 0.08 + Math.sin((highlightCycle / 10) * Math.PI) * 0.08
    : 0;

  return (
    <div
      style={{
        background: palette.bgCard,
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        boxShadow: `0 4px 20px rgba(0,0,0,0.07)`,
        borderLeft: `4px solid ${accentColor}`,
        opacity: progress,
        transform: `
          translateY(${(1 - progress) * -40 + stackOffset}px)
          scale(${0.95 + progress * 0.05})
        `,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {highlight && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: accentColor,
            opacity: pulseOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 3 }}>
          {resolvedTitle}
        </div>
        <div style={{ fontSize: 14, color: palette.textSecondary, fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>
          {body}
        </div>
      </div>
      <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif', flexShrink: 0, marginTop: 2 }}>
        {time}
      </div>
    </div>
  );
}
