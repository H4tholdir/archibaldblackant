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
      setError("L'email di risposta clienti è obbligatoria");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveAgentNotificationProfile(profile);
      setProfile(updated);
    } catch {
      setError('Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  type FieldKey = keyof AgentNotificationProfile;

  const renderField = (label: string, key: FieldKey, hint: string, required = false) => (
    <div key={key} style={{ background: '#1e293b', borderRadius: '8px', padding: '9px 12px', marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>{label}</div>
        {required && <div style={{ fontSize: '7px', color: '#ef4444', fontWeight: 700 }}>OBBLIGATORIO</div>}
      </div>
      <input
        value={profile[key] ?? ''}
        onChange={e => setProfile(p => ({ ...p, [key]: e.target.value || null }))}
        style={{
          background: '#0f172a',
          border: `1px solid ${required && !profile[key] ? '#ef4444' : '#334155'}`,
          borderRadius: '5px', padding: '5px 8px', color: '#e2e8f0', fontSize: '10px',
          width: '100%', outline: 'none', boxSizing: 'border-box',
        }}
      />
      <div style={{ fontSize: '7px', color: '#475569', marginTop: '2px' }}>→ {hint}</div>
    </div>
  );

  return (
    <div>
      {!isComplete && (
        <div style={{ background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#fca5a5' }}>⚠️ Profilo incompleto — notifiche bloccate</div>
          <div style={{ fontSize: '8px', color: '#94a3b8' }}>Configura email di risposta per abilitare l&apos;invio automatico</div>
        </div>
      )}
      {renderField('Nome visualizzato', 'notification_display_name', '{{agente_nome}}')}
      {renderField('Email risposta clienti', 'notification_reply_to_email', 'Reply-To header email', true)}
      {renderField('Telefono agente', 'notification_phone', '{{agente_telefono}}')}
      {renderField('Titolo professionale', 'notification_title', '{{agente_titolo}}')}
      {error && <div style={{ color: '#ef4444', fontSize: '9px', marginBottom: '8px' }}>{error}</div>}
      <button
        onClick={() => { void handleSave(); }}
        disabled={saving}
        style={{ width: '100%', background: '#22c55e', color: '#0f2211', fontSize: '10px', fontWeight: 700, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
      >
        {saving ? 'Salvataggio...' : 'Salva profilo notifiche'}
      </button>
    </div>
  );
}
