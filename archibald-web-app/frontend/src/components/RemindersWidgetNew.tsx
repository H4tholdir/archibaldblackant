import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTodayReminders, patchReminder,
  REMINDER_TYPE_LABELS, REMINDER_TYPE_COLORS, formatDueAt,
} from '../services/reminders.service';
import type { ReminderWithCustomer, TodayReminders } from '../services/reminders.service';

type Tab = 'today' | 'overdue';

export function RemindersWidgetNew() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<TodayReminders | null>(null);
  const [tab, setTab] = React.useState<Tab>('today');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getTodayReminders()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleComplete(r: ReminderWithCustomer) {
    const updated = await patchReminder(r.id, {
      status: 'done',
      completed_at: new Date().toISOString(),
    });
    setData((prev) => {
      if (!prev) return prev;
      const filterOut = (list: ReminderWithCustomer[]) => list.filter((x) => x.id !== updated.id);
      return {
        ...prev,
        today: filterOut(prev.today),
        overdue: filterOut(prev.overdue),
        completedToday: prev.completedToday + 1,
      };
    });
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    const updated = await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    setData((prev) => {
      if (!prev) return prev;
      const replaceIn = (list: ReminderWithCustomer[]) =>
        list.map((x) => (x.id === updated.id ? { ...x, status: updated.status, snoozedUntil: updated.snoozedUntil } : x));
      return { ...prev, today: replaceIn(prev.today), overdue: replaceIn(prev.overdue) };
    });
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        Caricamento promemoria...
      </div>
    );
  }

  if (!data) return null;

  const todayCount = data.today.length;
  const overdueCount = data.overdue.length;
  const activeList: ReminderWithCustomer[] = tab === 'today' ? data.today : data.overdue;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔔</span>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Promemoria</span>
          {overdueCount > 0 && (
            <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
              {overdueCount} scadut{overdueCount === 1 ? 'o' : 'i'}
            </span>
          )}
        </div>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{data.totalActive} attivi</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
        {([['today', `Oggi (${todayCount})`], ['overdue', `Scaduti (${overdueCount})`]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px', fontSize: '12px', fontWeight: tab === t ? 700 : 400,
            border: 'none', cursor: 'pointer',
            background: tab === t ? '#f8fafc' : '#fff',
            color: tab === t ? (t === 'overdue' ? '#dc2626' : '#1d4ed8') : '#64748b',
            borderBottom: tab === t ? `2px solid ${t === 'overdue' ? '#dc2626' : '#2563eb'}` : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: '10px 14px' }}>
        {activeList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
            ✓ Nessun promemoria {tab === 'today' ? 'per oggi' : 'scaduto'}
          </div>
        ) : (
          activeList.map((r) => {
            const typeColors = REMINDER_TYPE_COLORS[r.type] ?? { bg: '#f1f5f9', text: '#64748b' };
            const { label: dueLabel, urgent } = formatDueAt(r.dueAt);

            return (
              <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColors.text, marginTop: '5px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: typeColors.bg, color: typeColors.text, padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>
                      {REMINDER_TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    <button
                      onClick={() => navigate(`/customers/${encodeURIComponent(r.customerErpId)}`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#2563eb', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}
                    >
                      {r.customerName}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: urgent ? '#dc2626' : '#94a3b8', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
                  {r.note && <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{r.note}"</div>}
                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    <button onClick={() => { void handleComplete(r); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '5px', padding: '2px 7px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}>✓ Fatto</button>
                    <button onClick={() => { void handleSnooze(r, 3); }} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 7px', fontSize: '10px', cursor: 'pointer' }}>+3gg</button>
                    <button onClick={() => { void handleSnooze(r, 7); }} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 7px', fontSize: '10px', cursor: 'pointer' }}>+1sett</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        {data.completedToday > 0
          ? `✓ ${data.completedToday} completat${data.completedToday === 1 ? 'o' : 'i'} oggi`
          : 'Nessun promemoria completato oggi'}
      </div>
    </div>
  );
}
