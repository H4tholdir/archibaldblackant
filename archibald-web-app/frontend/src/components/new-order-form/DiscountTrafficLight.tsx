interface DiscountTrafficLightProps {
  effectiveDiscountPercent: number;
}

type TrafficLightState = {
  color: string;
  textColor: string;
  background: string;
  border: string;
  label: string;
};

function getState(pct: number): TrafficLightState | null {
  if (pct === 0) return null;
  if (pct <= 20) {
    return {
      color: '#22c55e',
      textColor: '#22c55e',
      background: '#052e16',
      border: '#166534',
      label: 'Limite sconto rispettato',
    };
  }
  if (pct <= 25) {
    return {
      color: '#f59e0b',
      textColor: '#fbbf24',
      background: '#422006',
      border: '#92400e',
      label: 'Limite sconto critico',
    };
  }
  return {
    color: '#dc2626',
    textColor: '#f87171',
    background: '#450a0a',
    border: '#991b1b',
    label: 'Limite sconto in approvazione',
  };
}

export function DiscountTrafficLight({ effectiveDiscountPercent }: DiscountTrafficLightProps) {
  const state = getState(effectiveDiscountPercent);
  if (!state) return null;

  const formatted = `${effectiveDiscountPercent.toFixed(1)}%`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        background: state.background,
        border: `1px solid ${state.border}`,
        borderRadius: '6px',
        padding: '0.55rem 0.8rem',
        marginTop: '0.5rem',
      }}
    >
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: state.color,
          boxShadow: `0 0 6px ${state.color}`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: state.textColor, fontWeight: 700, fontSize: '0.76rem', lineHeight: 1.2 }}>
          {state.label}
        </div>
        <div style={{ color: state.textColor, fontSize: '0.68rem', marginTop: '0.1rem', opacity: 0.85 }}>
          Sconto effettivo documento: {formatted}
        </div>
      </div>
      <div style={{ color: state.textColor, fontWeight: 800, fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
      </div>
    </div>
  );
}
