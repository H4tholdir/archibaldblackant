type Props = {
  customerName:           string;
  navigationStartedAt:    string | null;
  minMinutesBeforePrompt: number;
  onConfirm:              () => void;
  onDismiss:              () => void;
};

export function ArrivalBanner({ customerName, navigationStartedAt, minMinutesBeforePrompt, onConfirm, onDismiss }: Props) {
  if (!navigationStartedAt) return null;

  const elapsed = (Date.now() - new Date(navigationStartedAt).getTime()) / 60000;
  if (elapsed < minMinutesBeforePrompt) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 1000,
      background: '#1e293b', color: 'white', borderRadius: 12,
      padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>
        📍 Sei arrivato da <em>{customerName}</em>?
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, background: '#16a34a', color: 'white', border: 'none',
            borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >✓ Segna visitato</button>
        <button
          onClick={onDismiss}
          style={{
            flex: 1, background: '#374151', color: '#d1d5db', border: 'none',
            borderRadius: 8, padding: '8px 0', fontSize: 14, cursor: 'pointer',
          }}
        >Non ancora</button>
      </div>
    </div>
  );
}
