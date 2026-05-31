import { useState, useEffect } from 'react';
import type { AgentNotificationProfile } from '../types/notification-settings';
import { fetchAgentNotificationProfile, saveAgentNotificationProfile } from '../api/notification-settings';

export function AgentNotificationProfileForm() {
  const [profile, setProfile] = useState<AgentNotificationProfile>({
    notification_display_name: null,
    notification_reply_to_email: null,
    notification_phone: null,
    notification_title: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgentNotificationProfile().then(setProfile).catch(() => null);
  }, []);

  const isComplete = !!(
    profile.notification_reply_to_email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.notification_reply_to_email)
  );

  const handleSave = async () => {
    if (!isComplete) {
      setError("L'email di risposta è obbligatoria");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveAgentNotificationProfile(profile);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore durante il salvataggio';
      if (msg.includes('session_invalidated') || msg.includes('401')) {
        setError('Sessione scaduta — ricarica la pagina');
      } else {
        setError('Errore durante il salvataggio');
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof AgentNotificationProfile,
    hint: string,
    opts?: { required?: boolean; type?: string; placeholder?: string }
  ) => (
    <div key={key} style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{label}</label>
        {opts?.required && !profile[key] && (
          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700 }}>OBBLIGATORIO</span>
        )}
      </div>
      <input
        type={opts?.type ?? 'text'}
        value={profile[key] ?? ''}
        placeholder={opts?.placeholder ?? hint}
        onChange={e => setProfile(p => ({ ...p, [key]: e.target.value || null }))}
        style={{
          width: '100%',
          border: `1px solid ${opts?.required && !profile[key] ? '#fca5a5' : '#e2e8f0'}`,
          borderRadius: '8px',
          padding: '9px 12px',
          fontSize: '13px',
          color: '#0f172a',
          background: '#f8fafc',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#fff'; }}
        onBlur={e => { e.currentTarget.style.borderColor = opts?.required && !profile[key] ? '#fca5a5' : '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
      />
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
        Variabile template: <code style={{ fontSize: '10px', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', color: '#475569' }}>{hint}</code>
      </div>
    </div>
  );

  return (
    <div>
      {!isComplete && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '14px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>Profilo incompleto — notifiche bloccate</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Configura email di risposta per abilitare l&apos;invio automatico</div>
          </div>
        </div>
      )}

      {field('Nome visualizzato', 'notification_display_name', '{{agente_nome}}', { placeholder: 'Es. Mario Rossi' })}
      {field('Email risposta clienti', 'notification_reply_to_email', 'Reply-To header email', { required: true, type: 'email', placeholder: 'la.tua@email.it' })}
      {field('Telefono agente', 'notification_phone', '{{agente_telefono}}', { placeholder: '+39 000 000 0000' })}
      {field('Titolo professionale', 'notification_title', '{{agente_titolo}}', { placeholder: 'Es. Agente Komet Dental Italy' })}

      {error && (
        <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px', padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      <button
        onClick={() => { void handleSave(); }}
        disabled={saving}
        style={{
          width: '100%',
          background: saved ? '#16a34a' : '#2563eb',
          color: 'white',
          fontSize: '13px',
          fontWeight: 700,
          padding: '11px',
          borderRadius: '8px',
          border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saved ? '✓ Salvato' : saving ? 'Salvataggio...' : 'Salva dati notifiche'}
      </button>
    </div>
  );
}
