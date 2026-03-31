// src/components/SearchBar.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';

type Props = {
  query: string;
  typingStartFrame: number;
  framesPerChar?: number;
  delay?: number;
  resultCount?: number;
  resultLabel?: string;
};

export function SearchBar({
  query,
  typingStartFrame,
  framesPerChar = 6,
  delay = 0,
  resultCount,
  resultLabel,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: springCard,
    from: 0,
    to: 1,
  });

  const charsVisible = Math.floor(
    Math.max(0, (frame - typingStartFrame) / framesPerChar)
  );
  const displayText = query.slice(0, charsVisible);
  const showCursor = charsVisible < query.length;

  const showResults = resultCount !== undefined && charsVisible >= query.length;
  const resultsOpacity = interpolate(
    frame - typingStartFrame - query.length * framesPerChar,
    [0, 20],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        width: '100%',
        opacity: entryProgress,
        transform: `translateY(${(1 - entryProgress) * 20}px) scale(${0.95 + entryProgress * 0.05})`,
      }}
    >
      <div
        style={{
          background: palette.bgCard,
          borderRadius: 16,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          border: `1.5px solid ${palette.blue}40`,
        }}
      >
        <span style={{ fontSize: 22, opacity: 0.5 }}>🔍</span>
        <span
          style={{
            fontSize: 20,
            fontFamily: 'Inter, sans-serif',
            color: palette.textPrimary,
            fontWeight: 500,
            flex: 1,
          }}
        >
          {displayText}
          {showCursor && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: palette.blue,
                marginLeft: 2,
                verticalAlign: 'middle',
                opacity: Math.sin((frame / 15) * Math.PI) > 0 ? 1 : 0,
              }}
            />
          )}
        </span>
        {showResults && (
          <span
            style={{
              fontSize: 14,
              color: palette.textMuted,
              opacity: resultsOpacity,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {resultCount} risultati
          </span>
        )}
      </div>
    </div>
  );
}
