# New Order System Flow (Phase 28.2)

Complete documentation of the new form-based order entry system.

## 🎯 Overview

The new OrderForm implements a **three-layer architecture** for clean separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                     │
│  (React Components - UI/UX)                             │
│  - CustomerSelector, ProductSelector, QuantityInput     │
│  - OrderItemsList, DiscountSystem, OrderSummary         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                   Business Logic Layer                   │
│  (Services - Data Access & Business Rules)              │
│  - customerService, productService, priceService        │
│  - orderService                                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                      Data Layer                         │
│  (IndexedDB via Dexie - Offline-First Storage)         │
│  - customers, products, variants, prices, pendingOrders │
└─────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
src/
├── components/
│   ├── OrderForm.tsx                          # Main integration component
│   └── new-order-form/                        # Presentation layer components
│       ├── CustomerSelector.tsx               # Customer autocomplete
│       ├── ProductSelector.tsx                # Product autocomplete
│       ├── QuantityInput.tsx                  # Quantity with variant validation
│       ├── OrderItemsList.tsx                 # Order items with edit/delete
│       ├── DiscountSystem.tsx                 # Global discount management
│       └── OrderSummary.tsx                   # Order totals display
│
├── services/                                  # Business logic layer
│   ├── customers.service.ts                   # Customer data access
│   ├── products.service.ts                    # Product & variant data access
│   ├── prices.service.ts                      # Price data access
│   └── orders.service.ts                      # Order persistence (pending queue)
│
├── utils/
│   └── order-calculations.ts                  # Order total calculations
│
├── types/
│   └── order.ts                               # OrderItem & Order type definitions
│
└── db/
    └── schema.ts                              # IndexedDB schema (Dexie)
```

## 🔄 Complete User Flow

### 1. User Opens Order Form
- **Route**: `/order`
- **Component**: `OrderForm.tsx`
- **Navigation**: Accessible via Dashboard menu "📝 Nuovo Ordine"

### 2. Customer Selection
```typescript
// Component: CustomerSelector.tsx
// Service: customerService.searchCustomers(query)
```
- User types customer name in autocomplete
- System searches IndexedDB `customers` table
- Fuzzy search matches partial names
- User selects customer → displays green confirmation badge

### 3. Product Selection Loop
For each product to add:

#### 3a. Product Search
```typescript
// Component: ProductSelector.tsx
// Service: productService.searchProducts(query)
```
- User types product name/code in autocomplete
- System searches IndexedDB `products` table
- Displays: name, article code, description

#### 3b. Quantity Input
```typescript
// Component: QuantityInput.tsx
// Service: productService.getVariantByQuantity(productId, quantity)
```
- User enters quantity
- System validates against product variants
- Shows matching variant info (package content)
- Displays error if quantity doesn't match any variant

#### 3c. Add to Order
```typescript
// Service: priceService.getPriceByArticleId(article)
// Util: calculateItemTotals(unitPrice, quantity)
```
- System fetches price for product
- Calculates item subtotal
- Adds item to order with unique ID
- Resets product selection for next item

### 4. Order Items Management
```typescript
// Component: OrderItemsList.tsx
```
- Displays table of all added items
- Columns: Article, Quantity, Price, Discount, Total
- Actions: Edit (✏️), Delete (🗑️)

#### Edit Item Modal
- Modify quantity
- Add item-level discount (% or €)
- Recalculates item totals on save

### 5. Global Discount (Optional)
```typescript
// Component: DiscountSystem.tsx
```
Two modes:
- **Direct Mode**: Set percentage (%) or amount (€)
- **Reverse Mode**: Enter target total → calculates discount needed

### 6. Order Summary
```typescript
// Component: OrderSummary.tsx
// Util: calculateOrderTotals(items, globalDiscount)
```
Displays:
- Items Subtotal (sum of all items after item discounts)
- Global Discount (applied to subtotal)
- Subtotal After Global Discount
- VAT (22% of subtotal after global discount)
- **Total** (final amount with VAT)

### 7. Submit Order
```typescript
// Service: orderService.savePendingOrder(order)
// Navigation: navigate('/pending-orders')
```
- Validates: customer selected, items exist
- Saves to `pendingOrders` IndexedDB table
- Status: `pending`
- Redirects to Pending Orders page

## 🗄️ Data Flow

### OrderItem Type
```typescript
interface OrderItem {
  id: string;                    // UUID
  productId: string;             // Product reference
  productName: string;           // Display name
  article: string;               // Article code
  description?: string;          // Product description
  variantId: string;             // Variant reference
  quantity: number;              // Ordered quantity
  packageContent: number;        // Units per package
  unitPrice: number;             // Price per unit
  subtotal: number;              // quantity × unitPrice
  discountType?: 'percentage' | 'amount';
  discountValue?: number;
  discount: number;              // Calculated discount amount
  total: number;                 // Final item total
}
```

### PendingOrder Schema
```typescript
interface PendingOrder {
  id?: number;                   // Auto-increment
  customerId: string;            // Customer reference
  customerName: string;          // Display name
  items: Array<{
    articleCode: string;
    productName: string;
    description?: string;
    quantity: number;
    price: number;
    discount: number;
  }>;
  discountPercent?: number;      // Global discount %
  targetTotalWithVAT?: number;   // Reverse calc target
  createdAt: string;             // ISO timestamp
  status: 'pending' | 'syncing' | 'error';
  retryCount: number;
  errorMessage?: string;
}
```

## 🧮 Calculation Logic

### Item Totals
```typescript
subtotal = quantity × unitPrice
discount = discountType === 'percentage'
  ? subtotal × (discountValue / 100)
  : discountValue
total = subtotal - discount
```

### Order Totals
```typescript
itemsSubtotal = sum(items.map(item => item.total))

globalDiscount = globalDiscountType === 'percentage'
  ? itemsSubtotal × (globalDiscountValue / 100)
  : globalDiscountValue

subtotalAfterGlobalDiscount = itemsSubtotal - globalDiscount

vat = subtotalAfterGlobalDiscount × 0.22  // 22% IVA

total = subtotalAfterGlobalDiscount + vat
```

## 🔌 API Integration Points

### Services → IndexedDB
All services use **Dexie** for IndexedDB access:

```typescript
import { db } from '../db/schema';

// Example: customerService
const customers = await db.customers
  .where('name')
  .startsWithIgnoreCase(query)
  .limit(50)
  .toArray();
```

### Offline-First Architecture
- All data cached in IndexedDB
- Order submission queued in `pendingOrders`
- Background sync processes queue when online
- No network required during order entry

## 🎨 Component Props

### CustomerSelector
```typescript
interface CustomerSelectorProps {
  onSelect: (customer: Customer) => void;
}
```

### ProductSelector
```typescript
interface ProductSelectorProps {
  onSelect: (product: Product) => void;
}
```

### QuantityInput
```typescript
interface QuantityInputProps {
  productId: string;
  value: number;
  onChange: (qty: number, isValid: boolean) => void;
}
```

### OrderItemsList
```typescript
interface OrderItemsListProps {
  items: OrderItem[];
  onEditItem: (itemId: string, updates: Partial<OrderItem>) => void;
  onDeleteItem: (itemId: string) => void;
}
```

### DiscountSystem
```typescript
interface DiscountSystemProps {
  orderSubtotal: number;
  discountType: 'percentage' | 'amount';
  discountValue: number;
  onChange: (discount: { discountType, discountValue }) => void;
  onReverseCalculate: (targetTotal: number) => void;
}
```

### OrderSummary
```typescript
interface OrderSummaryProps {
  itemsSubtotal: number;
  globalDiscount: number;
  subtotalAfterGlobalDiscount: number;
  vat: number;
  total: number;
}
```

## 🧪 Testing

All components have comprehensive test suites:
- `*.spec.tsx` - Component tests
- `*.service.spec.ts` - Service layer tests
- `order-calculations.spec.ts` - Calculation logic tests

## 🚀 Navigation Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/order` | OrderForm | Create new order |
| `/pending-orders` | PendingOrdersPage | View pending queue |
| `/orders` | OrderHistory | View submitted orders |

## 📊 State Management

OrderForm uses **React hooks** for local state:
- `useState` for form state
- No global state library needed (offline-first via IndexedDB)
- Services encapsulate all data access logic

## 🔄 Post-Submission Flow

1. Order saved to `pendingOrders` table
2. User redirected to `/pending-orders`
3. Background sync service processes queue:
   - Reads pending orders (oldest first)
   - POSTs to `/api/orders/create`
   - Updates order status (`syncing` → `success`/`error`)
   - Retries on failure with exponential backoff

## 🎯 Key Design Decisions

1. **Three-layer architecture** - Clean separation enables easy testing and maintenance
2. **Offline-first** - IndexedDB caching eliminates network dependency
3. **Pending queue** - Reliable order submission even with poor connectivity
4. **Variant validation** - Prevents invalid quantities at input time
5. **Atomic components** - Each component has single responsibility
6. **Type safety** - Full TypeScript coverage with strict types
7. **Calculation utilities** - Centralized logic ensures consistency

## 🔧 Future Enhancements

Potential features not yet implemented:
- Order templates / favorites
- Bulk item import
- Price history display
- Stock level warnings
- Multi-currency support
- Tax rate customization
- Payment term selection
- Shipping method selection

---

**Last Updated**: Phase 28.2-06 (January 2025)
