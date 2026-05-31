import { useState, useEffect } from 'react';
import type { NotificationSettings, NotificationProfile, EscalationStep } from '../types/notification-settings';
import type { NotificationLogEntry } from '../api/notification-settings';
import {
  fetchNotificationSettings, saveNotificationSettings,
  fetchNotificationProfiles, fetchPendingWa, updatePendingWaStatus,
  fetchNotificationLog,
} from '../api/notification-settings';
import { NotificationTemplateEditor } from './NotificationTemplateEditor';

type PendingWa = {
  id: string; customerErpId: string; phoneTo: string;
  messageText: string; tone: string; status: string;
  invoiceNumbers: string[]; totalAmount: number | null;
};

type Props = { erpId: string; customerEmail: string | null; customerMobile: string | null; contactWritePendingAt?: string | null };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: on ? '#2563eb' : '#e2e8f0',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: '20px', height: '20px', background: 'white', borderRadius: '50%',
        position: 'absolute', top: '2px',
        left: on ? '22px' : '2px',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '8px', marginTop: '16px' }}>
      {children}
    </div>
  );
}

function InputField({ label, value, placeholder, onChange, type = 'text', hint }: {
  label: string; value: string; placeholder?: string;
  onChange: (v: string) => void; type?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{label}</div>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          border: '1px solid #e2e8f0', borderRadius: '8px',
          padding: '8px 10px', fontSize: '13px', color: '#0f172a',
          outline: 'none', background: '#fff',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
      />
      {hint && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{hint}</div>}
    </div>
  );
}

export function NotificheTab({ erpId, customerEmail, customerMobile, contactWritePendingAt }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
  const [pendingWa, setPendingWa] = useState<PendingWa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recentLog, setRecentLog] = useState<NotificationLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [customStepsMode, setCustomStepsMode] = useState(false);
  const [editingSteps, setEditingSteps] = useState<EscalationStep[]>([]);

  useEffect(() => {
    Promise.all([
      fetchNotificationSettings(erpId),
      fetchNotificationProfiles(),
      fetchPendingWa(),
      fetchNotificationLog(erpId),
    ]).then(([s, p, wa, log]) => {
      setSettings(s ?? {
        enabled: false, profileId: null, overrideSteps: null,
        emailOverride: null, whatsappOverride: null,
        notifyNewInvoice: true, notifyPreDue: true, preDueDays: 7,
        periodicStatementEnabled: false, periodicStatementDays: 30,
        periodicStatementContent: { open_invoices: true, total_due: true, credit_notes: true, history: false },
        effectiveEmail: customerEmail, effectiveWhatsapp: customerMobile,
      });
      setProfiles(p);
      setPendingWa(wa.filter(w => w.customerErpId === erpId));
      setRecentLog(log);
    }).catch(() => null).finally(() => setLoading(false));
  }, [erpId, customerEmail, customerMobile]);

  useEffect(() => {
    if (customStepsMode && settings) {
      const currentSteps = settings.overrideSteps ??
        profiles.find(p => p.id === settings.profileId)?.steps ?? [];
      setEditingSteps(currentSteps.map(s => ({
        days_after_due: s.days_after_due,
        tone: s.tone,
        channels: [...s.channels],
      })));
    }
  }, [customStepsMode]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveNotificationSettings(erpId, settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleSendWa = async (wa: PendingWa) => {
    await updatePendingWaStatus(wa.id, 'opened_by_agent');
    const encoded = encodeURIComponent(wa.messageText);
    window.open(`https://wa.me/${wa.phoneTo.replace(/\D/g, '')}?text=${encoded}`, '_blank');
    setTimeout(() => {
      updatePendingWaStatus(wa.id, 'confirmed_sent');
      setPendingWa(p => p.filter(x => x.id !== wa.id));
    }, 3000);
  };

  if (loading) {
    return <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Caricamento...</div>;
  }
  if (!settings) return null;

  const effectiveEmail = settings.emailOverride || customerEmail;
  const effectiveWhatsapp = settings.whatsappOverride || customerMobile;
  const hasContacts = !!(effectiveEmail || effectiveWhatsapp);

  return (
    <div>
      {/* Toggle master */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: hasContacts ? '#f8fafc' : '#f1f5f9',
        border: '1px solid #e2e8f0', borderRadius: '10px',
        padding: '12px 14px', marginBottom: '12px',
        opacity: hasContacts ? 1 : 0.7,
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Notifiche economiche</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {hasContacts
              ? (settings.enabled ? 'Attive · email auto + WA manuale' : 'Disabilitate')
              : 'Disabilitate · contatti mancanti'}
          </div>
        </div>
        <Toggle
          on={settings.enabled && hasContacts}
          onChange={v => hasContacts && setSettings(s => s ? { ...s, enabled: v } : s)}
        />
      </div>

      {/* Warning contatti mancanti */}
      {!hasContacts && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#d97706', marginBottom: '6px' }}>
            ⚠ Contatti mancanti
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
            Aggiungi un contatto email o WhatsApp per abilitare le notifiche. Puoi inserire un indirizzo di override qui sotto senza modificare la scheda cliente.
          </div>
          <InputField
            label="Email di contatto per notifiche"
            value={settings.emailOverride ?? ''}
            placeholder="es. cliente@dominio.it"
            type="email"
            onChange={v => setSettings(s => s ? { ...s, emailOverride: v || null } : s)}
            hint="Sovrascrive l'email della scheda cliente solo per le notifiche"
          />
          <InputField
            label="Numero WhatsApp per notifiche"
            value={settings.whatsappOverride ?? ''}
            placeholder="+39 333 1234567"
            type="tel"
            onChange={v => setSettings(s => s ? { ...s, whatsappOverride: v || null } : s)}
            hint="Sovrascrive il mobile della scheda cliente solo per le notifiche"
          />
          <button
            onClick={handleSave}
            style={{
              width: '100%', background: '#2563eb', color: 'white', border: 'none',
              borderRadius: '8px', padding: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Salva contatti e abilita
          </button>
        </div>
      )}

      {/* Sezioni visibili solo se ha contatti */}
      {hasContacts && settings.enabled && (
        <>
          {/* WA pending per questo cliente */}
          {pendingWa.filter(w => w.status !== 'confirmed_sent' && w.status !== 'dismissed').map(wa => (
            <div key={wa.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ background: '#fef3c7', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                💬 Messaggio WhatsApp da inviare
              </div>
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{wa.phoneTo} · {wa.invoiceNumbers.join(', ')}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => updatePendingWaStatus(wa.id, 'dismissed').then(() => setPendingWa(p => p.filter(x => x.id !== wa.id)))}
                    style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
                  >
                    Ignora
                  </button>
                  <button
                    onClick={() => handleSendWa(wa)}
                    style={{ flex: 2, background: '#16a34a', border: 'none', borderRadius: '6px', padding: '6px', fontSize: '12px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                  >
                    💬 Apri WhatsApp →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Configurazione — visibile se ha contatti (enabled o no) */}
      {hasContacts && (
        <>
          {/* Profilo escalation */}
          <SectionTitle>Profilo di escalation</SectionTitle>

          {!customStepsMode ? (
            <>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                {profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSettings(s => s ? { ...s, profileId: p.id, overrideSteps: null } : s)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      border: `1px solid ${settings.profileId === p.id && !settings.overrideSteps ? '#2563eb' : '#e2e8f0'}`,
                      background: settings.profileId === p.id && !settings.overrideSteps ? '#eff6ff' : 'white',
                      color: settings.profileId === p.id && !settings.overrideSteps ? '#2563eb' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={() => setCustomStepsMode(true)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${settings.overrideSteps ? '#7c3aed' : '#e2e8f0'}`,
                    background: settings.overrideSteps ? '#faf5ff' : 'white',
                    color: settings.overrideSteps ? '#7c3aed' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ Personalizzato{settings.overrideSteps ? ` (${settings.overrideSteps.length} passi)` : ''}
                </button>
              </div>
              {settings.profileId && profiles.find(p => p.id === settings.profileId) && !settings.overrideSteps && (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                  {profiles.find(p => p.id === settings.profileId)!.steps.map(s =>
                    `+${s.days_after_due}gg → ${s.tone}`
                  ).join(' · ')}
                </div>
              )}
            </>
          ) : (
            /* Modalità editor step personalizzati */
            <div style={{ border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px', marginBottom: '8px', background: '#faf5ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>Passi personalizzati</div>
                <button
                  onClick={() => setCustomStepsMode(false)}
                  style={{ fontSize: '11px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Annulla
                </button>
              </div>

              {/* Lista passi */}
              {editingSteps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', background: 'white', borderRadius: '8px', padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>+</span>
                    <input
                      type="number"
                      min={0} max={365}
                      value={step.days_after_due}
                      onChange={e => setEditingSteps(prev => prev.map((s, i) => i === idx ? { ...s, days_after_due: parseInt(e.target.value) || 0 } : s))}
                      style={{ width: '48px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 6px', fontSize: '12px', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>gg</span>
                  </div>
                  <select
                    value={step.tone}
                    onChange={e => setEditingSteps(prev => prev.map((s, i) => i === idx ? { ...s, tone: e.target.value as EscalationStep['tone'] } : s))}
                    style={{ fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 6px' }}
                  >
                    <option value="cordiale">Cordiale</option>
                    <option value="formale">Formale</option>
                    <option value="urgente">Urgente</option>
                  </select>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['email', 'whatsapp'] as const).map(ch => (
                      <label key={ch} style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={step.channels.includes(ch)}
                          onChange={e => setEditingSteps(prev => prev.map((s, i) => i === idx
                            ? { ...s, channels: e.target.checked ? [...s.channels, ch] : s.channels.filter(c => c !== ch) }
                            : s
                          ))}
                        />
                        {ch}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => setEditingSteps(prev => prev.filter((_, i) => i !== idx))}
                    style={{ marginLeft: 'auto', fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Aggiungi passo */}
              <button
                onClick={() => setEditingSteps(prev => [...prev, { days_after_due: (prev[prev.length - 1]?.days_after_due ?? 0) + 15, tone: 'cordiale', channels: ['email'] }])}
                style={{ width: '100%', background: 'none', border: '1px dashed #c4b5fd', borderRadius: '8px', padding: '6px', fontSize: '12px', color: '#7c3aed', cursor: 'pointer', marginBottom: '8px' }}
              >
                + Aggiungi passo
              </button>

              {/* Applica */}
              <button
                onClick={() => {
                  setSettings(s => s ? { ...s, overrideSteps: editingSteps, profileId: null } : s);
                  setCustomStepsMode(false);
                }}
                style={{ width: '100%', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Applica passi personalizzati
              </button>
            </div>
          )}

          {/* Contatti override */}
          <SectionTitle>Contatti per notifiche</SectionTitle>
          {contactWritePendingAt && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>⏳</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8' }}>Override contatti attivo per le notifiche</div>
                <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '1px' }}>Questi valori sostituiscono i dati della scheda cliente solo per le notifiche</div>
              </div>
            </div>
          )}
          <InputField
            label="Email"
            value={settings.emailOverride ?? customerEmail ?? ''}
            placeholder={customerEmail ?? 'nessuna email nella scheda cliente'}
            type="email"
            onChange={v => setSettings(s => s ? { ...s, emailOverride: v || null } : s)}
            hint={settings.emailOverride ? 'Override attivo · sovrascrive la scheda cliente' : `Da scheda cliente: ${customerEmail ?? 'non disponibile'}`}
          />
          <InputField
            label="Numero WhatsApp"
            value={settings.whatsappOverride ?? customerMobile ?? ''}
            placeholder={customerMobile ?? 'nessun mobile nella scheda cliente'}
            type="tel"
            onChange={v => setSettings(s => s ? { ...s, whatsappOverride: v || null } : s)}
            hint={settings.whatsappOverride ? 'Override attivo · sovrascrive la scheda cliente' : `Da scheda cliente: ${customerMobile ?? 'non disponibile'}`}
          />

          {/* Trigger */}
          <SectionTitle>Quando inviare</SectionTitle>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Notifica nuova fattura</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Inviata appena la fattura viene sincronizzata</div>
            </div>
            <Toggle
              on={settings.notifyNewInvoice}
              onChange={v => setSettings(s => s ? { ...s, notifyNewInvoice: v } : s)}
            />
          </div>

          <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Avviso pre-scadenza</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Promemoria prima della data di scadenza</div>
              </div>
              <Toggle
                on={settings.notifyPreDue}
                onChange={v => setSettings(s => s ? { ...s, notifyPreDue: v } : s)}
              />
            </div>
            {settings.notifyPreDue && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Invia</span>
                <input
                  type="number"
                  min={1} max={30}
                  value={settings.preDueDays}
                  onChange={e => setSettings(s => s ? { ...s, preDueDays: parseInt(e.target.value) || 7 } : s)}
                  style={{ width: '56px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>giorni prima della scadenza</span>
              </div>
            )}
          </div>

          <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Estratto conto periodico</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Riepilogo situazione a intervalli regolari</div>
              </div>
              <Toggle
                on={settings.periodicStatementEnabled}
                onChange={v => setSettings(s => s ? { ...s, periodicStatementEnabled: v } : s)}
              />
            </div>
            {settings.periodicStatementEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Ogni</span>
                <input
                  type="number"
                  min={7} max={365}
                  value={settings.periodicStatementDays}
                  onChange={e => setSettings(s => s ? { ...s, periodicStatementDays: parseInt(e.target.value) || 30 } : s)}
                  style={{ width: '56px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>giorni</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Invii recenti */}
      {hasContacts && recentLog.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b' }}>
              Invii recenti
            </div>
            <button
              onClick={() => setShowLog(v => !v)}
              style={{ fontSize: '12px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {showLog ? 'Nascondi ▲' : `Mostra (${recentLog.length}) ▼`}
            </button>
          </div>
          {showLog && recentLog.map((entry, i) => {
            const eventLabel: Record<string, string> = {
              overdue_step: '⏰ Sollecito scaduto',
              new_invoice: '📄 Nuova fattura',
              pre_due: '🔔 Pre-scadenza',
            };
            const channelLabel: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp' };
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                    {eventLabel[entry.event_type] ?? entry.event_type} · {channelLabel[entry.channel] ?? entry.channel}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {entry.invoice_number}{entry.tone ? ` · tono ${entry.tone}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>
                  {new Date(entry.sent_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template per-cliente (collassabile) */}
      {hasContacts && settings.enabled && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => setShowTemplateEditor(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '10px 14px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>✏️</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Template messaggi</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Personalizza il testo per questo cliente</div>
              </div>
            </div>
            <span style={{ color: '#64748b', fontSize: '12px' }}>{showTemplateEditor ? '▲' : '▼'}</span>
          </button>
          {showTemplateEditor && (
            <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
              <NotificationTemplateEditor customerErpId={erpId} />
            </div>
          )}
        </div>
      )}

      {/* Bottone salva */}
      {hasContacts && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', marginTop: '16px',
            background: saved ? '#16a34a' : '#2563eb',
            color: 'white', border: 'none',
            borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Salvataggio...' : saved ? '✓ Salvato' : 'Salva impostazioni'}
        </button>
      )}
    </div>
  );
}
