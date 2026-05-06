// src/components/InsightCard.tsx
import { useCurrentFrame, spring, interpolate, useVideoConfig } from 'remotion';
import { springCard, springBounce } from '../lib/springs';
import { palette } from '../lib/palette';
import { fontFamily } from '../font';
import { C } from '../lib/comparison-timing';

type Props = {
  showAtFrame: number;
  /** Tempo mostrato sul timer ERP (es. "3:09") */
  pwaFinalTime?: string;
};

const ACTIONS = [
  {
    icon: '📋',
    title: 'Creates the next order',
    desc: 'Queue multiple orders — submit all in batch whenever ready',
    delay: 20,
    highlight: false,
  },
  {
    icon: '📊',
    title: 'Reviews client history',
    desc: 'Full purchase history, documents & pricing always accessible',
    delay: 55,
    highlight: false,
  },
  {
    icon: '📱💻',
    title: 'Switches device — same session',
    desc: 'Tablet in the field → desktop at office → mobile between meetings',
    delay: 90,
    highlight: true,
  },
];

export function InsightCard({ showAtFrame, pwaFinalTime = '3:09' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < showAtFrame) return null;

  const relFrame = frame - showAtFrame;
  const cardProgress = spring({ frame: relFrame, fps, config: springCard, from: 0, to: 1 });

  // Progress bar animata per ERP
  const progressWidth = interpolate(relFrame, [0, 180], [0.70, 0.92], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Seconda fase: ordine visibile su ERP via bot
  const isBotDone = relFrame >= (C.V1.PWA_BOT_DONE - C.V1.PWA_AGENT_DONE_REL); // 2730f

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      opacity: cardProgress,
    }}>
      {/* Left: ERP still processing */}
      <div style={{
        width: '40%',
        background: palette.bgDark,
        padding: '32px 28px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily }}>
          Archibald ERP
        </div>

        {!isBotDone ? (
          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily, marginBottom: 8 }}>
              Still processing
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 100, margin: '16px 0 0', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressWidth * 100}%`,
                background: `linear-gradient(90deg, ${palette.textMuted}, rgba(200,208,224,0.6))`,
                borderRadius: 100,
              }} />
            </div>
            <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 6 }}>
              submitting order to ERP...
            </div>
          </div>
        ) : (
          <div style={{
            background: 'rgba(52,199,89,0.10)', border: '2px solid rgba(52,199,89,0.40)',
            borderRadius: 16, padding: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: palette.green, letterSpacing: -1, fontFamily }}>
              ✓ Order on ERP
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: palette.green, fontFamily, marginTop: 4 }}>
              2:46
            </div>
            <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Bot placed the order automatically
            </div>
          </div>
        )}

        {/* PWA done badge */}
        <div style={{
          background: 'rgba(52,199,89,0.10)', border: '1px solid rgba(52,199,89,0.25)',
          borderRadius: 12, padding: '12px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: palette.green, fontFamily }}>✓ Formicanera</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: palette.green, letterSpacing: -1, fontFamily }}>{pwaFinalTime}</div>
          <div style={{ fontSize: 10, color: palette.textMuted, fontFamily, marginTop: 2 }}>Order confirmed & syncing</div>
        </div>
      </div>

      {/* Right: agent doing other things */}
      <div style={{
        flex: 1,
        background: palette.bg,
        padding: '32px 36px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: palette.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily }}>
          Meanwhile...
        </div>
        <div style={{
          fontSize: 28, fontWeight: 900, color: palette.textPrimary, letterSpacing: -0.8, lineHeight: 1.15, fontFamily,
        }}>
          The agent keeps <span style={{ color: palette.blue }}>working</span>
        </div>
        <div style={{ fontSize: 13, color: palette.textMuted, fontFamily, lineHeight: 1.5 }}>
          ERP sync happens silently. Zero effort required from the agent.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ACTIONS.map((action) => {
            const itemProgress = spring({
              frame: Math.max(0, relFrame - action.delay),
              fps, config: springBounce, from: 0, to: 1,
            });
            return (
              <div key={action.title} style={{
                background: action.highlight ? 'rgba(0,122,255,0.06)' : palette.bgCard,
                borderLeft: `3px solid ${action.highlight ? palette.blue : palette.divider}`,
                borderRadius: '0 12px 12px 0',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: itemProgress,
                transform: `translateX(${(1 - itemProgress) * 28}px)`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{action.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: action.highlight ? palette.blue : palette.textPrimary, fontFamily }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 11, color: palette.textMuted, fontFamily, marginTop: 2 }}>
                    {action.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          background: '#F0FFF4', borderRadius: 10, padding: '12px 16px',
          border: '1px solid #BBF7D0',
          opacity: interpolate(relFrame, [130, 160], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', fontFamily }}>
            Not downtime — a new kind of time. ✓
          </div>
        </div>
      </div>
    </div>
  );
}
