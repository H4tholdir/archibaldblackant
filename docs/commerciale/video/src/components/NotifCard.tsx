import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  icon: string;
  text: string;
  time: string;
  accentColor: string;
  delay?: number;
};

export function NotifCard({ icon, text, time, accentColor, delay = 0 }: Props) {
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
    <div
      style={{
        background: palette.card,
        borderRadius: 20,
        padding: '18px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        borderLeft: `5px solid ${accentColor}`,
        opacity: progress,
        transform: `translateY(${(1 - progress) * -30}px)`,
      }}
    >
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          {text}
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
          {time}
        </div>
      </div>
    </div>
  );
}
