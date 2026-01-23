import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerSelector } from './new-order-form/CustomerSelector';
import { ProductSelector } from './new-order-form/ProductSelector';
import { QuantityInput } from './new-order-form/QuantityInput';
import { OrderItemsList } from './new-order-form/OrderItemsList';
import { DiscountSystem } from './new-order-form/DiscountSystem';
import { OrderSummary } from './new-order-form/OrderSummary';
import { productService } from '../services/products.service';
import { priceService } from '../services/prices.service';
import { orderService } from '../services/orders.service';
import {
  calculateItemTotals,
  calculateOrderTotals,
} from '../utils/order-calculations';
import type { Customer, Product, ProductVariant } from '../db/schema';
import type { OrderItem } from '../types/order';

export default function OrderForm() {
  const navigate = useNavigate();

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  // Product selection state (for adding new item)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [quantityValid, setQuantityValid] = useState(false);

  // Order items
  const [items, setItems] = useState<OrderItem[]>([]);

  // Global discount
  const [globalDiscountType, setGlobalDiscountType] = useState<
    'percentage' | 'amount'
  >('percentage');
  const [globalDiscountValue, setGlobalDiscountValue] = useState(0);

  // UI state
  const [submitting, setSubmitting] = useState(false);

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  // Handle product selection
  const handleProductSelect = async (product: Product) => {
    setSelectedProduct(product);

    // Auto-select variant based on default quantity
    const variant = await productService.getVariantByQuantity(
      product.id,
      quantity
    );
    setSelectedVariant(variant);
    setQuantityValid(variant !== null);
  };

  // Handle quantity change
  const handleQuantityChange = async (qty: number, isValid: boolean) => {
    setQuantity(qty);
    setQuantityValid(isValid);

    // Update variant based on new quantity
    if (selectedProduct) {
      const variant = await productService.getVariantByQuantity(
        selectedProduct.id,
        qty
      );
      setSelectedVariant(variant);
    }
  };

  // Add item to order
  const handleAddItem = async () => {
    if (!selectedProduct || !selectedVariant || !quantityValid) {
      alert('Seleziona prodotto e quantità valida');
      return;
    }

    // Get price
    const price = await priceService.getPriceByArticleId(
      selectedProduct.article || selectedProduct.id
    );

    if (!price) {
      alert('Prezzo non disponibile per questo prodotto');
      return;
    }

    // Calculate item totals
    const totals = calculateItemTotals({
      unitPrice: price,
      quantity,
    });

    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      article: selectedProduct.article || '',
      description: selectedProduct.description,
      variantId: selectedVariant.variantId,
      quantity,
      packageContent: selectedVariant.packageContent,
      unitPrice: price,
      ...totals,
    };

    setItems([...items, newItem]);

    // Reset selection
    setSelectedProduct(null);
    setSelectedVariant(null);
    setQuantity(1);
    setQuantityValid(false);
  };

  // Edit item
  const handleEditItem = async (
    itemId: string,
    updates: Partial<OrderItem>
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== itemId) return item;

        // Recalculate totals with updates
        const updatedItem = { ...item, ...updates };
        const totals = calculateItemTotals({
          unitPrice: updatedItem.unitPrice,
          quantity: updatedItem.quantity,
          discountType: updatedItem.discountType,
          discountValue: updatedItem.discountValue,
        });

        return { ...updatedItem, ...totals };
      })
    );
  };

  // Delete item
  const handleDeleteItem = (itemId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };

  // Calculate order totals
  const orderTotals = calculateOrderTotals(items, {
    discountType: globalDiscountType,
    discountValue: globalDiscountValue,
  });

  // Submit order
  const handleSubmitOrder = async () => {
    if (!selectedCustomer) {
      alert('Seleziona un cliente');
      return;
    }

    if (items.length === 0) {
      alert('Aggiungi almeno un articolo');
      return;
    }

    setSubmitting(true);

    try {
      // Save to pending orders queue
      await orderService.savePendingOrder({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        items: items.map((item) => ({
          articleCode: item.article,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          price: item.unitPrice,
          discount: item.discount,
        })),
        discountPercent:
          globalDiscountType === 'percentage'
            ? globalDiscountValue
            : undefined,
        targetTotalWithVAT: undefined, // Could add reverse calc target here
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
      });

      alert('Ordine salvato nella coda. Vai a "Ordini in Attesa" per inviarlo.');

      // Clear form
      setSelectedCustomer(null);
      setItems([]);
      setGlobalDiscountValue(0);

      // Navigate to pending orders
      navigate('/pending-orders');
    } catch (error) {
      console.error('[OrderForm] Failed to save order:', error);
      alert("Errore durante il salvataggio dell'ordine");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1
        style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '2rem' }}
      >
        Nuovo Ordine
      </h1>

      {/* Customer Selection */}
      <div style={{ marginBottom: '2rem' }}>
        <CustomerSelector onSelect={handleCustomerSelect} />
        {selectedCustomer && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: '#d1fae5',
              borderRadius: '4px',
              color: '#065f46',
            }}
          >
            ✅ Cliente selezionato: <strong>{selectedCustomer.name}</strong>
          </div>
        )}
      </div>

      {/* Product Selection (only if customer selected) */}
      {selectedCustomer && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 100px',
              gap: '1rem',
              marginBottom: '2rem',
              alignItems: 'end',
            }}
          >
            <ProductSelector onSelect={handleProductSelect} />

            {selectedProduct && (
              <>
                <QuantityInput
                  productId={selectedProduct.id}
                  value={quantity}
                  onChange={handleQuantityChange}
                />

                <button
                  onClick={handleAddItem}
                  disabled={!quantityValid}
                  style={{
                    padding: '0.625rem',
                    height: '42px',
                    backgroundColor: quantityValid ? '#22c55e' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: '600',
                    cursor: quantityValid ? 'pointer' : 'not-allowed',
                  }}
                >
                  Aggiungi
                </button>
              </>
            )}
          </div>

          {/* Order Items List */}
          {items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <OrderItemsList
                items={items}
                onEditItem={handleEditItem}
                onDeleteItem={handleDeleteItem}
              />
            </div>
          )}

          {/* Discount System (only if items exist) */}
          {items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <DiscountSystem
                orderSubtotal={orderTotals.itemsSubtotal}
                discountType={globalDiscountType}
                discountValue={globalDiscountValue}
                onChange={(discount) => {
                  setGlobalDiscountType(discount.discountType);
                  setGlobalDiscountValue(discount.discountValue);
                }}
                onReverseCalculate={(targetTotal) => {
                  // TODO: Implement reverse calculation
                  console.log('Reverse calculate to target:', targetTotal);
                }}
              />
            </div>
          )}

          {/* Order Summary (only if items exist) */}
          {items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <OrderSummary
                itemsSubtotal={orderTotals.itemsSubtotal}
                globalDiscount={orderTotals.globalDiscount}
                subtotalAfterGlobalDiscount={orderTotals.subtotalAfterGlobalDiscount}
                vat={orderTotals.vat}
                total={orderTotals.total}
              />
            </div>
          )}

          {/* Submit Button */}
          {items.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                style={{
                  padding: '1rem 2rem',
                  backgroundColor: submitting ? '#d1d5db' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Salvataggio...' : 'Crea Ordine'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
