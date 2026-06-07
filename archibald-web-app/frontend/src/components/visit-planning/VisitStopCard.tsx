import type { VisitPlanningStop, StopStatus } from '../../types/visit-planning';
import { STOP_STATUS_COLORS, SOURCE_BADGE } from '../../types/visit-planning';

type Props = {
  stop:                       VisitPlanningStop;
  onStatusChange:             (stopId: string, status: StopStatus) => void;
  onNavigate:                 (stop: VisitPlanningStop) => void;
  onOpenBrief?:               (stop: VisitPlanningStop) => void;
  onConfirmWithAppointment?:  (stop: VisitPlanningStop) => void;
  onToggleLock?:              (stop: VisitPlanningStop) => void;
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

export function VisitStopCard({ stop, onStatusChange: _onStatusChange, onNavigate, onOpenBrief, onConfirmWithAppointment, onToggleLock }: Props) {
  const statusColor = STOP_STATUS_COLORS[stop.status];
  const arrivalTime = formatTime(stop.estimatedArrival);
  const badge = SOURCE_BADGE[stop.sourceType];

  const cardBg =
    stop.status === 'visited'  ? '#f0fdf4' :
    stop.status === 'skipped'  ? '#fef2f2' :
    stop.status === 'to_call'  ? '#fffbeb' :
    stop.status === 'confirmed'? '#eff6ff' :
    stop.status === 'backup'   ? '#f8fafc' :
    '#ffffff';

  return (
    <div style={{
      background: cardBg,
      borderRadius: 10,
      marginBottom: 8,
      borderLeft: `4px solid ${statusColor}`,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      overflow: 'hidden',
    }}>
      {/* Riga principale */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
        {/* Orario + sequenza */}
        <div style={{ flexShrink: 0, minWidth: 52, textAlign: 'center' }}>
          {arrivalTime && (
            <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{arrivalTime}</div>
          )}
          {stop.sequence != null && (
            <div style={{
              background: statusColor, color: 'white',
              borderRadius: '50%', width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, margin: arrivalTime ? '3px auto 0' : 'auto',
            }}>{stop.sequence}</div>
          )}
        </div>

        {/* Nome + badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {stop.displayName}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: stop.sourceType === 'archibald' ? '#dbeafe' : '#d1fae5',
              color: stop.sourceType === 'archibald' ? '#1e40af' : '#065f46',
              flexShrink: 0,
            }}>{badge}</span>
            {stop.locked && <span title="Tappa bloccata" style={{ fontSize: 11 }}>🔒</span>}
          </div>
          {/* Percorso + durata */}
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {stop.travelMinutesFromPrevious != null
              ? `🚗 ${stop.travelMinutesFromPrevious} min percorso · `
              : ''}
            {stop.visitMinutes} min visita
          </div>
        </div>

        {/* Azioni */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {onToggleLock && (
            <button
              title={stop.locked ? 'Sblocca tappa' : 'Blocca tappa'}
              onClick={() => onToggleLock(stop)}
              style={{
                background: stop.locked ? '#7c3aed' : '#f1f5f9',
                color: stop.locked ? 'white' : '#374151',
                border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 12, cursor: 'pointer',
              }}
            >{stop.locked ? '🔒' : '🔓'}</button>
          )}
          {onConfirmWithAppointment && stop.status !== 'confirmed' && stop.status !== 'visited' && stop.status !== 'removed' && (
            <button title="Aggiungi ad Agenda" onClick={() => onConfirmWithAppointment(stop)}
              style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 13, cursor: 'pointer' }}
            >📅</button>
          )}
          <button title="Naviga" onClick={() => onNavigate(stop)}
            style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 13, cursor: 'pointer' }}
          >🧭</button>
          {onOpenBrief && (
            <button title="Scheda cliente" onClick={() => onOpenBrief(stop)}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 13, cursor: 'pointer' }}
            >👁</button>
          )}
        </div>
      </div>

      {/* Hint / raccomandazioni — compatte, una sola riga */}
      {(stop.recommendationReasons.length > 0 || stop.alerts.length > 0) && (
        <div style={{
          padding: '4px 12px 8px 76px',
          fontSize: 11, color: '#4b5563',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {stop.recommendationReasons.slice(0, 2).map((r, i) => (
            <span key={i} style={{ background: '#f1f5f9', padding: '1px 7px', borderRadius: 10 }}>{r}</span>
          ))}
          {stop.alerts.slice(0, 1).map((a, i) => (
            <span key={i} style={{ background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: 10 }}>⚠️ {a}</span>
          ))}
        </div>
      )}
    </div>
  );
}
