import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useAgenda } from '../hooks/useAgenda';
import { AgendaMixedList } from './AgendaMixedList';
import { AppointmentForm } from './AppointmentForm';
import { listAppointmentTypes } from '../api/appointment-types';
import type { AppointmentType } from '../types/agenda';

type Props = {
  customerErpId: string;
  customerName: string;
  isMobile?: boolean;
};

type FilterType = 'all' | 'appointment' | 'reminder' | 'overdue';

export function AgendaClienteSection({ customerErpId, customerName, isMobile = false }: Props) {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - 3);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 6);

  const { items, loading, refetch } = useAgenda({
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
    customerId: customerErpId,
  });

  const [filter, setFilter] = useState<FilterType>('all');
  const [showApptForm, setShowApptForm] = useState(false);
  const [types, setTypes] = useState<AppointmentType[]>([]);

  useEffect(() => {
    listAppointmentTypes().then(setTypes).catch(() => {});
  }, []);

  const todayKey = now.toISOString().split('T')[0];

  const filteredItems = items.filter((item) => {
    if (filter === 'appointment') return item.kind === 'appointment';
    if (filter === 'reminder') return item.kind === 'reminder';
    if (filter === 'overdue') {
      const dateKey = item.kind === 'appointment'
        ? item.data.startAt.split('T')[0]
        : item.data.dueAt.split('T')[0];
      return dateKey < todayKey;
    }
    return true;
  });

  const PILL_ACTIVE: CSSProperties = { background: '#2563eb', color: '#fff', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none' };
  const PILL_INACTIVE: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{"📅"} Agenda cliente</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{customerName} — {items.length} voci totali</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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
        {(['all', 'appointment', 'reminder', 'overdue'] as FilterType[]).map((f) => {
          const labels: Record<FilterType, string> = { all: 'Tutti', appointment: 'Appuntamenti', reminder: 'Promemoria', overdue: 'Scaduti' };
          return (
            <button key={f} onClick={() => setFilter(f)} style={filter === f ? PILL_ACTIVE : PILL_INACTIVE}>
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Caricamento...</div>
      ) : (
        <AgendaMixedList items={filteredItems} onRefetch={refetch} />
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
    </div>
  );
}
