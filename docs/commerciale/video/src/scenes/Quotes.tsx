// src/scenes/Quotes.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { BadgeGreen } from '../components/BadgeGreen';
import { SceneCaption } from '../components/SceneCaption';

const TAP_FRAME       = 80;
const BUILD_START     = 100;
const BUILD_END       = 200;
const PREVIEW_FRAME   = 210;
const SHARE_FRAME     = 250;
const TOAST_FRAME     = 340;

const PDF_LINES = [
  { label: 'Fresa conica Ø1.2',      qty: 4,  price: '€ 45,00',   subtotal: '€ 180,00' },
  { label: 'Kit impianto standard',   qty: 1,  price: '€ 320,00',  subtotal: '€ 320,00' },
  { label: 'Fresa cilindrica Ø2',    qty: 2,  price: '€ 48,00',   subtotal: '€ 96,00'  },
];

const SHARE_OPTIONS = [
  { icon: '📱', label: 'WhatsApp',   color: '#25D366' },
  { icon: '📧', label: 'Gmail',      color: '#EA4335' },
  { icon: '☁️', label: 'Dropbox',   color: '#0061FF' },
  { icon: '🔗', label: 'Copia link', color: palette.purple },
];

export function Quotes() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.quotes;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const tapScale = frame >= TAP_FRAME && frame < TAP_FRAME + 12
    ? interpolate(frame, [TAP_FRAME, TAP_FRAME + 6, TAP_FRAME + 12], [1, 0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  const linesVisible = Math.floor(
    interpolate(frame, [BUILD_START, BUILD_END], [0, PDF_LINES.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const totalProgress = interpolate(frame, [BUILD_END - 20, BUILD_END], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const previewProgress = spring({ frame: Math.max(0, frame - PREVIEW_FRAME), fps, config: springCard, from: 0, to: 1 });
  const sheetProgress = spring({ frame: Math.max(0, frame - SHARE_FRAME), fps, config: springCard, from: 0, to: 1 });
  const toastProgress = frame >= TOAST_FRAME
    ? spring({ frame: frame - TOAST_FRAME, fps, config: springBounce, from: 0, to: 1 })
    : 0;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, opacity: fadeOut, padding: '0 140px',
      position: 'relative',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📄 Preventivi con un Click
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Da qualsiasi ordine storico, un PDF professionale in meno di 3 secondi
        </div>
      </div>

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', width: '100%', maxWidth: 900 }}>
        {/* Ordine sorgente */}
        <div style={{ flex: '0 0 300px' }}>
          <div style={{
            background: palette.bgCard, borderRadius: 20, padding: 24,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>
              Ordine #4821
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: palette.textPrimary, marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
              Studio Dr. Bianchi
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 20 }}>
              € 1.240,00
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Modifica', 'Copia ordine'].map((label, i) => (
                <div key={i} style={{
                  background: palette.bg, borderRadius: 10, padding: '10px 16px',
                  fontSize: 14, fontWeight: 600, color: palette.textMuted,
                  fontFamily: 'Inter, sans-serif', textAlign: 'center',
                }}>
                  {label}
                </div>
              ))}
              <div style={{
                background: palette.blue, borderRadius: 10, padding: '12px 16px',
                fontSize: 15, fontWeight: 700, color: '#fff',
                fontFamily: 'Inter, sans-serif', textAlign: 'center',
                transform: `scale(${tapScale})`,
                boxShadow: `0 0 20px ${palette.blue}50`,
              }}>
                📄 Preventivo →
              </div>
            </div>
          </div>
        </div>

        {/* PDF + preview + share */}
        <div style={{ flex: 1 }}>
          {frame >= BUILD_START && frame < PREVIEW_FRAME && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 24,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)', minHeight: 280,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${palette.divider}` }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>Formicanera</div>
                  <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>Preventivo commerciale</div>
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', textAlign: 'right' }}>
                  <div>N° PRV-2026-0142</div>
                  <div>31/03/2026</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                Destinatario: <strong style={{ color: palette.textPrimary }}>Studio Dr. Bianchi</strong>
              </div>
              {PDF_LINES.slice(0, linesVisible).map((line, i) => {
                const lineP = interpolate(frame, [BUILD_START + i * 30, BUILD_START + i * 30 + 20], [0, 1], {
                  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                });
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: `1px solid ${palette.divider}`,
                    opacity: lineP, transform: `translateY(${(1 - lineP) * 8}px)`,
                  }}>
                    <span style={{ fontSize: 13, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', flex: 2 }}>{line.label}</span>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'center' }}>{line.qty} pz</span>
                    <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'center' }}>{line.price}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', flex: 1, textAlign: 'right' }}>{line.subtotal}</span>
                  </div>
                );
              })}
              {totalProgress > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, opacity: totalProgress }}>
                  <div style={{
                    background: palette.blue, color: '#fff',
                    borderRadius: 8, padding: '8px 16px',
                    fontSize: 16, fontWeight: 900, fontFamily: 'Inter, sans-serif',
                  }}>
                    Totale: € 596,00
                  </div>
                </div>
              )}
            </div>
          )}

          {frame >= PREVIEW_FRAME && (
            <div style={{
              opacity: previewProgress,
              transform: `translateY(${(1 - previewProgress) * 20}px) scale(${0.95 + previewProgress * 0.05})`,
            }}>
              <div style={{
                background: palette.bgCard, borderRadius: 16, padding: 20,
                boxShadow: '0 8px 40px rgba(0,0,0,0.12)', marginBottom: 16,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
                  📄 PRV-2026-0142.pdf
                </div>
                <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                  Studio Dr. Bianchi · € 596,00 · 31/03/2026
                </div>
              </div>
              <BadgeGreen label="PDF generato in 2.1 secondi" delay={PREVIEW_FRAME} />
            </div>
          )}

          {frame >= SHARE_FRAME && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 8px 40px rgba(0,0,0,0.10)', marginTop: 16,
              opacity: sheetProgress,
              transform: `translateY(${(1 - sheetProgress) * 20}px)`,
            }}>
              <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 12, fontWeight: 600 }}>
                Condividi tramite
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {SHARE_OPTIONS.map((opt, i) => {
                  const optP = spring({
                    frame: Math.max(0, frame - SHARE_FRAME - i * 12),
                    fps, config: springBounce, from: 0, to: 1,
                  });
                  return (
                    <div key={i} style={{
                      flex: 1, background: `${opt.color}15`,
                      borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                      opacity: optP, transform: `scale(${optP})`,
                    }}>
                      <div style={{ fontSize: 22 }}>{opt.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: opt.color, fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                        {opt.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {frame >= TOAST_FRAME && (
        <div style={{
          position: 'absolute', bottom: 40, right: 60,
          background: palette.bgDark, color: '#fff',
          borderRadius: 14, padding: '12px 20px',
          fontSize: 15, fontWeight: 600, fontFamily: 'Inter, sans-serif',
          display: 'flex', alignItems: 'center', gap: 10,
          transform: `scale(${toastProgress}) translateY(${(1 - toastProgress) * 20}px)`,
          opacity: toastProgress,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}>
          <span style={{ color: palette.green }}>✓</span> Condiviso via WhatsApp
        </div>
      )}

      <SceneCaption
        main="Preventivo professionale in 3 secondi · Da condividere durante la visita"
        vs="vs ERP: nessuna funzione preventivi — Word, calcolo manuale, email"
        delay={30}
        color="#34C759"
      />
    </div>
  );
}
