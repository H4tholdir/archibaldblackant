# Phase 10-06: Component Structure

## Component Hierarchy

```
OrderHistory Page (Plan 10-07)
├── Search & Filters
└── Grouped Orders Display
    ├── groupOrdersByPeriod() utility
    └── For each period group:
        ├── Period Header (Oggi, Questa settimana, etc.)
        └── OrderCard[] (one per order)
            ├── Collapsed View (always visible)
            │   ├── Customer Name
            │   ├── Date
            │   ├── Total
            │   ├── StatusBadge
            │   ├── TrackingBadge (if available)
            │   ├── "Vedi documenti" button
            │   └── Expand/collapse icon
            └── Expanded View (when expanded=true)
                ├── Customer Notes
                ├── OrderItems (items list)
                ├── OrderTimeline (status history)
                ├── Tracking Details
                └── DocumentsList
```

## Component Responsibility Matrix

| Component | Responsibility | State Management | Styling |
|-----------|---------------|------------------|---------|
| **OrderCard** | Display single order in collapsed/expanded states | Controlled (external) | Inline, banking app style |
| **OrderTimeline** | Display vertical status history | Stateless | Inline, color-coded |
| **groupOrdersByPeriod** | Categorize orders by time period | Pure function | N/A |

## Data Flow

```
API/Service Layer
    ↓
Order[] (raw data)
    ↓
groupOrdersByPeriod() → OrderGroup[]
    ↓
OrderCard (per order)
    ↓ (when expanded)
OrderTimeline (status updates)
```

## File Sizes

- `OrderCard.tsx`: 12KB (main component with collapsed/expanded logic)
- `OrderTimeline.tsx`: 3.7KB (timeline display)
- `orderGrouping.ts`: 2.8KB (grouping utility)
- `orderGrouping.spec.ts`: 5.9KB (12 unit tests)
- `OrderCard.example.tsx`: 6.9KB (integration examples)
- `ORDER_TIMELINE_COMPONENTS.md`: 6.4KB (documentation)

**Total:** ~38KB of production code + tests + docs

## Type Definitions

### Core Types

```typescript
// Order (main data structure)
interface Order {
  id: string;
  date: string;              // ISO 8601
  customerName: string;
  total: string;             // Pre-formatted with currency
  status: string;
  tracking?: { courier: string; trackingNumber: string };
  documents?: Array<{ type: string; name: string; url: string }>;
  items?: OrderItem[];
  statusTimeline?: StatusUpdate[];
  customerNotes?: string;
}

// OrderItem (individual line item)
interface OrderItem {
  articleCode: string;
  productName?: string;
  description: string;
  quantity: number;
  price: number;
  discount?: number;
}

// StatusUpdate (timeline entry)
interface StatusUpdate {
  status: string;
  timestamp: string;         // ISO 8601
  note?: string;
}

// OrderGroup (temporal grouping result)
interface OrderGroup {
  period: 'Oggi' | 'Questa settimana' | 'Questo mese' | 'Più vecchi';
  orders: Order[];
}
```

## Component Props

### OrderCard

```typescript
interface OrderCardProps {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onDocumentsClick?: (orderId: string) => void;
  timelineComponent?: ReactNode;
}
```

### OrderTimeline

```typescript
interface OrderTimelineProps {
  updates: StatusUpdate[];
}
```

## Styling Tokens

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `statusBlue` | #2196f3 | In lavorazione, Creato |
| `statusGreen` | #4caf50 | Evaso |
| `statusPurple` | #9c27b0 | Spedito |
| `statusGray` | #9e9e9e | Default/unknown |
| `white` | #fff | Card background |
| `textPrimary` | #333 | Primary text |
| `textSecondary` | #666 | Secondary text |
| `textTertiary` | #999 | Tertiary text |
| `borderLight` | #e0e0e0 | Borders, lines |
| `backgroundLight` | #f5f5f5 | Item backgrounds |
| `trackingBlue` | #e3f2fd | Tracking background |
| `trackingBorder` | #bbdefb | Tracking border |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `heading` | 18px/700 | Customer name |
| `total` | 20px/700 | Order total |
| `body` | 14px/400-600 | General text |
| `small` | 12px/400-600 | Secondary info, timestamps |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `borderRadius` | 12px | Card radius |
| `borderRadiusSmall` | 8px | Inner element radius |
| `borderRadiusPill` | 16px | Badge radius |
| `padding` | 16px | Card padding |
| `gap` | 8px | Element spacing |

### Effects

| Token | Value | Usage |
|-------|-------|-------|
| `shadowSubtle` | 0 2px 8px rgba(0,0,0,0.1) | Default card shadow |
| `shadowHover` | 0 4px 12px rgba(0,0,0,0.15) | Hover card shadow |
| `transition` | 0.2s | Hover, expand animations |

## Integration Points

### For Plan 10-07 (Order History Page)

1. **Import components:**
   ```typescript
   import { OrderCard } from './components/OrderCard';
   import { OrderTimeline } from './components/OrderTimeline';
   import { groupOrdersByPeriod } from './utils/orderGrouping';
   ```

2. **Fetch order data from API**
   - Transform API response to Order[] format
   - Ensure dates are ISO 8601 strings
   - Format totals with currency symbol

3. **Apply temporal grouping:**
   ```typescript
   const groupedOrders = groupOrdersByPeriod(orders);
   ```

4. **Render grouped orders:**
   ```typescript
   {groupedOrders.map(group => (
     <div key={group.period}>
       <h3>{group.period}</h3>
       {group.orders.map(order => (
         <OrderCard
           key={order.id}
           order={order}
           expanded={expandedId === order.id}
           onToggle={() => toggleExpanded(order.id)}
           timelineComponent={
             order.statusTimeline ?
               <OrderTimeline updates={order.statusTimeline} /> :
               null
           }
         />
       ))}
     </div>
   ))}
   ```

5. **Add search/filter functionality**
   - Filter orders before grouping
   - Apply search to customerName
   - Apply filters to status, date range

## Testing Strategy

### Unit Tests ✅

- `orderGrouping.spec.ts`: 12 tests covering all grouping scenarios
  - Empty arrays
  - Single/multiple orders
  - All time periods
  - Invalid dates
  - Sorting within groups
  - Property preservation

### Integration Tests (Plan 10-07)

- OrderCard expand/collapse behavior
- OrderTimeline display with various statuses
- Grouped orders rendering
- Search and filter functionality
- Documents click handling

### Visual Testing (Plan 10-07)

- Banking app style consistency
- Responsive behavior
- Hover states
- Animation smoothness

## Performance Considerations

1. **Memoization opportunities:**
   - `groupOrdersByPeriod()` result (if orders array doesn't change)
   - OrderCard rendering (if order data doesn't change)
   - StatusBadge color calculation

2. **Virtualization (future):**
   - For large order lists (100+ orders)
   - Consider react-window or similar

3. **Code splitting:**
   - OrderCard.example.tsx not included in production bundle
   - ORDER_TIMELINE_COMPONENTS.md not bundled

## Accessibility

- Semantic HTML structure (divs with clear hierarchy)
- Color contrast meets WCAG AA (status badges, text)
- Keyboard navigation support (via native button elements)
- Screen reader friendly (clear text labels)

**Future improvements:**
- Add ARIA labels for expand/collapse buttons
- Add aria-expanded attribute to cards
- Add role="list" to order groups
- Add focus management for keyboard navigation

---

*Created: 2026-01-15*
*Phase: 10-order-history*
*Plan: 10-06*
