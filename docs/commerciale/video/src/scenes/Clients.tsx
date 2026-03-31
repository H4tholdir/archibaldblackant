// src/scenes/Clients.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { BadgeGreen } from '../components/BadgeGreen';

const WIZARD_STEPS = [
  'Dati aziendali',
  'Partita IVA',
  'Indirizzo',
  'Contatti',
  'Pagamento',
  'Revisione',
];

const PIVA_TYPING_START = 180;
const PIVA = '04821760652';
const PIVA_CHARS_PER_FRAME = 6;
const VALIDATION_FRAME = PIVA_TYPING_START + PIVA.length * PIVA_CHARS_PER_FRAME + 10;
const AUTOFILL_FRAME = VALIDATION_FRAME + 40;
const BOT_FRAME = 460;

export function Clients() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.clients;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const isWizard = frame >= 150;

  const cardProgress = spring({ frame, fps, config: springCard, from: 0, to: 1 });
  const wizardProgress = spring({ frame: Math.max(0, frame - 150), fps, config: springCard, from: 0, to: 1 });

  const activeStep = Math.min(
    Math.floor(Math.max(0, (frame - 150) / 55)),
    WIZARD_STEPS.length - 1
  );

  const pivaChars = Math.floor(Math.max(0, (frame - PIVA_TYPING_START) / PIVA_CHARS_PER_FRAME));
  const pivaDisplay = PIVA.slice(0, pivaChars);

  const isValidating = frame >= VALIDATION_FRAME - 10 && frame < AUTOFILL_FRAME;
  const isValidated = frame >= AUTOFILL_FRAME;

  const spinnerAngle = interpolate(frame, [VALIDATION_FRAME, VALIDATION_FRAME + 30], [0, 360], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const botDoneOpacity = interpolate(frame, [BOT_FRAME + 40, BOT_FRAME + 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 120px',
    }}>

      {!isWizard ? (
        <>
          <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 8 }}>
            👤 Schede Clienti Migliorate
          </div>

          <div style={{ display: 'flex', gap: 32, width: '100%' }}>
            {/* Card cliente */}
            <div style={{
              background: palette.bgCard, borderRadius: 20, padding: 28,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
              width: 360, flexShrink: 0,
              opacity: cardProgress,
              transform: `translateX(${(1 - cardProgress) * -50}px)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${palette.blue}, ${palette.purple})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif',
                }}>
                  DB
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                    Studio Dr. Bianchi
                  </div>
                  <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                    Cliente dal 2019
                  </div>
                </div>
              </div>

              {[
                { label: 'P.IVA', value: '04821760652' },
                { label: 'Indirizzo', value: 'Via Roma 12, Napoli' },
                { label: 'Email', value: 'bianchi@studiodent.it' },
                { label: 'Telefono', value: '+39 081 1234567' },
              ].map(({ label, value }, i) => {
                const fieldOpacity = interpolate(frame, [20 + i * 15, 40 + i * 15], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: fieldOpacity,
                  }}>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
                      {value}
                    </span>
                  </div>
                );
              })}

              <div style={{ marginTop: 16 }}>
                <BadgeGreen label="Profilo completo" delay={80} size="sm" />
              </div>
            </div>

            {/* Storico inline */}
            <div style={{
              flex: 1,
              background: palette.bgCard, borderRadius: 20, padding: 24,
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              opacity: interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Inter, sans-serif' }}>
                Storico ordini
              </div>
              {[
                { id: '#4821', amount: '€ 1.240', date: '28 Mar' },
                { id: '#4756', amount: '€ 890',   date: '21 Mar' },
                { id: '#4700', amount: '€ 2.100', date: '14 Mar' },
                { id: '#4651', amount: '€ 445',   date: '07 Mar' },
                { id: '#4580', amount: '€ 1.650', date: '28 Feb' },
              ].map((o, j) => {
                const rowP = spring({ frame: Math.max(0, frame - 40 - j * 12), fps, config: springCard, from: 0, to: 1 });
                return (
                  <div key={j} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: rowP, transform: `translateX(${(1 - rowP) * 10}px)`,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>{o.id}</span>
                    <span style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>{o.date}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>{o.amount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div style={{
          opacity: wizardProgress,
          transform: `translateY(${(1 - wizardProgress) * 30}px)`,
          width: '100%', maxWidth: 620,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
              ✨ Nuovo Cliente — Wizard
            </div>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
            {WIZARD_STEPS.map((s, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 100,
                background: i <= activeStep ? palette.blue : palette.divider,
                transition: 'none',
              }} />
            ))}
          </div>

          <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', textAlign: 'center', marginBottom: 24 }}>
            Step {activeStep + 1} di {WIZARD_STEPS.length} — {WIZARD_STEPS[activeStep]}
          </div>

          <div style={{
            background: palette.bgCard, borderRadius: 20, padding: 28,
            boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textMuted, marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
                Partita IVA
              </div>
              <div style={{
                background: palette.bg, borderRadius: 12, padding: '14px 16px',
                border: `1.5px solid ${isValidated ? palette.green : isValidating ? palette.blue : palette.divider}`,
                fontSize: 20, fontWeight: 600, fontFamily: 'monospace',
                color: palette.textPrimary, letterSpacing: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>{pivaDisplay || '—'}</span>
                {isValidating && (
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `2px solid ${palette.blue}`,
                    borderTopColor: 'transparent',
                    display: 'inline-block',
                    transform: `rotate(${spinnerAngle}deg)`,
                  }} />
                )}
                {isValidated && (
                  <span style={{ color: palette.green, fontSize: 18 }}>✓</span>
                )}
              </div>
            </div>

            {isValidated && (
              <div style={{
                opacity: interpolate(frame, [AUTOFILL_FRAME, AUTOFILL_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}>
                <BadgeGreen label="P.IVA verificata — dati auto-compilati" delay={AUTOFILL_FRAME} size="sm" />
                {[
                  { label: 'Ragione sociale', value: 'Studio Dentistico Dr. Bianchi' },
                  { label: 'C.F.', value: 'BNCMRC80A01F839G' },
                  { label: 'PEC', value: 'bianchi@pec.it' },
                  { label: 'Sede legale', value: 'Via Roma 12, Napoli' },
                ].map(({ label, value }, i) => {
                  const fOpacity = interpolate(frame, [AUTOFILL_FRAME + 10 + i * 12, AUTOFILL_FRAME + 25 + i * 12], [0, 1], {
                    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                  });
                  return (
                    <div key={i} style={{
                      marginTop: 10, opacity: fOpacity,
                      display: 'flex', gap: 12,
                    }}>
                      <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', minWidth: 100 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {frame >= BOT_FRAME && (
              <div style={{
                marginTop: 20,
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: interpolate(frame, [BOT_FRAME, BOT_FRAME + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                {frame < BOT_FRAME + 40 && (
                  <span style={{ fontSize: 16, color: palette.blue, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                    Bot crea il cliente su Archibald...
                  </span>
                )}
                {frame >= BOT_FRAME + 40 && (
                  <span style={{ fontSize: 16, color: palette.green, fontFamily: 'Inter, sans-serif', fontWeight: 700, opacity: botDoneOpacity }}>
                    ✓ Cliente creato su ERP
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
