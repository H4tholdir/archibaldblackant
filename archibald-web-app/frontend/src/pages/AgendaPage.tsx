import { useState, useEffect, useMemo, useRef } from 'react';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import {
  createViewWeek,
  createViewMonthGrid,
  createViewDay,
  createViewList,
} from '@schedule-x/calendar';
import type { CalendarEvent } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { listAppointmentTypes } from '../api/appointment-types';
import { AgendaMixedList } from '../components/AgendaMixedList';
import { AppointmentForm } from '../components/AppointmentForm';
import { AppointmentTypeManager } from '../components/AppointmentTypeManager';
import { AgendaCalendarSyncPanel } from '../components/AgendaCalendarSyncPanel';
import { AgendaHelpPanel } from '../components/AgendaHelpPanel';
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

function toScheduleXEvent(appt: Appointment): CalendarEvent {
  return {
    id: appt.id,
    title: `${appt.typeEmoji ?? '📌'} ${appt.title}`,
    start: appt.startAt.slice(0, 16).replace('T', ' '),
    end: appt.endAt.slice(0, 16).replace('T', ' '),
  };
}

function isApptItem(item: AgendaItem): item is AgendaItem & { kind: 'appointment' } {
  return item.kind === 'appointment';
}

export function AgendaPage() {
  const todayKey = new Date().toISOString().split('T')[0];
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);

  useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [calMonth, setCalMonth] = useState(() => new Date());
  const calGrid = useMemo(() => buildMonthGrid(calMonth.getFullYear(), calMonth.getMonth()), [calMonth]);

  const { periodFrom, periodTo } = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const mm = String(month + 1).padStart(2, '0');
    return {
      periodFrom: `${year}-${mm}-01`,
      periodTo: `${year}-${mm}-${lastDay}`,
    };
  }, [calMonth]);

  const { items, loading, refetch } = useAgenda({ from: periodFrom, to: periodTo });

  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const eventsService = useMemo(() => createEventsServicePlugin(), []);

  const calendar = useCalendarApp(
    {
      views: [createViewWeek(), createViewMonthGrid(), createViewDay(), createViewList()],
      defaultView: 'week',
      locale: 'it-IT',
      firstDayOfWeek: 1,
      callbacks: {
        onEventClick: (event: unknown) => {
          const apptId = (event as { id: string }).id;
          const found = itemsRef.current.find(
            (i): i is AgendaItem & { kind: 'appointment' } =>
              i.kind === 'appointment' && i.data.id === apptId,
          );
          if (found) setSelectedAppt(found.data);
        },
      },
    },
    [eventsService],
  );

  useEffect(() => {
    const apptItems = items.filter(isApptItem);
    eventsService.set(apptItems.map((i) => toScheduleXEvent(i.data)));
  }, [items, eventsService]);

  const [showApptForm, setShowApptForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [newApptDate, setNewApptDate] = useState<string | undefined>();
  const [types, setTypes] = useState<AppointmentType[]>([]);

  useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', flex: 1 }}>{"📅"} Agenda</div>
        <button
          onClick={() => setShowSyncPanel(true)}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#374151', cursor: 'pointer' }}
        >
          {"🔗"} Sincronizza
        </button>
        <button
          onClick={() => setShowHelpPanel(true)}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: 14, cursor: 'pointer', color: '#64748b', fontWeight: 700 }}
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
              <AgendaMixedList items={items} onRefetch={refetch} compact />
            </div>
          </div>
        )}

        {/* Area principale */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!isMobile ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ScheduleXCalendar calendarApp={calendar} />
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Caricamento...</div>
              ) : (
                <AgendaMixedList items={items} onRefetch={refetch} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile */}
      {isMobile && (
        <div style={{ position: 'fixed', bottom: 24, right: 16 }}>
          <button
            onClick={() => { setNewApptDate(todayKey); setShowApptForm(true); }}
            style={{ width: 56, height: 56, borderRadius: '50%', background: '#2563eb', color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,.4)' }}
          >
            +
          </button>
        </div>
      )}

      {/* Desktop: action buttons */}
      {!isMobile && (
        <div style={{ padding: '10px 16px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setNewApptDate(todayKey); setShowApptForm(true); }}
            style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff' }}
          >
            {"📌"} + Appuntamento
          </button>
          <button
            onClick={() => setShowTypeManager(true)}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151', marginLeft: 'auto' }}
          >
            Gestisci tipi
          </button>
        </div>
      )}

      {/* Modali */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          defaultDate={newApptDate}
          isMobile={isMobile}
          onManageTypes={() => { setShowApptForm(false); setShowTypeManager(true); }}
          onSaved={() => { setShowApptForm(false); setNewApptDate(undefined); refetch(); }}
          onCancel={() => { setShowApptForm(false); setNewApptDate(undefined); }}
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
      {showTypeManager && <AppointmentTypeManager onClose={() => setShowTypeManager(false)} />}
      {showSyncPanel && <AgendaCalendarSyncPanel onClose={() => setShowSyncPanel(false)} />}
      {showHelpPanel && <AgendaHelpPanel onClose={() => setShowHelpPanel(false)} />}
    </div>
  );
}
