type Props = { onClose: () => void };

const SECTIONS = [
  {
    icon: '📌',
    title: 'Appuntamenti vs Promemoria',
    content: 'Gli appuntamenti (sfondo blu) hanno un orario preciso e possono essere generici. I promemoria (sfondo bianco) sono legati a un cliente e non hanno un orario.',
  },
  {
    icon: '📅',
    title: 'Viste calendario',
    content: "Usa i pulsanti in alto per passare tra: Giorno, Settimana, Mese e Lista. Usa i tasti ← → per navigare tra i periodi.",
  },
  {
    icon: '✋',
    title: 'Drag & drop',
    content: "Nella vista Giorno e Settimana puoi trascinare un appuntamento per spostarlo. Trascina il bordo inferiore per cambiarne la durata.",
  },
  {
    icon: '🤖',
    title: 'Promemoria automatici (clienti dormienti)',
    content: "Il sistema crea automaticamente promemoria per clienti inattivi da 3+ mesi (badge auto). Quando il cliente fa un ordine, il promemoria viene cancellato.",
  },
  {
    icon: '🔗',
    title: 'Sincronizzazione con Google/Apple Calendar',
    content: "Usa il pannello Sincronizzazione per ottenere il tuo URL abbonamento. Gli appuntamenti si aggiornano automaticamente ogni 8-24h.",
  },
  {
    icon: '⚙️',
    title: 'Tipi di appuntamento',
    content: "I tipi (Visita, Chiamata, Video call, ecc.) sono personalizzabili. Puoi aggiungere tipi custom con emoji e colore.",
  },
];

export function AgendaHelpPanel({ onClose }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{"❓"} Guida all&apos;Agenda</div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>{"✕"}</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SECTIONS.map(({ icon, title, content }) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24, flexShrink: 0, width: 36, height: 36, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
