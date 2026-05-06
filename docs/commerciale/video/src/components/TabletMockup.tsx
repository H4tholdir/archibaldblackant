// src/components/TabletMockup.tsx
import type { ReactNode } from 'react';
import { fontFamily } from '../font';
import { palette } from '../lib/palette';

type Props = {
  children: ReactNode;
  width?: number;
  height?: number;
};

export function TabletMockup({ children, width = 900, height = 680 }: Props) {
  const FRAME = 20;
  const STATUS_H = 28;
  const RADIUS = 20;

  return (
    <div style={{
      width,
      height,
      borderRadius: RADIUS,
      background: '#2C2C2E',
      border: '3px solid #C7C7CC',
      boxShadow: '0 16px 48px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.20)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        height: STATUS_H,
        background: '#1C1C1E',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF', fontFamily }}>9:41</span>
        <span style={{ fontSize: 11, color: '#FFFFFF', fontFamily, letterSpacing: 0.5 }}>▲ WiFi ●●●● 🔋</span>
      </div>
      <div style={{
        flex: 1,
        overflow: 'hidden',
        margin: `0 ${FRAME}px ${FRAME}px ${FRAME}px`,
        borderRadius: `0 0 ${RADIUS - 4}px ${RADIUS - 4}px`,
        background: '#000',
      }}>
        {children}
      </div>
    </div>
  );
}

export function TabletMockupWithLabel({ children, width = 900, height = 680 }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <TabletMockup width={width} height={height}>{children}</TabletMockup>
      <div style={{ fontSize: 13, fontWeight: 600, color: palette.blue, fontFamily, letterSpacing: 0.5 }}>
        Formicanera — Tablet · Mobile · Desktop
      </div>
    </div>
  );
}
