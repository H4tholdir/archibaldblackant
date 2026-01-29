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
        setMatches(results);
        // Auto-expand if matches found
        if (results.length > 0) {
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
  }, [articleCode, description]);

  // Notify parent when selection changes
  useEffect(() => {
    if (!onSelect) return;

    const selected: SelectedWarehouseMatch[] = [];
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
      }
    }
    onSelect(selected);
  }, [selectedMatches, matches, onSelect]);

  const handleToggleMatch = (match: WarehouseMatch, checked: boolean) => {
    const newSelected = new Map(selectedMatches);

    if (checked) {
      // Auto-select max available or requested quantity, whichever is smaller
      const defaultQty = Math.min(match.availableQty, requestedQuantity);
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
                  <div className="match-code">
                    <strong>{match.item.articleCode}</strong>
                    {match.item.description && (
                      <span className="match-description">
                        {match.item.description}
                      </span>
                    )}
                  </div>
                  <div className="match-location">
                    📦 <strong>{match.item.boxName}</strong> · Disponibili:{" "}
                    {match.availableQty} pz
                    {/* 🔧 FIX #2: Show reservation status */}
                    {match.item.reservedForOrder && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          padding: "2px 6px",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontSize: "0.75rem",
                          borderRadius: "4px",
                          fontWeight: "600",
                        }}
                      >
                        🔒 Riservato
                      </span>
                    )}
                    {match.item.soldInOrder && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          padding: "2px 6px",
                          background: "#fee2e2",
                          color: "#991b1b",
                          fontSize: "0.75rem",
                          borderRadius: "4px",
                          fontWeight: "600",
                        }}
                      >
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
          margin-top: 8px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: #f9f9f9;
        }

        .warehouse-match-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.95em;
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
          padding: 8px 12px;
          color: #666;
          font-size: 0.9em;
        }

        .warehouse-match-body {
          padding: 0 12px 12px 12px;
          border-top: 1px solid #ddd;
        }

        .match-item {
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          padding: 12px;
          margin-top: 10px;
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
          margin-bottom: 8px;
        }

        .match-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .match-checkbox input {
          cursor: pointer;
        }

        .match-level-badge {
          font-size: 0.9em;
          font-weight: 500;
        }

        .match-score {
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.85em;
          font-weight: 600;
        }

        .match-details {
          margin: 8px 0;
          font-size: 0.9em;
        }

        .match-code {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 6px;
        }

        .match-description {
          color: #666;
          font-size: 0.95em;
        }

        .match-location {
          color: #555;
          margin-bottom: 4px;
        }

        .match-reason {
          color: #888;
          font-size: 0.85em;
          font-style: italic;
        }

        .match-quantity-selector {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #ddd;
        }

        .match-quantity-selector label {
          font-size: 0.9em;
          font-weight: 500;
          display: block;
          margin-bottom: 6px;
        }

        .quantity-input-group {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .quantity-input-group button {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        }

        .quantity-input-group button:hover:not(:disabled) {
          background: #f0f0f0;
        }

        .quantity-input-group button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quantity-input-group input {
          width: 70px;
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 4px;
          text-align: center;
        }

        .btn-use-all {
          background: #007bff !important;
          color: white !important;
          border-color: #007bff !important;
        }

        .btn-use-all:hover:not(:disabled) {
          background: #0056b3 !important;
        }

        .warehouse-summary {
          margin-top: 12px;
          padding: 10px;
          background: #e7f3ff;
          border-radius: 6px;
          border-left: 4px solid #007bff;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 0.9em;
        }

        .summary-row.warning {
          color: #856404;
          background: #fff3cd;
          padding: 6px 8px;
          border-radius: 4px;
          margin-top: 4px;
        }

        .summary-row.success {
          color: #155724;
          background: #d4edda;
          padding: 6px 8px;
          border-radius: 4px;
          margin-top: 4px;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .warehouse-match-body {
            padding: 0 8px 8px 8px;
          }

          .match-item {
            padding: 10px;
          }

          .quantity-input-group {
            flex-wrap: wrap;
          }

          .quantity-input-group input {
            width: 60px;
          }
        }
      `}</style>
    </div>
  );
}
