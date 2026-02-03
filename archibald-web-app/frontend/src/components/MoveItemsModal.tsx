import { useState, useEffect } from "react";
import type { WarehouseItem } from "../db/schema";
import {
  moveWarehouseItems,
  getWarehouseBoxes,
  type BoxWithStats,
} from "../services/warehouse-service";
import { toastService } from "../services/toast.service";

export interface MoveItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItemIds: Set<number>;
  items: WarehouseItem[];
  onSuccess: () => void;
}

export function MoveItemsModal({
  isOpen,
  onClose,
  selectedItemIds,
  items,
  onSuccess,
}: MoveItemsModalProps) {
  const [destinationBox, setDestinationBox] = useState("");
  const [availableBoxes, setAvailableBoxes] = useState<BoxWithStats[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadBoxes();
    }
  }, [isOpen]);

  const loadBoxes = async () => {
    try {
      const boxes = await getWarehouseBoxes();
      setAvailableBoxes(boxes);
      if (boxes.length > 0) {
        setDestinationBox(boxes[0].name);
      }
    } catch (error) {
      console.error("Load boxes error:", error);
      toastService.error("Errore caricamento scatoli");
    }
  };

  const selectedItems = items.filter((item) =>
    item.id !== undefined ? selectedItemIds.has(item.id) : false,
  );

  const availableItemsCount = selectedItems.filter(
    (item) => !item.reservedForOrder && !item.soldInOrder,
  ).length;

  const reservedOrSoldCount = selectedItems.length - availableItemsCount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!destinationBox) {
      toastService.error("Seleziona scatolo di destinazione");
      return;
    }

    if (selectedItemIds.size === 0) {
      toastService.error("Nessun articolo selezionato");
      return;
    }

    setLoading(true);

    try {
      const result = await moveWarehouseItems(
        Array.from(selectedItemIds),
        destinationBox,
      );

      if (result.movedCount > 0 && result.skippedCount === 0) {
        toastService.success(
          `✅ ${result.movedCount} articoli spostati in "${destinationBox}"`,
        );
      } else if (result.movedCount > 0 && result.skippedCount > 0) {
        toastService.warning(
          `⚠️ ${result.movedCount} spostati, ${result.skippedCount} saltati (riservati/venduti)`,
        );
      } else {
        toastService.error(
          "Nessun articolo spostato (tutti riservati/venduti)",
        );
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Move items error:", error);
      toastService.error(
        error instanceof Error ? error.message : "Errore spostamento articoli",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          maxWidth: "600px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          animation: "modalSlideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 16px 24px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#333",
              margin: 0,
            }}
          >
            🔀 Sposta Articoli
          </h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px" }}>
            {/* Summary */}
            <div
              style={{
                backgroundColor: "#f5f5f5",
                padding: "16px",
                borderRadius: "8px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  color: "#666",
                  marginBottom: "8px",
                }}
              >
                <strong>Articoli selezionati:</strong> {selectedItems.length}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#666",
                  marginBottom: "8px",
                }}
              >
                <strong>Spostabili:</strong> {availableItemsCount}
              </div>
              {reservedOrSoldCount > 0 && (
                <div
                  style={{
                    fontSize: "14px",
                    color: "#d32f2f",
                  }}
                >
                  <strong>Riservati/Venduti (saltati):</strong>{" "}
                  {reservedOrSoldCount}
                </div>
              )}
            </div>

            {/* Warning */}
            {reservedOrSoldCount > 0 && (
              <div
                style={{
                  backgroundColor: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "18px" }}>⚠️</div>
                <div style={{ fontSize: "13px", color: "#856404" }}>
                  Gli articoli riservati o venduti non verranno spostati e
                  rimarranno nel loro scatolo attuale.
                </div>
              </div>
            )}

            {/* Destination Box */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Scatolo di Destinazione *
              </label>
              <select
                value={destinationBox}
                onChange={(e) => setDestinationBox(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Seleziona scatolo...</option>
                {availableBoxes.map((box) => (
                  <option key={box.name} value={box.name}>
                    {box.name} ({box.itemsCount} articoli, {box.totalQuantity}{" "}
                    pz)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #e0e0e0",
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading || availableItemsCount === 0}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#4caf50",
                color: "#fff",
                cursor:
                  loading || availableItemsCount === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: loading || availableItemsCount === 0 ? 0.6 : 1,
              }}
            >
              {loading ? "Spostamento..." : "Sposta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
