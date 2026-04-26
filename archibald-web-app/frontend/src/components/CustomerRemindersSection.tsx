import React from 'react';
import { ReminderForm } from './ReminderForm';
import {
  listCustomerReminders, createReminder, patchReminder, deleteReminder,
  REMINDER_PRIORITY_COLORS,
  REMINDER_PRIORITY_LABELS, formatDueAt,
} from '../services/reminders.service';
import type { Reminder, CreateReminderInput } from '../services/reminders.service';

type Filter = 'active' | 'done' | 'all';

export function CustomerRemindersSection({ customerProfile, openNewForm, onNewFormClose }: {
  customerProfile: string;
  openNewForm?: boolean;
  onNewFormClose?: () => void;
}) {
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [filter, setFilter] = React.useState<Filter>('active');
  const [isNewFormOpen, setIsNewFormOpen] = React.useState(openNewForm ?? false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [completingId, setCompletingId] = React.useState<number | null>(null);
  const [completionNote, setCompletionNote] = React.useState('');

  React.useEffect(() => {
    listCustomerReminders(customerProfile, filter).then(setReminders).catch(() => {});
  }, [customerProfile, filter]);

  React.useEffect(() => {
    if (openNewForm) setIsNewFormOpen(true);
  }, [openNewForm]);

  const activeCount = reminders.filter((r) => r.status === 'active' || r.status === 'snoozed').length;

  async function handleCreate(input: CreateReminderInput) {
    const created = await createReminder(customerProfile, input);
    setReminders((prev) => [created, ...prev]);
    setIsNewFormOpen(false);
    onNewFormClose?.();
  }

  async function handleComplete(r: Reminder) {
    const updated = await patchReminder(r.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
      completion_note: completionNote.trim() || undefined,
    });
    setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    setCompletingId(null);
    setCompletionNote('');
  }

  async function handleSnooze(r: Reminder, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    const updated = await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
  }

  async function handleDelete(id: number) {
    await deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  }

  const FILTER_LABELS: Record<Filter, string> = {
    active: `Attivi (${activeCount})`,
    done: 'Completati',
    all: 'Tutti',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>🔔 Promemoria</span>
        <button onClick={() => setIsNewFormOpen(true)} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>+ Nuovo</button>
      </div>

      {isNewFormOpen && (
        <ReminderForm
          customerProfile={customerProfile}
          onSave={handleCreate}
          onCancel={() => { setIsNewFormOpen(false); onNewFormClose?.(); }}
        />
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['active', 'done', 'all'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
            border: filter === f ? '2px solid #2563eb' : '1px solid #e2e8f0',
            background: filter === f ? '#eff6ff' : '#f8fafc',
            color: filter === f ? '#1d4ed8' : '#64748b',
            fontWeight: filter === f ? 700 : 400,
          }}>{FILTER_LABELS[f]}</button>
        ))}
      </div>

      {reminders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
          🔔 Nessun promemoria attivo<br />
          <button onClick={() => setIsNewFormOpen(true)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
            + Aggiungi il primo promemoria
          </button>
        </div>
      )}

      {reminders.map((r) => {
        const typeColors = { bg: r.typeColorBg, text: r.typeColorText };
        const prioColors = REMINDER_PRIORITY_COLORS[r.priority];
        const { label: dueLabel, urgent } = formatDueAt(r.dueAt);
        const isExpired = urgent;

        return (
          <div key={r.id} style={{ background: isExpired ? '#fff5f5' : '#fff', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '10px', marginBottom: '8px', opacity: r.status === 'done' ? 0.5 : 1 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColors.text, marginTop: '5px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, background: typeColors.bg, color: typeColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {r.typeEmoji} {r.typeLabel}
                    {r.typeDeletedAt && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#94a3b8' }}>(eliminato)</span>}
                  </span>
                  <span style={{ fontSize: '11px', background: prioColors.bg, color: prioColors.text, padding: '1px 7px', borderRadius: '10px' }}>
                    {REMINDER_PRIORITY_LABELS[r.priority] ?? r.priority}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: urgent ? '#dc2626' : '#64748b', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
                {r.note && <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginTop: '3px' }}>"{r.note}"</div>}
              </div>
            </div>

            {r.status !== 'done' && r.status !== 'cancelled' && editingId !== r.id && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {completingId === r.id ? (
                  <div style={{ width: '100%' }}>
                    <textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)}
                      placeholder="Nota completamento (opzionale)..." rows={2}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none', marginBottom: '6px' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { void handleComplete(r); }} style={{ background: '#15803d', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>✓ Conferma</button>
                      <button onClick={() => { setCompletingId(null); setCompletionNote(''); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setCompletingId(r.id)} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>✓ Fatto</button>
                    <button onClick={() => { void handleSnooze(r, 3); }} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏰ +3gg</button>
                    <button onClick={() => { void handleSnooze(r, 7); }} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏰ +1 sett</button>
                    <button onClick={() => setEditingId(r.id)} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✎</button>
                    <button onClick={() => setDeletingId(r.id)} style={{ background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                  </>
                )}
              </div>
            )}

            {editingId === r.id && (
              <ReminderForm customerProfile={customerProfile} initial={r}
                onSave={async (input) => {
                  const updated = await patchReminder(r.id, {
                    ...input,
                    note: input.note ?? undefined,
                  });
                  setReminders((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            )}

            {deletingId === r.id && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button onClick={() => { void handleDelete(r.id); }} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
                  <button onClick={() => setDeletingId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
