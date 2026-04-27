import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { patchReminder } from '../services/reminders.service';
import { deleteAppointment } from '../api/appointments';
import type { AgendaItem } from '../types/agenda';

const SECTION_STYLE = {
  overdue:  { background: '#fef2f2', color: '#dc2626' },
  today:    { background: '#eff6ff', color: '#1d4ed8' },
  upcoming: { background: '#f8fafc', color: '#64748b' },
};

const ROW_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 12px',
  borderBottom: '1px solid #e9eef5',
  minHeight: 46,
  background: '#ffffff',
};

const APPT_ROW: CSSProperties = {
  ...ROW_BASE,
  background: '#eff6ff',
  borderLeft: '4px solid #2563eb',
  paddingLeft: 8,
  borderBottomColor: '#dbeafe',
};

const ACTION_BTN: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  border: '1.5px solid #e2e8f0',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  color: '#94a3b8',
  flexShrink: 0,
};

const ELLIPSIS: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(iso: string): string {
  return iso.split('T')[0];
}

type Props = {
  items: AgendaItem[];
  onRefetch: () => void;
  compact?: boolean;
  pastItemIds?: Set<string | number>;
};

export function AgendaMixedList({ items, onRefetch, compact = false, pastItemIds }: Props) {
  const navigate = useNavigate();
  const todayKey = new Date().toISOString().split('T')[0];
  const [completingId, setCompletingId] = useState<string | number | null>(null);

  const displayItems = compact ? items.slice(0, 5) : items;

  const overdue: AgendaItem[] = [];
  const today: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];

  for (const item of displayItems) {
    const dateKey =
      item.kind === 'appointment'
        ? toDateKey(item.data.startAt)
        : toDateKey(item.data.dueAt);
    if (dateKey < todayKey) overdue.push(item);
    else if (dateKey === todayKey) today.push(item);
    else upcoming.push(item);
  }

  async function handleCompleteReminder(id: number) {
    setCompletingId(id);
    try {
      await patchReminder(id, { status: 'done', completed_at: new Date().toISOString() });
      onRefetch();
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDeleteAppointment(id: string) {
    setCompletingId(id);
    try {
      await deleteAppointment(id);
      onRefetch();
    } finally {
      setCompletingId(null);
    }
  }

  function renderItem(item: AgendaItem) {
    if (item.kind === 'appointment') {
      const appt = item.data;
      const apptPastStyle = pastItemIds?.has(appt.id) ? { opacity: 0.6, textDecoration: 'line-through' as const } : {};
      return (
        <div key={appt.id} style={{ ...APPT_ROW, ...apptPastStyle }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#2563eb',
              minWidth: 36,
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            {appt.allDay ? 'Tutto il g.' : formatTime(appt.startAt)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', ...ELLIPSIS }}>
              {'📌 '}{appt.title}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, ...ELLIPSIS }}>
              {appt.typeEmoji} {appt.typeLabel}
              {appt.customerName ? ` · ${appt.customerName}` : ''}
            </div>
          </div>
          <button
            onClick={() => handleDeleteAppointment(appt.id)}
            disabled={completingId === appt.id}
            style={ACTION_BTN}
          >
            {'✓'}
          </button>
        </div>
      );
    }

    const r = item.data;
    const reminderPastStyle = pastItemIds?.has(r.id) ? { opacity: 0.6, textDecoration: 'line-through' as const } : {};
    return (
      <div key={r.id} style={{ ...ROW_BASE, ...reminderPastStyle }}>
        <div style={{ minWidth: 36, flexShrink: 0 }} />
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: r.typeColorBg,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer',
              ...ELLIPSIS,
            }}
            onClick={() => navigate(`/customers/${r.customerErpId}`)}
          >
            {r.customerName}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            {r.typeEmoji} {r.typeLabel}
            {r.source === 'auto' && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', flexShrink: 0 }}>
                {"🤖"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => handleCompleteReminder(r.id)}
          disabled={completingId === r.id}
          style={ACTION_BTN}
        >
          {'✓'}
        </button>
      </div>
    );
  }

  function renderSection(
    label: string,
    sectionItems: AgendaItem[],
    style: (typeof SECTION_STYLE)[keyof typeof SECTION_STYLE],
  ) {
    if (sectionItems.length === 0) return null;
    return (
      <>
        <div
          style={{
            ...style,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '4px 12px',
          }}
        >
          {label}
        </div>
        {sectionItems.map((item) => renderItem(item))}
      </>
    );
  }

  if (displayItems.length === 0) {
    return (
      <div
        style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
      >
        Nessun elemento in agenda
      </div>
    );
  }

  return (
    <div style={{ overflow: 'hidden' }}>
      {renderSection('⚠ Scaduto', overdue, SECTION_STYLE.overdue)}
      {renderSection(
        `📅 ${new Date().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} — Oggi`,
        today,
        SECTION_STYLE.today,
      )}
      {renderSection('Prossimi', upcoming, SECTION_STYLE.upcoming)}
    </div>
  );
}
