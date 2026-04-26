import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listUpcomingReminders, patchReminder, deleteReminder, formatDueAt,
} from '../services/reminders.service';
import type { ReminderWithCustomer, UpcomingReminders, CreateReminderInput } from '../services/reminders.service';
import { ReminderForm } from './ReminderForm';

const DAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const TODAY_STR = new Date().toISOString().split('T')[0];

function getWeekDays(ref: Date): Date[] {
  const dow = ref.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function RemindersWidgetNew() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<UpcomingReminders | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedDay, setSelectedDay] = React.useState(TODAY_STR);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const today = new Date();
  const weekDays = getWeekDays(today);

  async function loadData() {
    setLoading(true);
    try {
      const d = await listUpcomingReminders(14);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void loadData(); }, []);

  async function handleComplete(r: ReminderWithCustomer) {
    await patchReminder(r.id, { status: 'done', completed_at: new Date().toISOString() });
    void loadData();
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    void loadData();
  }

  async function handleDelete(id: number) {
    await deleteReminder(id);
    setDeletingId(null);
    void loadData();
  }

  async function handleEdit(r: ReminderWithCustomer, input: CreateReminderInput) {
    await patchReminder(r.id, {
      type_id: input.type_id,
      priority: input.priority,
      due_at: input.due_at,
      recurrence_days: input.recurrence_days,
      note: input.note ?? undefined,
      notify_via: input.notify_via,
    });
    setEditingId(null);
    void loadData();
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        Caricamento promemoria...
      </div>
    );
  }

  if (!data) return null;

  const overdueCount = data.overdue.length;
  const selectedList = data.byDate[selectedDay] ?? [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header — clickable → /agenda */}
      <div
        onClick={() => navigate('/agenda')}
        style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{'🔔'}</span>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Promemoria</span>
          {overdueCount > 0 && (
            <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
              {overdueCount}{' '}{'scadut'}{overdueCount === 1 ? 'o' : 'i'}
            </span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{'→ Agenda'}</span>
      </div>

      {/* Strip settimanale */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '8px 10px', gap: '4px' }}>
        {weekDays.map((day, i) => {
          const ds = toDateStr(day);
          const isSelected = ds === selectedDay;
          const isToday = ds === TODAY_STR;
          const dayReminders = data.byDate[ds] ?? [];
          const dots = dayReminders.slice(0, 4).map((r) => r.typeColorText);

          return (
            <div
              key={ds}
              onClick={() => setSelectedDay(ds)}
              style={{
                flex: 1, textAlign: 'center', cursor: 'pointer', borderRadius: '8px',
                padding: '4px 2px', background: isSelected ? '#2563eb' : isToday ? '#eff6ff' : 'transparent',
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 600, color: isSelected ? '#fff' : '#94a3b8', marginBottom: '1px' }}>
                {DAY_LABELS[i]}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#fff' : isToday ? '#2563eb' : '#0f172a' }}>
                {day.getDate()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '2px', minHeight: '6px' }}>
                {dots.map((color, di) => (
                  <div key={di} style={{ width: '5px', height: '5px', borderRadius: '50%', background: isSelected ? '#fff' : color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sezione scaduti (sempre visibile se presenti) */}
      {overdueCount > 0 && (
        <div style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 14px 4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
            {'⚠ Scaduti ('}{overdueCount}{')'}
          </div>
          {data.overdue.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              editingId={editingId}
              deletingId={deletingId}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onEdit={(rem, input) => handleEdit(rem, input)}
              onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
              onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
              onDeleteConfirm={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Lista giorno selezionato */}
      <div style={{ padding: '8px 14px' }}>
        {selectedList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '12px' }}>
            Nessun promemoria per questo giorno
          </div>
        ) : (
          selectedList.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              editingId={editingId}
              deletingId={deletingId}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onEdit={(rem, input) => handleEdit(rem, input)}
              onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
              onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
              onDeleteConfirm={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        {data.completedToday > 0
          ? `✓ ${data.completedToday} completat${data.completedToday === 1 ? 'o' : 'i'} oggi`
          : `${data.totalActive} attivi`}
      </div>
    </div>
  );
}

type ReminderCardProps = {
  r: ReminderWithCustomer;
  editingId: number | null;
  deletingId: number | null;
  onComplete: (r: ReminderWithCustomer) => Promise<void>;
  onSnooze: (r: ReminderWithCustomer, days: number) => Promise<void>;
  onEdit: (r: ReminderWithCustomer, input: CreateReminderInput) => Promise<void>;
  onEditToggle: (id: number) => void;
  onDeleteToggle: (id: number) => void;
  onDeleteConfirm: (id: number) => Promise<void>;
};

function ReminderCard({
  r, editingId, deletingId,
  onComplete, onSnooze, onEdit, onEditToggle, onDeleteToggle, onDeleteConfirm,
}: ReminderCardProps) {
  const { label: dueLabel, urgent } = formatDueAt(r.dueAt);
  const navigate = useNavigate();

  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.typeColorText, marginTop: '5px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, background: r.typeColorBg, color: r.typeColorText, padding: '1px 6px', borderRadius: '8px' }}>
              {r.typeEmoji}{' '}{r.typeLabel}
            </span>
            <button
              onClick={() => navigate(`/customers/${encodeURIComponent(r.customerErpId)}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#2563eb', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}
            >
              {r.customerName}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: urgent ? '#dc2626' : '#94a3b8', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
          {r.note && <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{r.note}"</div>}

          <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
            <button onClick={() => { void onComplete(r); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}>{'✓'}</button>
            <button onClick={() => onEditToggle(r.id)} style={{ background: editingId === r.id ? '#eff6ff' : '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>{'✎'}</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: deletingId === r.id ? '#fef2f2' : '#f8fafc', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>{'✕'}</button>
            <button onClick={() => { void onSnooze(r, 3); }} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>{'⏰+3gg'}</button>
          </div>
        </div>
      </div>

      {editingId === r.id && (
        <div style={{ marginTop: '8px' }}>
          <ReminderForm
            customerProfile={r.customerErpId}
            initial={r}
            onSave={(input) => onEdit(r, input)}
            onCancel={() => onEditToggle(r.id)}
          />
        </div>
      )}

      {deletingId === r.id && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '7px', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
          <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
            <button onClick={() => { void onDeleteConfirm(r.id); }} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Elimina</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
