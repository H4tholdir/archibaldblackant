# Phase 20: Sync Orchestrator - Background Automation

## Overview

Implementare un orchestratore robusto per gestire automaticamente le sincronizzazioni in background di tutti i dati (Clienti, Ordini, Prodotti, Prezzi) con monitoring in tempo reale, gestione errori intelligente e priorità dinamiche.

## Current State (Phase 19 Complete)

✅ **Manual Sync Funzionante**:
- Sync manuale clienti e prodotti via frontend
- Multi-layer Italian localization (Browser args + ENV vars + HTTP headers)
- Service user authentication per background tasks
- API endpoints: `POST /api/customers/sync`, `POST /api/products/sync`

🔴 **Automatic Sync Disabilitato**:
- `syncScheduler.start()` - Commentato
- `syncService.startAutoSync(30)` - Commentato
- `productSyncService.startAutoSync(30)` - Commentato

Motivazione: Prima di abilitare sync automatica in produzione, serve un orchestratore robusto con monitoring, error recovery e gestione intelligente delle priorità.

## Requirements

### 1. Centralized Orchestrator
- Single source of truth per tutte le sync operations
- Priority queue system (Customers > Orders > Products > Prices)
- Prevents concurrent sync conflicts
- Graceful shutdown on server restart

### 2. Smart Scheduling
- Adaptive intervals based on data change frequency
- Configurable schedules per data type
- Rispetta orari di lavoro (no sync 00:00-06:00)
- Delta sync quando possibile, full sync quando necessario

### 3. Error Recovery
- Exponential backoff on failures
- Max retry limits con alerting
- Dead letter queue per sync fallite
- Health check endpoint con sync status

### 4. Real-Time Monitoring
- WebSocket progress updates per frontend
- Admin dashboard con:
  - Current sync status (running/idle/error)
  - Last sync timestamps
  - Success/failure rates
  - Average sync duration
  - Queue depth
- Prometheus metrics export

### 5. Manual Override
- Frontend buttons mantengono priorità
- Admin può pausare/riprendere scheduler
- Force sync opzionale (cancella DB + rescrape)
- Per-user sync history tracking

## Technical Architecture

### Core Components

#### 1. SyncOrchestrator (New)
```typescript
class SyncOrchestrator {
  // Priority queue
  private queue: PriorityQueue<SyncTask>

  // State management
  private currentSync: SyncTask | null
  private isPaused: boolean
  private healthStatus: OrchestratorHealth

  // Scheduling
  private schedules: Map<SyncType, ScheduleConfig>

  // Error handling
  private errorTracker: ErrorTracker
  private deadLetterQueue: DeadLetterQueue

  // Monitoring
  private metricsCollector: MetricsCollector
  private progressEmitter: EventEmitter

  async start(): Promise<void>
  async pause(): Promise<void>
  async resume(): Promise<void>
  async shutdown(): Promise<void>

  async queueSync(task: SyncTask): Promise<void>
  async processTasks(): Promise<void>

  getHealth(): OrchestratorHealth
  getMetrics(): OrchestratorMetrics
}
```

#### 2. Priority Queue
```typescript
interface SyncTask {
  id: string
  type: 'customers' | 'orders' | 'products' | 'prices'
  mode: 'full' | 'delta' | 'manual'
  priority: number // 1-100 (higher = more important)
  userId?: string
  triggeredBy: 'scheduler' | 'manual' | 'admin'
  scheduledAt: number
  attempts: number
  maxAttempts: number
}

enum SyncPriority {
  MANUAL = 100,        // User triggered
  CUSTOMERS = 80,      // High priority
  ORDERS = 60,         // Medium-high
  PRODUCTS = 40,       // Medium
  PRICES = 20          // Low priority
}
```

#### 3. Schedule Config
```typescript
interface ScheduleConfig {
  enabled: boolean
  fullEvery: number    // hours
  deltaEvery: number   // hours
  quietHours: {        // No sync during these hours
    start: number      // 0-23
    end: number        // 0-23
  }
  maxConcurrent: number
  retryPolicy: RetryPolicy
}

interface RetryPolicy {
  maxAttempts: number
  backoffMultiplier: number
  initialDelayMs: number
  maxDelayMs: number
}
```

#### 4. Metrics & Monitoring
```typescript
interface OrchestratorMetrics {
  // Current state
  status: 'running' | 'paused' | 'error'
  currentTask: SyncTask | null
  queueDepth: number

  // Historical
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  avgDuration: number

  // Per-type stats
  byType: {
    [key in SyncType]: {
      lastSync: number
      lastSuccess: number
      lastFailure: number
      successRate: number
      avgDuration: number
    }
  }
}

interface OrchestratorHealth {
  healthy: boolean
  status: string
  uptime: number
  lastError?: {
    message: string
    timestamp: number
    type: SyncType
  }
}
```

#### 5. WebSocket Progress Updates
```typescript
interface SyncProgressEvent {
  taskId: string
  type: SyncType
  status: 'queued' | 'running' | 'completed' | 'error'
  progress: {
    current: number
    total: number
    percentage: number
  }
  startedAt?: number
  completedAt?: number
  error?: string
}

// Frontend subscribes to real-time updates
socket.on('sync:progress', (event: SyncProgressEvent) => {
  updateSyncStatusUI(event)
})
```

### Database Schema Updates

#### sync_tasks Table
```sql
CREATE TABLE sync_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  mode TEXT NOT NULL,
  priority INTEGER NOT NULL,
  user_id TEXT,
  triggered_by TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  status TEXT DEFAULT 'queued',
  result TEXT,
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_sync_tasks_status ON sync_tasks(status);
CREATE INDEX idx_sync_tasks_type ON sync_tasks(type);
CREATE INDEX idx_sync_tasks_scheduled ON sync_tasks(scheduled_at);
```

#### orchestrator_state Table
```sql
CREATE TABLE orchestrator_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- State keys:
-- 'status': 'running' | 'paused'
-- 'current_task_id': string | null
-- 'last_error': JSON
-- 'uptime_started_at': timestamp
```

## Implementation Plan

### Phase 20.1: Core Orchestrator
- [ ] Create SyncOrchestrator class
- [ ] Implement priority queue
- [ ] Add schedule config system
- [ ] Create database schema
- [ ] Implement graceful startup/shutdown

### Phase 20.2: Error Recovery
- [ ] Implement retry logic with exponential backoff
- [ ] Create dead letter queue
- [ ] Add error tracking and alerting
- [ ] Implement health check endpoint

### Phase 20.3: Real-Time Monitoring
- [ ] WebSocket server for progress updates
- [ ] Frontend sync status widget
- [ ] Admin dashboard page
- [ ] Prometheus metrics exporter

### Phase 20.4: Smart Scheduling
- [ ] Adaptive interval calculation
- [ ] Quiet hours implementation
- [ ] Delta sync optimization
- [ ] Load balancing logic

### Phase 20.5: Testing & Deployment
- [ ] Integration tests
- [ ] Load testing
- [ ] Monitoring setup
- [ ] Production deployment
- [ ] Re-enable automatic sync

## Success Metrics

1. **Reliability**: 99%+ success rate for scheduled syncs
2. **Performance**: < 5 min average sync duration
3. **Observability**: Real-time sync status visible in dashboard
4. **Error Recovery**: Auto-recovery from transient failures
5. **User Experience**: Manual sync takes precedence within 10s

## References

### Existing Code to Leverage
- `sync-scheduler.ts` - Current scheduler (to be replaced)
- `customer-sync-service.ts` - Customer sync logic (keep)
- `product-sync-service.ts` - Product sync logic (keep)
- `price-sync-service.ts` - Price sync logic (keep)
- `browser-pool.ts` - Multi-layer Italian localization (keep)
- `archibald-bot.ts` - PDF download with Italian forcing (keep)

### Best Practices from Phase 19
- ✅ Multi-layer localization (Browser + ENV + HTTP)
- ✅ Service user authentication
- ✅ Health check endpoints
- ✅ Detailed logging
- ✅ Error propagation

## Migration Strategy

1. **Phase 20 Development**: Build orchestrator alongside existing system
2. **Testing**: Run orchestrator in shadow mode (no actual sync)
3. **Gradual Rollout**: Enable one sync type at a time
4. **Monitoring**: Watch metrics for 48h per type
5. **Cleanup**: Remove old scheduler code once stable

## Notes

- Keep manual sync always available (user control)
- Prioritize customers > orders > products > prices
- Use same multi-layer Italian localization
- Maintain backward compatibility with existing API
- Log everything for debugging
- Design for horizontal scaling (future Redis queue)

---

**Status**: Planning Phase
**Owner**: To be assigned
**Target**: Post Phase 19 (Manual sync validated)
**Priority**: High (needed before production scaling)
