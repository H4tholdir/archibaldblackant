import { useState, useEffect } from 'react';
import type { NotificationSettings, NotificationProfile } from '../types/notification-settings';
import {
  fetchNotificationSettings, saveNotificationSettings,
  fetchNotificationProfiles, fetchPendingWa, updatePendingWaStatus,
} from '../api/notification-settings';

type PendingWa = {
  id: string;
  customerErpId: string;
  phoneTo: string;
  messageText: string;
  tone: string;
  status: string;
  invoiceNumbers: string[];
  totalAmount: number | null;
};

type Props = { erpId: string; customerEmail: string | null; customerMobile: string | null };

export function NotificheTab({ erpId, customerEmail, customerMobile }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
  const [pendingWa, setPendingWa] = useState<PendingWa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchNotificationSettings(erpId),
      fetchNotificationProfiles(),
      fetchPendingWa(),
    ]).then(([s, p, wa]) => {
      setSettings(s ?? {
        enabled: false,
        profileId: null,
        overrideSteps: null,
        emailOverride: null,
        whatsappOverride: null,
        notifyNewInvoice: true,
        notifyPreDue: true,
        preDueDays: 7,
        periodicStatementEnabled: false,
        periodicStatementDays: 30,
        periodicStatementContent: { open_invoices: true, total_due: true, credit_notes: true, history: false },
        effectiveEmail: customerEmail,
        effectiveWhatsapp: customerMobile,
      });
      setProfiles(p);
      setPendingWa(wa.filter(w => w.customerErpId === erpId));
    }).catch(() => null).finally(() => setLoading(false));
  }, [erpId, customerEmail, customerMobile]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveNotificationSettings(erpId, settings);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSendWa = async (wa: PendingWa) => {
    await updatePendingWaStatus(wa.id, 'opened_by_agent');
    const encoded = encodeURIComponent(wa.messageText);
    window.open(`https://wa.me/${wa.phoneTo.replace(/\D/g, '')}?text=${encoded}`, '_blank');
    setTimeout(() => { void updatePendingWaStatus(wa.id, 'confirmed_sent'); }, 3000);
  };

  if (loading) return <div style={{ padding: '16px', color: '#64748b' }}>Caricamento...</div>;
  if (!settings) return null;

  const hasContacts = !!(settings.effectiveEmail || settings.effectiveWhatsapp);

  if (!hasContacts) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📬</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>Notifiche economiche</div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>Disabilitate — contatti mancanti</div>
          </div>
        </div>
        <div style={{ background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#fca5a5', marginBottom: '4px' }}>⚠ Contatti mancanti</div>
          <div style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.5 }}>
            Configura email o numero WhatsApp nel tab Contatti per abilitare le notifiche.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Toggle master */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>📬</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>
              Notifiche economiche {settings.enabled ? 'attive' : 'disabilitate'}
            </div>
            <div style={{ fontSize: '9px', color: '#64748b' }}>Email auto + WhatsApp manuale</div>
          </div>
        </div>
        <div
          onClick={() => setSettings(s => s ? { ...s, enabled: !s.enabled } : s)}
          style={{
            width: '40px', height: '22px', borderRadius: '11px',
            background: settings.enabled ? '#22c55e' : '#334155',
            position: 'relative', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <div style={{
            width: '18px', height: '18px', background: 'white', borderRadius: '50%',
            position: 'absolute', top: '2px',
            ...(settings.enabled ? { right: '2px' } : { left: '2px' }),
          }} />
        </div>
      </div>

      {/* Profilo attivo */}
      {settings.enabled && profiles.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px' }}>
          <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', marginBottom: '6px' }}>Profilo escalation</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => setSettings(s => s ? { ...s, profileId: p.id } : s)}
                style={{
                  background: settings.profileId === p.id ? '#1e40af' : '#0f172a',
                  color: settings.profileId === p.id ? '#93c5fd' : '#64748b',
                  border: `1px solid ${settings.profileId === p.id ? '#3b82f6' : '#334155'}`,
                  borderRadius: '6px', padding: '4px 10px', fontSize: '9px',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WA pending per questo cliente */}
      {pendingWa.filter(w => w.status !== 'confirmed_sent' && w.status !== 'dismissed').map(wa => (
        <div key={wa.id} style={{ background: '#1a1200', border: '1px solid #f59e0b', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
          <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase' }}>💬 WA da inviare · pending</span>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '6px' }}>{wa.phoneTo}</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => {
                  void updatePendingWaStatus(wa.id, 'dismissed').then(() =>
                    setPendingWa(p => p.filter(x => x.id !== wa.id))
                  );
                }}
                style={{ flex: 1, background: '#78350f', border: '1px solid #f59e0b', borderRadius: '6px', padding: '5px', fontSize: '9px', color: '#fcd34d', cursor: 'pointer' }}
              >
                🚫 Ignora
              </button>
              <button
                onClick={() => { void handleSendWa(wa); }}
                style={{ flex: 2, background: '#166534', borderRadius: '6px', padding: '5px', fontSize: '9px', fontWeight: 700, color: '#86efac', border: 'none', cursor: 'pointer' }}
              >
                💬 Apri WhatsApp →
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={() => { void handleSave(); }}
        disabled={saving}
        style={{ width: '100%', background: '#22c55e', color: '#0f2211', fontSize: '10px', fontWeight: 700, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginTop: '10px' }}
      >
        {saving ? 'Salvataggio...' : 'Salva impostazioni'}
      </button>
    </div>
  );
}
