// src/scenes/Documents.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SceneCaption } from '../components/SceneCaption';

const DDT_TAP_FRAME  = 40;
const DDT_DONE_FRAME = 100;
const FAT_TAP_FRAME  = 120;
const FAT_DONE_FRAME = 180;
const TRACKING_FRAME = 185;

const TRACKING_EVENTS = [
  { icon: '✅', text: 'Preso in carico FedEx',   place: 'Napoli',           time: '28/03 14:32', done: true  },
  { icon: '✅', text: 'In transito',              place: 'Roma Smistamento', time: '28/03 22:15', done: true  },
  { icon: '✅', text: 'Partito per destinazione', place: 'Milano',           time: '29/03 03:44', done: true  },
  { icon: '🔵', text: 'In consegna oggi',         place: 'Milano',           time: '29/03 09:20', done: false },
  { icon: '⭕', text: 'Consegnato',               place: '—',                time: '—',           done: false },
];

function DownloadIndicator({ progress, color }: { progress: number; color: string }) {
  const R = 12;
  const C = 2 * Math.PI * R;
  if (progress <= 0) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color }}>
        ↓
      </div>
    );
  }
  if (progress >= 1) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${palette.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: palette.green }}>
        ✓
      </div>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={R} fill="none" stroke={palette.divider} strokeWidth="3" />
      <circle cx="18" cy="18" r={R} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${progress * C} ${C}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" />
    </svg>
  );
}

export function Documents() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.documents;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const leftProgress = spring({ frame, fps, config: springCard, from: 0, to: 1 });
  const trackingProgress = spring({ frame: Math.max(0, frame - TRACKING_FRAME), fps, config: springCard, from: 0, to: 1 });

  const ddtProgress = interpolate(frame, [DDT_TAP_FRAME, DDT_DONE_FRAME], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
  const fatProgress = interpolate(frame, [FAT_TAP_FRAME, FAT_DONE_FRAME], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  const lineProgress = interpolate(frame, [TRACKING_FRAME + 20, TRACKING_FRAME + 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', gap: 40, opacity: fadeOut, padding: '48px 80px',
      position: 'relative',
    }}>

      {/* Pannello sinistro — documenti */}
      <div style={{
        flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: 20,
        opacity: leftProgress, transform: `translateX(${(1 - leftProgress) * -40}px)`,
      }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            📁 DDT e Fatture
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Un tap → download immediato · in-app
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            background: `${palette.green}15`, borderRadius: 20, padding: '5px 14px',
            fontSize: 13, fontWeight: 700, color: palette.green, fontFamily: 'Inter, sans-serif',
            opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            ✨ Nessun accesso all&apos;ERP richiesto
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
            Ordine #4821 — Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
            28/03/2026 · € 1.240,00
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>
            Documenti di Trasporto (DDT)
          </div>

          {[
            { label: 'DDT-2026-00312', date: '28/03/2026', amount: '€ 1.240,00', progress: ddtProgress, color: palette.blue },
            { label: 'DDT-2026-00298', date: '21/03/2026', amount: '€ 890,00',   progress: 0,           color: palette.blue },
          ].map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${palette.divider}`,
            }}>
              <span style={{ fontSize: 24 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>{doc.label}</div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>{doc.date} · {doc.amount}</div>
              </div>
              <DownloadIndicator progress={doc.progress} color={doc.color} />
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16, marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>
            Fatture
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
            <span style={{ fontSize: 24 }}>🧾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>FAT-2026-00187</div>
              <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>31/03/2026 · € 1.512,80</div>
            </div>
            <DownloadIndicator progress={fatProgress} color={palette.green} />
          </div>
        </div>
      </div>

      {/* Pannello destro — tracking FedEx */}
      <div style={{
        flex: 1,
        opacity: trackingProgress,
        transform: `translateX(${(1 - trackingProgress) * 50}px)`,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            🚚 Tracking FedEx
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Integrato nella scheda ordine · aggiornato in tempo reale
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
            background: `${palette.orange}15`, borderRadius: 20, padding: '5px 14px',
            fontSize: 13, fontWeight: 700, color: palette.orange, fontFamily: 'Inter, sans-serif',
            opacity: trackingProgress,
            boxShadow: `0 0 ${6 + Math.sin((frame / 10) * Math.PI) * 4}px ${palette.orange}40`,
          }}>
            📍 In consegna oggi — Milano
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: palette.textMuted, marginBottom: 20, letterSpacing: 1 }}>
            FedEx · 774899172937
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TRACKING_EVENTS.map((ev, i) => {
              const evDelay = TRACKING_FRAME + 25 + i * 28;
              const evOpacity = interpolate(frame, [evDelay, evDelay + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const evX = interpolate(frame, [evDelay, evDelay + 20], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple });
              const isActive = i === 3;

              return (
                <div key={i} style={{ display: 'flex', gap: 16, opacity: evOpacity, transform: `translateX(${evX}px)` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
                    <div style={{
                      fontSize: 18, flexShrink: 0,
                      transform: `scale(${isActive ? 1 + Math.sin((frame / 8) * Math.PI) * 0.1 : 1})`,
                    }}>
                      {ev.icon}
                    </div>
                    {i < TRACKING_EVENTS.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 24, background: ev.done ? palette.green : palette.divider, marginTop: 3, marginBottom: 3, borderRadius: 2 }}>
                        {ev.done && (
                          <div style={{ height: `${lineProgress * 100}%`, background: palette.green, borderRadius: 2 }} />
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ paddingBottom: i < TRACKING_EVENTS.length - 1 ? 20 : 0 }}>
                    <div style={{ fontSize: 16, fontWeight: ev.done ? 700 : 500, color: ev.done ? palette.textPrimary : palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                      {ev.text}
                    </div>
                    <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      {ev.place} · {ev.time}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SceneCaption
        main="DDT e fatture in un tap · Tracking FedEx integrato nella scheda ordine"
        vs="vs ERP: cerca il documento, scarica, invia manualmente — e per il tracking: telefonate"
        delay={30}
        color="#5856D6"
      />
    </div>
  );
}
