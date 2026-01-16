# Order Timeline UI Components

Banking app style components for displaying order history with expandable cards, temporal grouping, and status timeline.

## Components

### OrderCardNew

Expandable card component for displaying order information with collapsed and expanded states.

**Note:** This component replaces the deprecated `OrderCard.tsx`.

**Props:**
```typescript
interface OrderCardProps {
  order: Order;              // Order data to display
  expanded: boolean;         // Whether card is expanded
  onToggle: () => void;      // Handler for card toggle
  onDocumentsClick?: (orderId: string) => void;  // Handler for documents button
  timelineComponent?: ReactNode;  // Timeline component to show when expanded
}
```

**Order Interface:**
```typescript
interface Order {
  id: string;
  date: string;              // ISO 8601 format
  customerName: string;
  total: string;             // Formatted with currency (e.g., "1.234,56 €")
  status: string;            // Current order status
  tracking?: {               // Optional tracking information
    courier: string;
    trackingNumber: string;
  };
  documents?: Array<{        // Optional documents
    type: string;
    name: string;
    url: string;
  }>;
  items?: OrderItem[];       // Order items (shown when expanded)
  statusTimeline?: StatusUpdate[];  // Status history (shown when expanded)
  customerNotes?: string;    // Customer notes (shown when expanded)
}
```

**Features:**
- Collapsed view shows customer name, date, total, status badge, tracking badge (if available), and "Vedi documenti" button
- Expanded view adds items list, status timeline, customer notes, tracking details, and documents list
- Banking app styling with white card, 12px border radius, subtle shadow
- Smooth expand/collapse animation
- Hover effects for better UX
- Separate click handlers for card toggle and documents button

**Example:**
```tsx
import { OrderCardNew } from './components/OrderCardNew';
import { OrderTimeline } from './components/OrderTimeline';

<OrderCardNew
  order={order}
  expanded={expandedOrderId === order.id}
  onToggle={() => setExpandedOrderId(order.id)}
  onSendToMilano={(id, name) => console.log('Send to Milano', id, name)}
  onEdit={(id) => console.log('Edit order', id)}
  token={jwtToken}
/>
```

---

### OrderTimeline

Vertical timeline component for displaying order status updates.

**Props:**
```typescript
interface OrderTimelineProps {
  updates: StatusUpdate[];   // Array of status updates
}

interface StatusUpdate {
  status: string;            // Status name
  timestamp: string;         // ISO 8601 format
  note?: string;             // Optional note/description
}
```

**Features:**
- Vertical timeline with colored dots and connecting line
- Newest update at top (sorted automatically)
- Current status (first item) highlighted with larger dot and bold text
- Timestamps formatted as "dd MMM, HH:mm" (e.g., "15 gen, 14:30")
- Status-specific colors:
  - Blue (#2196f3): "In lavorazione", "Creato"
  - Green (#4caf50): "Evaso"
  - Purple (#9c27b0): "Spedito"
  - Gray (#9e9e9e): Default/unknown
- Returns null if updates array is empty

**Example:**
```tsx
import { OrderTimeline } from './components/OrderTimeline';

const updates = [
  {
    status: "Spedito",
    timestamp: "2026-01-15T14:30:00Z",
    note: "Pacco affidato al corriere BRT"
  },
  {
    status: "Evaso",
    timestamp: "2026-01-15T10:00:00Z"
  },
  {
    status: "Creato",
    timestamp: "2026-01-14T16:00:00Z"
  }
];

<OrderTimeline updates={updates} />
```

---

## Utilities

### groupOrdersByPeriod

Pure function for grouping orders by time period.

**Function Signature:**
```typescript
function groupOrdersByPeriod(orders: Order[]): OrderGroup[]

interface OrderGroup {
  period: 'Oggi' | 'Questa settimana' | 'Questo mese' | 'Più vecchi';
  orders: Order[];
}
```

**Grouping Logic:**
- **"Oggi"**: Orders from today (same day)
- **"Questa settimana"**: Orders from last 7 days (excluding today)
- **"Questo mese"**: Orders from current month (excluding this week)
- **"Più vecchi"**: Orders before current month

**Features:**
- Pure function with no side effects
- Sorts orders within each group by date descending (newest first)
- Returns only non-empty groups in correct order
- Handles invalid dates gracefully (logs warning, groups into "Più vecchi")
- Preserves all order properties during grouping

**Example:**
```tsx
import { groupOrdersByPeriod } from './utils/orderGrouping';

const groupedOrders = groupOrdersByPeriod(orders);

{groupedOrders.map(group => (
  <div key={group.period}>
    <h3>{group.period}</h3>
    {group.orders.map(order => (
      <OrderCardNew key={order.id} order={order} ... />
    ))}
  </div>
))}
```

---

## Styling

All components use inline styles following the banking app aesthetic:

- **Colors:**
  - White backgrounds (#fff)
  - Subtle shadows (0 2px 8px rgba(0,0,0,0.1))
  - Gray text (#333, #666, #999)
  - Status colors (blue, green, purple, gray)

- **Typography:**
  - Font sizes: 12px - 20px
  - Font weights: 400, 600, 700
  - System fonts (default)

- **Spacing:**
  - Border radius: 8px - 12px
  - Padding: 8px - 16px
  - Gaps: 8px - 16px
  - Margins: 4px - 16px

- **Transitions:**
  - Smooth hover effects (0.2s)
  - Box shadow changes on hover
  - Transform for lift effect

---

## Testing

Unit tests are provided for the grouping utility:

```bash
npm test -- src/utils/orderGrouping.spec.ts --run
```

**Test Coverage:**
- Empty arrays
- Single/multiple orders
- All time periods
- Invalid dates
- Sorting within groups
- Property preservation
- Group ordering

---

## Integration Example

For complete integration examples, see:
- `OrderHistory.tsx` - Full order history page with grouping, filters, and actions
- `DraftOrders.tsx` - Draft orders management page

---

## Type Safety

All components and utilities are fully typed with TypeScript:
- Strict interfaces for all props
- Exported types for Order, OrderItem, StatusUpdate, OrderGroup
- Period type union for validation

---

## Best Practices

1. **Use tab-based layout** - OrderCardNew uses tabs (Panoramica, Articoli, Logistica, Finanziario, Storico) for organized content
2. **Handle click events separately** - Card toggle, send to Milano, and edit actions have separate handlers
3. **Format dates/totals before passing** - Components expect pre-formatted strings for display
4. **Use groupOrdersByPeriod for lists** - Temporal grouping improves UX for large order histories
5. **Control expanded state externally** - OrderCardNew is controlled component for flexible state management
6. **Pass JWT token** - Required for authenticated actions like DDT PDF download

---

*Created: 2026-01-15*
*Phase: 10-order-history*
*Plan: 10-06*
