import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { BotTimeline } from '../components/BotTimeline';
import { SCENE_DURATION } from '../lib/timing';

const BOT_STEPS = [
  { label: 'Apertura Archibald', sub: 'Login completato' },
  { label: 'Inserimento ordine', sub: '24 articoli · € 1.240,00' },
  { label: 'Conferma a Verona', sub: 'In elaborazione...' },
];

export function Bot() {
  const frame = useCurrentFrame();
  const dur = SCENE_DURATION.bot;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.darkBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: palette.textMuted,
          letterSpacing: 4,
          textTransform: 'uppercase',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Invio automatico in corso
      </div>
      <BotTimeline steps={BOT_STEPS} staggerFrames={40} startFrame={10} />
    </div>
  );
}
