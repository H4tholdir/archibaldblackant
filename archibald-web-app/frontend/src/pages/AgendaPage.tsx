import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Temporal as TemporalType } from 'temporal-polyfill';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import {
  createViewWeek,
  createViewMonthGrid,
  createViewDay,
  createViewList,
} from '@schedule-x/calendar';
import type { CalendarEvent, CalendarEventExternal } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { createDragAndDropPlugin } from '@schedule-x/drag-and-drop';
import { createResizePlugin } from '@schedule-x/resize';
import { createScrollControllerPlugin } from '@schedule-x/scroll-controller';
import { createCurrentTimePlugin } from '@schedule-x/current-time';
import { listAppointmentTypes } from '../api/appointment-types';
import { AgendaMixedList } from '../components/AgendaMixedList';
import { AppointmentForm } from '../components/AppointmentForm';
import { AppointmentTypeManager } from '../components/AppointmentTypeManager';
import { AgendaCalendarSyncPanel } from '../components/AgendaCalendarSyncPanel';
import { AgendaHelpPanel } from '../components/AgendaHelpPanel';
import { ReminderForm } from '../components/ReminderForm';
import { createReminder, patchReminder } from '../services/reminders.service';
import type { CreateReminderInput, ReminderWithCustomer } from '../services/reminders.service';
import { fetchWithRetry } from '../utils/fetch-with-retry';
import { useAgenda } from '../hooks/useAgenda';
import type { Appointment, AppointmentType, AgendaItem } from '../types/agenda';

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAY_LABELS = ['L','M','M','G','V','S','D'];

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}

function toDateKey(d: Date): string { return d.toISOString().split('T')[0]; }

// Temporal is available as a native global (Chromium 137+) — same instance used by Schedule-X
declare const Temporal: typeof TemporalType;

const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';

function toScheduleXEvent(appt: Appointment, todayKey: string): CalendarEvent {
  const tz = USER_TZ;
  const start = appt.allDay
    ? Temporal.PlainDate.from(appt.startAt.split('T')[0])
    : Temporal.Instant.from(appt.startAt).toZonedDateTimeISO(tz);
  const end = appt.allDay
    ? Temporal.PlainDate.from(appt.endAt.split('T')[0])
    : Temporal.Instant.from(appt.endAt).toZonedDateTimeISO(tz);
  return {
    id: appt.id,
    title: `${appt.typeEmoji ?? '📌'} ${appt.title}`,
    start,
    end,
    _colorHex: appt.typeColorHex ?? '#2563eb',
    _customerName: appt.customerName,
    _location: appt.location,
    _notes: appt.notes,
    _typeLabel: appt.typeLabel,
    _isPast: appt.startAt.split('T')[0] < todayKey,
  };
}

type SxEvent = CalendarEvent & {
  _colorHex?: string;
  _customerName?: string | null;
  _location?: string | null;
  _notes?: string | null;
  _typeLabel?: string | null;
  _isReminder?: boolean;
  _isPast?: boolean;
};

function toScheduleXReminderEvent(r: ReminderWithCustomer, todayKey: string): CalendarEvent {
  const dateKey = r.dueAt.split('T')[0];
  return {
    id: `reminder-${r.id}`,
    title: `🔔 ${r.customerName}`,
    start: Temporal.PlainDate.from(dateKey),
    end: Temporal.PlainDate.from(dateKey),
    _colorHex: r.typeColorBg ?? '#f59e0b',
    _isReminder: true,
    _isPast: dateKey < todayKey,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function CustomTimeGridEvent({ calendarEvent }: { calendarEvent: SxEvent }) {
  const color = calendarEvent._colorHex ?? '#2563eb';
  const isPast = calendarEvent._isPast ?? false;
  return (
    <div style={{
      background: hexToRgba(color, isPast ? 0.07 : 0.14),
      borderLeft: `3px solid ${isPast ? '#cbd5e1' : color}`,
      borderRadius: '0 4px 4px 0',
      padding: '3px 5px',
      height: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      boxSizing: 'border-box',
      opacity: isPast ? 0.6 : 1,
    }}>
      <div style={{ fontWeight: 700, color, fontSize: 11, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {calendarEvent.title}
      </div>
      {calendarEvent._customerName && (
        <div style={{ fontSize: 10, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {"👤"} {calendarEvent._customerName}
        </div>
      )}
      {calendarEvent._location && (
        <div style={{ fontSize: 10, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {"📍"} {calendarEvent._location}
        </div>
      )}
      {calendarEvent._notes && (
        <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontStyle: 'italic' }}>
          {calendarEvent._notes}
        </div>
      )}
    </div>
  );
}

function CustomMonthGridEvent({ calendarEvent }: { calendarEvent: SxEvent }) {
  const color = calendarEvent._colorHex ?? '#2563eb';
  const isPast = calendarEvent._isPast ?? false;
  return (
    <div style={{
      background: isPast ? '#e2e8f0' : color,
      borderRadius: 3,
      padding: '1px 6px',
      fontSize: 11,
      color: isPast ? '#94a3b8' : '#fff',
      fontWeight: 600,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      opacity: isPast ? 0.7 : 1,
    }}>
      {calendarEvent.title}
    </div>
  );
}

function isApptItem(item: AgendaItem): item is AgendaItem & { kind: 'appointment' } {
  return item.kind === 'appointment';
}

// Adapter v3→v4: il calendario v4 chiama startTimeGridDrag/startDateGridDrag/startMonthGridDrag,
// ma il plugin DnD v3 espone createTimeGridDragHandler ecc. Il wrapper mappa le firme.
function makeDndAdapter(raw: ReturnType<typeof createDragAndDropPlugin>) {
  return {
    name: raw.name,
    onRender: (app: unknown) => raw.onRender(app as Parameters<typeof raw.onRender>[0]),
    startTimeGridDrag: (deps: unknown, dayBounds: unknown) =>
      raw.createTimeGridDragHandler(deps as Parameters<typeof raw.createTimeGridDragHandler>[0], dayBounds as Parameters<typeof raw.createTimeGridDragHandler>[1]),
    startDateGridDrag: (deps: unknown) =>
      raw.createDateGridDragHandler(deps as Parameters<typeof raw.createDateGridDragHandler>[0]),
    startMonthGridDrag: (event: unknown, app: unknown) =>
      raw.createMonthGridDragHandler(event as Parameters<typeof raw.createMonthGridDragHandler>[0], app as Parameters<typeof raw.createMonthGridDragHandler>[1]),
    setInterval: (minutes: number) => raw.setInterval(minutes),
  };
}

export function AgendaPage() {
  const [searchParams] = useSearchParams();
  const todayKey = new Date().toISOString().split('T')[0];
  const [hideAutoReminders, setHideAutoReminders] = useState(
    () => localStorage.getItem('agenda.hideAutoReminders') === 'true',
  );
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  const isMobileRef = useRef(isMobile);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
      isMobileRef.current = mobile;
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Vista del pannello principale su mobile: 'calendar' | 'list'
  const [mobilePanelView, setMobilePanelView] = useState<'calendar' | 'list'>('calendar');

  const [calMonth, setCalMonth] = useState(() => new Date());
  const calGrid = useMemo(() => buildMonthGrid(calMonth.getFullYear(), calMonth.getMonth()), [calMonth]);

  const { periodFrom, periodTo } = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const mm = String(month + 1).padStart(2, '0');
    // periodTo esteso al mese successivo per mostrare eventi PROSSIMI del mese seguente
    const nextMonthDate = new Date(year, month + 2, 0);
    const nextYear = nextMonthDate.getFullYear();
    const nextMm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
    const nextLastDay = nextMonthDate.getDate();
    return {
      periodFrom: `${year}-${mm}-01`,
      periodTo: `${nextYear}-${nextMm}-${nextLastDay}`,
    };
  }, [calMonth]);

  const { items, loading, refetch } = useAgenda({ from: periodFrom, to: periodTo });

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const eventsService = useMemo(() => createEventsServicePlugin(), []);
  const rawDnd = useMemo(() => createDragAndDropPlugin(15), []);
  const dragAndDrop = useMemo(() => makeDndAdapter(rawDnd), [rawDnd]);
  const resize = useMemo(() => createResizePlugin(15), []);
  const scrollController = useMemo(() => createScrollControllerPlugin({ initialScroll: '07:00' }), []);
  const currentTime = useMemo(() => createCurrentTimePlugin(), []);

  // defaultView calcolato all'init (non reattivo al resize — l'utente può cambiare manualmente)
  const initialDefaultView = useRef<'day' | 'week'>(window.innerWidth < 768 ? 'day' : 'week');

  const calendar = useCalendarApp(
    {
      views: [createViewWeek(), createViewMonthGrid(), createViewDay(), createViewList()],
      defaultView: initialDefaultView.current,
      locale: 'it-IT',
      firstDayOfWeek: 1,
      timezone: USER_TZ,
      dayBoundaries: { start: '07:00', end: '22:00' },
      weekOptions: { gridStep: 30 },
      callbacks: {
        onEventClick: (event: unknown) => {
          const apptId = (event as { id: string }).id;
          if (apptId.startsWith('reminder-')) {
            const remId = Number(apptId.replace('reminder-', ''));
            const found = itemsRef.current.find(
              (i): i is AgendaItem & { kind: 'reminder' } => i.kind === 'reminder' && i.data.id === remId,
            );
            if (found) setSelectedReminder(found.data);
            return;
          }
          const found = itemsRef.current.find(
            (i): i is AgendaItem & { kind: 'appointment' } =>
              i.kind === 'appointment' && i.data.id === apptId,
          );
          if (found) setSelectedAppt(found.data);
        },
        onEventUpdate: (event: CalendarEventExternal) => {
          const toIso = (t: TemporalType.ZonedDateTime | TemporalType.PlainDate): string =>
            t instanceof Object && 'toInstant' in t
              ? (t as TemporalType.ZonedDateTime).toInstant().toString()
              : (t as TemporalType.PlainDate).toString();
          const eventId = String(event.id);
          if (eventId.startsWith('reminder-')) {
            // DnD reminder: aggiorna dueAt con la nuova data (allDay → PlainDate → "YYYY-MM-DD")
            const reminderId = Number(eventId.replace('reminder-', ''));
            const dateStr = toIso(event.start); // es. "2026-05-01" (PlainDate.toString())
            const newDueAt = dateStr.includes('T') ? dateStr : `${dateStr}T09:00:00.000Z`;
            patchReminder(reminderId, { due_at: newDueAt }).then(() => refetch()).catch(() => {});
            return;
          }
          fetchWithRetry(`/api/appointments/${event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startAt: toIso(event.start), endAt: toIso(event.end) }),
          }).then(() => refetch()).catch(() => {});
        },
        isCalendarSmall: () => false,
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventsService, dragAndDrop, resize, scrollController, currentTime],
  );

  useEffect(() => {
    const apptItems = items.filter(isApptItem);
    const reminderItems = items.filter(
      (i): i is AgendaItem & { kind: 'reminder'; data: ReminderWithCustomer } =>
        i.kind === 'reminder' && !(hideAutoReminders && i.data.source === 'auto'),
    );
    eventsService.set([
      ...apptItems.map((i) => toScheduleXEvent(i.data, todayKey)),
      ...reminderItems.map((i) => toScheduleXReminderEvent(i.data, todayKey)),
    ]);
  }, [items, eventsService, todayKey, hideAutoReminders]);

  const initialNavRef = useRef({ date: searchParams.get('date'), time: searchParams.get('time') });
  useEffect(() => {
    const { date: dateStr, time: timeStr } = initialNavRef.current;
    if (!dateStr) return;
    // Aspetta 50ms per dare tempo a Schedule-X di inizializzare $app
    const timer = setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const $app = (calendar as any).$app;
        const currentDate = $app?.datePickerState?.selectedDate?.value;
        if (!currentDate || typeof currentDate.with !== 'function') return;
        const [year, month, day] = dateStr.split('-').map(Number);
        const targetDate = currentDate.with({ year, month, day });
        $app.datePickerState.selectedDate.value = targetDate;
        $app?.calendarState?.setView(window.innerWidth < 768 ? 'day' : 'week', targetDate);
        if (timeStr) {
          const zdt = Temporal.Instant.from(timeStr).toZonedDateTimeISO(USER_TZ);
          const hh = String(zdt.hour).padStart(2, '0');
          const mm = String(zdt.minute).padStart(2, '0');
          setTimeout(() => scrollController.scrollTo(`${hh}:${mm}`), 150);
        }
      } catch { /* navigazione fallita: calendario non ancora pronto */ }
    }, 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar]);

  const [showApptForm, setShowApptForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [newApptDate, setNewApptDate] = useState<string | undefined>();
  const [types, setTypes] = useState<AppointmentType[]>([]);

  const [selectedReminder, setSelectedReminder] = useState<import('../services/reminders.service').ReminderWithCustomer | null>(null);
  const [convertingReminder, setConvertingReminder] = useState<{ id: number; customerErpId: string | null; customerName: string | null } | null>(null);

  const [fabExpanded, setFabExpanded] = useState(false);
  const [showReminderFlow, setShowReminderFlow] = useState(false);
  const [reminderPickerQuery, setReminderPickerQuery] = useState('');
  const [reminderPickerResults, setReminderPickerResults] = useState<Array<{ erpId: string; name: string }>>([]);
  const [reminderPickerCustomer, setReminderPickerCustomer] = useState<{ erpId: string; name: string } | null>(null);

  useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!reminderPickerQuery || reminderPickerQuery.length < 2) {
      setReminderPickerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(reminderPickerQuery)}&limit=5`);
        const data = await res.json() as { success: boolean; data: { customers: Array<{ erpId: string; name: string }> } };
        setReminderPickerResults((data.data?.customers ?? []).slice(0, 5));
      } catch {
        setReminderPickerResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [reminderPickerQuery]);

  const pastItemIds = useMemo(() => {
    const s = new Set<string | number>();
    for (const item of items) {
      const k = item.kind === 'appointment' ? item.data.startAt.split('T')[0] : item.data.dueAt.split('T')[0];
      if (k < todayKey) s.add(item.data.id);
    }
    return s;
  }, [items, todayKey]);

  const overdueCount = items.filter((i) => {
    const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0];
    return k < todayKey;
  }).length;
  const todayCount = items.filter((i) => {
    const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0];
    return k === todayKey;
  }).length;
  const apptCount = items.filter(isApptItem).length;
  const totalCount = items.length;

  const showSidebar = !isMobile;

  function handleNavigateToAppt(startAt: string) {
    if (isMobile) setMobilePanelView('calendar');
    const [year, month, day] = startAt.split('T')[0].split('-').map(Number);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $app = (calendar as any).$app;
    const currentDate = $app?.datePickerState?.selectedDate?.value;
    // Costruisce la data target con temporal-polyfill (stesso tipo di $app interno)
    const targetDate = currentDate?.with({ year, month, day });
    // La week view legge selectedDate.value per getWeekFor() — va aggiornato direttamente
    $app.datePickerState.selectedDate.value = targetDate;
    // setView aggiorna anche range e tipo vista
    $app?.calendarState?.setView(isMobile ? 'day' : 'week', targetDate);
    const zdt = Temporal.Instant.from(startAt).toZonedDateTimeISO(USER_TZ);
    const timeStr = `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
    setTimeout(() => scrollController.scrollTo(timeStr), 100);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', flex: 1, minWidth: 80 }}>{"📅"} Agenda</div>
        {/* Pulsanti azione — visibili solo su tablet/desktop */}
        {!isMobile && (
          <>
            <button
              onClick={() => { setNewApptDate(todayKey); setShowApptForm(true); }}
              style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {"📌"} + Appuntamento
            </button>
            <button
              onClick={() => setShowTypeManager(true)}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Gestisci tipi
            </button>
          </>
        )}
        <button
          onClick={() => setShowSyncPanel(true)}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {"🔗"} Sincronizza
        </button>
        <button
          onClick={() => setShowHelpPanel(true)}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', color: '#64748b', fontWeight: 700, flexShrink: 0 }}
        >
          ?
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 12px', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        {([
          { label: 'Scaduti', value: overdueCount, color: '#ef4444' },
          { label: 'Oggi', value: todayCount, color: '#2563eb' },
          { label: 'Appt.', value: apptCount, color: '#10b981' },
          { label: 'Totali', value: totalCount, color: '#8b5cf6' },
        ] as const).map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
            <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, marginBottom: 2 }}>{value}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Sidebar desktop/tablet */}
        {showSidebar && (
          <div style={{ width: isTablet ? 240 : 280, flexShrink: 0, background: '#fff', borderRight: '1px solid #f1f5f9', overflowY: 'auto', padding: '12px 0' }}>
            {/* Mini-cal */}
            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 16 }}
                >
                  ‹
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
                </span>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 16 }}
                >
                  ›
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {DAY_LABELS.map((l, li) => (
                  <div key={li} style={{ fontSize: 10, textAlign: 'center', color: '#94a3b8', fontWeight: 700, paddingBottom: 4 }}>{l}</div>
                ))}
                {calGrid.map((d, i) => (
                  <div
                    key={i}
                    onClick={() => { if (d) { setNewApptDate(toDateKey(d)); setShowApptForm(true); } }}
                    style={{
                      fontSize: 12, textAlign: 'center', padding: '4px 0', borderRadius: '50%',
                      background: d && toDateKey(d) === todayKey ? '#2563eb' : 'transparent',
                      color: d && toDateKey(d) === todayKey ? '#fff' : d ? '#374151' : 'transparent',
                      cursor: d ? 'pointer' : 'default', fontWeight: 500,
                    }}
                  >
                    {d?.getDate()}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px 6px' }}>
                <button
                  onClick={() => setHideAutoReminders((v) => { localStorage.setItem('agenda.hideAutoReminders', String(!v)); return !v; })}
                  title={hideAutoReminders ? 'Mostra reminder automatici' : 'Nascondi reminder automatici dormienti'}
                  style={{ background: hideAutoReminders ? '#fef3c7' : '#f8fafc', border: `1px solid ${hideAutoReminders ? '#fde68a' : '#e2e8f0'}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: hideAutoReminders ? '#92400e' : '#64748b', cursor: 'pointer', fontWeight: 600 }}
                >
                  {hideAutoReminders ? '🤖 Dormienti nascosti' : '🤖 Nascondi dormienti'}
                </button>
              </div>
              <AgendaMixedList
                items={items}
                onRefetch={refetch}
                onNavigateToEvent={handleNavigateToAppt}
                hideAuto={hideAutoReminders}
                onConvertToAppointment={(r) => { setConvertingReminder({ id: r.id, customerErpId: r.customerErpId, customerName: r.customerName }); setNewApptDate(r.dueAt.split('T')[0]); setShowApptForm(true); }}
              />
            </div>
          </div>
        )}

        {/* Area principale */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Toggle Calendario/Lista — solo mobile */}
          {isMobile && (
            <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9', padding: '6px 12px', gap: 6 }}>
              <button
                onClick={() => setMobilePanelView('calendar')}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: mobilePanelView === 'calendar' ? '#2563eb' : '#f1f5f9',
                  color: mobilePanelView === 'calendar' ? '#fff' : '#64748b',
                }}
              >
                {"📅"} Calendario
              </button>
              <button
                onClick={() => setMobilePanelView('list')}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: mobilePanelView === 'list' ? '#2563eb' : '#f1f5f9',
                  color: mobilePanelView === 'list' ? '#fff' : '#64748b',
                }}
              >
                {"📋"} Lista
              </button>
            </div>
          )}

          {/* Calendario — sempre montato, nascosto/visibile via visibility per mantenere lo stato interno */}
          <div style={{ flex: 1, overflow: 'hidden', display: (!isMobile || mobilePanelView === 'calendar') ? 'flex' : 'none', flexDirection: 'column' }}>
            <ScheduleXCalendar calendarApp={calendar} customComponents={{ timeGridEvent: CustomTimeGridEvent, monthGridEvent: CustomMonthGridEvent }} />
          </div>

          {/* Lista — solo mobile, solo quando selezionata */}
          {isMobile && mobilePanelView === 'list' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>
              ) : (
                <AgendaMixedList
                    items={items}
                    onRefetch={refetch}
                    pastItemIds={pastItemIds}
                    onNavigateToEvent={handleNavigateToAppt}
                    hideAuto={hideAutoReminders}
                    onConvertToAppointment={(r) => { setConvertingReminder({ id: r.id, customerErpId: r.customerErpId, customerName: r.customerName }); setNewApptDate(r.dueAt.split('T')[0]); setShowApptForm(true); setMobilePanelView('calendar'); }}
                  />
              )}
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile — speed dial collassabile */}
      {isMobile && (
        <>
          {fabExpanded && (
            <div
              onClick={() => setFabExpanded(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            />
          )}
          <div style={{ position: 'fixed', bottom: 24, right: 16, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            {fabExpanded && (
              <>
                <button
                  onClick={() => { setFabExpanded(false); setShowReminderFlow(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 24, padding: '9px 16px 9px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(245,158,11,.45)', whiteSpace: 'nowrap' }}
                >
                  {"🔔"} Promemoria
                </button>
                <button
                  onClick={() => { setFabExpanded(false); setNewApptDate(todayKey); setShowApptForm(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 24, padding: '9px 16px 9px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,.45)', whiteSpace: 'nowrap' }}
                >
                  {"📌"} Appuntamento
                </button>
              </>
            )}
            <button
              onClick={() => setFabExpanded((v) => !v)}
              style={{ width: 56, height: 56, borderRadius: '50%', background: fabExpanded ? '#64748b' : '#2563eb', color: '#fff', border: 'none', fontSize: 26, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,.4)', transform: fabExpanded ? 'rotate(45deg)' : 'none', transition: 'transform 0.18s, background 0.18s' }}
            >
              +
            </button>
          </div>
        </>
      )}

      {/* Modali */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          defaultDate={newApptDate}
          defaultCustomerErpId={convertingReminder?.customerErpId ?? undefined}
          defaultCustomerName={convertingReminder?.customerName ?? undefined}
          isMobile={isMobile}
          onManageTypes={() => setShowTypeManager(true)}
          onSaved={() => {
            setShowApptForm(false);
            setNewApptDate(undefined);
            if (convertingReminder) {
              patchReminder(convertingReminder.id, { status: 'done', completed_at: new Date().toISOString() }).catch(() => {});
              setConvertingReminder(null);
            }
            refetch();
          }}
          onCancel={() => { setShowApptForm(false); setNewApptDate(undefined); setConvertingReminder(null); }}
        />
      )}
      {selectedAppt && (
        <AppointmentForm
          types={types}
          initial={selectedAppt}
          isMobile={isMobile}
          onSaved={() => { setSelectedAppt(null); refetch(); }}
          onCancel={() => setSelectedAppt(null)}
        />
      )}
      {showTypeManager && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}>
          <AppointmentTypeManager onClose={() => {
            setShowTypeManager(false);
            listAppointmentTypes().then(setTypes).catch(() => {});
          }} />
        </div>
      )}
      {showSyncPanel && <AgendaCalendarSyncPanel onClose={() => setShowSyncPanel(false)} />}
      {showHelpPanel && <AgendaHelpPanel onClose={() => setShowHelpPanel(false)} />}

      {/* Reminder detail panel — aperto da click su evento calendario */}
      {selectedReminder && (
        <>
          <div
            onClick={() => setSelectedReminder(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,0.35)' }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1051,
            background: '#fff', borderRadius: '18px 18px 0 0',
            boxShadow: '0 -4px 24px rgba(0,0,0,.2)', padding: '16px 20px 24px',
          }}>
            <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{selectedReminder.customerName}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selectedReminder.typeEmoji} {selectedReminder.typeLabel}
                  {selectedReminder.source === 'auto' && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, padding: '1px 5px' }}>🤖 automatico</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedReminder(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>
            {selectedReminder.note && (
              <div style={{ fontSize: 13, color: '#374151', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 }}>
                {selectedReminder.note}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  patchReminder(selectedReminder.id, { status: 'done', completed_at: new Date().toISOString() })
                    .then(() => { setSelectedReminder(null); refetch(); })
                    .catch(() => {});
                }}
                style={{ flex: 1, padding: '10px 0', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >
                ✓ Segna completo
              </button>
              <button
                onClick={() => {
                  setConvertingReminder({ id: selectedReminder.id, customerErpId: selectedReminder.customerErpId, customerName: selectedReminder.customerName });
                  setNewApptDate(selectedReminder.dueAt.split('T')[0]);
                  setSelectedReminder(null);
                  setShowApptForm(true);
                }}
                style={{ flex: 1, padding: '10px 0', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >
                {'📌 Crea appuntamento'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reminder flow: customer picker */}
      {showReminderFlow && !reminderPickerCustomer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: 20, maxHeight: '60vh', overflow: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>{"🔔"} Scegli cliente</div>
            <input
              autoFocus
              autoComplete="off"
              type="search"
              value={reminderPickerQuery}
              onChange={(e) => setReminderPickerQuery(e.target.value)}
              placeholder="Cerca cliente..."
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {reminderPickerResults.map((c) => (
              <div
                key={c.erpId}
                onClick={() => setReminderPickerCustomer(c)}
                style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 14, color: '#0f172a' }}
              >
                {c.name}
              </div>
            ))}
            {reminderPickerQuery.length >= 2 && reminderPickerResults.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Nessun cliente trovato</div>
            )}
            <button
              onClick={() => { setShowReminderFlow(false); setReminderPickerQuery(''); setReminderPickerResults([]); }}
              style={{ marginTop: 12, width: '100%', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Reminder flow: reminder form */}
      {showReminderFlow && reminderPickerCustomer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>{"🔔"} Promemoria — {reminderPickerCustomer.name}</div>
            <ReminderForm
              customerProfile={reminderPickerCustomer.erpId}
              onSave={async (input: CreateReminderInput) => {
                await createReminder(reminderPickerCustomer.erpId, input);
                setShowReminderFlow(false);
                setReminderPickerCustomer(null);
                setReminderPickerQuery('');
                setReminderPickerResults([]);
                refetch();
              }}
              onCancel={() => { setShowReminderFlow(false); setReminderPickerCustomer(null); setReminderPickerQuery(''); setReminderPickerResults([]); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
