import { palette } from '../lib/palette';

type Props = {
  value: string;
  label: string;
  color?: string;
};

export function MetricCard({ value, label, color = palette.blue }: Props) {
  return (
    <div
      style={{
        background: palette.darkBg,
        borderRadius: 20,
        padding: '24px 20px',
        textAlign: 'center',
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 52,
          fontWeight: 900,
          color,
          lineHeight: 1,
          marginBottom: 10,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 18,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: 1,
          lineHeight: 1.4,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {label}
      </div>
    </div>
  );
}
