interface DiscountTrafficLightProps {
  effectiveDiscountPercent: number;
}

type TrafficLightState = {
  color: string;
  textColor: string;
  background: string;
  border: string;
  label: string;
  glow: boolean;
};

function getState(pct: number): TrafficLightState | null {
  if (pct === 0) return null;
  // Allinea la soglia al valore visualizzato (toFixed(1)) per evitare discrepanze floating-point.
  const rounded = Math.round(pct * 10) / 10;
  if (rounded <= 20) {
    return {
      color: '#22c55e',
      textColor: '#86efac',
      background: '#052e16',
      border: '#166534',
      label: 'Range di sconto approvato',
      glow: false,
    };
  }
  if (rounded <= 25) {
    return {
      color: '#fbbf24',
      textColor: '#fde68a',
      background: '#422006',
      border: '#92400e',
      label: 'Range di sconto critico, fai attenzione sei al limite della scontistica.',
      glow: false,
    };
  }
  return {
    color: '#dc2626',
    textColor: '#fca5a5',
    background: '#450a0a',
    border: '#991b1b',
    label: "Hai superato il limite sconto, l'ordine sarà soggetto ad approvazione.",
    glow: true,
  };
}

export function DiscountTrafficLight({ effectiveDiscountPercent }: DiscountTrafficLightProps) {
  const state = getState(effectiveDiscountPercent);
  if (!state) return null;

  const formatted = `${effectiveDiscountPercent.toFixed(1)}%`;

  return (
    <>
      {state.glow && (
        <style>{`
          @keyframes arch-glow-pulse {
            0%, 100% { box-shadow: 0 0 8px 2px rgba(220,38,38,0.35); }
            50% { box-shadow: 0 0 22px 7px rgba(220,38,38,0.65); }
          }
          @keyframes arch-dot-pulse {
            0%, 100% { box-shadow: 0 0 5px 1px rgba(220,38,38,0.55); }
            50% { box-shadow: 0 0 14px 5px rgba(220,38,38,0.95); }
          }
        `}</style>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: state.background,
          border: `1.5px solid ${state.border}`,
          borderRadius: '8px',
          padding: '0.7rem 1rem',
          marginTop: '0.5rem',
          animation: state.glow ? 'arch-glow-pulse 2s ease-in-out infinite' : undefined,
        }}
      >
        <div
          style={{
            width: '13px',
            height: '13px',
            borderRadius: '50%',
            background: state.color,
            flexShrink: 0,
            boxShadow: state.glow ? undefined : `0 0 7px ${state.color}`,
            animation: state.glow ? 'arch-dot-pulse 2s ease-in-out infinite' : undefined,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              color: state.textColor,
              fontWeight: 700,
              fontSize: '0.8rem',
              lineHeight: 1.35,
              letterSpacing: '0.01em',
            }}
          >
            {state.label}
          </div>
        </div>
        <div
          style={{
            color: state.textColor,
            fontWeight: 800,
            fontSize: '1.1rem',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {formatted}
        </div>
      </div>
    </>
  );
}
