import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { createAppointment, updateAppointment } from '../api/appointments';
import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { Appointment, AppointmentType, CreateAppointmentInput } from '../types/agenda';

type Props = {
  types: AppointmentType[];
  initial?: Appointment;
  defaultDate?: string;
  defaultCustomerErpId?: string;
  defaultCustomerName?: string;
  onSaved: (appt: Appointment) => void;
  onCancel: () => void;
  onManageTypes?: () => void;
  isMobile?: boolean;
};

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

function fromDatetimeLocal(local: string): string {
  return new Date(local).toISOString();
}

export function AppointmentForm({
  types, initial, defaultDate, defaultCustomerErpId, defaultCustomerName,
  onSaved, onCancel, onManageTypes, isMobile = false,
}: Props) {
  const now = new Date();
  const defaultStart = defaultDate
    ? `${defaultDate}T09:00`
    : toDatetimeLocal(now.toISOString());
  const defaultEnd = defaultDate
    ? `${defaultDate}T10:00`
    : toDatetimeLocal(new Date(now.getTime() + 3600000).toISOString());

  const [title,         setTitle]         = useState(initial?.title ?? '');
  const [startAt,       setStartAt]       = useState(initial ? toDatetimeLocal(initial.startAt) : defaultStart);
  const [endAt,         setEndAt]         = useState(initial ? toDatetimeLocal(initial.endAt) : defaultEnd);
  const [allDay,        setAllDay]        = useState(initial?.allDay ?? false);
  const [customerErpId, setCustomerErpId] = useState<string | null>(initial?.customerErpId ?? defaultCustomerErpId ?? null);
  const [customerName,  setCustomerName]  = useState<string | null>(initial?.customerName ?? defaultCustomerName ?? null);
  const [location,      setLocation]      = useState(initial?.location ?? '');
  const [typeId,        setTypeId]        = useState<number | null>(initial?.typeId ?? null);
  const [notes,         setNotes]         = useState(initial?.notes ?? '');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [customerQuery,   setCustomerQuery]   = useState('');
  const [customerResults, setCustomerResults] = useState<Array<{ erpId: string; name: string }>>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  useEffect(() => {
    if (customerQuery.trim().length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingCustomer(true);
      try {
        const res = await fetchWithRetry(`/api/customers?search=${encodeURIComponent(customerQuery)}`);
        const data = await res.json() as { success: boolean; data: { customers: Array<{ erpId: string; name: string }> } };
        setCustomerResults((data.data?.customers ?? []).slice(0, 5));
      } catch { setCustomerResults([]); }
      finally { setSearchingCustomer(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  async function handleSave() {
    if (!title.trim()) { setError('Inserisci un titolo'); return; }
    if (!allDay && endAt <= startAt) { setError("L'orario di fine deve essere dopo l'inizio"); return; }

    setSaving(true); setError(null);
    try {
      const input: CreateAppointmentInput = {
        title: title.trim(),
        startAt: allDay ? `${startAt.split('T')[0]}T00:00:00.000Z` : fromDatetimeLocal(startAt),
        endAt:   allDay ? `${startAt.split('T')[0]}T23:59:59.999Z` : fromDatetimeLocal(endAt),
        allDay,
        customerErpId: customerErpId ?? null,
        location: location.trim() || null,
        typeId,
        notes: notes.trim() || null,
      };
      const saved = initial
        ? await updateAppointment(initial.id, input)
        : await createAppointment(input);
      onSaved(saved);
    } catch {
      setError('Errore nel salvare. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  const LABEL_STYLE: CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5,
    display: 'block',
  };
  const INPUT_STYLE: CSSProperties = {
    width: '100%', border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', fontSize: 14, color: '#0f172a', boxSizing: 'border-box',
  };

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: isMobile ? '14px 16px' : '18px', flex: 1, overflowY: 'auto' }}>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div>
        <label style={LABEL_STYLE} htmlFor="appt-title">Titolo</label>
        <input
          id="appt-title"
          style={INPUT_STYLE}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, color: '#0f172a' }}>Tutto il giorno</span>
        <div
          onClick={() => setAllDay(!allDay)}
          style={{ width: 40, height: 22, background: allDay ? '#2563eb' : '#e2e8f0', borderRadius: 11, position: 'relative', cursor: 'pointer' }}
        >
          <div style={{
            width: 18, height: 18, background: '#fff', borderRadius: '50%',
            position: 'absolute', top: 2, left: allDay ? 20 : 2,
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }} />
        </div>
      </div>

      {!allDay && (
        <div>
          <div style={LABEL_STYLE}>Data e orario</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 6, alignItems: 'center' }}>
            <input
              type="datetime-local"
              style={{ ...INPUT_STYLE, padding: '9px 8px', fontSize: 13, textAlign: 'center' }}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>→</div>
            <input
              type="datetime-local"
              style={{ ...INPUT_STYLE, padding: '9px 8px', fontSize: 13, textAlign: 'center' }}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
      )}

      {allDay && (
        <div>
          <div style={LABEL_STYLE}>Data</div>
          <input
            type="date"
            style={INPUT_STYLE}
            value={startAt.split('T')[0]}
            onChange={(e) => setStartAt(`${e.target.value}T00:00`)}
          />
        </div>
      )}

      <div>
        <div style={LABEL_STYLE}>Cliente (opzionale)</div>
        {customerName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 14, color: '#1e40af', fontWeight: 600, flex: 1 }}>
              {'👤 '}{customerName}
            </span>
            <button
              onClick={() => { setCustomerErpId(null); setCustomerName(null); setCustomerQuery(''); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder={searchingCustomer ? 'Ricerca...' : 'Cerca cliente...'}
              style={{ ...INPUT_STYLE, fontSize: 13 }}
            />
            {customerResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 100, marginTop: 2 }}>
                {customerResults.map((c) => (
                  <div
                    key={c.erpId}
                    onClick={() => { setCustomerErpId(c.erpId); setCustomerName(c.name); setCustomerQuery(''); setCustomerResults([]); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#0f172a' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div style={LABEL_STYLE}>Tipo</div>
        <div style={isMobile
          ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }
          : { display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}
        >
          {types.map((t) => (
            <div
              key={t.id}
              onClick={() => setTypeId(typeId === t.id ? null : t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? 0 : 5,
                flexDirection: isMobile ? ('column' as const) : ('row' as const),
                border: `1.5px solid ${typeId === t.id ? t.colorHex : '#e2e8f0'}`,
                borderRadius: isMobile ? 8 : 20,
                padding: isMobile ? '7px 4px' : '5px 12px',
                fontSize: 13,
                cursor: 'pointer',
                background: typeId === t.id ? '#eff6ff' : '#fff',
                color: typeId === t.id ? '#1e40af' : '#374151',
                fontWeight: typeId === t.id ? 700 : 400,
                textAlign: isMobile ? ('center' as const) : ('left' as const),
              }}
            >
              <span style={isMobile ? { fontSize: 14, display: 'block', marginBottom: 2 } : {}}>
                {t.emoji} {t.label}
              </span>
            </div>
          ))}
        </div>
        {onManageTypes && (
          <button
            onClick={onManageTypes}
            style={{ background: 'none', border: 'none', fontSize: 12, color: '#2563eb', cursor: 'pointer', marginTop: 6, padding: 0 }}
          >
            {'✏️ Gestisci tipi appuntamento →'}
          </button>
        )}
      </div>

      <div>
        <div style={LABEL_STYLE}>Luogo (opzionale)</div>
        <input
          style={INPUT_STYLE}
          placeholder="Via, Città..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div>
        <div style={LABEL_STYLE}>Note</div>
        <textarea
          style={{ ...INPUT_STYLE, resize: 'none', height: 72, lineHeight: 1.5 } as CSSProperties}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
        {'📅 Disponibile via URL abbonamento in Google/Apple Calendar (Impostazioni → Sincronizzazione)'}
      </div>
    </div>
  );

  const footer = (
    <div style={{ padding: isMobile ? '10px 16px 14px' : '14px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? ('column' as const) : ('row' as const), gap: 8 }}>
      <button
        onClick={onCancel}
        disabled={saving}
        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 16px', borderRadius: 8 }}
      >
        Annulla
      </button>
      <button
        onClick={() => void handleSave()}
        disabled={saving}
        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: isMobile ? 0 : 'auto' }}
      >
        {saving ? 'Salvataggio...' : 'Salva'}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div onClick={onCancel} style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />
        <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '10px auto 12px' }} />
          <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              {'📌 '}{initial ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
            </div>
            <button
              onClick={onCancel}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}
            >
              ✕
            </button>
          </div>
          {body}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: '#2563eb', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {'📌 '}{initial ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
            </div>
            <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 2 }}>
              {new Date(startAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>
        {body}
        {footer}
      </div>
    </div>
  );
}
