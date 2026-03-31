// src/scenes/Documents.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';

const DDT_TAP_FRAME    = 60;
const DDT_DONE_FRAME   = 120;
const FAT_TAP_FRAME    = 150;
const FAT_DONE_FRAME   = 210;
const TRACKING_FRAME   = 215;

const TRACKING_EVENTS = [
  { icon: '✅', text: 'Preso in carico',          place: 'Napoli',            time: '28/03 14:32', done: true  },
  { icon: '✅', text: 'In transito',               place: 'Roma Smistamento',  time: '28/03 22:15', done: true  },
  { icon: '✅', text: 'Partito per destinazione',  place: 'Milano',            time: '29/03 03:44', done: true  },
  { icon: '🔵', text: 'In consegna',               place: 'Milano',            time: '29/03 09:20', done: false },
  { icon: '⭕', text: 'Consegnato',                place: '—',                 time: '—',           done: false },
];

export function Documents() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.documents;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const trackingProgress = spring({ frame: Math.max(0, frame - TRACKING_FRAME), fps, config: springCard, from: 0, to: 1 });

  const ddtProgress = interpolate(frame, [DDT_TAP_FRAME, DDT_DONE_FRAME], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });
  const fatProgress = interpolate(frame, [FAT_TAP_FRAME, FAT_DONE_FRAME], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const circleR = 12;
  const circleC = 2 * Math.PI * circleR;

  const lineProgress = interpolate(frame, [TRACKING_FRAME + 20, TRACKING_FRAME + 100], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const renderDownloadIndicator = (progress: number, color: string) => {
    if (progress > 0 && progress < 1) {
      return (
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r={circleR} fill="none" stroke={palette.divider} strokeWidth="2.5" />
          <circle
            cx="16" cy="16" r={circleR}
            fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={`${progress * circleC} ${circleC}`}
            strokeLinecap="round"
            transform="rotate(-90 16 16)"
          />
        </svg>
      );
    }
    if (progress >= 1) {
      return (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${palette.green}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: palette.green }}>✓</div>
      );
    }
    return (
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color }}>↓</div>
    );
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', gap: 40, opacity: fadeOut, padding: '48px 80px',
    }}>
      {/* Pannello sinistro — documenti */}
      <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            📁 Documenti
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            DDT e fatture in un tap — download immediato
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>
            Ordine #4821 — Studio Dr. Bianchi
          </div>
          <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
            28/03/2026 · € 1.240,00
          </div>

          {[
            { label: 'DDT-2026-00312', date: '28/03/2026', amount: '€ 1.240,00', progress: ddtProgress, color: palette.blue },
            { label: 'DDT-2026-00298', date: '21/03/2026', amount: '€ 890,00',   progress: 0,           color: palette.blue },
          ].map((doc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${palette.divider}`,
            }}>
              <span style={{ fontSize: 22 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                  {doc.label}
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                  {doc.date} · {doc.amount}
                </div>
              </div>
              <div style={{ position: 'relative', width: 32, height: 32 }}>
                {renderDownloadIndicator(doc.progress, doc.color)}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
            <span style={{ fontSize: 22 }}>🧾</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                FAT-2026-00187
              </div>
              <div style={{ fontSize: 12, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                31/03/2026 · € 1.512,80
              </div>
            </div>
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              {renderDownloadIndicator(fatProgress, palette.green)}
            </div>
          </div>
        </div>
      </div>

      {/* Pannello destro — tracking */}
      <div style={{
        flex: 1,
        opacity: trackingProgress,
        transform: `translateX(${(1 - trackingProgress) * 40}px)`,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
            🚚 Tracking FedEx
          </div>
          <div style={{ fontSize: 16, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
            Aggiornato automaticamente · in-app
          </div>
        </div>

        <div style={{ background: palette.bgCard, borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', flex: 1 }}>
          <div style={{ fontSize: 13, fontFamily: 'monospace', color: palette.textMuted, marginBottom: 20 }}>
            774899172937
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: `${palette.orange}15`, borderRadius: 20, padding: '6px 14px',
            fontSize: 14, fontWeight: 700, color: palette.orange,
            fontFamily: 'Inter, sans-serif', marginBottom: 20,
            boxShadow: `0 0 ${6 + Math.sin((frame / 10) * Math.PI) * 4}px ${palette.orange}40`,
          }}>
            📍 In consegna oggi
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TRACKING_EVENTS.map((ev, i) => {
              const evDelay = TRACKING_FRAME + 30 + i * 25;
              const evOpacity = interpolate(frame, [evDelay, evDelay + 20], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              });
              const evX = interpolate(frame, [evDelay, evDelay + 20], [10, 0], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
              });
              const isActive = i === 3;

              return (
                <div key={i} style={{ display: 'flex', gap: 14, opacity: evOpacity, transform: `translateX(${evX}px)` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div style={{
                      fontSize: 16, flexShrink: 0,
                      transform: `scale(${isActive ? 1 + Math.sin((frame / 8) * Math.PI) * 0.1 : 1})`,
                    }}>
                      {ev.icon}
                    </div>
                    {i < TRACKING_EVENTS.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 20, background: ev.done ? palette.green : palette.divider, marginTop: 2, marginBottom: 2, borderRadius: 2 }}>
                        {ev.done && (
                          <div style={{ height: `${lineProgress * 100}%`, background: palette.green, borderRadius: 2 }} />
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ paddingBottom: i < TRACKING_EVENTS.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 15, fontWeight: ev.done ? 700 : 500, color: ev.done ? palette.textPrimary : palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
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
    </div>
  );
}
