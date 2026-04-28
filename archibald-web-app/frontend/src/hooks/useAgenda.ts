import { useState, useEffect, useCallback } from 'react';
import { listAppointments } from '../api/appointments';
import { listUpcomingReminders } from '../services/reminders.service';
import type { AgendaItem, Appointment } from '../types/agenda';
import type { ReminderWithCustomer } from '../services/reminders.service';

type UseAgendaOpts = {
  from: string;
  to: string;
  customerId?: string;
};

export function useAgenda(opts: UseAgendaOpts): {
  items: AgendaItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const daysDiff = opts.to && opts.from
      ? Math.ceil((new Date(opts.to).getTime() - new Date(opts.from).getTime()) / (1000 * 60 * 60 * 24))
      : 31;
    const reminderDays = Math.max(daysDiff, 31);

    Promise.all([
      listAppointments({ from: opts.from, to: opts.to, customerId: opts.customerId }),
      listUpcomingReminders(reminderDays),
    ])
      .then(([appts, remindersData]) => {
        if (cancelled) return;

        const overdue = remindersData.overdue.filter(
          (r) => !opts.customerId || r.customerErpId === opts.customerId,
        );
        const byDate = Object.values(remindersData.byDate)
          .flat()
          .filter((r) => !opts.customerId || r.customerErpId === opts.customerId);

        setItems(normalizeToAgendaItems(appts, [...overdue, ...byDate]));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError('Errore nel caricamento agenda');
        setLoading(false);
        console.error(err);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.from, opts.to, opts.customerId, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return { items, loading, error, refetch };
}

export function normalizeToAgendaItems(
  appointments: Appointment[],
  reminders: ReminderWithCustomer[],
): AgendaItem[] {
  const apptItems: AgendaItem[] = appointments.map((a) => ({ kind: 'appointment', data: a }));
  const reminderItems: AgendaItem[] = reminders.map((r) => ({ kind: 'reminder', data: r }));
  return [...apptItems, ...reminderItems].sort((a, b) => {
    const dateA = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
    const dateB = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
    return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
  });
}
