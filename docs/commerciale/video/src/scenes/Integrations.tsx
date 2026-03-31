// src/scenes/Integrations.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { IntegrationHub } from '../components/IntegrationHub';

const INTEGRATIONS = [
  { name: 'WhatsApp', icon: '📱', color: '#25D366', x: -160, y: -120 },
  { name: 'Gmail',    icon: '📧', color: '#EA4335', x:  160, y: -120 },
  { name: 'Dropbox',  icon: '☁️', color: '#0061FF', x: -160, y:  120 },
  { name: 'Google',   icon: '🔵', color: '#4285F4', x:  160, y:  120 },
];

const WA_DEMO    = 120;
const GMAIL_DEMO = 240;
const CLOUD_DEMO = 340;
const HUB_FINAL  = 440;

export function Integrations() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.integrations;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const spotlightIndex =
    frame >= HUB_FINAL  ? null :
    frame >= CLOUD_DEMO ? 2    :
    frame >= GMAIL_DEMO ? 1    :
    frame >= WA_DEMO    ? 0    :
    null;

  const waDemoOpacity    = interpolate(frame, [WA_DEMO, WA_DEMO + 20],         [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const gmailDemoOpacity = interpolate(frame, [GMAIL_DEMO, GMAIL_DEMO + 20],   [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cloudDemoOpacity = interpolate(frame, [CLOUD_DEMO, CLOUD_DEMO + 20],   [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const hubFinalOpacity  = interpolate(frame, [HUB_FINAL, HUB_FINAL + 20],     [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 80px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🔗 Integrazioni
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Formicanera al centro di tutti i tuoi strumenti
        </div>
      </div>

      <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
        <IntegrationHub
          integrations={INTEGRATIONS}
          centerIcon="🐜"
          delay={0}
          spotlightIndex={spotlightIndex}
        />

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {frame >= WA_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #25D366`,
              opacity: spotlightIndex !== 0 && frame < HUB_FINAL ? 0.3 : waDemoOpacity,
              transform: `translateX(${(1 - waDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#25D366', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                📱 WhatsApp
              </div>
              <div style={{ background: '#25D36615', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                <span style={{ fontWeight: 700 }}>Formicanera:</span> Ordine #4821 confermato ✓
                <br />
                <span style={{ color: palette.textMuted }}>📎 DDT-2026-00312.pdf allegato</span>
              </div>
              <div style={{ fontSize: 12, color: '#25D366', fontFamily: 'Inter, sans-serif', marginTop: 6, fontWeight: 600 }}>
                Condividi ordini e documenti →
              </div>
            </div>
          )}

          {frame >= GMAIL_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #EA4335`,
              opacity: spotlightIndex !== 1 && frame < HUB_FINAL ? 0.3 : gmailDemoOpacity,
              transform: `translateX(${(1 - gmailDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#EA4335', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                📧 Gmail
              </div>
              <div style={{ fontSize: 13, color: palette.textSecondary, fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontWeight: 600, color: palette.textPrimary }}>Preventivo PRV-2026-0142</div>
                <div>A: bianchi@studiodent.it</div>
                <div style={{ color: palette.green, marginTop: 4 }}>✓ Inviato</div>
              </div>
            </div>
          )}

          {frame >= CLOUD_DEMO && (
            <div style={{
              background: palette.bgCard, borderRadius: 16, padding: 16,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderLeft: `3px solid #0061FF`,
              opacity: cloudDemoOpacity,
              transform: `translateX(${(1 - cloudDemoOpacity) * 20}px)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0061FF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, sans-serif' }}>
                ☁️ Dropbox + Google Drive
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>DDT-2026-00312.pdf</div>
                  <div style={{ height: 4, background: palette.divider, borderRadius: 100, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${interpolate(frame, [CLOUD_DEMO, CLOUD_DEMO + 60], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`,
                      background: '#0061FF', borderRadius: 100,
                    }} />
                  </div>
                </div>
                {frame >= CLOUD_DEMO + 60 && (
                  <span style={{ color: palette.green, fontSize: 18 }}>✓</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#0061FF', fontFamily: 'Inter, sans-serif', marginTop: 6, fontWeight: 600 }}>
                Archiviazione automatica documenti →
              </div>
            </div>
          )}

          {frame >= HUB_FINAL && (
            <div style={{
              textAlign: 'center', fontSize: 20, fontWeight: 700,
              color: palette.blue, fontFamily: 'Inter, sans-serif',
              opacity: hubFinalOpacity,
            }}>
              Un ecosistema connesso
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
