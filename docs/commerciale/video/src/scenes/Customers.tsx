import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springText } from '../lib/springs';
import { palette } from '../lib/palette';
import { FrostedCard } from '../components/FrostedCard';
import { SCENE_DURATION } from '../lib/timing';

const FIELDS = [
  { label: 'RAGIONE SOCIALE', value: 'Studio Dr. Bianchi' },
  { label: 'PARTITA IVA', value: '04821930652' },
  { label: 'INDIRIZZO', value: 'Via Roma 12, Napoli' },
];

export function Customers() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_DURATION.customers;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badgeProgress = spring({ frame: Math.max(0, frame - 90), fps, config: springCard, from: 0, to: 1 });
  const label1Progress = spring({ frame: Math.max(0, frame - 100), fps, config: springText, from: 0, to: 1 });
  const label2Progress = spring({ frame: Math.max(0, frame - 120), fps, config: springText, from: 0, to: 1 });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 80,
        opacity: fadeOut,
      }}
    >
      <FrostedCard delay={0} rotateY={6} rotateX={-2} width={420} padding={40}>
        <div style={{ fontSize: 18, fontWeight: 700, color: palette.blue, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24, fontFamily: 'Inter, sans-serif' }}>
          Passo 2 di 6 — Anagrafica
        </div>
        {FIELDS.map((f, i) => {
          const fieldOpacity = interpolate(frame, [i * 20, i * 20 + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ background: palette.bg, borderRadius: 12, padding: '12px 16px', marginBottom: 12, opacity: fieldOpacity }}>
              <div style={{ fontSize: 14, color: palette.textMuted, fontWeight: 700, letterSpacing: 1, fontFamily: 'Inter, sans-serif' }}>
                {f.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: palette.textPrimary, marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                {f.value}
              </div>
            </div>
          );
        })}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: `${palette.green}20`,
            color: palette.green,
            borderRadius: 40,
            padding: '10px 24px',
            fontSize: 20,
            fontWeight: 700,
            marginTop: 16,
            transform: `scale(${badgeProgress})`,
            opacity: badgeProgress,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          ✓ P.IVA verificata
        </div>
      </FrostedCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: palette.divider, borderRadius: 12, padding: '14px 24px', fontSize: 22, fontWeight: 700, color: palette.textPrimary, opacity: label1Progress, transform: `translateX(${(1 - label1Progress) * 30}px)`, fontFamily: 'Inter, sans-serif' }}>
          28 campi gestiti
        </div>
        <div style={{ background: `${palette.blue}20`, borderRadius: 12, padding: '14px 24px', fontSize: 22, fontWeight: 700, color: palette.blue, opacity: label2Progress, transform: `translateX(${(1 - label2Progress) * 30}px)`, fontFamily: 'Inter, sans-serif' }}>
          🤖 Bot crea su Archibald
        </div>
      </div>
    </div>
  );
}
