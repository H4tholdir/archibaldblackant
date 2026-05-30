import { useState, useEffect } from 'react';
import type { NotificationTemplate } from '../types/notification-templates';
import { fetchTemplates, saveTemplate, deleteTemplate } from '../api/notification-templates';

const EVENT_LABELS: Record<string, string> = {
  overdue_step: 'Sollecito scaduto',
  new_invoice: 'Nuova fattura',
  pre_due: 'Pre-scadenza',
  periodic_statement: 'Estratto conto periodico',
};

const TONE_LABELS: Record<string, string> = {
  cordiale: 'Cordiale',
  formale: 'Formale',
  urgente: 'Urgente',
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

const VARIABLES = [
  { key: '{{cliente_nome}}', desc: 'Nome del cliente' },
  { key: '{{agente_nome}}', desc: "Nome dell'agente" },
  { key: '{{agente_titolo}}', desc: 'Titolo professionale agente' },
  { key: '{{agente_email}}', desc: 'Email agente (reply-to)' },
  { key: '{{agente_telefono}}', desc: 'Telefono agente' },
  { key: '{{totale}}', desc: 'Importo totale fatture' },
  { key: '{{n_fatture}}', desc: 'Numero di fatture' },
  { key: '{{lista_fatture}}', desc: 'Lista numeri fattura' },
  { key: '{{giorni}}', desc: 'Giorni alla scadenza (pre_due)' },
  { key: '{{tono}}', desc: 'Tono del messaggio' },
];

const DEFAULT_SUBJECTS: Record<string, Record<string, string>> = {
  overdue_step: {
    cordiale: 'Promemoria pagamento — {{n_fatture}} fatture · {{totale}}',
    formale: 'Sollecito pagamento — {{n_fatture}} fatture · {{totale}}',
    urgente: '⚠ Sollecito urgente — {{n_fatture}} fatture insolute · {{totale}}',
  },
  new_invoice: { cordiale: 'Nuova fattura emessa — {{n_fatture}} fatture · {{totale}}' },
  pre_due: { cordiale: 'Promemoria scadenza — {{n_fatture}} fatture in scadenza entro {{giorni}} giorni' },
  periodic_statement: { cordiale: 'Estratto conto — {{n_fatture}} fatture aperte · {{totale}}' },
};

type Props = { customerErpId?: string };

export function NotificationTemplateEditor({ customerErpId }: Props = {}) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selected, setSelected] = useState<NotificationTemplate>({
    event_type: 'overdue_step',
    tone: 'cordiale',
    channel: 'email',
    subject_tmpl: null,
    body_tmpl: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates(customerErpId).then(setTemplates).finally(() => setLoading(false));
  }, [customerErpId]);

  const loadTemplate = (event_type: string, tone: string, channel: string) => {
    const existing = templates.find(
      t => t.event_type === event_type && t.tone === tone && t.channel === channel,
    );
    setSelected({
      id: existing?.id,
      customer_erp_id: customerErpId ?? null,
      event_type: event_type as NotificationTemplate['event_type'],
      tone: tone as NotificationTemplate['tone'],
      channel: channel as NotificationTemplate['channel'],
      subject_tmpl: existing?.subject_tmpl ?? null,
      body_tmpl: existing?.body_tmpl ?? '',
    });
  };

  const handleSave = async () => {
    if (!selected.body_tmpl.trim()) return;
    setSaving(true);
    try {
      const templateToSave = { ...selected, customer_erp_id: customerErpId ?? null };
      const saved_tmpl = await saveTemplate(templateToSave);
      setTemplates(prev => {
        const idx = prev.findIndex(
          t => t.event_type === saved_tmpl.event_type && t.tone === saved_tmpl.tone && t.channel === saved_tmpl.channel,
        );
        if (idx >= 0) { const n = [...prev]; n[idx] = saved_tmpl; return n; }
        return [...prev, saved_tmpl];
      });
      setSelected(saved_tmpl);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected.id) return;
    await deleteTemplate(selected.id);
    setTemplates(prev => prev.filter(t => t.id !== selected.id));
    setSelected({ ...selected, id: undefined, subject_tmpl: null, body_tmpl: '' });
  };

  const availableTones = selected.event_type === 'overdue_step'
    ? ['cordiale', 'formale', 'urgente']
    : ['cordiale'];

  const defaultSubject = DEFAULT_SUBJECTS[selected.event_type]?.[selected.tone] ?? '';
  const hasCustom = !!selected.id;

  if (loading) return <div style={{ color: '#64748b', fontSize: '12px', padding: '8px' }}>Caricamento template...</div>;

  return (
    <div>
      {customerErpId && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#16a34a' }}>
          Template specifico per questo cliente — sovrascrive il template agente
        </div>
      )}
      {/* Selettori */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        {[
          {
            label: 'Evento',
            options: Object.entries(EVENT_LABELS),
            value: selected.event_type,
            onChange: (v: string) => {
              const tone = availableTones.includes(selected.tone) ? selected.tone : 'cordiale';
              loadTemplate(v, tone, selected.channel);
            },
          },
          {
            label: 'Tono',
            options: availableTones.map(t => [t, TONE_LABELS[t]] as [string, string]),
            value: selected.tone,
            onChange: (v: string) => loadTemplate(selected.event_type, v, selected.channel),
          },
          {
            label: 'Canale',
            options: Object.entries(CHANNEL_LABELS),
            value: selected.channel,
            onChange: (v: string) => loadTemplate(selected.event_type, selected.tone, v),
          },
        ].map(sel => (
          <div key={sel.label}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{sel.label}</div>
            <select
              value={sel.value}
              onChange={e => sel.onChange(e.target.value)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', color: '#0f172a', background: 'white' }}
            >
              {sel.options.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Badge stato */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
          background: hasCustom ? '#eff6ff' : '#f8fafc',
          color: hasCustom ? '#2563eb' : '#94a3b8',
          border: `1px solid ${hasCustom ? '#bfdbfe' : '#e2e8f0'}`,
        }}>
          {hasCustom ? '✏️ Template personalizzato' : '📄 Usando template di default'}
        </div>
        {hasCustom && (
          <button
            onClick={handleDelete}
            style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Ripristina default
          </button>
        )}
      </div>

      {/* Editor subject (solo email) */}
      {selected.channel === 'email' && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Oggetto email</div>
          <input
            type="text"
            value={selected.subject_tmpl ?? ''}
            placeholder={defaultSubject}
            onChange={e => setSelected(s => ({ ...s, subject_tmpl: e.target.value || null }))}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: '#0f172a' }}
          />
        </div>
      )}

      {/* Editor body */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
          {selected.channel === 'email' ? 'Testo introduttivo email' : 'Testo messaggio WhatsApp'}
        </div>
        <textarea
          value={selected.body_tmpl}
          placeholder={selected.channel === 'email' ? 'Testo del paragrafo introduttivo...' : 'Testo del messaggio WA con variabili {{...}}'}
          onChange={e => setSelected(s => ({ ...s, body_tmpl: e.target.value }))}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: '#0f172a', resize: 'vertical' }}
        />
      </div>

      {/* Variabili disponibili */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          Variabili disponibili
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {VARIABLES.map(v => (
            <span
              key={v.key}
              title={v.desc}
              onClick={() => setSelected(s => ({ ...s, body_tmpl: s.body_tmpl + v.key }))}
              style={{ fontSize: '11px', padding: '2px 6px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace' }}
            >
              {v.key}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Clicca per inserire nel testo</div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !selected.body_tmpl.trim()}
        style={{
          width: '100%', background: saved ? '#16a34a' : '#2563eb', color: 'white',
          border: 'none', borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700,
          cursor: saving || !selected.body_tmpl.trim() ? 'not-allowed' : 'pointer',
          opacity: !selected.body_tmpl.trim() ? 0.5 : 1,
        }}
      >
        {saving ? 'Salvataggio...' : saved ? '✓ Salvato' : 'Salva template'}
      </button>
    </div>
  );
}
