import { useState } from 'react';
import type { OrderItem } from '../../types/order';

interface OrderItemsListProps {
  items: OrderItem[];
  onEditItem: (itemId: string, updates: Partial<OrderItem>) => void;
  onDeleteItem: (itemId: string) => void;
}

export function OrderItemsList({
  items,
  onEditItem,
  onDeleteItem,
}: OrderItemsListProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px dashed #d1d5db',
        }}
      >
        Nessun articolo inserito. Aggiungi il primo articolo per iniziare.
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <h3
        style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          marginBottom: '1rem',
        }}
      >
        Articoli ({items.length})
      </h3>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px',
            gap: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: '600',
            fontSize: '0.875rem',
            color: '#374151',
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
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px',
              gap: '1rem',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: 'white',
            }}
          >
            {/* Product Name & Description */}
            <div>
              <div style={{ fontWeight: '500' }}>{item.productName}</div>
              {item.article && (
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Codice: {item.article}
                </div>
              )}
              {item.description && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {item.description}
                </div>
              )}
              {item.packageContent && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  Confezione: {item.packageContent}
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>{item.quantity}</div>

            {/* Unit Price */}
            <div>€{item.unitPrice.toFixed(2)}</div>

            {/* Discount */}
            <div>
              {item.discount > 0 ? (
                <span style={{ color: '#dc2626' }}>
                  {item.discount}%
                </span>
              ) : (
                <span style={{ color: '#9ca3af' }}>—</span>
              )}
            </div>

            {/* Total */}
            <div style={{ fontWeight: '600' }}>€{item.total.toFixed(2)}</div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setEditingItemId(item.id)}
                aria-label={`Modifica ${item.productName}`}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ✏️
              </button>
              <button
                onClick={() => {
                  if (confirm(`Rimuovere ${item.productName} dall'ordine?`)) {
                    onDeleteItem(item.id);
                  }
                }}
                aria-label={`Elimina ${item.productName}`}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
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
  const [discountValue, setDiscountValue] = useState(item.discountValue || item.discount || 0);

  const handleSave = () => {
    onSave({
      quantity,
      discountType: 'percentage',
      discountValue,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '1rem' }}>Modifica Articolo</h3>

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="edit-quantity"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Quantità
          </label>
          <input
            id="edit-quantity"
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            htmlFor="edit-discount-value"
            style={{ display: 'block', marginBottom: '0.25rem' }}
          >
            Sconto (%)
          </label>
          <input
            id="edit-discount-value"
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(parseFloat(e.target.value.replace(",", ".")) || 0)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#e5e7eb',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
