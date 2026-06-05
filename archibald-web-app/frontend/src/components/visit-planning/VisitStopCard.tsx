import type { VisitPlanningStop, StopStatus } from '../../types/visit-planning';
import { STOP_STATUS_COLORS, SOURCE_BADGE } from '../../types/visit-planning';

type Props = {
  stop:           VisitPlanningStop;
  onStatusChange: (stopId: string, status: StopStatus) => void;
  onNavigate:     (stop: VisitPlanningStop) => void;
  onOpenBrief?:   (stop: VisitPlanningStop) => void;
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

export function VisitStopCard({ stop, onStatusChange, onNavigate, onOpenBrief }: Props) {
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
      padding: '10px 12px',
      marginBottom: 8,
      borderLeft: `4px solid ${statusColor}`,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {arrivalTime && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{arrivalTime}</span>
            )}
            {stop.sequence != null && (
              <span style={{
                background: statusColor, color: 'white',
                borderRadius: '50%', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{stop.sequence}</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stop.displayName}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px',
              borderRadius: 4, background: '#e0f2fe', color: '#0369a1',
            }}>{badge}</span>
            {stop.locked && <span style={{ fontSize: 10 }}>🔒</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {stop.travelMinutesFromPrevious != null && (
              <span>🚗 {stop.travelMinutesFromPrevious} min · </span>
            )}
            <span>{stop.visitMinutes} min visita</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            title="Naviga"
            onClick={() => onNavigate(stop)}
            style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
          >🧭</button>
          {onOpenBrief && (
            <button
              title="Scheda visita"
              onClick={() => onOpenBrief(stop)}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}
            >👁</button>
          )}
        </div>
      </div>

      {stop.recommendationReasons.length > 0 && (
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {stop.recommendationReasons.slice(0, 2).map((r, i) => (
            <span key={i} style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 10 }}>{r}</span>
          ))}
        </div>
      )}

      {stop.alerts.map((a, i) => (
        <div key={i} style={{
          fontSize: 11, color: '#92400e', background: '#fef3c7',
          borderRadius: 4, padding: '2px 6px', marginTop: 4,
        }}>{a}</div>
      ))}
    </div>
  );
}
