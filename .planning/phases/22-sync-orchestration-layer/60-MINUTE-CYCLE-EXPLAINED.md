# 60-Minute Cycle Scheduling - Complete Explanation

**Date**: 2026-01-22
**Phase**: 22 (Sync Orchestration Layer)
**Decision**: Option A - 60-minute cycle

---

## Core Concept: Independent Timers with Staggered Starts

### Key Insight

Il ciclo di 60 minuti **NON è un "round-robin"** dove ogni sync aspetta il suo turno.

Invece, **ogni sync ha il suo timer indipendente** che si ripete in base alla sua frequenza specifica.

---

## How It Works: Visual Timeline

### First Hour (T=0 to T=60)

```
Minute:  0    5   10   15   20   25   30   35   40   45   50   55   60
         |----|----|----|----|----|----|----|----|----|----|----|----|

Orders:  ■         ■         ■         ■         ■         ■
         └─ Every 10 minutes (6 times per hour)

Cust:         ■                             ■
              └─ Every 30 minutes (2 times per hour)

Prices:            ■                             ■
                   └─ Every 30 minutes (2 times per hour)

Invoices:               ■                             ■
                        └─ Every 30 minutes (2 times per hour)

DDT:                         ■
                             └─ Every 45 minutes (starts at T+20)

Products:                         ■
                                  └─ Every 90 minutes (starts at T+30)
```

**Key Observations**:
1. Orders runs **6 times** per hour (most frequent)
2. Customers, Prices, Invoices run **2 times** per hour each
3. DDT runs **1.33 times** per hour (every 45min means 4 times per 3 hours)
4. Products runs **0.67 times** per hour (every 90min means 2 times per 3 hours)

---

### Second Hour (T=60 to T=120)

```
Minute:  60   65   70   75   80   85   90   95  100  105  110  115  120
         |----|----|----|----|----|----|----|----|----|----|----|----|

Orders:  ■         ■         ■         ■         ■         ■
         └─ Continues every 10 min

Cust:         ■                             ■
              └─ Continues every 30 min (T+65, T+95)

Prices:            ■                             ■
                   └─ Continues every 30 min (T+70, T+100)

Invoices:               ■                             ■
                        └─ Continues every 30 min (T+75, T+105)

DDT:                              ■
                                  └─ Next at T+65 (20+45=65)

Products:                                            NO SYNC
                                                     └─ Next at T+120 (30+90=120)
```

**Key Observations**:
- Orders never stops (every 10 min forever)
- Customers/Prices/Invoices continue their 30-min rhythm
- DDT next runs at T+65 (45min after T+20)
- Products next runs at T+120 (90min after T+30)

---

### Third Hour (T=120 to T=180)

```
Minute: 120  125  130  135  140  145  150  155  160  165  170  175  180
        |----|----|----|----|----|----|----|----|----|----|----|----|

Orders: ■         ■         ■         ■         ■         ■
        └─ Continues every 10 min

Products:  ■
           └─ Runs again at T+120 (30+90=120), then T+210 (120+90=210)

DDT:                 ■
                     └─ Runs at T+110 (20+45+45=110)
```

**Pattern**: Each sync maintains its own independent schedule indefinitely.

---

## Implementation: How Timers Are Configured

### Pseudocode

```typescript
export class SyncOrchestrator {
  private intervals: Map<SyncType, NodeJS.Timer> = new Map();

  /**
   * Start all syncs with staggered initial delays
   */
  startStaggeredAutoSync(): void {
    // Orders: T+0, repeat every 10 minutes
    this.scheduleSync('orders', 10 * 60 * 1000, 0);

    // Customers: T+5, repeat every 30 minutes
    this.scheduleSync('customers', 30 * 60 * 1000, 5 * 60 * 1000);

    // Prices: T+10, repeat every 30 minutes
    this.scheduleSync('prices', 30 * 60 * 1000, 10 * 60 * 1000);

    // Invoices: T+15, repeat every 30 minutes
    this.scheduleSync('invoices', 30 * 60 * 1000, 15 * 60 * 1000);

    // DDT: T+20, repeat every 45 minutes
    this.scheduleSync('ddt', 45 * 60 * 1000, 20 * 60 * 1000);

    // Products: T+30, repeat every 90 minutes
    this.scheduleSync('products', 90 * 60 * 1000, 30 * 60 * 1000);
  }

  /**
   * Schedule a sync with initial delay and repeat interval
   */
  private scheduleSync(
    type: SyncType,
    interval: number,    // Repeat interval (ms)
    initialDelay: number // Delay before first execution (ms)
  ): void {
    logger.info(`[SyncOrchestrator] Scheduling ${type} sync`, {
      interval: `${interval / 60000}min`,
      initialDelay: `${initialDelay / 60000}min`
    });

    // Wait for initialDelay, then start repeating
    setTimeout(() => {
      // Trigger first sync
      this.requestSync(type, 'auto');

      // Set up repeating timer
      const timer = setInterval(() => {
        this.requestSync(type, 'auto');
      }, interval);

      // Store timer reference for cleanup
      this.intervals.set(type, timer);

    }, initialDelay);
  }

  /**
   * Stop all auto-sync timers
   */
  stopAutoSync(): void {
    this.intervals.forEach((timer, type) => {
      clearInterval(timer);
      logger.info(`[SyncOrchestrator] Stopped ${type} auto-sync`);
    });
    this.intervals.clear();
  }
}
```

---

## Detailed Execution Flow

### Example: Orders Sync

```typescript
// Server starts at T=0
startStaggeredAutoSync()
  ├─ scheduleSync('orders', 10min, 0min)
  │   ├─ setTimeout(0) → immediate execution
  │   ├─ T=0: requestSync('orders', 'auto')
  │   └─ setInterval(10min) → repeats every 10 minutes
  │       ├─ T=10: requestSync('orders', 'auto')
  │       ├─ T=20: requestSync('orders', 'auto')
  │       ├─ T=30: requestSync('orders', 'auto')
  │       └─ ... forever (or until stopAutoSync() called)
```

### Example: Products Sync

```typescript
// Server starts at T=0
startStaggeredAutoSync()
  ├─ scheduleSync('products', 90min, 30min)
  │   ├─ setTimeout(30min) → wait 30 minutes
  │   ├─ T=30: requestSync('products', 'auto')
  │   └─ setInterval(90min) → repeats every 90 minutes
  │       ├─ T=120: requestSync('products', 'auto')
  │       ├─ T=210: requestSync('products', 'auto')
  │       └─ ... forever
```

---

## Why Staggered Starts?

### Without Staggering (BAD ❌)

```
T=0: ALL syncs start simultaneously
     ├─ Orders, Customers, Products, Prices, DDT, Invoices
     ├─ CPU spike to 100%
     ├─ Memory spike (6 PDFs in memory)
     ├─ Database contention (6 concurrent writes)
     └─ Possible server crash or timeout
```

### With Staggering (GOOD ✅)

```
T=0:  Orders starts     (CPU: 20%, Memory: 50MB)
T=5:  Customers starts  (CPU: 35%, Memory: 100MB) ← Orders still running
T=10: Prices starts     (CPU: 50%, Memory: 150MB) ← Orders finished
T=15: Invoices starts   (CPU: 40%, Memory: 120MB)
T=20: DDT starts        (CPU: 45%, Memory: 130MB)
T=30: Products starts   (CPU: 55%, Memory: 180MB)

Average CPU:  40% (smooth)
Peak CPU:     55% (manageable)
```

**Key Benefit**: Load distributed over time, no simultaneous spikes

---

## How Frequencies Are Defined

### Configuration Object

```typescript
interface SyncConfig {
  type: SyncType;
  interval: number;     // How often to repeat (ms)
  initialDelay: number; // When to start first execution (ms)
  priority: number;     // For queueing when overlaps occur
}

const SYNC_CONFIGS: SyncConfig[] = [
  {
    type: 'orders',
    interval: 10 * 60 * 1000,  // 10 minutes
    initialDelay: 0,            // Start immediately
    priority: 4                 // Highest priority
  },
  {
    type: 'customers',
    interval: 30 * 60 * 1000,  // 30 minutes
    initialDelay: 5 * 60 * 1000, // Start at T+5min
    priority: 3
  },
  {
    type: 'prices',
    interval: 30 * 60 * 1000,  // 30 minutes
    initialDelay: 10 * 60 * 1000, // Start at T+10min
    priority: 5                 // Critical (financial data)
  },
  {
    type: 'invoices',
    interval: 30 * 60 * 1000,  // 30 minutes
    initialDelay: 15 * 60 * 1000, // Start at T+15min
    priority: 4
  },
  {
    type: 'ddt',
    interval: 45 * 60 * 1000,  // 45 minutes
    initialDelay: 20 * 60 * 1000, // Start at T+20min
    priority: 2
  },
  {
    type: 'products',
    interval: 90 * 60 * 1000,  // 90 minutes
    initialDelay: 30 * 60 * 1000, // Start at T+30min
    priority: 2
  }
];
```

### Programmatic Initialization

```typescript
startStaggeredAutoSync(): void {
  SYNC_CONFIGS.forEach(config => {
    this.scheduleSync(config.type, config.interval, config.initialDelay);
  });
}
```

**Benefit**: Easy to adjust frequencies (change config values, restart server)

---

## Handling Overlaps with Priority Queue

### Scenario: Two Syncs Overlap

```
T=10: Orders sync queued (priority 4)
T=10: Orders sync starts
T=12: Customers sync queued (priority 3) ← While Orders running
      └─ Added to queue, waits
T=18: Orders sync completes
T=18: Customers sync dequeued (next in priority order)
T=18: Customers sync starts
```

**Mutex Enforcement**:
```typescript
async requestSync(type: SyncType, mode: string, priority?: number): Promise<void> {
  // Determine priority
  const syncPriority = priority ?? this.getDefaultPriority(type);

  // If sync in progress, queue the request
  if (this.syncInProgress) {
    this.syncQueue.push({ type, mode, priority: syncPriority });
    this.syncQueue.sort((a, b) => b.priority - a.priority); // Sort by priority DESC

    logger.info(`[SyncOrchestrator] Sync queued: ${type} (queue length: ${this.syncQueue.length})`);
    return; // ← Exit, will be processed later
  }

  // Execute sync immediately
  await this.executeSync(type, mode);
}
```

**Key Logic**:
1. Check if `syncInProgress === true`
2. If yes → add to queue, sort by priority
3. If no → execute immediately
4. After execution → process next in queue

---

## Cycle Duration: Why 60 Minutes?

### Option A: 60-Minute "Window" ✅ (Recommended)

**Definition**: "Cycle" = time window for one full pass of all syncs

**Calculation**:
- Orders runs 6 times → 0, 10, 20, 30, 40, 50 (within 60min)
- Customers runs 2 times → 5, 35 (within 60min)
- Products runs 1 time → 30 (within 90min, but starts at 30)

**Key Insight**: "60-minute cycle" means:
- All high-frequency syncs (10min, 30min) complete at least once
- Lower-frequency syncs (45min, 90min) may span multiple "cycles"

**Not a hard constraint**: Just a convenient mental model

---

### Option B: 90-Minute Cycle (If Needed)

If monitoring shows frequent overlaps:

```typescript
const SYNC_CONFIGS: SyncConfig[] = [
  {
    type: 'orders',
    interval: 10 * 60 * 1000,
    initialDelay: 0,
    priority: 4
  },
  {
    type: 'customers',
    interval: 30 * 60 * 1000,
    initialDelay: 10 * 60 * 1000,  // Changed: 5 → 10
    priority: 3
  },
  {
    type: 'prices',
    interval: 30 * 60 * 1000,
    initialDelay: 20 * 60 * 1000,  // Changed: 10 → 20
    priority: 5
  },
  // ... wider spacing between starts
];
```

**Benefit**: More breathing room (30-min buffer vs 10-min)

**Drawback**: Slower freshness (customers delayed up to 90min vs 60min)

---

## Real-World Example: First 2 Hours

### Timeline with Actual Sync Durations

**Assumptions**:
- Orders sync: 5-8 minutes
- Customers sync: 10-15 minutes
- Products sync: 15-20 minutes
- Prices sync: 10-15 minutes
- DDT sync: 3-5 minutes
- Invoices sync: 3-5 minutes

```
T=0:     Orders starts (8min duration)
T=5:     Customers starts (12min duration)
         ├─ Orders still running → Customers QUEUED
T=8:     Orders completes
T=8:     Customers dequeued, starts
T=10:    Orders starts again (8min)
         ├─ Customers still running (started at T=8)
         └─ Orders QUEUED (waits for Customers)
T=18:    Orders completes (waited from T=10)
T=20:    Customers completes (started at T=8, 12min duration)
T=20:    Orders dequeued, starts (8min)
         └─ Prices queued at T=10, waits
T=20:    DDT queued (Prices has higher priority, goes first)
T=28:    Orders completes
T=28:    Prices dequeued, starts (12min)
T=30:    Orders starts again, queued (Prices running)
T=30:    Products queued (Prices running)
T=40:    Prices completes
T=40:    Products dequeued (priority 2)
T=40:    Orders still queued (priority 4 > 2, but Products already started)
... continues ...
```

**Key Observations**:
- Mutex prevents simultaneous execution ✅
- Queue ensures priority ordering ✅
- Some syncs wait (acceptable delay, 1-5 minutes typical)
- System self-regulates (no crashes, no resource exhaustion)

---

## Monitoring & Observability

### Metrics to Track

```typescript
interface SyncOrchestratorMetrics {
  // Per-sync metrics
  syncCounts: Map<SyncType, number>;        // How many times each sync ran
  syncDurations: Map<SyncType, number[]>;   // Duration of each execution
  syncSuccessRates: Map<SyncType, number>;  // Success %

  // Queue metrics
  queueDepth: number;                       // Current queue length
  maxQueueDepth: number;                    // Peak queue length
  averageQueueWaitTime: number;             // Avg time in queue (ms)

  // Overlap metrics
  overlapCount: number;                     // How many times sync overlapped
  overlapDuration: number;                  // Total time spent queued (ms)
}
```

### Dashboard Visualization

```
Sync Orchestrator Status
-------------------------
Active Sync:      Orders (running for 3m 42s)
Queue:            2 pending (Customers, Prices)
Next Scheduled:   DDT in 7 minutes

Sync Performance (Last Hour)
-----------------------------
Orders:      6 runs, avg 7.2min, 100% success
Customers:   2 runs, avg 12.1min, 100% success
Products:    1 run, 18.3min, 100% success
Prices:      2 runs, avg 11.5min, 100% success
DDT:         1 run, 4.2min, 100% success
Invoices:    2 runs, avg 3.8min, 100% success

Queue Statistics
----------------
Max depth:        3 (peak at 10:35am)
Avg wait time:    2.1 minutes
Total overlaps:   12 (acceptable)
```

---

## Configuration: How to Adjust Frequencies

### Option 1: Config File (Recommended)

**File**: `archibald-web-app/backend/config/sync-schedule.json`

```json
{
  "orders": {
    "interval": "10m",
    "initialDelay": "0m",
    "priority": 4
  },
  "customers": {
    "interval": "30m",
    "initialDelay": "5m",
    "priority": 3
  },
  "products": {
    "interval": "90m",
    "initialDelay": "30m",
    "priority": 2
  },
  "prices": {
    "interval": "30m",
    "initialDelay": "10m",
    "priority": 5
  },
  "ddt": {
    "interval": "45m",
    "initialDelay": "20m",
    "priority": 2
  },
  "invoices": {
    "interval": "30m",
    "initialDelay": "15m",
    "priority": 4
  }
}
```

**Load Config**:
```typescript
import syncSchedule from '../config/sync-schedule.json';

startStaggeredAutoSync(): void {
  Object.entries(syncSchedule).forEach(([type, config]) => {
    const interval = this.parseInterval(config.interval);
    const initialDelay = this.parseInterval(config.initialDelay);

    this.scheduleSync(type as SyncType, interval, initialDelay);
  });
}

private parseInterval(str: string): number {
  const match = str.match(/^(\d+)(m|h|s)$/);
  if (!match) throw new Error(`Invalid interval: ${str}`);

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}
```

**Benefit**: Change frequencies without code changes (restart server to apply)

---

### Option 2: Environment Variables

```bash
# .env file
SYNC_ORDERS_INTERVAL=10m
SYNC_CUSTOMERS_INTERVAL=30m
SYNC_PRODUCTS_INTERVAL=90m
SYNC_PRICES_INTERVAL=30m
SYNC_DDT_INTERVAL=45m
SYNC_INVOICES_INTERVAL=30m
```

```typescript
const interval = process.env[`SYNC_${type.toUpperCase()}_INTERVAL`] || '30m';
```

**Benefit**: Environment-specific configuration (dev vs production)

---

### Option 3: Admin API (Phase 25)

```typescript
/**
 * Update sync frequency dynamically (no restart required)
 */
app.post('/api/admin/sync/configure', authenticateJWT, async (req, res) => {
  const { type, interval, initialDelay, priority } = req.body;

  // Stop current timer
  syncOrchestrator.stopSync(type);

  // Restart with new config
  syncOrchestrator.scheduleSync(type, interval, initialDelay);

  res.json({ success: true, message: `${type} sync reconfigured` });
});
```

**Benefit**: Live configuration changes without downtime

---

## Summary: How 60-Minute Cycle Works

### Key Points

1. **Not a round-robin**: Each sync has independent timer
2. **Staggered starts**: Prevent simultaneous execution (T+0, T+5, T+10, etc.)
3. **Variable frequencies**: Orders(10m), Customers(30m), Products(90m), etc.
4. **Mutex enforcement**: Only one sync runs at a time
5. **Priority queueing**: Higher priority syncs go first when overlap
6. **Self-regulating**: System handles overlaps gracefully (queue + wait)

### Visual Mental Model

Think of it like a **traffic light intersection**:
- Each road (sync type) has its own timer (frequency)
- Cars (sync executions) arrive at different rates
- Traffic light (orchestrator) ensures only one car crosses at a time
- Priority vehicles (ambulances = orders/prices) get to go first

### Configuration Summary

```typescript
// Orders: Most frequent (every 10min)
setInterval(() => requestSync('orders'), 10 * 60 * 1000);

// Customers: Medium frequency (every 30min, starts at T+5)
setTimeout(() => {
  setInterval(() => requestSync('customers'), 30 * 60 * 1000);
}, 5 * 60 * 1000);

// Products: Lowest frequency (every 90min, starts at T+30)
setTimeout(() => {
  setInterval(() => requestSync('products'), 90 * 60 * 1000);
}, 30 * 60 * 1000);
```

**That's it!** Simple timers + mutex + priority queue = robust scheduling

---

## FAQ

### Q: What if a sync takes longer than its interval?

**Example**: Products sync takes 95 minutes, but interval is 90 minutes

**Answer**: Next execution is queued, waits for current to complete
- T=30: Products starts (95min duration)
- T=120: Next Products execution queued (can't start, previous running)
- T=125: Previous Products completes (T+30 + 95min)
- T=125: Queued Products execution starts

**Result**: Sync frequency adapts to actual duration (self-regulating)

---

### Q: Can I disable a specific sync?

**Answer**: Yes, don't schedule it

```typescript
startStaggeredAutoSync(): void {
  this.scheduleSync('orders', 10 * 60 * 1000, 0);
  this.scheduleSync('customers', 30 * 60 * 1000, 5 * 60 * 1000);
  // this.scheduleSync('products', 90 * 60 * 1000, 30 * 60 * 1000); // ← Disabled
}
```

Or stop specific timer:
```typescript
stopSync(type: SyncType): void {
  const timer = this.intervals.get(type);
  if (timer) {
    clearInterval(timer);
    this.intervals.delete(type);
    logger.info(`[SyncOrchestrator] Stopped ${type} auto-sync`);
  }
}
```

---

### Q: What happens on server restart?

**Answer**: All timers reset to T=0

- Orders starts immediately (initialDelay=0)
- Customers starts at T+5min
- Products starts at T+30min
- Etc.

**No persistence**: Timer state is in-memory only (acceptable for sync scheduling)

---

### Q: Can I trigger a manual sync while auto-sync is running?

**Answer**: Yes, it will be queued with priority

```typescript
// User clicks "Sync Customers" button
await syncOrchestrator.requestSync('customers', 'full', 10); // priority=10 (very high)

// System checks:
if (this.syncInProgress) {
  this.syncQueue.push({ type: 'customers', mode: 'full', priority: 10 });
  this.syncQueue.sort((a, b) => b.priority - a.priority); // Moves to front of queue
}
```

**Result**: Manual sync jumps to front of queue (higher priority)

---

**Next Step**: Implement in Phase 22-02 (Staggered Scheduling)
