// src/scenes/Storico.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springSnap, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SearchBar } from '../components/SearchBar';
import { BadgeGreen } from '../components/BadgeGreen';
import { SceneCaption } from '../components/SceneCaption';

const ORDERS = [
  { id: '#4821', date: '28/03/26', client: 'Dr. Bianchi', amount: '€ 1.240', status: 'Confermato' },
  { id: '#4756', date: '21/03/26', client: 'Dr. Bianchi', amount: '€ 890',   status: 'Confermato' },
  { id: '#4700', date: '14/03/26', client: 'Dr. Bianchi', amount: '€ 2.100', status: 'Confermato' },
  { id: '#4651', date: '07/03/26', client: 'Dr. Bianchi', amount: '€ 445',   status: 'Confermato' },
  { id: '#4580', date: '28/02/26', client: 'Dr. Bianchi', amount: '€ 1.650', status: 'Confermato' },
];

const ARTICLES = [
  { name: 'Fresa conica Ø1.2',    code: 'FRE-012', qty: 4,  match: true  },
  { name: 'Kit impianto standard', code: 'KIT-STD', qty: 1,  match: false },
  { name: 'Fresa cilindrica Ø2',  code: 'FRE-020', qty: 2,  match: true  },
  { name: 'Cemento provvisorio',   code: 'CEM-PRV', qty: 10, match: false },
];

const SEARCH_START   = 100;
const TYPING_START   = 120;
const EXPAND_FRAME   = 220;
const SELECT_FRAME   = 280;
const FLY_FRAME      = 380;
const SPLIT_FRAME    = 360;

export function Storico() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.storico;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const isSplit = frame >= SPLIT_FRAME;

  const queryComplete = frame >= TYPING_START + 5 * 6;
  const showMatches = queryComplete;

  const sel0 = interpolate(frame, [SELECT_FRAME, SELECT_FRAME + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sel1 = interpolate(frame, [SELECT_FRAME + 15, SELECT_FRAME + 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const selectionVisible = frame >= SELECT_FRAME;

  const flyProgress = interpolate(frame, [FLY_FRAME, FLY_FRAME + 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  const formProgress = spring({
    frame: Math.max(0, frame - SPLIT_FRAME),
    fps, config: springCard, from: 0, to: 1,
  });

  const leftWidth = interpolate(frame, [SPLIT_FRAME, SPLIT_FRAME + 20], [100, 45], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingApple,
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      opacity: fadeOut, padding: '48px 80px',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🗂 Storico Ordini
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          Dr. Bianchi · <span style={{ fontWeight: 700, color: palette.blue }}>47 ordini</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flex: 1 }}>
        {/* Pannello sinistro */}
        <div style={{
          flex: `0 0 ${leftWidth}%`,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {frame >= SEARCH_START && (
            <SearchBar
              query="fresa"
              typingStartFrame={TYPING_START}
              framesPerChar={6}
              delay={SEARCH_START}
              resultCount={showMatches ? 3 : undefined}
            />
          )}

          {ORDERS.map((order, i) => {
            const rowProgress = spring({
              frame: Math.max(0, frame - i * 12),
              fps, config: springCard, from: 0, to: 1,
            });
            const isExpanded = frame >= EXPAND_FRAME && i === 2;
            const isHighlighted = showMatches && (i === 1 || i === 2 || i === 4);

            return (
              <div key={i}>
                <div style={{
                  background: palette.bgCard,
                  borderRadius: 12,
                  padding: '14px 18px',
                  opacity: rowProgress,
                  transform: `translateY(${(1 - rowProgress) * 10}px)`,
                  boxShadow: isHighlighted ? `0 0 0 2px ${palette.yellow}60, 0 4px 16px rgba(0,0,0,0.06)` : '0 2px 12px rgba(0,0,0,0.05)',
                  borderLeft: isHighlighted ? `3px solid ${palette.yellow}` : '3px solid transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                        {order.id}
                      </span>
                      <span style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif' }}>
                        {order.date}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                        {order.amount}
                      </span>
                      <span style={{
                        background: `${palette.green}20`, color: palette.green,
                        fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    background: `${palette.blue}06`,
                    borderRadius: '0 0 12px 12px',
                    padding: '12px 18px',
                    marginTop: -4,
                    opacity: interpolate(frame, [EXPAND_FRAME, EXPAND_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  }}>
                    {ARTICLES.map((art, j) => {
                      const selProg = art.match ? (j === 0 ? sel0 : sel1) : 0;
                      return (
                        <div key={j} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '6px 0',
                          borderBottom: j < ARTICLES.length - 1 ? `1px solid ${palette.divider}` : 'none',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 6,
                            border: `2px solid ${selProg > 0.5 ? palette.blue : palette.divider}`,
                            background: selProg > 0.5 ? palette.blue : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#fff', fontWeight: 700,
                            transform: `scale(${0.8 + selProg * 0.2})`,
                            transition: 'none',
                          }}>
                            {selProg > 0.5 ? '✓' : ''}
                          </div>
                          <div>
                            <span style={{
                              fontSize: 14, fontWeight: art.match ? 700 : 400,
                              color: art.match ? palette.blue : palette.textSecondary,
                              fontFamily: 'Inter, sans-serif',
                              background: art.match && showMatches ? `${palette.yellow}40` : 'transparent',
                              padding: art.match ? '1px 4px' : '0',
                              borderRadius: 4,
                            }}>
                              {art.name}
                            </span>
                            <span style={{ fontSize: 12, color: palette.textMuted, marginLeft: 8, fontFamily: 'Inter, sans-serif' }}>
                              {art.qty} pz
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {selectionVisible && (
                      <div style={{
                        marginTop: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        opacity: interpolate(frame, [SELECT_FRAME + 25, SELECT_FRAME + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                      }}>
                        <span style={{ fontSize: 14, color: palette.blue, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                          2 articoli selezionati
                        </span>
                        <div style={{
                          background: palette.blue, color: '#fff',
                          borderRadius: 10, padding: '8px 16px',
                          fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                          boxShadow: `0 4px 16px ${palette.blue}40`,
                          opacity: flyProgress < 0.1 ? 1 : interpolate(flyProgress, [0, 0.3], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                        }}>
                          Copia in nuovo ordine →
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pannello destro — nuovo ordine */}
        {isSplit && (
          <div style={{
            flex: '1',
            opacity: formProgress,
            transform: `translateX(${(1 - formProgress) * 60}px)`,
          }}>
            <div style={{
              background: palette.bgCard,
              borderRadius: 20, padding: 24,
              boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
              borderTop: `3px solid ${palette.blue}`,
              height: '100%',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                ✨ Nuovo Ordine
              </div>
              <div style={{ fontSize: 14, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 16 }}>
                Dr. Bianchi · Pre-compilato
              </div>
              {ARTICLES.filter(a => a.match).map((art, j) => {
                const artProgress = spring({
                  frame: Math.max(0, frame - FLY_FRAME - j * 20),
                  fps, config: springSnap, from: 0, to: 1,
                });
                return (
                  <div key={j} style={{
                    opacity: artProgress,
                    transform: `scale(${0.9 + artProgress * 0.1}) translateY(${(1 - artProgress) * 10}px)`,
                    background: `${palette.blue}08`,
                    borderRadius: 10, padding: '12px 14px',
                    marginBottom: 8,
                    border: `1px solid ${palette.blue}20`,
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                      {art.name}
                    </div>
                    <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      {art.code} · {art.qty} pz
                    </div>
                  </div>
                );
              })}
              {frame >= FLY_FRAME + 50 && (
                <div style={{ marginTop: 16 }}>
                  <BadgeGreen label="Ordine pre-compilato" delay={FLY_FRAME + 50} size="sm" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <SceneCaption
        main="Cerca nello storico e copia articoli in un tap — ordine pre-compilato"
        vs="vs ERP: riaprire l'ordine precedente, copiare manualmente, rischio errori"
        delay={30}
        color="#5856D6"
      />
    </div>
  );
}
