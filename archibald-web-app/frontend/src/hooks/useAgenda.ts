import React from 'react';
import { listAppointments } from '../api/appointments';
import { listUpcomingReminders } from '../services/reminders.service';
import type { AgendaItem } from '../types/agenda';

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
  const [items, setItems] = React.useState<AgendaItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listAppointments({ from: opts.from, to: opts.to, customerId: opts.customerId }),
      listUpcomingReminders(31),
    ])
      .then(([appts, remindersData]) => {
        if (cancelled) return;

        const apptItems: AgendaItem[] = appts.map((a) => ({ kind: 'appointment', data: a }));

        const overdue = remindersData.overdue.filter(
          (r) => !opts.customerId || r.customerErpId === opts.customerId,
        );
        const byDate = Object.values(remindersData.byDate)
          .flat()
          .filter((r) => !opts.customerId || r.customerErpId === opts.customerId);

        const reminderItems: AgendaItem[] = [...overdue, ...byDate].map((r) => ({
          kind: 'reminder',
          data: r,
        }));

        const merged = [...apptItems, ...reminderItems].sort((a, b) => {
          const dateA = a.kind === 'appointment' ? a.data.startAt : a.data.dueAt;
          const dateB = b.kind === 'appointment' ? b.data.startAt : b.data.dueAt;
          return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
        });

        setItems(merged);
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

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);

  return { items, loading, error, refetch };
}
