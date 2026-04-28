import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgenda } from '../hooks/useAgenda';
import { AgendaMixedList } from './AgendaMixedList';
import { AppointmentForm } from './AppointmentForm';
import { ReminderForm } from './ReminderForm';
import { listAppointmentTypes } from '../api/appointment-types';
import { createReminder, listCustomerReminders, deleteReminder } from '../services/reminders.service';
import type { CreateReminderInput, Reminder } from '../services/reminders.service';
import type { AppointmentType, AgendaItem } from '../types/agenda';

type Props = {
  customerErpId: string;
  customerName: string;
  isMobile?: boolean;
};

type FilterType = 'all' | 'appointment' | 'reminder' | 'overdue' | 'storico';

const PILL_ACTIVE: CSSProperties = { background: '#2563eb', color: '#fff', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none' };
const PILL_INACTIVE: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const FILTER_LABELS: Record<FilterType, string> = { all: 'Tutti', appointment: 'Appuntamenti', reminder: 'Promemoria', overdue: 'Scaduti', storico: '📂 Storico' };

export function AgendaClienteSection({ customerErpId, customerName, isMobile = false }: Props) {
  const navigate = useNavigate();

  const { from: fromStr, to: toStr, todayKey } = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - 12);
    const to = new Date(now);
    to.setMonth(to.getMonth() + 6);
    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      todayKey: now.toISOString().split('T')[0],
    };
  }, []);

  const { items, loading, refetch } = useAgenda({
    from: fromStr,
    to: toStr,
    customerId: customerErpId,
  });

  function handleNavigateToEvent(startAt: string, apptId?: string) {
    const dateKey = startAt.split('T')[0];
    const params = new URLSearchParams({ date: dateKey });
    if (startAt.length > 10) params.set('time', startAt);
    if (apptId) params.set('apptId', apptId);
    navigate(`/agenda?${params.toString()}`);
  }

  const [filter, setFilter] = useState<FilterType>('all');
  const [showApptForm, setShowApptForm] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [doneReminders, setDoneReminders] = useState<Reminder[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    if (filter !== 'storico') return;
    setDoneLoading(true);
    listCustomerReminders(customerErpId, 'done')
      .then(setDoneReminders)
      .catch(() => setDoneReminders([]))
      .finally(() => setDoneLoading(false));
  }, [filter, customerErpId]);

  const doneReminderItems = useMemo<AgendaItem[]>(() => {
    return doneReminders.map((r) => ({
      kind: 'reminder',
      data: { ...r, customerName, customerErpId },
    }));
  }, [doneReminders, customerName, customerErpId]);

  const filteredItems = useMemo(() => {
    if (filter === 'storico') {
      const pastAppts = items.filter((item) => {
        const dateKey = item.kind === 'appointment'
          ? item.data.startAt.split('T')[0]
          : item.data.dueAt.split('T')[0];
        return item.kind === 'appointment' && dateKey < todayKey;
      });
      return [...pastAppts, ...doneReminderItems].sort((a, b) => {
        const da = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
        const db = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
        return da > db ? -1 : da < db ? 1 : 0;
      });
    }
    if (filter === 'appointment') return items.filter((i) => i.kind === 'appointment');
    if (filter === 'reminder') return items.filter((i) => i.kind === 'reminder');
    if (filter === 'overdue') {
      return items.filter((item) => {
        const dateKey = item.kind === 'appointment'
          ? item.data.startAt.split('T')[0]
          : item.data.dueAt.split('T')[0];
        return dateKey < todayKey;
      });
    }
    return items.filter((item) => {
      const dateKey = item.kind === 'appointment'
        ? item.data.startAt.split('T')[0]
        : item.data.dueAt.split('T')[0];
      return dateKey >= todayKey;
    });
  }, [items, filter, todayKey, doneReminderItems]);

  function handleDeleteDoneReminder(id: number) {
    deleteReminder(id)
      .then(() => setDoneReminders((prev) => prev.filter((r) => r.id !== id)))
      .catch(() => {});
  }

  const pastItemIds = useMemo(() => {
    const s = new Set<string | number>();
    for (const item of filteredItems) {
      const dateKey = item.kind === 'appointment'
        ? item.data.startAt.split('T')[0]
        : item.data.dueAt.split('T')[0];
      if (dateKey < todayKey) s.add(item.data.id);
    }
    return s;
  }, [filteredItems, todayKey]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{"📅"} Agenda cliente</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {customerName} — {items.filter((i) => { const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0]; return k >= todayKey; }).length} attivi · {items.filter((i) => { const k = i.kind === 'appointment' ? i.data.startAt.split('T')[0] : i.data.dueAt.split('T')[0]; return k < todayKey; }).length} passati
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowReminderForm(true)}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}
          >
            {"🔔"} + Promemoria
          </button>
          <button
            onClick={() => setShowApptForm(true)}
            style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
          >
            {"📌"} + Appuntamento
          </button>
        </div>
      </div>

      {/* Filtri pill */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
        {(['all', 'appointment', 'reminder', 'overdue', 'storico'] as FilterType[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={filter === f ? PILL_ACTIVE : PILL_INACTIVE}>
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading || doneLoading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento...</div>
      ) : filter === 'storico' && filteredItems.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Nessun appuntamento o promemoria completato negli ultimi 30 giorni
        </div>
      ) : (
        <AgendaMixedList items={filteredItems} onRefetch={refetch} pastItemIds={pastItemIds} onNavigateToEvent={handleNavigateToEvent} onDeleteReminder={filter === 'storico' ? handleDeleteDoneReminder : undefined} />
      )}

      {/* Form modale appuntamento */}
      {showApptForm && (
        <AppointmentForm
          types={types}
          defaultCustomerErpId={customerErpId}
          defaultCustomerName={customerName}
          isMobile={isMobile}
          onSaved={() => { setShowApptForm(false); refetch(); }}
          onCancel={() => setShowApptForm(false)}
        />
      )}

      {/* Form modale promemoria */}
      {showReminderForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>
              {"🔔"} Nuovo promemoria — {customerName}
            </div>
            <ReminderForm
              customerProfile={customerErpId}
              onSave={async (input: CreateReminderInput) => {
                await createReminder(customerErpId, input);
                setShowReminderForm(false);
                refetch();
              }}
              onCancel={() => setShowReminderForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
