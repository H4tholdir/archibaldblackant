import React from 'react';
import type { Reminder, CreateReminderInput, ReminderType, ReminderPriority } from '../services/reminders.service';
import {
  REMINDER_TYPE_LABELS, REMINDER_PRIORITY_LABELS, REMINDER_PRIORITY_COLORS,
  RECURRENCE_OPTIONS, computeDueDateFromChip,
} from '../services/reminders.service';

type ReminderFormProps = {
  customerProfile: string;
  initial?: Partial<Reminder>;
  onSave: (input: CreateReminderInput) => Promise<void>;
  onCancel: () => void;
};

const DATE_CHIPS = ['Domani', '3 giorni', '1 settimana', '2 settimane', '1 mese', '3 mesi'];

export function ReminderForm({ customerProfile: _customerProfile, initial, onSave, onCancel }: ReminderFormProps) {
  const [type, setType] = React.useState<ReminderType>(initial?.type ?? 'commercial_contact');
  const [priority, setPriority] = React.useState<ReminderPriority>(initial?.priority ?? 'normal');
  const [dueAt, setDueAt] = React.useState(
    initial?.dueAt ? initial.dueAt.split('T')[0] : new Date(Date.now() + 86400000).toISOString().split('T')[0],
  );
  const [recurrenceDays, setRecurrenceDays] = React.useState<number | null>(initial?.recurrenceDays ?? null);
  const [notifyVia, setNotifyVia] = React.useState<'app' | 'email'>(initial?.notifyVia ?? 'app');
  const [note, setNote] = React.useState(initial?.note ?? '');
  const [saving, setSaving] = React.useState(false);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);

  function handleChip(chip: string) {
    setActiveChip(chip);
    setDueAt(computeDueDateFromChip(chip).split('T')[0]);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSave({
        type,
        priority,
        due_at: new Date(dueAt + 'T09:00:00').toISOString(),
        recurrence_days: recurrenceDays,
        note: note.trim() || null,
        notify_via: notifyVia,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Tipo di contatto
        </label>
        <select value={type} onChange={(e) => setType(e.target.value as ReminderType)}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
          {(Object.entries(REMINDER_TYPE_LABELS) as [ReminderType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Priorità</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['urgent', 'normal', 'low'] as ReminderPriority[]).map((p) => {
            const colors = REMINDER_PRIORITY_COLORS[p];
            const selected = priority === p;
            return (
              <button key={p} onClick={() => setPriority(p)} style={{
                padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
                fontWeight: selected ? 700 : 400,
                border: selected ? `2px solid ${colors.text}` : '1px solid #e2e8f0',
                background: selected ? colors.bg : '#fff',
                color: selected ? colors.text : '#64748b',
              }}>{REMINDER_PRIORITY_LABELS[p]}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Quando</label>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {DATE_CHIPS.map((chip) => (
            <button key={chip} onClick={() => handleChip(chip)} style={{
              padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px',
              border: activeChip === chip ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: activeChip === chip ? '#eff6ff' : '#fff',
              color: activeChip === chip ? '#1d4ed8' : '#64748b',
            }}>{chip}</button>
          ))}
          <button onClick={() => setActiveChip('custom')} style={{ padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>📅 Data…</button>
        </div>
        <input type="date" value={dueAt} onChange={(e) => { setDueAt(e.target.value); setActiveChip('custom'); }}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Ripetizione</label>
        <select value={recurrenceDays ?? 'null'} onChange={(e) => setRecurrenceDays(e.target.value === 'null' ? null : Number(e.target.value))}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
          {RECURRENCE_OPTIONS.map(({ label, days }) => (
            <option key={String(days)} value={String(days)}>{label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['app', 'email'] as const).map((v) => (
            <button key={v} onClick={() => setNotifyVia(v)} style={{
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              border: notifyVia === v ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: notifyVia === v ? '#eff6ff' : '#fff',
              color: notifyVia === v ? '#1d4ed8' : '#64748b',
            }}>{v === 'app' ? '📱 App' : '📧 Email'}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <textarea value={note ?? ''} onChange={(e) => setNote(e.target.value)}
          placeholder="Es: proporre preventivo trattamento X..."
          rows={2}
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => { void handleSubmit(); }} disabled={saving} style={{ flex: 1, padding: '8px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontSize: '13px' }}>
          {saving ? 'Salvataggio...' : 'Salva promemoria'}
        </button>
        <button onClick={onCancel} style={{ padding: '8px 14px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Annulla</button>
      </div>
    </div>
  );
}
