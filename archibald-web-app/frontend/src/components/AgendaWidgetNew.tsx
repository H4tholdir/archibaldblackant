import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listUpcomingReminders, createReminder } from '../services/reminders.service';
import type { UpcomingReminders, CreateReminderInput } from '../services/reminders.service';
import { listAppointments } from '../api/appointments';
import { listAppointmentTypes } from '../api/appointment-types';
import { AgendaMixedList } from './AgendaMixedList';
import { AppointmentForm } from './AppointmentForm';
import { ReminderForm } from './ReminderForm';
import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { AgendaItem, Appointment, AppointmentType } from '../types/agenda';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function getWeekDays(ref: Date): Date[] {
  const dow = ref.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - offset);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function AgendaWidgetNew() {
  const navigate = useNavigate();
  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);
  const weekDays = useMemo(() => getWeekDays(new Date()), []);

  const [reminders, setReminders] = useState<UpcomingReminders | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApptForm, setShowApptForm] = useState(false);
  const [showReminderFlow, setShowReminderFlow] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Array<{erpId: string; name: string}>>([]);
  const [pickerCustomer, setPickerCustomer] = useState<{erpId: string; name: string} | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekStart = toDateKey(weekDays[0]);
      const weekEnd   = toDateKey(weekDays[6]);
      const [r, a, t] = await Promise.all([
        listUpcomingReminders(14),
        listAppointments({ from: weekStart, to: weekEnd }),
        listAppointmentTypes(),
      ]);
      setReminders(r); setAppts(a); setTypes(t);
    } catch {
      setError('Errore nel caricamento agenda');
    } finally {
      setLoading(false);
    }
  }, [weekDays]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!pickerQuery || pickerQuery.length < 2) { setPickerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(pickerQuery)}&limit=5`);
        const data = await res.json() as { customers?: Array<{ erpId: string; name: string }> };
        setPickerResults((data.customers ?? []).map((c) => ({ erpId: c.erpId, name: c.name })));
      } catch { setPickerResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [pickerQuery]);

  const items: AgendaItem[] = useMemo(() => {
    if (!reminders) return [];
    const apptItems: AgendaItem[] = appts.map((a) => ({ kind: 'appointment' as const, data: a }));
    const overdue: AgendaItem[] = reminders.overdue.map((r) => ({ kind: 'reminder' as const, data: r }));
    const today: AgendaItem[] = (reminders.byDate[todayKey] ?? []).map((r) => ({ kind: 'reminder' as const, data: r }));
    return [...apptItems, ...overdue, ...today].sort((a, b) => {
      const da = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
      const db = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
      return da < db ? -1 : 1;
    });
  }, [reminders, appts, todayKey]);

  const overdueCount = reminders?.overdue.length ?? 0;
  const todayReminderCount = (reminders?.byDate[todayKey] ?? []).length;
  const todayApptCount = appts.filter((a) => toDateKey(new Date(a.startAt)) === todayKey).length;
  const todayTotal = todayReminderCount + todayApptCount;
  const weekApptCount = appts.length;
  const weekTotal = (reminders?.totalActive ?? 0) + weekApptCount;

  function dotsForDay(dayKey: string) {
    const dayAppts = appts.filter((a) => toDateKey(new Date(a.startAt)) === dayKey);
    const dayReminders = reminders?.byDate[dayKey] ?? [];
    return { apptCount: dayAppts.length, reminderCount: dayReminders.length };
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{'📅 Agenda'}</div>
        <button
          onClick={() => navigate('/agenda')}
          style={{ background: 'none', border: 'none', fontSize: 12, color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
        >
          {'Apri agenda →'}
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '12px 12px 10px', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { label: 'Scaduti',   value: overdueCount,  color: '#ef4444' },
          { label: 'Oggi',      value: todayTotal,    color: '#2563eb' },
          { label: 'Appt.',     value: weekApptCount, color: '#10b981' },
          { label: 'Settimana', value: weekTotal,     color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px 6px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '10px 10px 0 0' }} />
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, marginBottom: 2, color }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
          {'Questa settimana'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekDays.map((d, i) => {
            const key = toDateKey(d);
            const isToday = key === todayKey;
            const { apptCount, reminderCount } = dotsForDay(key);
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: isToday ? '#2563eb' : '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                  {DAY_LABELS[i]}
                </div>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, background: isToday ? '#2563eb' : 'transparent', color: isToday ? '#fff' : '#374151' }}>
                  {d.getDate()}
                </div>
                <div style={{ display: 'flex', gap: 2, minHeight: 8 }}>
                  {Array.from({ length: Math.min(apptCount, 2) }).map((_, j) => (
                    <div key={`a${j}`} style={{ width: 5, height: 5, borderRadius: '50%', background: '#2563eb' }} />
                  ))}
                  {Array.from({ length: Math.min(reminderCount, 2) }).map((_, j) => (
                    <div key={`r${j}`} style={{ width: 5, height: 5, borderRadius: '50%', background: '#94a3b8' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista mista */}
      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {'Caricamento...'}
        </div>
      ) : (
        <>
          {error && (
            <div style={{ padding: '12px 16px', textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}
          <AgendaMixedList items={items} onRefetch={loadAll} compact />
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <button
          onClick={() => setShowReminderFlow(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', borderRight: '1px solid #f1f5f9', background: 'none', color: '#10b981', width: '100%' }}
        >
          {'🔔 + Promemoria'}
        </button>
        <button
          onClick={() => setShowApptForm(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: '#2563eb', width: '100%' }}
        >
          {'📌 + Appuntamento'}
        </button>
      </div>

      {/* Form appuntamento */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          onSaved={() => { setShowApptForm(false); void loadAll(); }}
          onCancel={() => setShowApptForm(false)}
        />
      )}

      {/* Customer picker per promemoria */}
      {showReminderFlow && !pickerCustomer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: 20, maxHeight: '60vh', overflow: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{'🔔 Scegli cliente'}</div>
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Cerca cliente..."
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {pickerResults.map((c) => (
              <div key={c.erpId} onClick={() => setPickerCustomer(c)}
                style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 14, color: '#0f172a' }}>
                {c.name}
              </div>
            ))}
            <button
              onClick={() => { setShowReminderFlow(false); setPickerQuery(''); setPickerResults([]); }}
              style={{ marginTop: 12, width: '100%', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
            >
              {'Annulla'}
            </button>
          </div>
        </div>
      )}

      {/* Form promemoria */}
      {showReminderFlow && pickerCustomer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>{'🔔 Nuovo promemoria — '}{pickerCustomer.name}</div>
            <ReminderForm
              customerProfile={pickerCustomer.erpId}
              onSave={async (input: CreateReminderInput) => {
                await createReminder(pickerCustomer.erpId, input);
                setShowReminderFlow(false); setPickerCustomer(null); setPickerQuery(''); setPickerResults([]);
                void loadAll();
              }}
              onCancel={() => { setShowReminderFlow(false); setPickerCustomer(null); setPickerQuery(''); setPickerResults([]); }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
