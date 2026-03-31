import { useCurrentFrame, interpolate } from 'remotion';
import { palette } from '../lib/palette';
import { NotifCard } from '../components/NotifCard';
import { SCENE_DURATION } from '../lib/timing';

const NOTIFS = [
  { icon: '✅', text: 'Ordine #4821 confermato su Archibald', time: 'Adesso', color: palette.green },
  { icon: '📄', text: 'DDT disponibile — Studio Dr. Bianchi', time: '2 minuti fa', color: palette.blue },
  { icon: '⚠️', text: 'Cliente inattivo da 7 mesi', time: 'Studio Esposito', color: palette.orange },
  { icon: '🚚', text: 'Spedizione in transito — Milano', time: 'FedEx Tracking', color: palette.blue },
];

export function Notifications() {
  const frame = useCurrentFrame();
  const dur = SCENE_DURATION.notifications;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: palette.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 760 }}>
        {NOTIFS.map((n, i) => (
          <NotifCard
            key={i}
            icon={n.icon}
            text={n.text}
            time={n.time}
            accentColor={n.color}
            delay={i * 15}
          />
        ))}
      </div>
    </div>
  );
}
