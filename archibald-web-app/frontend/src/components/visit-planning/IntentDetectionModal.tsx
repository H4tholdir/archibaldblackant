import type { IntentDetection } from '../../services/visit-planning.service';

type Props = {
  date:      string;
  detection: IntentDetection;
  onConfirm: () => void;
  onIgnore:  () => void;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export function IntentDetectionModal({ date, detection, onConfirm, onIgnore }: Props) {
  const d = new Date(date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onIgnore}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: '16px 16px 0 0',
        padding: 20, width: '100%', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>📅</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
              Appuntamenti trovati per {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {detection.appointments.length} {detection.appointments.length === 1 ? 'appuntamento confermato' : 'appuntamenti confermati'} in agenda
            </div>
          </div>
        </div>

        <div style={{ fontSize: 14, color: '#374151', marginBottom: 16, lineHeight: 1.5 }}>
          Costruisco il giro <strong>attorno a questi appuntamenti fissi</strong>, riempiendo le finestre libere con clienti vicini.
        </div>

        {detection.appointments.map(appt => (
          <div key={appt.appointmentId} style={{
            background: 'white', border: '1px solid #e5e7eb',
            borderLeft: '4px solid #2563eb', borderRadius: 10,
            padding: 12, marginBottom: 10, display: 'flex', gap: 12,
          }}>
            <div style={{
              background: '#eff6ff', borderRadius: 8, padding: '8px 12px',
              textAlign: 'center', minWidth: 56, flexShrink: 0,
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>
                {fmtTime(appt.startAt).slice(0, 2)}
              </div>
              <div style={{ fontSize: 11, color: '#2563eb' }}>:{fmtTime(appt.startAt).slice(3, 5)}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{appt.title}</div>
              {appt.location && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📍 {appt.location}</div>}
              <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
                <span style={{ background: '#f1f5f9', display: 'inline-block', padding: '2px 7px', borderRadius: 6 }}>
                  ⏱ {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)} min
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>
                  🔒 Fisso
                </span>
              </div>
            </div>
          </div>
        ))}

        {detection.freeWindows.map((w, i) => (
          <div key={i} style={{
            background: '#f0fdf4', border: '1px dashed #86efac',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
              ✅ Finestra libera: {fmtTime(w.startAt)} → {fmtTime(w.endAt)}
            </div>
            <div style={{ fontSize: 12, color: '#374151' }}>
              {w.durationMin} min → circa {Math.max(1, Math.floor((w.durationMin - 15) / 45))} clienti vicini
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={onConfirm}
            style={{ flex: 2, background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >▶ Genera giro con questi appuntamenti</button>
          <button
            onClick={onIgnore}
            style={{ flex: 1, background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: 12, fontSize: 13, cursor: 'pointer' }}
          >Ignora</button>
        </div>
      </div>
    </div>
  );
}
