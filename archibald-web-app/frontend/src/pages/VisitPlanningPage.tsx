import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisitPlanningSession } from '../types/visit-planning';
import { VISIT_MODE_LABELS } from '../types/visit-planning';
import * as vpService from '../services/visit-planning.service';
import { VisitPlanningWizard } from '../components/visit-planning/VisitPlanningWizard';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  draft:       { label: 'Bozza',       bg: '#f1f5f9', color: '#475569' },
  planned:     { label: 'Pianificato', bg: '#dbeafe', color: '#1e40af' },
  in_progress: { label: 'In corso',    bg: '#dcfce7', color: '#166534' },
  completed:   { label: 'Completato',  bg: '#f0fdf4', color: '#15803d' },
  cancelled:   { label: 'Annullato',   bg: '#fee2e2', color: '#991b1b' },
};

export function VisitPlanningPage() {
  const navigate = useNavigate();
  const [sessions, setSessions]     = useState<VisitPlanningSession[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading]       = useState(true);

  const today      = new Date().toISOString().slice(0, 10);
  const monthAgo   = new Date(Date.now() - 30 * 24 * 3600000).toISOString().slice(0, 10);
  const monthAhead = new Date(Date.now() + 60 * 24 * 3600000).toISOString().slice(0, 10);

  useEffect(() => {
    vpService.listSessions({ from: monthAgo, to: monthAhead })
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (input: Parameters<typeof vpService.createSession>[0]) => {
    const session = await vpService.createSession(input);
    navigate(`/giri/${session.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`Eliminare il giro "${title}"? Questa azione non è reversibile.`)) return;
    try {
      await vpService.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch {
      alert('Errore durante l\'eliminazione. Riprova.');
    }
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '12px 16px' : '24px 32px', backgroundColor: '#f9fafb', minHeight: '100%', borderRadius: isMobile ? 0 : 12 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🗺️ Giri Visite</h1>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>Pianifica e gestisci i tuoi giri clienti</p>

        {/* Due entry point */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 4 }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
            borderRadius: 12, padding: 18, color: 'white',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,.2)', padding: '2px 8px', borderRadius: 10, display: 'inline-block', marginBottom: 8 }}>
              TU SCEGLI
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>📍 Esplora per zona</div>
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4, marginBottom: 12 }}>
              Sfoglia i clienti per zona e costruisci il giro scegliendo chi visitare.
            </div>
            <button
              onClick={() => navigate('/giri/zone')}
              style={{ background: 'white', color: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', width: '100%' }}
            >Esplora zone →</button>
          </div>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, display: 'inline-block', marginBottom: 8 }}>
                AUTO
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 5 }}>⚡ Genera</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4, marginBottom: 12 }}>
                L&apos;algoritmo seleziona i clienti migliori.
              </div>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 12, cursor: 'pointer', width: '100%' }}
            >Genera giro</button>
          </div>
        </div>
      </div>

      {showWizard && (
        <div style={{ marginBottom: 24 }}>
          <VisitPlanningWizard onSubmit={handleCreate} onCancel={() => setShowWizard(false)} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Caricamento...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Nessun giro pianificato</div>
          <div style={{ fontSize: 13 }}>Premi "+ Nuovo giro" per iniziare</div>
        </div>
      ) : (
        <div>
          {sessions.map(s => {
            const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft;
            const isToday = s.startDate === today;
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/giri/${s.id}`)}
                style={{
                  background: isToday ? '#eff6ff' : 'white',
                  border: isToday ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 10, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,.05)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {formatDate(s.startDate)} · {VISIT_MODE_LABELS[s.mode]}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb' }}>OGGI</span>}
                  <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10 }}>{badge.label}</span>
                  <button
                    onClick={e => handleDelete(e, s.id, s.title)}
                    title="Elimina giro"
                    style={{ background: '#fee2e2', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13, padding: '3px 8px', borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; }}
                  >🗑</button>
                  <span style={{ color: '#9ca3af' }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 40 }}>
        <a href="/giri/feste" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
          🎉 Gestisci feste patronali →
        </a>
        <a href="/giri/corsi" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', marginLeft: 16 }}>
          🎓 Gestisci corsi →
        </a>
      </div>
    </div>
  );
}
