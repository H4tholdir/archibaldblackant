import { useState, useEffect } from "react";
import {
  findWarehouseMatches,
  type WarehouseMatch,
} from "../services/warehouse-matching";

interface WarehouseMatchAccordionProps {
  articleCode: string;
  description?: string;
  requestedQuantity: number;
  onSelect?: (matches: SelectedWarehouseMatch[]) => void;
  excludeWarehouseItemIds?: number[]; // Warehouse items already used in other order rows
  onTotalQuantityChange?: (totalQty: number) => void; // Called when total selected quantity changes
}

export interface SelectedWarehouseMatch {
  warehouseItemId: number;
  articleCode: string;
  boxName: string;
  quantity: number; // How many to use from this box
  maxAvailable: number; // Total available in this box
}

export function WarehouseMatchAccordion({
  articleCode,
  description,
  requestedQuantity,
  onSelect,
  excludeWarehouseItemIds = [],
  onTotalQuantityChange,
}: WarehouseMatchAccordionProps) {
  const [matches, setMatches] = useState<WarehouseMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Map<number, number>>(
    new Map(),
  ); // warehouseItemId → quantity to use

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
          (match) => !excludeWarehouseItemIds.includes(match.item.id!),
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

    // 🔧 FIX #1: Notify parent of selected items and total quantity
    if (onSelect) {
      onSelect(selected);
    }
    if (onTotalQuantityChange) {
      onTotalQuantityChange(totalQty);
    }
  }, [selectedMatches, matches, onSelect, onTotalQuantityChange]);

  const handleToggleMatch = (match: WarehouseMatch, checked: boolean) => {
    const newSelected = new Map(selectedMatches);

    if (checked) {
      const defaultQty =
        requestedQuantity > 0
          ? Math.min(match.availableQty, requestedQuantity)
          : match.availableQty;
      newSelected.set(match.item.id!, defaultQty);
    } else {
      newSelected.delete(match.item.id!);
    }

    setSelectedMatches(newSelected);
  };

  const handleChangeQuantity = (match: WarehouseMatch, qty: number) => {
    const newSelected = new Map(selectedMatches);
    const maxQty = match.availableQty;

    // Clamp to valid range
    const clampedQty = Math.max(0, Math.min(qty, maxQty));

    if (clampedQty > 0) {
      newSelected.set(match.item.id!, clampedQty);
    } else {
      newSelected.delete(match.item.id!);
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
      <div className="warehouse-match-loading">
        <span>🔍 Ricerca in magazzino...</span>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="warehouse-match-empty">
        <span>🏪 Nessun match in magazzino</span>
      </div>
    );
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "exact":
        return "✅";
      case "figura-gambo":
        return "🟢";
      case "figura":
        return "🟡";
      case "description":
        return "🟠";
      default:
        return "⚪";
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "exact":
        return "Match Esatto";
      case "figura-gambo":
        return "Stessa Figura + Gambo";
      case "figura":
        return "Stessa Figura";
      case "description":
        return "Descrizione Simile";
      default:
        return "Match";
    }
  };

  return (
    <div className="warehouse-match-accordion">
      <button
        type="button"
        className="warehouse-match-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="match-count">
          🏪 {matches.length}{" "}
          {matches.length === 1 ? "articolo trovato" : "articoli trovati"} in
          magazzino
        </span>
        <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="warehouse-match-body">
          {matches.map((match) => {
            const isSelected = selectedMatches.has(match.item.id!);
            const selectedQty = selectedMatches.get(match.item.id!) || 0;
            // 🔧 FIX #2: Disable if reserved or sold
            const isUnavailable =
              !!match.item.reservedForOrder || !!match.item.soldInOrder;

            return (
              <div
                key={match.item.id}
                className={`match-item ${isSelected ? "selected" : ""}`}
                style={
                  isUnavailable
                    ? { opacity: 0.6, pointerEvents: "none" }
                    : undefined
                }
              >
                <div className="match-header-row">
                  <label className="match-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isUnavailable}
                      onChange={(e) =>
                        handleToggleMatch(match, e.target.checked)
                      }
                    />
                    <span className="match-level-badge">
                      {getLevelIcon(match.level)} {getLevelLabel(match.level)}
                    </span>
                  </label>
                  <span className="match-score">{match.score}%</span>
                </div>

                <div className="match-details">
                  <div className="match-info-row">
                    <strong>{match.item.articleCode}</strong>
                    {match.item.description && (
                      <span className="match-description">
                        {match.item.description}
                      </span>
                    )}
                    <span className="match-location-inline">
                      📦 {match.item.boxName} · {match.availableQty} pz
                    </span>
                    {match.item.reservedForOrder && (
                      <span className="match-status-badge reserved">
                        🔒 Riservato
                      </span>
                    )}
                    {match.item.soldInOrder && (
                      <span className="match-status-badge sold">
                        ❌ Venduto
                      </span>
                    )}
                  </div>
                  <div className="match-reason">{match.reason}</div>
                </div>

                {isSelected && (
                  <div className="match-quantity-selector">
                    <label>
                      Quantità da usare:
                      <div className="quantity-input-group">
                        <button
                          type="button"
                          onClick={() =>
                            handleChangeQuantity(match, selectedQty - 1)
                          }
                          disabled={selectedQty <= 0}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={match.availableQty}
                          value={selectedQty}
                          onChange={(e) =>
                            handleChangeQuantity(
                              match,
                              Number.parseInt(e.target.value) || 0,
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleChangeQuantity(match, selectedQty + 1)
                          }
                          disabled={selectedQty >= match.availableQty}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="btn-use-all"
                          onClick={() =>
                            handleChangeQuantity(match, match.availableQty)
                          }
                        >
                          Usa tutti
                        </button>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          {totalSelectedQty > 0 && (
            <div className="warehouse-summary">
              <div className="summary-row">
                <span>✅ Selezionati da magazzino:</span>
                <strong>{totalSelectedQty} pz</strong>
              </div>
              {remainingToOrder > 0 && (
                <div className="summary-row warning">
                  <span>📦 Da ordinare:</span>
                  <strong>{remainingToOrder} pz</strong>
                </div>
              )}
              {remainingToOrder === 0 && (
                <div className="summary-row success">
                  <span>🎉 Quantità coperta completamente da magazzino!</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        .warehouse-match-accordion {
          margin-top: 4px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: #f9f9f9;
        }

        .warehouse-match-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.875em;
          font-weight: 500;
          transition: background 0.2s;
        }

        .warehouse-match-header:hover {
          background: #f0f0f0;
        }

        .match-count {
          color: #333;
        }

        .expand-icon {
          color: #666;
          font-size: 0.8em;
        }

        .warehouse-match-loading,
        .warehouse-match-empty {
          padding: 6px 10px;
          color: #666;
          font-size: 0.85em;
        }

        .warehouse-match-body {
          padding: 0 8px 8px 8px;
          border-top: 1px solid #ddd;
        }

        .match-item {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 5px;
          padding: 8px;
          margin-top: 6px;
          transition: border-color 0.2s;
        }

        .match-item.selected {
          border-color: #007bff;
          background: #f0f8ff;
        }

        .match-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .match-checkbox {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .match-checkbox input {
          cursor: pointer;
        }

        .match-level-badge {
          font-size: 0.8em;
          font-weight: 500;
        }

        .match-score {
          background: #28a745;
          color: white;
          padding: 1px 6px;
          border-radius: 10px;
          font-size: 0.8em;
          font-weight: 600;
        }

        .match-details {
          margin: 2px 0;
          font-size: 0.825em;
        }

        .match-info-row {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 4px 8px;
        }

        .match-description {
          color: #666;
          font-size: 0.9em;
        }

        .match-location-inline {
          color: #555;
          white-space: nowrap;
        }

        .match-status-badge {
          padding: 1px 5px;
          font-size: 0.75em;
          border-radius: 3px;
          font-weight: 600;
          white-space: nowrap;
        }

        .match-status-badge.reserved {
          background: #fef3c7;
          color: #92400e;
        }

        .match-status-badge.sold {
          background: #fee2e2;
          color: #991b1b;
        }

        .match-reason {
          color: #888;
          font-size: 0.8em;
          font-style: italic;
        }

        .match-quantity-selector {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #ddd;
        }

        .match-quantity-selector label {
          font-size: 0.85em;
          font-weight: 500;
          display: block;
          margin-bottom: 4px;
        }

        .quantity-input-group {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .quantity-input-group button {
          padding: 4px 10px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85em;
        }

        .quantity-input-group button:hover:not(:disabled) {
          background: #f0f0f0;
        }

        .quantity-input-group button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quantity-input-group input {
          width: 60px;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-align: center;
          font-size: 0.85em;
        }

        .btn-use-all {
          background: #007bff !important;
          color: white !important;
          border-color: #007bff !important;
          font-size: 0.8em !important;
        }

        .btn-use-all:hover:not(:disabled) {
          background: #0056b3 !important;
        }

        .warehouse-summary {
          margin-top: 8px;
          padding: 6px 8px;
          background: #e7f3ff;
          border-radius: 5px;
          border-left: 3px solid #007bff;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 0;
          font-size: 0.85em;
        }

        .summary-row.warning {
          color: #856404;
          background: #fff3cd;
          padding: 4px 6px;
          border-radius: 4px;
          margin-top: 3px;
        }

        .summary-row.success {
          color: #155724;
          background: #d4edda;
          padding: 4px 6px;
          border-radius: 4px;
          margin-top: 3px;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .warehouse-match-body {
            padding: 0 6px 6px 6px;
          }

          .match-item {
            padding: 6px;
          }

          .quantity-input-group {
            flex-wrap: wrap;
          }

          .quantity-input-group input {
            width: 50px;
          }
        }
      `}</style>
    </div>
  );
}
