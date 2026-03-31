import { useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';

type Props = {
  children: React.ReactNode;
  delay?: number;
  rotateY?: number;
  rotateX?: number;
  width?: number;
  padding?: number;
};

export function FrostedCard({
  children,
  delay = 0,
  rotateY = -8,
  rotateX = 3,
  width = 340,
  padding = 28,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        padding,
        width,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        transform: `
          perspective(1200px)
          rotateY(${rotateY}deg)
          rotateX(${rotateX}deg)
          scale(${progress})
          translateY(${(1 - progress) * 40}px)
        `,
        opacity: progress,
      }}
    >
      {children}
    </div>
  );
}
