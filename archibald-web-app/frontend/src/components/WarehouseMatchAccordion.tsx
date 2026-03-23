import { useState, useEffect } from "react";
import {
  findWarehouseMatches,
  parseArticleCode,
  type WarehouseMatch,
} from "../services/warehouse-matching";
import type { SelectedWarehouseMatch } from "../types/warehouse";
import { WAREHOUSE_LEVEL_COLORS, bestMatchLevel } from '../utils/warehouse-theme';
import type { WarehouseThemeLevel } from '../utils/warehouse-theme';

export type { SelectedWarehouseMatch };

interface WarehouseMatchAccordionProps {
  articleCode: string;
  description?: string;
  requestedQuantity: number;
  onSelect?: (matches: SelectedWarehouseMatch[]) => void;
  excludeWarehouseItemIds?: number[]; // Warehouse items already used in other order rows
  onTotalQuantityChange?: (totalQty: number) => void; // Called when total selected quantity changes
  onMatchLevelChange?: (level: WarehouseThemeLevel) => void;
}

export function WarehouseMatchAccordion({
  articleCode,
  description,
  requestedQuantity,
  onSelect,
  excludeWarehouseItemIds = [],
  onTotalQuantityChange,
  onMatchLevelChange,
}: WarehouseMatchAccordionProps) {
  const [matches, setMatches] = useState<WarehouseMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Map<number, number>>(
    new Map(),
  ); // warehouseItemId → quantity to use

  const currentLevel = bestMatchLevel(matches);
  const currentColors = WAREHOUSE_LEVEL_COLORS[currentLevel];

  // Search for matches when article code changes
  useEffect(() => {
    if (!articleCode) {
      setMatches([]);
      return;
    }

    setLoading(true);
    findWarehouseMatches(articleCode, description, 50)
      .then((results) => {
        // 🔧 FIX #2: Filter out warehouse items already used in other order rows
        const filteredResults = results.filter(
          (match) => !excludeWarehouseItemIds.includes(match.item.id),
        );
        setMatches(filteredResults);
        // Auto-expand if matches found
        if (filteredResults.length > 0) {
          setExpanded(true);
        }
      })
      .catch((error) => {
        console.error("Error finding warehouse matches:", error);
        setMatches([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [articleCode, description, excludeWarehouseItemIds]);

  // Clamp selected quantities when matches change (e.g. after re-fetch)
  useEffect(() => {
    if (selectedMatches.size === 0) return;
    let needsUpdate = false;
    const clamped = new Map(selectedMatches);
    for (const [itemId, qty] of clamped.entries()) {
      const match = matches.find((m) => m.item.id === itemId);
      if (!match) {
        clamped.delete(itemId);
        needsUpdate = true;
      } else if (qty > match.availableQty) {
        clamped.set(itemId, match.availableQty);
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      setSelectedMatches(clamped);
    }
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when selection changes
  useEffect(() => {
    const selected: SelectedWarehouseMatch[] = [];
    let totalQty = 0;

    for (const [itemId, qty] of selectedMatches.entries()) {
      const match = matches.find((m) => m.item.id === itemId);
      if (match && qty > 0) {
        selected.push({
          warehouseItemId: itemId,
          articleCode: match.item.articleCode,
          boxName: match.item.boxName,
          quantity: qty,
          maxAvailable: match.availableQty,
        });
        totalQty += qty;
      }
    }

    if (onSelect) {
      onSelect(selected);
    }
    if (onTotalQuantityChange) {
      onTotalQuantityChange(totalQty);
    }
  }, [selectedMatches, matches, onSelect, onTotalQuantityChange]);

  // Emit level change to parent
  useEffect(() => {
    onMatchLevelChange?.(bestMatchLevel(matches));
  }, [matches, onMatchLevelChange]);

  const handleToggleMatch = (match: WarehouseMatch, checked: boolean) => {
    const newSelected = new Map(selectedMatches);

    if (checked) {
      const defaultQty =
        requestedQuantity > 0
          ? Math.min(match.availableQty, requestedQuantity)
          : match.availableQty;
      newSelected.set(match.item.id, defaultQty);
    } else {
      newSelected.delete(match.item.id);
    }

    setSelectedMatches(newSelected);
  };

  const handleChangeQuantity = (match: WarehouseMatch, qty: number) => {
    const newSelected = new Map(selectedMatches);
    const maxQty = match.availableQty;

    // Clamp to valid range
    const clampedQty = Math.max(0, Math.min(qty, maxQty));

    if (clampedQty > 0) {
      newSelected.set(match.item.id, clampedQty);
    } else {
      newSelected.delete(match.item.id);
    }

    setSelectedMatches(newSelected);
  };

  const totalSelectedQty = Array.from(selectedMatches.values()).reduce(
    (sum, qty) => sum + qty,
    0,
  );
  const remainingToOrder = Math.max(0, requestedQuantity - totalSelectedQty);

  if (loading) {
    return (
      <div style={{ padding: '6px 10px', color: '#666', fontSize: '0.85em' }}>
        <span>🔍 Ricerca in magazzino...</span>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div style={{ padding: '6px 10px', color: '#666', fontSize: '0.85em' }}>
        <span>🏪 Nessun match in magazzino</span>
      </div>
    );
  }

  const getShortDiff = (match: WarehouseMatch): string | null => {
    if (match.level === 'exact') return null;
    const input = parseArticleCode(articleCode);
    const item = parseArticleCode(match.item.articleCode);
    if (match.level === 'figura-gambo') return `misura ${item.misura} ≠ ${input.misura}`;
    if (match.level === 'figura') return `gambo ${item.gambo} ≠ ${input.gambo}`;
    if (match.level === 'description') return `figura ${item.figura} ≠ ${input.figura}`;
    return null;
  };

  return (
    <div
      style={{
        marginTop: 4,
        border: `1px solid ${currentColors.borderColor}`,
        borderRadius: 6,
        background: currentColors.backgroundLight,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: currentColors.backgroundMid,
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.875em',
          fontWeight: 700,
          color: currentColors.accentColor,
          borderRadius: expanded ? '6px 6px 0 0' : '6px',
          transition: 'background 0.3s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🏪</span>
          <span>{matches.length} {matches.length === 1 ? 'articolo trovato' : 'articoli trovati'} in magazzino</span>
          <span style={{ background: currentColors.accentColor, color: 'white', fontSize: '0.75em', padding: '1px 7px', borderRadius: 10 }}>{matches.length}</span>
        </div>
        <span style={{ fontSize: '0.75em' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 8px 8px 8px', borderTop: `1px solid ${currentColors.borderColor}` }}>
          {matches.map((match) => {
            const isSelected = selectedMatches.has(match.item.id);
            const selectedQty = selectedMatches.get(match.item.id) || 0;
            const isUnavailable =
              !!match.item.reservedForOrder || !!match.item.soldInOrder;
            const colors = WAREHOUSE_LEVEL_COLORS[match.level];
            const shortDiff = getShortDiff(match);

            return (
              <div
                key={match.item.id}
                style={{
                  background: isSelected ? colors.backgroundMid : 'white',
                  border: `1px solid ${colors.borderColor}`,
                  borderLeft: `3px solid ${colors.accentColor}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 0.2s',
                  opacity: isUnavailable ? 0.5 : 1,
                  pointerEvents: isUnavailable ? 'none' : undefined,
                  marginTop: 6,
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <input autoComplete="off"
                    type="checkbox"
                    checked={isSelected}
                    disabled={isUnavailable}
                    onChange={(e) => handleToggleMatch(match, e.target.checked)}
                    style={{ accentColor: colors.accentColor, width: 14, height: 14, flexShrink: 0 }}
                  />
                  {/* Code + box name */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {match.item.articleCode}
                    </span>
                    <span style={{ color: '#cbd5e1', fontSize: 11, flexShrink: 0 }}>·</span>
                    <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {match.item.boxName}
                    </span>
                  </div>
                  {/* Diff badge */}
                  {shortDiff && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: colors.accentColor,
                      background: colors.backgroundMid, border: `1px solid ${colors.borderColor}`,
                      borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {shortDiff}
                    </span>
                  )}
                  {/* Quantity — large, prominent */}
                  {!isUnavailable ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 36 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: colors.accentColor, lineHeight: 1 }}>
                        {match.availableQty}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: colors.accentColor, letterSpacing: '0.05em' }}>pz</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#991b1b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {match.item.reservedForOrder ? '🔒 Riservato' : '❌ Venduto'}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <div style={{ marginTop: 2, paddingTop: 6, borderTop: `1px solid ${colors.borderColor}`, width: '100%' }}>
                    <div style={{ fontSize: '0.85em', fontWeight: 500, marginBottom: 4 }}>Quantità da usare:</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleChangeQuantity(match, selectedQty - 1)}
                        disabled={selectedQty <= 0}
                        style={{ width: 22, height: 22, border: `1px solid ${colors.borderColor}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                      >
                        −
                      </button>
                      <input autoComplete="off"
                        type="number"
                        min={0}
                        max={match.availableQty}
                        value={selectedQty}
                        onChange={(e) =>
                          handleChangeQuantity(
                            match,
                            Number.parseInt(e.target.value) || 0,
                          )
                        }
                        style={{ width: 40, textAlign: 'center', border: `1px solid ${colors.borderColor}`, borderRadius: 4, padding: '2px 4px', fontSize: 11 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleChangeQuantity(match, selectedQty + 1)}
                        disabled={selectedQty >= match.availableQty}
                        style={{ width: 22, height: 22, border: `1px solid ${colors.borderColor}`, borderRadius: 4, background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeQuantity(match, match.availableQty)}
                        style={{
                          padding: '3px 8px',
                          border: `1px solid ${colors.accentColor}`,
                          background: colors.accentColor,
                          color: 'white',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.8em',
                        }}
                      >
                        Usa tutti
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          {totalSelectedQty > 0 && (
            <div style={{ background: currentColors.backgroundMid, border: `1px solid ${currentColors.borderColor}`, borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: currentColors.accentColor }}>
                {totalSelectedQty} pz da magazzino{remainingToOrder > 0 ? ` · ${remainingToOrder} pz da ordinare` : ' · Quantità coperta ✓'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
