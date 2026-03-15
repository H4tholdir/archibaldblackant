import { useState } from "react";
import type { OrderItem } from "../../types/order";
import { formatCurrency } from "../../utils/format-currency";

interface OrderItemsListProps {
  items: OrderItem[];
  onEditItem: (itemId: string, updates: Partial<OrderItem>) => void;
  onDeleteItem: (itemId: string) => void;
  newItemIds?: Set<string>;
}

const NEW_ITEM_STYLES = `
  @keyframes slideInItem {
    0%   { opacity: 0; transform: translateX(-12px); }
    60%  { transform: translateX(3px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeBadge {
    0%, 70% { opacity: 1; }
    100%    { opacity: 0; }
  }
  @keyframes slideOutItem {
    0%   { opacity: 1; transform: translateX(0); max-height: 120px; }
    60%  { opacity: 0; transform: translateX(32px); }
    100% { opacity: 0; transform: translateX(40px); max-height: 0; padding-top: 0; padding-bottom: 0; border-width: 0; }
  }
`;

export function OrderItemsList({
  items,
  onEditItem,
  onDeleteItem,
  newItemIds,
}: OrderItemsListProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #d1d5db",
        }}
      >
        Nessun articolo inserito. Aggiungi il primo articolo per iniziare.
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <style>{NEW_ITEM_STYLES}</style>
      <h3
        style={{
          fontSize: "1.125rem",
          fontWeight: "600",
          marginBottom: "1rem",
        }}
      >
        Articoli ({items.length})
      </h3>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px",
            gap: "1rem",
            padding: "0.75rem 1rem",
            backgroundColor: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            fontWeight: "600",
            fontSize: "0.875rem",
            color: "#374151",
          }}
        >
          <div>Articolo</div>
          <div>Quantità</div>
          <div>Prezzo</div>
          <div>Sconto</div>
          <div>Totale</div>
          <div>Azioni</div>
        </div>

        {/* Table Body */}
        {items.map((item) => {
          const isNew = newItemIds?.has(item.id) ?? false;
          const isRemoving = removingItemId === item.id;
          return (
            <div
              key={item.id}
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px",
                gap: "1rem",
                padding: "1rem",
                borderBottom: "1px solid #e5e7eb",
                backgroundColor: isNew ? "#f0fdf4" : "white",
                borderLeft: isNew ? "3px solid #059669" : undefined,
                animation: isRemoving
                  ? "slideOutItem 0.28s ease forwards"
                  : isNew
                    ? "slideInItem 0.4s cubic-bezier(0.34,1.56,0.64,1)"
                    : undefined,
                overflow: "hidden",
              }}
            >
              {/* Product Name & Description */}
              <div>
                <div style={{ fontWeight: "500", display: "flex", alignItems: "center", gap: 6 }}>
                  {item.productName}
                  {isNew && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: "#059669",
                        background: "#dcfce7",
                        borderRadius: 4,
                        padding: "1px 5px",
                        animation: "fadeBadge 2.2s ease forwards",
                      }}
                    >
                      ✓ nuovo
                    </span>
                  )}
                </div>
                {item.article && (
                  <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    Codice: {item.article}
                  </div>
                )}
                {item.description && (
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    {item.description}
                  </div>
                )}
                {item.packageContent && (
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    Confezione: {item.packageContent}
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>{item.quantity}</div>

              {/* Unit Price */}
              <div>{formatCurrency(item.unitPrice)}</div>

              {/* Discount */}
              <div>
                {item.discount > 0 ? (
                  <span style={{ color: "#dc2626" }}>{item.discount}%</span>
                ) : (
                  <span style={{ color: "#9ca3af" }}>—</span>
                )}
              </div>

              {/* Total */}
              <div style={{ fontWeight: "600" }}>
                {formatCurrency(item.total)}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => setEditingItemId(item.id)}
                  aria-label={`Modifica ${item.productName}`}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.875rem",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Rimuovere ${item.productName} dall'ordine?`)) {
                      setRemovingItemId(item.id);
                      setTimeout(() => {
                        onDeleteItem(item.id);
                        setRemovingItemId(null);
                      }, 280);
                    }
                  }}
                  aria-label={`Elimina ${item.productName}`}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.875rem",
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal (if editing) */}
      {editingItemId && (
        <EditItemModal
          item={items.find((i) => i.id === editingItemId)!}
          onSave={(updates) => {
            onEditItem(editingItemId, updates);
            setEditingItemId(null);
          }}
          onCancel={() => setEditingItemId(null)}
        />
      )}
    </div>
  );
}

interface EditItemModalProps {
  item: OrderItem;
  onSave: (updates: Partial<OrderItem>) => void;
  onCancel: () => void;
}

function EditItemModal({ item, onSave, onCancel }: EditItemModalProps) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [discountValue, setDiscountValue] = useState(
    item.discountValue || item.discount || 0,
  );

  const handleSave = () => {
    onSave({
      quantity,
      discountType: "percentage",
      discountValue,
    });
  };

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
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          maxWidth: "500px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: "1rem" }}>Modifica Articolo</h3>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="edit-quantity"
            style={{ display: "block", marginBottom: "0.25rem" }}
          >
            Quantità
          </label>
          <input
            id="edit-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="edit-discount-value"
            style={{ display: "block", marginBottom: "0.25rem" }}
          >
            Sconto (%)
          </label>
          <input
            id="edit-discount-value"
            type="number"
            value={discountValue}
            onChange={(e) =>
              setDiscountValue(
                parseFloat(e.target.value.replace(",", ".")) || 0,
              )
            }
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
        </div>

        <div
          style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#e5e7eb",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
