import { useState, useEffect } from 'react';
import { fetchWithRetry } from '../utils/fetch-with-retry';

type Props = { onClose: () => void };

export function AgendaCalendarSyncPanel({ onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [icsUrl, setIcsUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWithRetry('/api/agenda/ics-token')
      .then((r) => r.json())
      .then((data: { token: string }) => {
        setIcsUrl(`${window.location.origin}/api/agenda/feed.ics?token=${data.token}`);
      })
      .catch(() => setIcsUrl(null));
  }, []);

  async function handleCopy() {
    if (!icsUrl) return;
    await navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#2563eb', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{"🔗"} Sincronizzazione calendario</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>{"✕"}</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Fase 1: Subscription URL */}
          <div style={{ border: '2px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#f0fdf4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#15803d', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>FASE 1</span>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>Abbonamento automatico (nessun login)</span>
            </div>
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              Copia questo URL e aggiungilo in <strong>Google Calendar</strong> ({'"'}Aggiungi da URL{'"'}) o <strong>Apple Calendar</strong> ({'"'}Abbonati a calendario{'"'}). I tuoi appuntamenti si aggiorneranno automaticamente ogni 8-24h.
              {icsUrl ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={icsUrl}
                    style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#475569', background: '#f8fafc' }} />
                  <button onClick={handleCopy}
                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    {copied ? '✓ Copiato' : 'Copia'}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>Caricamento URL...</div>
              )}
            </div>
          </div>

          {/* Export one-shot */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8, fontSize: 13 }}>{"📤"} Esporta tutti gli appuntamenti (.ics)</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Scarica un file .ics compatibile con Google Calendar, Apple Calendar, Outlook.</div>
            <a href="/api/agenda/export.ics" download="agenda-formicanera.ics"
              style={{ display: 'inline-block', background: '#f1f5f9', color: '#374151', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              {"⬇"} Scarica .ics
            </a>
          </div>

          {/* Fase 3: coming soon */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 6, fontSize: 13 }}>{"🔄"} Sincronizzazione bidirezionale Google Calendar <span style={{ fontSize: 11, background: '#f1f5f9', color: '#94a3b8', borderRadius: 4, padding: '1px 6px', marginLeft: 4 }}>In arrivo</span></div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Accedi con Google una volta sola: i tuoi appuntamenti saranno sincronizzati in tempo reale in entrambe le direzioni.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
