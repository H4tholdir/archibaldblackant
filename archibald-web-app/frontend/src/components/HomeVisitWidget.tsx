import { Link } from 'react-router-dom';
import type { VisitPlanningSession, VisitPlanningStop, StopStatus } from '../types/visit-planning';
import { STOP_STATUS_COLORS } from '../types/visit-planning';

type Props = {
  todaySession: VisitPlanningSession | null;
  stops:        VisitPlanningStop[];
};

const CONFIRMED: StopStatus[] = ['confirmed', 'planned', 'to_call'];

export function HomeVisitWidget({ todaySession, stops }: Props) {
  if (!todaySession) {
    return (
      <Link to="/giri" style={{ textDecoration: 'none' }}>
        <div style={{
          background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10,
          padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>🗺️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Nessun giro pianificato oggi</div>
            <div style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>Pianifica il tuo giro →</div>
          </div>
        </div>
      </Link>
    );
  }

  const activeStops  = stops.filter(s => CONFIRMED.includes(s.status));
  const visitedCount = stops.filter(s => s.status === 'visited').length;
  const nextStop     = activeStops[0] ?? null;

  return (
    <Link to={`/giri/${todaySession.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'white', border: '2px solid #2563eb', borderRadius: 10,
        padding: '12px 14px', marginBottom: 12,
        boxShadow: '0 2px 8px rgba(37,99,235,.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
              <span aria-hidden="true">🗺️ </span>
              <span>{todaySession.title}</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {activeStops.length} {activeStops.length === 1 ? 'tappa' : 'tappe'} · {visitedCount} visitate
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>Apri →</span>
        </div>

        {nextStop && (
          <div style={{ background: '#eff6ff', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STOP_STATUS_COLORS[nextStop.status], flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Prossima:</span> {nextStop.displayName}
              {nextStop.estimatedArrival && (
                <span style={{ color: '#6b7280', marginLeft: 6 }}>
                  {new Date(nextStop.estimatedArrival).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
