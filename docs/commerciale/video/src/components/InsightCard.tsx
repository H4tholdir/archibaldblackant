// src/components/InsightCard.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';
import { C } from '../lib/comparison-timing';

type Props = {
  showAtFrame: number;
  pwaFinalTime?: string;
};

const PARALLEL_ACTIONS = [
  { icon: '📋', title: 'Creates the next pending order', desc: 'Queue as many as needed — submit them all at once later', delay: 20 },
  { icon: '📊', title: 'Reviews client history & documents', desc: 'DDT, invoices, order history — always accessible', delay: 55 },
  { icon: '📅', title: 'Checks appointments & reminders', desc: 'Full agenda integrated — never miss a follow-up', delay: 90 },
  { icon: '📱', title: 'Switches device — same session', desc: 'Tablet in the field → mobile in the car → desktop at home', delay: 125, highlight: true },
];

const SEND_MOMENTS = [
  { icon: '🏢', label: 'During the client visit' },
  { icon: '🚗', label: 'Driving to the next client' },
  { icon: '⏸️', label: 'While parking' },
  { icon: '🏠', label: 'From home, on the couch' },
  { icon: '📦', label: 'In batch — all at once' },
];

export function InsightCard({ showAtFrame, pwaFinalTime = '1:15' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < showAtFrame) return null;

  const relFrame = frame - showAtFrame;
  const cardProgress = spring({ frame: relFrame, fps, config: springCard, from: 0, to: 1 });
  const isBotDone = relFrame >= (C.V1.PWA_BOT_DONE - C.V1.PWA_AGENT_DONE_REL); // 2730f

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex',
      opacity: cardProgress,
    }}>
      {/* Left: Status PWA */}
      <div style={{
        width: '38%', background: palette.bgDark,
        padding: '28px 24px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily }}>
          Formicanera — Agent Status
        </div>

        {/* Agent done badge */}
        <div style={{
          background: 'rgba(52,199,89,0.12)', border: '1px solid rgba(52,199,89,0.30)',
          borderRadius: 14, padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: palette.green, fontFamily, letterSpacing: 1 }}>✓ AGENT DONE</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: palette.green, letterSpacing: -1.5, fontFamily }}>{pwaFinalTime}</div>
          <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 2 }}>Order confirmed as pending</div>
        </div>

        {/* Bot status */}
        {!isBotDone ? (
          <div style={{
            background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.20)',
            borderRadius: 12, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: palette.blue, fontFamily, letterSpacing: 1 }}>⚡ Sending to ERP</div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 100, margin: '10px 0 0', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (relFrame / 2730) * 100)}%`,
                background: `linear-gradient(90deg, ${palette.blue}, #34C759)`,
                borderRadius: 100, transition: 'width 0.5s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 6 }}>Background sync in progress...</div>
          </div>
        ) : (
          <div style={{
            background: 'rgba(52,199,89,0.10)', border: '1px solid rgba(52,199,89,0.25)',
            borderRadius: 12, padding: '12px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: palette.green, fontFamily }}>✓ Order on ERP</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: palette.green, letterSpacing: -1, fontFamily }}>2:46</div>
            <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 2 }}>Visible in Archibald ERP</div>
          </div>
        )}

        {/* Send moments */}
        <div style={{
          marginTop: 4,
          opacity: interpolate(relFrame, [80, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: palette.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily, marginBottom: 8 }}>
            Submit whenever:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SEND_MOMENTS.map((m) => (
              <div key={m.label} style={{
                background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 10px',
                fontSize: 10, color: palette.textWhiteDim, fontFamily,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>{m.icon}</span> {m.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: parallel actions */}
      <div style={{
        flex: 1, background: palette.bg,
        padding: '28px 32px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily }}>
          Meanwhile, the agent keeps working
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: palette.textPrimary, letterSpacing: -0.8, lineHeight: 1.15, fontFamily }}>
          Pending orders accumulate<br />
          <span style={{ color: palette.blue }}>throughout the day.</span>
        </div>
        <div style={{ fontSize: 14, color: palette.textMuted, fontFamily, lineHeight: 1.55, marginBottom: 4 }}>
          Submit in batch at any time. ERP sync is fully automatic — no desk required.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {PARALLEL_ACTIONS.map((action) => {
            const itemProgress = spring({
              frame: Math.max(0, relFrame - action.delay),
              fps, config: springBounce, from: 0, to: 1,
            });
            return (
              <div key={action.title} style={{
                background: action.highlight ? 'rgba(0,122,255,0.06)' : palette.bgCard,
                borderLeft: `3px solid ${action.highlight ? palette.blue : palette.divider}`,
                borderRadius: '0 12px 12px 0',
                padding: '11px 15px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: itemProgress,
                transform: `translateX(${(1 - itemProgress) * 26}px)`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{action.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: action.highlight ? palette.blue : palette.textPrimary, fontFamily }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 11, color: palette.textMuted, fontFamily, marginTop: 1 }}>
                    {action.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          background: '#F0FFF4', borderRadius: 10, padding: '11px 16px',
          border: '1px solid #BBF7D0',
          opacity: interpolate(relFrame, [160, 190], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', fontFamily }}>
            Not waiting time — a new kind of productive time. ✓
          </div>
        </div>
      </div>
    </div>
  );
}
