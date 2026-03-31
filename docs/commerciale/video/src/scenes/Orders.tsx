import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard } from '../lib/springs';
import { palette } from '../lib/palette';
import { FrostedCard } from '../components/FrostedCard';
import { SCENE_DURATION } from '../lib/timing';

export function Orders() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.orders;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const statProgress = spring({ frame: Math.max(0, frame - 40), fps, config: springCard, from: 0, to: 1 });
  const botProgress = spring({ frame: Math.max(0, frame - 60), fps, config: springCard, from: 0, to: 1 });
  const subOpacity = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const botStep2Done = frame > 120;
  const botStep3Active = frame > 150;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 60,
        opacity: fadeOut,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Order card sinistra */}
      <FrostedCard delay={0} rotateY={-8} rotateX={3} width={340} padding={32}>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
          Ordine #4821
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: palette.textPrimary, marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
          Studio Dr. Bianchi
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
          € 1.240,00
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: `${palette.green}20`,
            borderRadius: 40,
            padding: '8px 20px',
            fontSize: 20,
            fontWeight: 700,
            color: palette.green,
            marginTop: 20,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          ✓ Inviato a Verona
        </div>
      </FrostedCard>

      {/* Stat centrale */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          opacity: statProgress,
          transform: `scale(${statProgress})`,
        }}
      >
        <div
          style={{
            background: palette.blue,
            color: '#fff',
            borderRadius: 40,
            padding: '14px 40px',
            fontSize: 48,
            fontWeight: 900,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          3 min
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, opacity: subOpacity, fontFamily: 'Inter, sans-serif' }}>
          vs 20 min con Archibald
        </div>
      </div>

      {/* Bot status card destra */}
      <div
        style={{
          background: palette.darkBg,
          borderRadius: 24,
          padding: 32,
          width: 300,
          opacity: botProgress,
          transform: `translateX(${(1 - botProgress) * 40}px)`,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 24, fontFamily: 'Inter, sans-serif' }}>
          Bot Archibald
        </div>
        {[
          { label: 'Login Archibald', done: true },
          { label: 'Inserimento dati', done: botStep2Done },
          { label: 'Conferma a Verona', done: false, active: botStep3Active },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step.done ? palette.green : step.active ? palette.blue : palette.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {step.done ? '✓' : ''}
            </div>
            <div style={{ fontSize: 22, color: '#FFFFFF', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
              {step.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
