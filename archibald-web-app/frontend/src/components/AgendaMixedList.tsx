import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { patchReminder } from '../services/reminders.service';
import type { ReminderWithCustomer } from '../services/reminders.service';
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

const OVERDUE_REM_ROW: CSSProperties = {
  ...ROW_BASE,
  background: '#fff1f2',
  borderLeft: '4px solid #dc2626',
  paddingLeft: 8,
  borderBottomColor: '#fecaca',
};

const AUTO_WARN_ROW: CSSProperties = {
  ...ROW_BASE,
  background: '#fffbeb',
  borderLeft: '4px solid #f59e0b',
  paddingLeft: 8,
  borderBottomColor: '#fde68a',
};

const AUTO_DANGER_ROW: CSSProperties = {
  ...ROW_BASE,
  background: '#fff7ed',
  borderLeft: '4px solid #ea580c',
  paddingLeft: 8,
  borderBottomColor: '#fed7aa',
};

function parseMonthsFromNote(note: string | null): number {
  if (!note) return 0;
  const m = note.match(/da (\d+) mes/i);
  return m ? parseInt(m[1], 10) : 0;
}

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
  onNavigateToEvent?: (startAt: string, apptId?: string) => void;
  hideAuto?: boolean;
  onConvertToAppointment?: (r: ReminderWithCustomer) => void;
};

export function AgendaMixedList({ items, onRefetch, compact = false, pastItemIds, onNavigateToEvent, hideAuto = false, onConvertToAppointment }: Props) {
  const navigate = useNavigate();
  const todayKey = new Date().toISOString().split('T')[0];
  const [completingId, setCompletingId] = useState<string | number | null>(null);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [hiddenReminderIds, setHiddenReminderIds] = useState<Set<number>>(new Set());

  const filteredItems = hideAuto
    ? items.filter((i) => i.kind !== 'reminder' || i.data.source !== 'auto')
    : items;
  const visibleItems = hiddenReminderIds.size > 0
    ? filteredItems.filter((i) => !(i.kind === 'reminder' && hiddenReminderIds.has(i.data.id)))
    : filteredItems;
  const displayItems = compact ? visibleItems.slice(0, 5) : visibleItems;

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
    setHiddenReminderIds((prev) => new Set(prev).add(id));
    try {
      await patchReminder(id, { status: 'done', completed_at: new Date().toISOString() });
      onRefetch();
    } catch {
      setHiddenReminderIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
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
      const apptDateKey = toDateKey(appt.startAt);
      const isPastAppt = apptDateKey < todayKey;
      const apptPastStyle = isPastAppt ? { opacity: 0.65 } : {};
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
          {onNavigateToEvent && !appt.allDay && (
            <button
              onClick={() => onNavigateToEvent(appt.startAt, appt.id)}
              title="Mostra nel calendario"
              style={{ ...ACTION_BTN, color: '#2563eb', borderColor: '#bfdbfe', fontSize: 13 }}
            >
              {'📅'}
            </button>
          )}
          {!isPastAppt && (
            <button
              onClick={() => handleDeleteAppointment(appt.id)}
              disabled={completingId === appt.id}
              title="Elimina appuntamento"
              style={{ ...ACTION_BTN, color: '#ef4444', borderColor: '#fecaca', fontSize: 12 }}
            >
              {'🗑️'}
            </button>
          )}
        </div>
      );
    }

    const r = item.data;
    const isOverdue = pastItemIds?.has(r.id) ?? false;
    const isAuto = r.source === 'auto';
    const months = parseMonthsFromNote(r.note);
    const isDanger = r.priority === 'urgent' || months >= 8;
    const isExpanded = expandedId === r.id;

    let rowStyle = ROW_BASE;
    let nameColor = '#0f172a';
    let metaColor = '#94a3b8';
    if (isOverdue) {
      rowStyle = OVERDUE_REM_ROW; nameColor = '#b91c1c'; metaColor = '#dc2626';
    } else if (isAuto && isDanger) {
      rowStyle = AUTO_DANGER_ROW; nameColor = '#9a3412'; metaColor = '#ea580c';
    } else if (isAuto) {
      rowStyle = AUTO_WARN_ROW; nameColor = '#92400e'; metaColor = '#b45309';
    }

    const urgencyBadge = isAuto
      ? isDanger
        ? <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', flexShrink: 0 }}>⚠ {months}m — esclusività</span>
        : <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', flexShrink: 0 }}>🤖 {months > 0 ? `${months}m inattivo` : 'dormiente'}</span>
      : null;

    return (
      <div key={r.id}>
        <div
          style={{ ...rowStyle, cursor: 'pointer' }}
          onClick={() => setExpandedId(isExpanded ? null : r.id)}
        >
          <div style={{ minWidth: 36, flexShrink: 0 }} />
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isOverdue ? '#dc2626' : isAuto && isDanger ? '#ea580c' : isAuto ? '#f59e0b' : r.typeColorBg,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: nameColor, ...ELLIPSIS }}>{r.customerName}</div>
            <div style={{ fontSize: 11, color: metaColor, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
              {r.typeEmoji} {r.typeLabel}
              {urgencyBadge}
            </div>
          </div>
          {onNavigateToEvent && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateToEvent(r.dueAt); }}
              title="Mostra nel calendario"
              style={{ ...ACTION_BTN, color: isOverdue ? '#dc2626' : '#64748b', borderColor: isOverdue ? '#fca5a5' : '#e2e8f0', fontSize: 13 }}
            >
              {'📅'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); void handleCompleteReminder(r.id); }}
            disabled={completingId === r.id}
            style={ACTION_BTN}
          >
            {'✓'}
          </button>
        </div>
        {isExpanded && (
          <div style={{ padding: '8px 12px 10px 52px', background: rowStyle.background, borderBottom: '1px solid #e9eef5' }}>
            {r.note && <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{r.note}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => navigate(`/customers/${r.customerErpId}`)}
                style={{ fontSize: 12, padding: '4px 10px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151', fontWeight: 600 }}
              >
                👤 Scheda cliente
              </button>
              {onConvertToAppointment && (
                <button
                  onClick={() => onConvertToAppointment(r)}
                  style={{ fontSize: 12, padding: '4px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', color: '#1e40af', fontWeight: 700 }}
                >
                  📌 Crea appuntamento
                </button>
              )}
            </div>
          </div>
        )}
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

  if (visibleItems.length === 0) {
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
