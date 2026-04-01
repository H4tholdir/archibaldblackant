// src/scenes/Notifications.tsx
import { useCurrentFrame, interpolate } from 'remotion';
import { easingApple } from '../lib/springs';
import { palette } from '../lib/palette';
import { SCENE_FRAMES } from '../lib/timing';
import { NotifCard } from '../components/NotifCard';
import { SceneCaption } from '../components/SceneCaption';

const NOTIFS = [
  { icon: '✅', title: 'Ordine confermato',      body: 'Ordine #4821 registrato su Archibald',                           time: '14:32', color: palette.green,  highlight: false },
  { icon: '📄', title: 'Documento disponibile',  body: 'DDT-2026-00312 pronto per il download',                          time: '14:35', color: palette.blue,   highlight: false },
  { icon: '🚚', title: 'Spedizione aggiornata',  body: 'FedEx: pacco in consegna oggi a Milano',                        time: '09:21', color: palette.purple,  highlight: false },
  { icon: '📋', title: 'Preventivo aperto',      body: 'Studio Dr. Bianchi ha aperto il preventivo',                    time: '10:47', color: palette.green,  highlight: false },
  { icon: '⚠️', title: 'Cliente inattivo',       body: 'Lab. Dott. Ferrari — 8 mesi senza ordini · rischio esclusività', time: '08:00', color: palette.orange, highlight: true  },
  { icon: '🔴', title: 'Documento mancante',     body: 'Ordine #4756 — nessun DDT dopo 14 giorni',                      time: '08:00', color: palette.red,    highlight: true  },
  { icon: '📈', title: 'Variazione prezzo',      body: 'Kit impianto standard +3.2% da domani',                         time: '07:00', color: palette.orange, highlight: false },
  { icon: '⚠️', title: 'Cliente incompleto',    body: 'Clinica Azzurra — P.IVA mancante · ordini bloccati',             time: '06:00', color: palette.red,   highlight: false },
];

const STAGGER = 25;
const FINAL_LABEL_FRAME = 370;

export function Notifications() {
  const frame = useCurrentFrame();
  const dur = SCENE_FRAMES.notifications;

  const fadeOut = interpolate(frame, [dur - 15, dur], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const labelOpacity = interpolate(frame, [FINAL_LABEL_FRAME, FINAL_LABEL_FRAME + 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: palette.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '48px 160px',
      gap: 20, opacity: fadeOut,
      position: 'relative',
    }}>
      <div style={{ textAlign: 'center', opacity: headerOpacity }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: palette.textPrimary, fontFamily: 'Inter, sans-serif' }}>
          🔔 Notifiche Intelligenti
        </div>
        <div style={{ fontSize: 18, color: palette.textMuted, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
          11 tipi di eventi · zero ricerche manuali
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
        {NOTIFS.map((n, i) => (
          <NotifCard
            key={i}
            icon={n.icon}
            title={n.title}
            body={n.body}
            time={n.time}
            accentColor={n.color}
            delay={20 + i * STAGGER}
            stackOffset={i * 2}
            highlight={n.highlight}
          />
        ))}
      </div>

      <div style={{
        fontSize: 20, fontStyle: 'italic', color: palette.textMuted,
        fontFamily: 'Inter, sans-serif', textAlign: 'center',
        opacity: labelOpacity,
      }}>
        &quot;Formicanera ti avvisa. Tu pensi solo a vendere.&quot;
      </div>

      <SceneCaption
        main="11 tipi di notifiche proattive · Formicanera ti avvisa prima che tu cerchi"
        vs="vs ERP: zero notifiche — l'agente deve controllare manualmente ogni informazione"
        delay={30}
        color="#FF9500"
      />
    </div>
  );
}
