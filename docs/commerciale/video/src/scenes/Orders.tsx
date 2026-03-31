// src/scenes/Orders.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { FrostedCard } from '../components/FrostedCard';
import { DarkCard } from '../components/DarkCard';
import { StatPill } from '../components/StatPill';
import { BadgeGreen } from '../components/BadgeGreen';
import { BotTimeline } from '../components/BotTimeline';

export function Orders() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.orders;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const descOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const erpRefOpacity = interpolate(frame, [280, 310], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const erpRefX = interpolate(frame, [280, 310], [-20, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const erpBarWidth = interpolate(frame, [295, 380], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const botSteps = [
    { label: 'Login su Archibald ERP',    activeAtFrame: 0,   doneAtFrame: 30  },
    { label: 'Inserimento dati ordine',   activeAtFrame: 60,  doneAtFrame: 120 },
    { label: 'Conferma a Verona',         activeAtFrame: 150, doneAtFrame: 240 },
  ];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        opacity: fadeOut,
        padding: '0 80px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 42, fontWeight: 800, color: palette.textPrimary,
          opacity: headerOpacity, fontFamily: 'Inter, sans-serif',
        }}>
          📋 Inserimento Ordini
        </div>
        <div style={{
          fontSize: 22, color: palette.textMuted,
          opacity: descOpacity, fontFamily: 'Inter, sans-serif', marginTop: 8,
        }}>
          L'agente compila dal telefono. Il bot registra su Archibald in automatico.
        </div>
      </div>

      {/* 3 colonne */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 52 }}>

        {/* Colonna sx — Order Card */}
        <FrostedCard delay={0} rotateY={-8} rotateX={3} fromX={-80} width={300} padding={28}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
            Ordine #4821
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: palette.textPrimary, marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
            Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 42, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif', letterSpacing: -1 }}>
            € 1.240,00
          </div>
          <div style={{ marginTop: 14 }}>
            <BadgeGreen label="Inviato a Verona" delay={30} size="sm" />
          </div>
          {/* ERP ref */}
          <div style={{
            marginTop: 16,
            opacity: erpRefOpacity,
            transform: `translateX(${erpRefX}px)`,
          }}>
            <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
              Rif. ERP: STO-2026-4821
            </div>
            <div style={{ height: 4, background: palette.divider, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${erpBarWidth * 100}%`,
                background: palette.blue,
                borderRadius: 2,
              }} />
            </div>
          </div>
        </FrostedCard>

        {/* Colonna centrale — Stat */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <StatPill label="3 min" color={palette.blue} size="lg" delay={40} />
          <div style={{
            fontSize: 18, color: palette.textMuted,
            fontFamily: 'Inter, sans-serif',
            opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            vs 20 min con Archibald
          </div>
        </div>

        {/* Colonna dx — Bot Card */}
        <DarkCard delay={60} fromX={80} width={290} padding={28}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: palette.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20, fontFamily: 'Inter, sans-serif',
          }}>
            Bot Archibald
          </div>
          <BotTimeline steps={botSteps} delay={60} />
        </DarkCard>

      </div>
    </div>
  );
}
