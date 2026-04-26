import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listUpcomingReminders, patchReminder, deleteReminder, formatDueAt,
} from '../services/reminders.service';
import type { ReminderWithCustomer, UpcomingReminders, CreateReminderInput } from '../services/reminders.service';
import { ReminderForm } from '../components/ReminderForm';

const DAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  return cells;
}

type KpiFilter = 'all' | 'overdue' | 'today' | 'upcoming';

export function AgendaPage() {
  const navigate = useNavigate();
  const todayStr = React.useMemo(() => new Date().toISOString().split('T')[0], []);
  const [data, setData] = React.useState<UpcomingReminders | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [calMonth, setCalMonth] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [kpiFilter, setKpiFilter] = React.useState<KpiFilter>('all');
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  async function loadData() {
    try {
      const d = await listUpcomingReminders(31);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void loadData(); }, []);

  async function handleComplete(r: ReminderWithCustomer) {
    setError(null);
    try {
      await patchReminder(r.id, { status: 'done', completed_at: new Date().toISOString() });
      void loadData();
    } catch {
      setError('Errore nel completare il promemoria');
    }
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    setError(null);
    try {
      await patchReminder(r.id, { status: 'snoozed', snoozed_until: new Date(Date.now() + days * 86400000).toISOString() });
      void loadData();
    } catch {
      setError('Errore nel posticipare il promemoria');
    }
  }

  async function handleEdit(r: ReminderWithCustomer, input: CreateReminderInput) {
    setError(null);
    try {
      await patchReminder(r.id, {
        type_id: input.type_id, priority: input.priority, due_at: input.due_at,
        recurrence_days: input.recurrence_days, note: input.note ?? undefined, notify_via: input.notify_via,
      });
      setEditingId(null);
      void loadData();
    } catch {
      setError('Errore nel modificare il promemoria');
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await deleteReminder(id);
      setDeletingId(null);
      void loadData();
    } catch {
      setError("Errore nell'eliminare il promemoria");
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Caricamento agenda...</div>
    );
  }

  if (!data) return null;
  const safeData = data;

  const todayReminders = safeData.byDate[todayStr] ?? [];
  const allByDate = Object.entries(safeData.byDate).sort(([a], [b]) => a.localeCompare(b));

  const overdueKpi = safeData.overdue.length;
  const todayKpi = todayReminders.length;
  const upcomingKpi = Math.max(0, safeData.totalActive - safeData.overdue.length - todayKpi);

  function getFilteredSections(): Array<{ key: string; label: string; reminders: ReminderWithCustomer[]; isOverdue?: boolean }> {
    if (selectedDay) {
      const dayReminders = safeData.byDate[selectedDay] ?? [];
      const sections: ReturnType<typeof getFilteredSections> = [];
      if (safeData.overdue.length > 0) sections.push({ key: 'overdue', label: `⚠ In ritardo (${safeData.overdue.length})`, reminders: safeData.overdue, isOverdue: true });
      sections.push({ key: selectedDay, label: `📅 ${new Date(selectedDay + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`, reminders: dayReminders });
      return sections;
    }
    if (kpiFilter === 'overdue') return [{ key: 'overdue', label: `⚠ In ritardo (${overdueKpi})`, reminders: safeData.overdue, isOverdue: true }];
    if (kpiFilter === 'today') return [{ key: todayStr, label: `📅 Oggi — ${todayKpi} promemori`, reminders: todayReminders }];

    const sections: ReturnType<typeof getFilteredSections> = [];
    if (kpiFilter !== 'upcoming' && safeData.overdue.length > 0) {
      sections.push({ key: 'overdue', label: `⚠ In ritardo (${safeData.overdue.length})`, reminders: safeData.overdue, isOverdue: true });
    }
    for (const [dateStr, reminders] of allByDate) {
      if (kpiFilter === 'upcoming' && dateStr === todayStr) continue;
      const isToday = dateStr === todayStr;
      const label = isToday
        ? `📅 Oggi — ${new Date(dateStr + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
        : `📅 ${new Date(dateStr + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      sections.push({ key: dateStr, label, reminders });
    }
    return sections;
  }

  const sections = getFilteredSections();
  const cells = buildMonthGrid(calMonth.getFullYear(), calMonth.getMonth());

  const miniCal = (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: isMobile ? '16px' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}>{'‹'}</button>
        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
          {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
        </span>
        <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}>{'›'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px' }}>
        {DAY_LABELS.map((l, i) => (
          <div key={`label-${i}`} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '4px 0' }}>{l}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const ds = toDateStr(cell);
          const hasDots = (safeData.byDate[ds]?.length ?? 0) > 0;
          const isSelected = selectedDay === ds;
          const isToday = ds === todayStr;
          return (
            <div
              key={ds}
              onClick={() => setSelectedDay(isSelected ? null : ds)}
              style={{
                textAlign: 'center', padding: '5px 2px', borderRadius: '6px', cursor: 'pointer',
                background: isSelected ? '#2563eb' : isToday ? '#eff6ff' : 'transparent',
                color: isSelected ? '#fff' : isToday ? '#2563eb' : '#0f172a',
                fontWeight: isToday || isSelected ? 700 : 400, fontSize: '12px',
              }}
            >
              {cell.getDate()}
              {hasDots && (
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? '#fff' : '#2563eb', margin: '1px auto 0' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const agenda = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {([
          { key: 'overdue' as KpiFilter, label: 'Scaduti', count: overdueKpi, color: '#dc2626', bg: '#fef2f2' },
          { key: 'today' as KpiFilter, label: 'Oggi', count: todayKpi, color: '#2563eb', bg: '#eff6ff' },
          { key: 'upcoming' as KpiFilter, label: 'Prossimi', count: upcomingKpi, color: '#15803d', bg: '#f0fdf4' },
        ]).map(({ key, label, count, color, bg }) => (
          <button
            key={key}
            onClick={() => { setKpiFilter(kpiFilter === key ? 'all' : key); setSelectedDay(null); }}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: '10px', border: kpiFilter === key ? `2px solid ${color}` : '1px solid #e2e8f0',
              background: kpiFilter === key ? bg : '#fff', cursor: 'pointer', textAlign: 'center',
              fontWeight: 700, whiteSpace: 'pre-line', lineHeight: 1.6,
              fontSize: '13px', color,
            }}
          >{`${count}\n${label}`}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: '12px', padding: '6px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {sections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>
          {'✓ Nessun promemoria in questo periodo'}
        </div>
      ) : (
        sections.map(({ key, label, reminders, isOverdue }) => (
          <div key={key} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: isOverdue ? '#dc2626' : '#0f172a', marginBottom: '6px', padding: '0 2px' }}>
              {label}
            </div>
            {reminders.map((r) => (
              <AgendaReminderCard
                key={r.id}
                r={r}
                editingId={editingId}
                deletingId={deletingId}
                onComplete={handleComplete}
                onSnooze={handleSnooze}
                onEdit={(r2, input) => handleEdit(r2, input)}
                onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
                onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
                onDeleteConfirm={handleDelete}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{'📅 Agenda'}</h1>
        <button
          onClick={() => navigate('/customers')}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          {'+ Promemoria'}
        </button>
      </div>

      {isMobile ? (
        <div>
          {miniCal}
          {agenda}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ width: '280px', flexShrink: 0 }}>{miniCal}</div>
          {agenda}
        </div>
      )}
    </div>
  );
}

type AgendaCardProps = {
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

function AgendaReminderCard({
  r, editingId, deletingId,
  onComplete, onSnooze, onEdit, onEditToggle, onDeleteToggle, onDeleteConfirm,
}: AgendaCardProps) {
  const navigate = useNavigate();
  const { label: dueLabel, urgent } = formatDueAt(r.dueAt);

  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.typeColorText, marginTop: '5px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, background: r.typeColorBg, color: r.typeColorText, padding: '1px 7px', borderRadius: '10px' }}>
              {r.typeEmoji}{' '}{r.typeLabel}
            </span>
            <button
              onClick={() => navigate(`/customers/${encodeURIComponent(r.customerErpId)}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#2563eb', padding: 0 }}
            >
              {r.customerName}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: urgent ? '#dc2626' : '#64748b', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
          {r.note && <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>"{r.note}"</div>}

          {r.status !== 'done' && editingId !== r.id && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
              <button onClick={() => { void onComplete(r); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>{'✓ Fatto'}</button>
              <button onClick={() => { void onSnooze(r, 3); }} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>{'⏰ +3gg'}</button>
              <button onClick={() => onEditToggle(r.id)} style={{ background: editingId === r.id ? '#eff6ff' : '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>{'✎'}</button>
              <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>{'✕'}</button>
            </div>
          )}
        </div>
      </div>

      {editingId === r.id && (
        <div style={{ marginTop: '10px' }}>
          <ReminderForm
            customerProfile={r.customerErpId}
            initial={r}
            onSave={(input) => onEdit(r, input)}
            onCancel={() => onEditToggle(r.id)}
          />
        </div>
      )}

      {deletingId === r.id && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button onClick={() => { void onDeleteConfirm(r.id); }} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
