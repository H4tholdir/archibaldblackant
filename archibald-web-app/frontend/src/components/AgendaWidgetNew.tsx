import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '../contexts/PrivacyContext';
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

function getWeekDays(ref: Date, offset = 0): Date[] {
  const dow = ref.getDay();
  const absOffset = dow === 0 ? 6 : dow - 1;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - absOffset + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekLabel(offset: number, days: Date[]): string {
  if (offset === 0) return 'Questa settimana';
  if (offset === 1) return 'Settimana prossima';
  if (offset === -1) return 'Settimana scorsa';
  const s = days[0];
  const e = days[6];
  return `${s.getDate()}/${s.getMonth() + 1} – ${e.getDate()}/${e.getMonth() + 1}`;
}

const BTN_BARE: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px',
  fontSize: 16, color: '#94a3b8', lineHeight: 1,
};

export function AgendaWidgetNew() {
  const navigate = useNavigate();
  const { privacyEnabled } = usePrivacy();
  const todayKey = useMemo(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const weekDays = useMemo(() => getWeekDays(new Date(), weekOffset), [weekOffset]);

  const [reminders, setReminders] = useState<UpcomingReminders | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApptForm, setShowApptForm] = useState(false);
  const [showReminderFlow, setShowReminderFlow] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Array<{ erpId: string; name: string }>>([]);
  const [pickerCustomer, setPickerCustomer] = useState<{ erpId: string; name: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekStart = toDateKey(weekDays[0]);
      // Finestra appuntamenti: da lunedì corrente a 60 giorni (allineata ai reminder)
      const apptEnd = new Date(weekDays[0]);
      apptEnd.setDate(apptEnd.getDate() + 60);
      const [r, a, t] = await Promise.all([
        listUpcomingReminders(60),
        listAppointments({ from: weekStart, to: toDateKey(apptEnd) }),
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
    const onVisible = () => { if (document.visibilityState === 'visible') void loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadAll]);

  useEffect(() => {
    if (!pickerQuery || pickerQuery.length < 2) { setPickerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(pickerQuery)}&limit=5`);
        const data = await res.json() as { success: boolean; data: { customers: Array<{ erpId: string; name: string }> } };
        setPickerResults((data.data?.customers ?? []).slice(0, 5));
      } catch { setPickerResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [pickerQuery]);

  // Tutti gli elementi (reminder + appuntamenti) per tutta la finestra temporale
  const items: AgendaItem[] = useMemo(() => {
    if (!reminders) return [];
    const apptItems: AgendaItem[] = appts.map((a) => ({ kind: 'appointment' as const, data: a }));
    const allReminderItems: AgendaItem[] = [
      ...reminders.overdue,
      ...Object.values(reminders.byDate).flat(),
    ].map((r) => ({ kind: 'reminder' as const, data: r }));
    return [...apptItems, ...allReminderItems].sort((a, b) => {
      const da = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
      const db = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
      return da < db ? -1 : 1;
    });
  }, [reminders, appts]);

  // Elementi da mostrare nella lista: filtrati per giorno selezionato o i primi 5
  const displayItems = useMemo(() => {
    if (selectedDayKey) {
      return items.filter((item) => {
        const key = item.kind === 'appointment'
          ? item.data.startAt.split('T')[0]
          : item.data.dueAt.split('T')[0];
        return key === selectedDayKey;
      });
    }
    return items.slice(0, 5);
  }, [items, selectedDayKey]);

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

  function handleNavigateToEvent(startAt: string, apptId?: string) {
    const dateKey = startAt.split('T')[0];
    const params = new URLSearchParams({ date: dateKey });
    if (startAt.length > 10) params.set('time', startAt);
    if (apptId) params.set('apptId', apptId);
    navigate(`/agenda?${params.toString()}`);
  }

  function handleDayClick(dayKey: string) {
    setSelectedDayKey((prev) => (prev === dayKey ? null : dayKey));
  }

  const selectedDayLabel = selectedDayKey
    ? new Date(selectedDayKey + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })
    : null;

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
          { label: 'Scaduti', value: overdueCount, color: '#ef4444' },
          { label: 'Oggi', value: todayTotal, color: '#2563eb' },
          { label: 'Appt.', value: weekApptCount, color: '#10b981' },
          { label: 'Settimana', value: weekTotal, color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px 6px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '10px 10px 0 0' }} />
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, marginBottom: 2, color }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f1f5f9' }}>
        {/* Nav header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button style={BTN_BARE} onClick={() => { setWeekOffset((o) => o - 1); setSelectedDayKey(null); }}>{'‹'}</button>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            {weekLabel(weekOffset, weekDays)}
          </span>
          <button style={BTN_BARE} onClick={() => { setWeekOffset((o) => o + 1); setSelectedDayKey(null); }}>{'›'}</button>
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekDays.map((d, i) => {
            const key = toDateKey(d);
            const isToday = key === todayKey;
            const isSelected = selectedDayKey === key;
            const { apptCount, reminderCount } = dotsForDay(key);
            return (
              <div
                key={key}
                onClick={() => handleDayClick(key)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 9, color: isSelected || isToday ? '#2563eb' : '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                  {DAY_LABELS[i]}
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700,
                  background: isSelected ? '#2563eb' : isToday ? '#eff6ff' : 'transparent',
                  border: isToday && !isSelected ? '2px solid #2563eb' : 'none',
                  color: isSelected ? '#fff' : isToday ? '#2563eb' : '#374151',
                }}>
                  {d.getDate()}
                </div>
                {/* Dots: blu=appuntamento, arancio=reminder */}
                <div style={{ display: 'flex', gap: 2, minHeight: 7, alignItems: 'center' }}>
                  {Array.from({ length: Math.min(apptCount, 2) }).map((_, j) => (
                    <div key={`a${j}`} style={{ width: 5, height: 5, borderRadius: '50%', background: '#2563eb' }} />
                  ))}
                  {Array.from({ length: Math.min(reminderCount, 2) }).map((_, j) => (
                    <div key={`r${j}`} style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legenda puntini */}
        <div style={{ display: 'flex', gap: 10, marginTop: 6, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#2563eb' }} />
            {'Appuntamento'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />
            {'Promemoria'}
          </div>
        </div>
      </div>

      {/* Titolo lista + Lista mista — blurrati se privacy attiva */}
      <div className={privacyEnabled ? 'privacy-blur' : undefined}>
        {selectedDayLabel && (
          <div style={{ padding: '8px 14px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {selectedDayLabel}
            </span>
            <button
              onClick={() => setSelectedDayKey(null)}
              style={{ background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}
            >
              {'✕ Mostra tutti'}
            </button>
          </div>
        )}

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
            <AgendaMixedList
              items={displayItems}
              onRefetch={loadAll}
              onNavigateToEvent={handleNavigateToEvent}
            />
          </>
        )}
      </div>

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
              autoComplete="off"
              type="search"
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
            {pickerQuery.length >= 2 && pickerResults.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>
                Nessun cliente trovato
              </div>
            )}
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
