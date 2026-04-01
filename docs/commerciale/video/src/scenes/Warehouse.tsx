// src/scenes/Warehouse.tsx
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { springCard, springBounce, easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { SearchBar } from '../components/SearchBar';
import { BadgeGreen } from '../components/BadgeGreen';
import { ProgressBar } from '../components/ProgressBar';
import { SceneCaption } from '../components/SceneCaption';

type Product = {
  name: string;
  code: string;
  stock: number;
  status: 'ok' | 'low' | 'out';
  price: number;
  delay: number;
};

const PRODUCTS: Product[] = [
  { name: 'Fresa conica Ø1.2',       code: 'FRE-012', stock: 48, status: 'ok',  price: 45.00, delay: 20  },
  { name: 'Fresa sferica Ø0.8',      code: 'FRE-008', stock: 12, status: 'ok',  price: 52.00, delay: 35  },
  { name: 'Fresa cilindrica Ø2',     code: 'FRE-020', stock: 3,  status: 'low', price: 48.00, delay: 50  },
  { name: 'Fresa bullet Ø1.5',       code: 'FRE-015', stock: 0,  status: 'out', price: 39.00, delay: 65  },
  { name: 'Fresa torque control Ø1', code: 'FRE-010', stock: 27, status: 'ok',  price: 61.00, delay: 80  },
  { name: 'Fresa finisher Ø1.8',     code: 'FRE-018', stock: 8,  status: 'low', price: 44.00, delay: 95  },
];

const EXPAND_FRAME = 120;
const CHECK_FRAME  = 300;
const CHECK_DONE   = 340;

const STOCK_COLOR = {
  ok:  palette.green,
  low: palette.orange,
  out: palette.red,
};
const STOCK_LABEL: { [K in 'ok' | 'low' | 'out']: (n: number) => string } = {
  ok:  (n) => `In magazzino: ${n} pz`,
  low: (n) => `Ultimi ${n} pz`,
  out: (_) => 'Esaurito',
};

export function Warehouse() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SCENE_FRAMES.warehouse;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const isExpanded = frame >= EXPAND_FRAME;
  const isChecking = frame >= CHECK_FRAME && frame < CHECK_DONE;
  const isDone     = frame >= CHECK_DONE;

  const checkPulse = isChecking
    ? 0.6 + Math.sin((frame / 5) * Math.PI) * 0.4
    : 1;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 24, opacity: fadeOut, padding: '0 120px',
      position: 'relative',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          📦 Catalogo & Check Magazzino
        </div>
        <div style={{ fontSize: 20, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 8 }}>
          Stock in tempo reale per ogni articolo, con il tuo prezzo cliente
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 620 }}>
        <SearchBar
          query="fresa conica"
          typingStartFrame={10}
          framesPerChar={6}
          delay={0}
          resultCount={6}
        />
      </div>

      <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PRODUCTS.map((p, i) => {
          const rowProgress = spring({
            frame: Math.max(0, frame - p.delay),
            fps, config: springCard, from: 0, to: 1,
          });
          const stockColor = STOCK_COLOR[p.status];

          return (
            <div key={i}>
              <div style={{
                background: palette.bgCard, borderRadius: 14, padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                opacity: rowProgress,
                transform: `translateY(${(1 - rowProgress) * 15}px)`,
                border: i === 0 && isExpanded ? `1.5px solid ${palette.blue}40` : '1.5px solid transparent',
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                    {p.code}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{
                    background: `${stockColor}18`,
                    color: stockColor,
                    fontSize: 13, fontWeight: 700, borderRadius: 20,
                    padding: '4px 12px', fontFamily: 'Inter, sans-serif',
                  }}>
                    {STOCK_LABEL[p.status](p.stock)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: palette.blue, fontFamily: 'Inter, sans-serif' }}>
                    € {p.price.toFixed(2)}
                  </span>
                </div>
              </div>

              {i === 0 && isExpanded && (
                <div style={{
                  background: `${palette.blue}06`,
                  borderRadius: '0 0 14px 14px', padding: '16px 18px',
                  marginTop: -4,
                  opacity: interpolate(frame, [EXPAND_FRAME, EXPAND_FRAME + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <ProgressBar
                      progress={p.stock / 60}
                      animate={false}
                      color={palette.green}
                      height={8}
                      label="Disponibilità magazzino"
                      showPercent
                      bgColor={palette.divider}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 13, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginBottom: 14 }}>
                    <span>Cod. ERP: <strong style={{ color: palette.textPrimary }}>{p.code}-STD</strong></span>
                    <span>Ultimo ord.: <strong style={{ color: palette.textPrimary }}>15/03 · 10 pz</strong></span>
                    <span>Prezzo cliente: <strong style={{ color: palette.blue }}>€ {p.price.toFixed(2)}</strong></span>
                  </div>

                  {!isDone ? (
                    <div style={{
                      background: palette.blue,
                      color: '#fff', borderRadius: 12, padding: '10px 20px',
                      fontSize: 15, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      boxShadow: `0 4px 16px ${palette.blue}40`,
                      opacity: isChecking ? checkPulse : spring({
                        frame: Math.max(0, frame - EXPAND_FRAME - 20),
                        fps, config: springBounce, from: 0, to: 1,
                      }),
                    }}>
                      {isChecking ? (
                        <>
                          <span style={{
                            width: 16, height: 16, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.4)',
                            borderTopColor: '#fff',
                            display: 'inline-block',
                            transform: `rotate(${frame * 12}deg)`,
                          }} />
                          Verifica disponibilità...
                        </>
                      ) : 'Verifica disponibilità →'}
                    </div>
                  ) : (
                    <BadgeGreen label="Disponibile: 48 pz · Pronta consegna" delay={CHECK_DONE} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SceneCaption
        main="Stock in 2 secondi · Il tuo prezzo cliente, non il listino generico"
        vs="vs ERP: nessun check disponibilità in app — telefonate al magazzino ogni volta"
        delay={30}
        color="#FF9500"
      />
    </div>
  );
}
