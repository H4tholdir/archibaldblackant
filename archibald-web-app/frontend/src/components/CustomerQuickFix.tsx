import { useState, useRef } from 'react';
import { useKeyboardScroll } from '../hooks/useKeyboardScroll';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';
import { useOperationTracking } from '../contexts/OperationTrackingContext';
import type { MissingFieldKey } from '../utils/customer-completeness';

interface CustomerQuickFixProps {
  erpId: string;
  customerName: string;
  missingFields: readonly MissingFieldKey[];
  onSaved: () => void;
  onDismiss: () => void;
}

type FieldKey = 'name' | 'vatNumber' | 'pec' | 'sdi' | 'street' | 'postalCode' | 'city';

type FieldValues = Record<FieldKey, string>;

const FIELD_LABELS: Record<string, string> = {
  name:       'Ragione Sociale',
  vatNumber:  'P.IVA',
  pec:        'PEC',
  sdi:        'SDI',
  street:     'Indirizzo',
  postalCode: 'CAP',
  city:       'Città',
};

function buildInputKeys(missingFields: readonly MissingFieldKey[]): FieldKey[] {
  const keys: FieldKey[] = [];
  for (const f of missingFields) {
    if (f === 'pec_or_sdi') {
      if (!keys.includes('pec')) keys.push('pec');
      if (!keys.includes('sdi')) keys.push('sdi');
    } else if (f === 'vatValidatedAt') {
      if (!keys.includes('vatNumber')) keys.push('vatNumber');
    } else {
      const k = f as FieldKey;
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function CustomerQuickFix({
  erpId,
  customerName,
  missingFields,
  onSaved,
  onDismiss,
}: CustomerQuickFixProps) {
  const isDesktop = window.innerWidth >= 1024;
  const { modalOverlayKeyboardStyle, keyboardPaddingStyle, scrollFieldIntoView } =
    useKeyboardScroll();
  const { trackOperation } = useOperationTracking();

  const inputKeys = buildInputKeys(missingFields);

  const [values, setValues] = useState<FieldValues>({
    name: customerName,
    vatNumber: '',
    pec: '',
    sdi: '',
    street: '',
    postalCode: '',
    city: '',
  });
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const validate = (): string | null => {
    for (const key of inputKeys) {
      if (key === 'sdi') continue;
      if (key === 'pec' && inputKeys.includes('sdi')) continue;
      if (!values[key].trim()) return `${FIELD_LABELS[key]} è obbligatorio`;
    }
    if (
      missingFields.includes('pec_or_sdi') &&
      !values.pec.trim() &&
      !values.sdi.trim()
    ) {
      return 'Inserisci PEC o SDI (almeno uno dei due)';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }

    setError(null);
    setSaving(true);
    setProgress(0);

    try {
      const data: Record<string, unknown> = {
        erpId,
        name: values.name || customerName,
      };
      if (inputKeys.includes('vatNumber') && values.vatNumber)
        data.vatNumber = values.vatNumber;
      if (inputKeys.includes('pec') && values.pec)
        data.pec = values.pec;
      if (inputKeys.includes('sdi') && values.sdi)
        data.sdi = values.sdi;
      if (inputKeys.includes('street') && values.street)
        data.street = values.street;
      if (inputKeys.includes('postalCode') && values.postalCode)
        data.postalCode = values.postalCode;
      if (inputKeys.includes('city') && values.city)
        data.postalCodeCity = values.city;

      const { jobId } = await enqueueOperation('update-customer', data);
      trackOperation(erpId, jobId, customerName, 'Aggiornamento cliente...');
      await pollJobUntilDone(jobId, {
        maxWaitMs: 120_000,
        onProgress: (p) => setProgress(p),
      });

      toastService.success('Dati cliente aggiornati');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante il salvataggio');
      setSaving(false);
    }
  };

  const renderFields = () =>
    inputKeys.map((key) => (
      <div key={key} style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block', fontSize: '12px', fontWeight: 600,
            color: '#374151', marginBottom: '4px',
          }}
        >
          {FIELD_LABELS[key]}
          {key === 'sdi' && missingFields.includes('pec_or_sdi') ? (
            <span style={{ color: '#6b7280', fontWeight: 400 }}> (alternativa)</span>
          ) : (
            <span style={{ color: '#ef4444' }}> *</span>
          )}
        </label>
        <input
          ref={key === inputKeys[0] ? firstRef : undefined}
          type={key === 'pec' ? 'email' : 'text'}
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
          disabled={saving}
          placeholder={FIELD_LABELS[key]}
          style={{
            width: '100%', padding: '9px 12px',
            border: '1.5px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', outline: 'none',
            background: saving ? '#f9fafb' : 'white',
            boxSizing: 'border-box',
          }}
        />
      </div>
    ));

  const formContent = (
    <>
      {error && (
        <div
          style={{
            background: '#fff5f5', border: '1px solid #fca5a5',
            borderRadius: '6px', padding: '9px 12px',
            marginBottom: '12px', fontSize: '13px', color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {renderFields()}

      {saving && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
            {progress < 100 ? `Aggiornamento Archibald... ${progress}%` : 'Completato'}
          </div>
          <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`, height: '100%',
                background: '#2563eb', transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{
          width: '100%', padding: '12px',
          background: saving ? '#93c5fd' : '#2563eb',
          color: 'white', border: 'none', borderRadius: '8px',
          fontSize: '14px', fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Salvataggio in corso...' : "Salva e continua con l'ordine"}
      </button>

      {!saving && (
        <button
          onClick={onDismiss}
          style={{
            width: '100%', marginTop: '8px', padding: '9px',
            background: 'none', border: 'none',
            fontSize: '13px', color: '#9ca3af', cursor: 'pointer',
          }}
        >
          Annulla
        </button>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <div
        data-testid="quickfix-overlay"
        onClick={(e) => { if (e.target === e.currentTarget && !saving) onDismiss(); }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9000,
          ...modalOverlayKeyboardStyle,
        }}
      >
        <div
          data-testid="quickfix-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'white', borderRadius: '10px',
            overflow: 'hidden', width: '100%', maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              background: '#fff5f5', borderBottom: '1px solid #fecaca',
              padding: '14px 18px', display: 'flex',
              alignItems: 'flex-start', gap: '10px',
            }}
          >
            <span style={{ fontSize: '20px', flexShrink: 0 }}>⛔</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
                Ordine bloccato
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                {customerName} — completa i dati per continuare
              </div>
            </div>
            {!saving && (
              <button
                onClick={onDismiss}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: '0 2px',
                }}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ padding: '16px 18px', ...keyboardPaddingStyle }}>
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="quickfix-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 9000,
      }}
    >
      <div
        data-testid="quickfix-sheet"
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'white',
          borderTop: '2px solid #2563eb',
          borderRadius: '16px 16px 0 0',
          padding: '16px 20px 24px',
          maxHeight: '85vh', overflowY: 'auto',
          ...keyboardPaddingStyle,
        }}
      >
        <div
          style={{
            width: '32px', height: '3px', background: '#d1d5db',
            borderRadius: '2px', margin: '0 auto 16px',
          }}
        />
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
            Completa prima di procedere
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            {customerName} —{' '}
            {missingFields.length === 1
              ? '1 campo obbligatorio mancante'
              : `${missingFields.length} campi obbligatori mancanti`}
          </div>
        </div>
        {formContent}
      </div>
    </div>
  );
}
