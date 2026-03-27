import { useState } from 'react';
import { enqueueOperation, pollJobUntilDone } from '../api/operations';
import { toastService } from '../services/toast.service';

export type SectionField = {
  key: string;
  label: string;
  value: string | null;
  type?: 'text' | 'email' | 'url' | 'textarea';
  readOnly?: boolean;
};

interface CustomerInlineSectionProps {
  title: string;
  fields: SectionField[];
  customerProfile: string;
  customerName: string;
  hasError?: boolean;
  onSaved?: () => void;
  columns?: 1 | 2 | 3;
}

export function CustomerInlineSection({
  title,
  fields,
  customerProfile,
  customerName,
  hasError = false,
  onSaved,
  columns = 2,
}: CustomerInlineSectionProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const displayValues = editing
    ? values
    : Object.fromEntries(fields.map((f) => [f.key, f.value ?? '']));

  const handleEdit = () => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.value ?? ''])));
    setError(null);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setProgress(0);
    setError(null);
    try {
      const data: Record<string, unknown> = {
        customerProfile,
        name: customerName,
      };
      for (const field of fields) {
        if (field.readOnly) continue;
        const val = values[field.key];
        if (field.key === 'city') {
          data.postalCodeCity = val || null;
        } else {
          data[field.key] = val || null;
        }
      }
      const { jobId } = await enqueueOperation('update-customer', data);
      await pollJobUntilDone(jobId, {
        maxWaitMs: 120_000,
        onProgress: (p) => setProgress(p),
      });
      toastService.success(`${title} aggiornato`);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const borderColor = hasError ? '#fca5a5' : editing ? '#93c5fd' : '#e2e8f0';
  const bgColor = hasError ? '#fff5f5' : editing ? '#eff6ff' : '#f8fafc';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '7px', padding: '10px', marginBottom: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: hasError ? '#dc2626' : editing ? '#2563eb' : '#475569' }}>
          {hasError ? '⚠ ' : editing ? '✎ ' : ''}{title}
        </span>
        {!saving && (
          editing ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCancel} style={{ fontSize: '10px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                Annulla
              </button>
              <button onClick={handleSave} style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                ✓ Salva sezione
              </button>
            </div>
          ) : (
            <button onClick={handleEdit} style={{ fontSize: '10px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
              ✏ Modifica
            </button>
          )
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: '11px', color: '#dc2626', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '4px', padding: '6px 8px', marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {/* Progress */}
      {saving && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '3px' }}>
            {progress < 100 ? `Salvataggio... ${progress}%` : 'Completato'}
          </div>
          <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#2563eb', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '6px' }}>
        {fields.map((field) => (
          <div key={field.key}>
            {editing && !field.readOnly ? (
              <>
                <label style={{ display: 'block', fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={displayValues[field.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    disabled={saving}
                    rows={3}
                    style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                ) : (
                  <input
                    type={field.type ?? 'text'}
                    value={displayValues[field.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    disabled={saving}
                    style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #d1d5db', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: '8px', color: '#94a3b8' }}>{field.label}</div>
                <div style={{ fontSize: '10px', color: field.value ? '#1e293b' : '#d1d5db', fontWeight: field.value ? 500 : 400, fontStyle: field.value ? 'normal' : 'italic' }}>
                  {field.value ?? '—'}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
