// src/components/TabletMockup.tsx
import type { ReactNode } from 'react';
import { fontFamily } from '../font';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  /** Larghezza totale mockup incluso frame */
  width?: number;
  /** Altezza totale mockup incluso frame */
  height?: number;
};

const FRAME_THICKNESS = 16;
const RADIUS_OUTER = 28;
const RADIUS_INNER = 14;
const STATUS_H = 20;
const HOME_H = 4;

export function TabletMockup({ children, width = 920, height = 680 }: Props) {
  const screenW = width - FRAME_THICKNESS * 2;
  const screenH = height - FRAME_THICKNESS * 2;

  return (
    <div style={{
      width,
      height,
      borderRadius: RADIUS_OUTER,
      background: 'linear-gradient(160deg, #4A4A4C 0%, #2C2C2E 40%, #1C1C1E 100%)',
      boxShadow: '0 32px 80px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }}>
      {/* Camera pill — left short edge, centered vertically */}
      <div style={{
        position: 'absolute',
        left: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 5,
        height: 28,
        borderRadius: 3,
        background: '#1A1A1C',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
      }} />

      {/* Screen */}
      <div style={{
        width: screenW,
        height: screenH,
        borderRadius: RADIUS_INNER,
        overflow: 'hidden',
        background: '#000',
        position: 'relative',
      }}>
        {/* Status bar overlay — semi-transparent, blends with app */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: STATUS_H,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.90)',
            fontFamily,
            letterSpacing: 0.3,
            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>
            9:41
          </span>
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.85)',
            fontFamily,
            letterSpacing: 0.2,
            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}>
            ●●●● WiFi 🔋
          </span>
        </div>

        {/* Content fills entire screen */}
        <div style={{ width: '100%', height: '100%' }}>
          {children}
        </div>

        {/* Home indicator */}
        <div style={{
          position: 'absolute',
          bottom: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 80,
          height: HOME_H,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.35)',
          zIndex: 10,
        }} />
      </div>
    </div>
  );
}

export function TabletMockupWithLabel({ children, width = 920, height = 680 }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <TabletMockup width={width} height={height}>{children}</TabletMockup>
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: palette.blue,
        fontFamily,
        letterSpacing: 0.5,
      }}>
        Formicanera — Tablet · Mobile · Desktop
      </div>
    </div>
  );
}
