// archibald-web-app/frontend/src/components/WarehouseHistoryDialog.tsx
import { useState } from 'react';
import type { WarehouseMatch } from '../services/warehouse-matching';
import type { SelectedWarehouseMatch } from '../types/warehouse';
import { WAREHOUSE_LEVEL_COLORS, WAREHOUSE_LEVEL_LABELS, isAutoSelected } from '../utils/warehouse-theme';

type Props = {
  articleCode: string;
  description: string;
  requestedQuantity: number;
  matches: WarehouseMatch[];
  onConfirm: (selections: SelectedWarehouseMatch[]) => void;
  onSkip: () => void;
  onCancel: () => void;
};

export function WarehouseHistoryDialog({
  articleCode, description, requestedQuantity, matches, onConfirm, onSkip, onCancel,
}: Props) {
  const [selections, setSelections] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const match of matches) {
      if (isAutoSelected(match.level)) {
        m.set(match.item.id, Math.min(match.availableQty, requestedQuantity));
      }
    }
    return m;
  });

  const totalSelected = Array.from(selections.values()).reduce((s, q) => s + q, 0);
  const toOrder = Math.max(0, requestedQuantity - totalSelected);

  const handleToggle = (match: WarehouseMatch, checked: boolean) => {
    const next = new Map(selections);
    if (checked) next.set(match.item.id, Math.min(match.availableQty, requestedQuantity));
    else next.delete(match.item.id);
    setSelections(next);
  };

  const handleQty = (match: WarehouseMatch, qty: number) => {
    const next = new Map(selections);
    const clamped = Math.max(0, Math.min(qty, match.availableQty));
    if (clamped > 0) next.set(match.item.id, clamped);
    else next.delete(match.item.id);
    setSelections(next);
  };

  const handleConfirm = () => {
    const result: SelectedWarehouseMatch[] = [];
    for (const [itemId, qty] of selections.entries()) {
      const match = matches.find(m => m.item.id === itemId);
      if (match && qty > 0) {
        result.push({ warehouseItemId: itemId, articleCode: match.item.articleCode, boxName: match.item.boxName, quantity: qty, maxAvailable: match.availableQty });
      }
    }
    onConfirm(result);
  };

  // description is accepted for future use
  void description;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 480, boxShadow: '0 20px 50px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#1e293b', color: 'white', padding: '14px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Articoli trovati in magazzino</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>{articleCode}</div>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matches.map((match) => {
            const colors = WAREHOUSE_LEVEL_COLORS[match.level];
            const isSelected = selections.has(match.item.id);
            const qty = selections.get(match.item.id) ?? 0;

            return (
              <div key={match.item.id} style={{ border: `1px solid ${colors.borderColor}`, borderLeft: `4px solid ${colors.accentColor}`, borderRadius: 8, padding: 12, background: isSelected ? colors.backgroundLight : 'white', transition: 'background 0.2s' }}>
                {/* Level badge + code */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={isSelected} onChange={e => handleToggle(match, e.target.checked)} style={{ accentColor: colors.accentColor, width: 14, height: 14 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: colors.backgroundMid, color: colors.accentColor }}>{WAREHOUSE_LEVEL_LABELS[match.level]}</span>
                </div>

                {/* Diff block */}
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', marginBottom: 8, border: `1px solid ${colors.borderColor}` }}>
                  <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>Richiesto</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>{articleCode}</span>
                  <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700 }}>Trovato</span>
                  <span style={{ color: colors.accentColor, fontWeight: 700 }}>{match.item.articleCode}</span>
                </div>

                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  📦 {match.item.boxName} · <strong>{match.availableQty} pz</strong> disponibili
                </div>

                {isSelected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Usa:</span>
                    <button onClick={() => handleQty(match, qty - 1)} disabled={qty <= 1} style={{ width: 24, height: 24, border: `1px solid ${colors.borderColor}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <input type="number" min={1} max={match.availableQty} value={qty} onChange={e => handleQty(match, Number(e.target.value))} style={{ width: 50, textAlign: 'center', border: `1px solid ${colors.borderColor}`, borderRadius: 4, padding: '2px 4px', fontSize: 12 }} />
                    <button onClick={() => handleQty(match, qty + 1)} disabled={qty >= match.availableQty} style={{ width: 24, height: 24, border: `1px solid ${colors.borderColor}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>/ {match.availableQty}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          {totalSelected > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#065f46', display: 'flex', justifyContent: 'space-between' }}>
              <span>Da magazzino: <strong>{totalSelected} pz</strong></span>
              {toOrder > 0 && <span>Da ordinare: <strong>{toOrder} pz</strong></span>}
              {toOrder === 0 && <span>✓ Quantità coperta</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', fontSize: 12, cursor: 'pointer', color: '#475569' }}>Annulla</button>
          <button onClick={onSkip} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#475569' }}>Aggiungi senza magazzino</button>
          <button onClick={handleConfirm} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {totalSelected > 0 ? `Aggiungi (${totalSelected} da mag.)` : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  );
}
