import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { PreflightChange } from '../api/preflight';

type Decision = 'keep' | 'update';

type PreflightModalProps = {
  changes: PreflightChange[];
  onConfirm: (decisions: Record<string, Decision>) => void;
  onClose: () => void;
};

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  padding: '16px',
};

const MODAL_STYLE: CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '480px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const HEADER_STYLE: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const BODY_STYLE: CSSProperties = {
  overflowY: 'auto',
  padding: '12px 20px',
  flex: 1,
};

const FOOTER_STYLE: CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

const BTN_PRIMARY: CSSProperties = {
  padding: '8px 18px',
  background: '#0984e3',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
};

const BTN_SECONDARY: CSSProperties = {
  padding: '8px 18px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
};

function changeTitle(change: PreflightChange): string {
  if (change.type === 'discontinued') {
    return 'Articolo rimosso dal catalogo';
  }
  return 'Variazione di prezzo';
}

function changeDetail(change: PreflightChange): string {
  if (change.type === 'discontinued') {
    return change.suggestedAlternative
      ? `Alternativa disponibile: ${change.suggestedAlternative.name} (${change.suggestedAlternative.code})`
      : 'Nessuna alternativa disponibile';
  }
  const oldStr = change.oldPrice?.toFixed(2) ?? '—';
  const newStr = change.newPrice?.toFixed(2) ?? '—';
  return `€ ${oldStr} → € ${newStr}`;
}

export function PreflightModal({
  changes,
  onConfirm,
  onClose,
}: PreflightModalProps) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(
      changes.map((c) => [c.articleCode, 'keep' as const]),
    ),
  );

  function setDecision(articleCode: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [articleCode]: decision }));
  }

  function handleConfirm() {
    onConfirm(decisions);
  }

  if (changes.length === 0) {
    return null;
  }

  return (
    <div style={OVERLAY_STYLE}>
      <div style={MODAL_STYLE} role="dialog" aria-modal="true">
        <div style={HEADER_STYLE}>
          <span
            style={{
              fontWeight: 600,
              fontSize: '16px',
              color: '#111827',
            }}
          >
            ⚠️ Modifiche al catalogo
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#6b7280',
              lineHeight: 1,
            }}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        <div style={BODY_STYLE}>
          <p
            style={{
              color: '#6b7280',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            Da quando hai confermato questo ordine, alcuni articoli sono
            cambiati. Scegli come procedere.
          </p>
          {changes.map((change) => (
            <div
              key={change.articleCode}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '10px',
                background:
                  change.type === 'discontinued' ? '#fff7ed' : '#f0f9ff',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  color: '#111827',
                  marginBottom: '4px',
                }}
              >
                {change.articleCode}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#4b5563',
                  marginBottom: '8px',
                }}
              >
                {changeTitle(change)}: {changeDetail(change)}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setDecision(change.articleCode, 'keep')}
                  style={{
                    ...BTN_SECONDARY,
                    background:
                      decisions[change.articleCode] === 'keep'
                        ? '#dbeafe'
                        : '#f3f4f6',
                    borderColor:
                      decisions[change.articleCode] === 'keep'
                        ? '#3b82f6'
                        : '#d1d5db',
                    color:
                      decisions[change.articleCode] === 'keep'
                        ? '#1d4ed8'
                        : '#374151',
                    fontSize: '12px',
                    padding: '4px 12px',
                  }}
                >
                  Mantieni prezzo concordato
                </button>
                <button
                  onClick={() => setDecision(change.articleCode, 'update')}
                  style={{
                    ...BTN_SECONDARY,
                    background:
                      decisions[change.articleCode] === 'update'
                        ? '#d1fae5'
                        : '#f3f4f6',
                    borderColor:
                      decisions[change.articleCode] === 'update'
                        ? '#10b981'
                        : '#d1d5db',
                    color:
                      decisions[change.articleCode] === 'update'
                        ? '#065f46'
                        : '#374151',
                    fontSize: '12px',
                    padding: '4px 12px',
                  }}
                >
                  Aggiorna al nuovo catalogo
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={FOOTER_STYLE}>
          <button style={BTN_SECONDARY} onClick={onClose}>
            Annulla
          </button>
          <button style={BTN_PRIMARY} onClick={handleConfirm}>
            Conferma e invia
          </button>
        </div>
      </div>
    </div>
  );
}
