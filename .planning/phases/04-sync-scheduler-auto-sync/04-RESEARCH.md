# Phase 4: Sync Scheduler & Auto-Sync - Research

**Researched:** 2026-02-20
**Domain:** Node.js scheduling patterns, BullMQ, PostgreSQL settings persistence
**Confidence:** HIGH

<research_summary>
## Summary

Phase 4 fixes an existing but non-functional sync scheduler infrastructure. The codebase already has both frontend UI components (SyncControlPanel, SyncMonitoringDashboard) and a backend scheduler (sync-scheduler.ts), but they are disconnected: the scheduler is never started at bootstrap, `getActiveAgentIds` reads from the wrong source (active jobs instead of DB users), and interval configuration has no persistence layer.

The key architectural decision is **setInterval vs BullMQ Job Schedulers** for recurring sync jobs. After analysis, the recommendation is to keep the current `setInterval` pattern because it cleanly separates scheduling from job processing and handles the dynamic agent list naturally. BullMQ Job Schedulers (`upsertJobScheduler`) would require one scheduler per (agent, sync-type) combination and dynamic management when agents are added/removed — unnecessary complexity.

**Primary recommendation:** Fix the existing architecture (bootstrap scheduler, fix agent source, add DB persistence for intervals, implement missing scheduler methods) rather than redesign. The UI components are already built and expect specific API contracts — honor them.
</research_summary>

<standard_stack>
## Standard Stack

No new libraries needed. All technologies already in use:

### Core (already in project)
| Library | Purpose | Status |
|---------|---------|--------|
| BullMQ | Job queue for sync operations | Working, already processes syncs |
| PostgreSQL (pg) | Database for settings persistence | Working, needs new table |
| Express | API routes for sync control | Working, routes exist but some endpoints return 501 |
| React | Frontend admin panels | Working, SyncControlPanel + SyncMonitoringDashboard exist |

### No New Dependencies Required
This phase is entirely about wiring existing pieces together and filling implementation gaps.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Current Architecture (keep this)
```
┌──────────────────┐     setInterval      ┌──────────────────┐
│  SyncScheduler   │ ──────────────────>  │  OperationQueue  │
│  (setInterval)   │     enqueue()        │  (BullMQ)        │
│                  │                      │                  │
│  getActiveAgents │                      │  Worker processes │
│  per-type timers │                      │  sync handlers   │
└──────────────────┘                      └──────────────────┘
         │                                         │
         │ reads agent IDs                         │ reads/writes
         v                                         v
┌──────────────────┐                      ┌──────────────────┐
│  agents.users    │                      │  Agent data      │
│  (whitelisted)   │                      │  tables          │
└──────────────────┘                      └──────────────────┘
```

### Pattern 1: Per-Type Interval Scheduling
**What:** Instead of two groups (agentSyncMs, sharedSyncMs), use individual timers per sync type
**Why:** User wants granular control per sync type from UI
**Implementation:**
```typescript
type SyncTypeIntervals = {
  orders: number;      // ms
  customers: number;
  products: number;
  prices: number;
  ddt: number;
  invoices: number;
};

// One timer per sync type instead of two group timers
const timers: Map<string, NodeJS.Timeout> = new Map();
```

### Pattern 2: Settings Persistence with DB
**What:** Store sync intervals in PostgreSQL, load at bootstrap, save on admin change
**Why:** Intervals must survive server restarts
**Implementation:**
```sql
CREATE TABLE IF NOT EXISTS system.sync_settings (
  sync_type TEXT PRIMARY KEY,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Pattern 3: Agent Registry from DB
**What:** Replace `agentLock.getAllActive().keys()` with DB query for whitelisted users
**Why:** agentLock only tracks users with active jobs, not all users who need syncing
**Existing function:** `usersRepo.getWhitelistedUsers(pool)` already exists in `db/repositories/users.ts:181`
**Key change:** `getActiveAgentIds` becomes async: `() => Promise<string[]>`

### Anti-Patterns to Avoid
- **BullMQ Job Schedulers for this use case:** `upsertJobScheduler` creates one scheduler per job type in Redis. With N agents x 4 agent-sync-types, you'd need to dynamically manage NxM schedulers when agents are added/removed. setInterval + enqueue is simpler.
- **Restarting all timers on single interval change:** When admin changes one sync type interval, only restart that type's timer, not all timers.
- **Blocking DB queries in timer callbacks:** `getWhitelistedUsers` is async — the timer callback must handle this properly without blocking the event loop.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent list for sync | Custom tracking of "active agents" | `usersRepo.getWhitelistedUsers(pool)` | Already exists, queries `agents.users WHERE whitelisted = TRUE` |
| Settings persistence | File-based config or env-only | PostgreSQL `system.sync_settings` table | DB is already the persistence layer, env vars are for defaults only |
| Interval validation | Custom validation | Zod schema (already in sync-status.ts) | `intervalSchema` already validates min:5, max:1440 |
| Job deduplication | Custom dedup logic | BullMQ built-in deduplication | Already configured for sync jobs in operation-queue.ts |

**Key insight:** Most of the "new" functionality already has partial implementations scattered across the codebase. The work is connecting pieces, not building new ones.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Timer Drift with setInterval
**What goes wrong:** setInterval does not guarantee exact timing; under load, intervals drift
**Why it happens:** Node.js event loop busy with sync processing delays timer execution
**How to avoid:** Accept drift — for sync intervals of 5+ minutes, sub-second drift is irrelevant. Do NOT use cron libraries for this — overkill.
**Warning signs:** N/A — drift is not a real problem at these timescales

### Pitfall 2: Race Condition on Interval Update
**What goes wrong:** Admin changes interval while timer callback is executing → old timer fires, new timer fires, duplicate syncs enqueued
**How to avoid:** clearInterval the old timer BEFORE starting the new one. BullMQ deduplication is the safety net — duplicate enqueues are already deduplicated by `${type}-${userId}` key.
**Warning signs:** Duplicate sync jobs in queue after interval change

### Pitfall 3: getWhitelistedUsers Query on Every Timer Tick
**What goes wrong:** If timer fires every 5 minutes for 6 types, that's a DB query every ~50 seconds
**Why it happens:** Each timer independently queries for whitelisted users
**How to avoid:** Cache the user list with a TTL (e.g., 60 seconds). Or batch: when any timer fires for an agent-specific sync, fetch the list once and share across the enqueue calls.
**Warning signs:** High DB connection usage from repeated simple queries

### Pitfall 4: Customer Sync Parser Failure Deletes Valid Data
**What goes wrong:** PDF download incomplete → parser sees fewer customers → deletes existing ones → data loss
**Why it happens:** Sync uses "delete all + re-insert" pattern
**How to avoid:** Validate parser output before committing: if customer count drops by >50% vs last known count, flag as suspicious and skip with warning. Use transaction + rollback on validation failure.
**Warning signs:** Customer count drops suddenly after a sync cycle

### Pitfall 5: Scheduler Not Stopped Before Server Shutdown
**What goes wrong:** setInterval timers keep firing during graceful shutdown → jobs enqueued into draining queue
**How to avoid:** Already handled in main.ts line 287: `syncScheduler.stop()` is called on shutdown
**Warning signs:** Jobs appear in queue after shutdown signal
</common_pitfalls>

<code_examples>
## Code Examples

### Existing: SyncScheduler Creation (main.ts:150-153)
```typescript
// CURRENT (broken): uses agentLock for active IDs
const syncScheduler = createSyncScheduler(
  queue.enqueue.bind(queue),
  () => Array.from(agentLock.getAllActive().keys()),  // BUG: only active jobs
);
// scheduler.start() is NEVER called
```

### Fix: SyncScheduler with DB-backed Agent IDs
```typescript
// FIXED: use DB for whitelisted users, async callback
const syncScheduler = createSyncScheduler(
  queue.enqueue.bind(queue),
  async () => {
    const users = await usersRepo.getWhitelistedUsers(pool);
    return users.map(u => u.id);
  },
);

// Start at bootstrap with intervals from DB (or defaults from env)
const savedIntervals = await syncSettingsRepo.getAllIntervals(pool);
syncScheduler.start(savedIntervals);
```

### Existing: SyncMonitoringDashboard Already Has Interval UI
```typescript
// SyncMonitoringDashboard.tsx already has:
// - Per-type interval input fields (min 5, max 1440 minutes)
// - Save button per type
// - POST /api/sync/intervals/:type with { intervalMinutes: number }
// - fetchIntervals() → GET /api/sync/intervals
```

### Existing: sync-status.ts Route for Interval Update
```typescript
// sync-status.ts:170-206 - Route EXISTS but returns 501 because
// syncScheduler.updateInterval is undefined
router.post('/intervals/:type', async (req: AuthRequest, res) => {
  // Validates type ∈ {orders, customers, products, prices, ddt, invoices}
  // Validates intervalMinutes ∈ [5, 1440] via Zod
  // Calls syncScheduler.updateInterval(type, intervalMinutes) — NOT IMPLEMENTED
});
```

### DB Migration for sync_settings
```sql
-- New migration needed
CREATE TABLE IF NOT EXISTS system.sync_settings (
  sync_type TEXT PRIMARY KEY
    CHECK (sync_type IN ('orders', 'customers', 'products', 'prices', 'ddt', 'invoices')),
  interval_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (interval_minutes BETWEEN 5 AND 1440),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO system.sync_settings (sync_type, interval_minutes) VALUES
  ('orders', 10),
  ('customers', 15),
  ('products', 30),
  ('prices', 60),
  ('ddt', 20),
  ('invoices', 20)
ON CONFLICT (sync_type) DO NOTHING;
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `queue.add(name, data, { repeat: { every } })` | `queue.upsertJobScheduler(id, { every }, template)` | BullMQ v5+ | New API for repeatable jobs, but NOT recommended for this use case (see architecture notes) |
| Two interval groups (agent/shared) | Per-type intervals | This phase | Matches existing UI expectations in SyncMonitoringDashboard |

**BullMQ `upsertJobScheduler` consideration:**
The modern BullMQ way to schedule recurring jobs is `upsertJobScheduler`. It stores the schedule in Redis and survives restarts. However, for Archibald:
- Agent-specific syncs need to run for ALL whitelisted users → one scheduler per (user, type) → dynamic management overhead
- The existing setInterval + enqueue pattern is simpler and the UI already expects it
- **Verdict: Keep setInterval, persist intervals in PostgreSQL**

**No deprecated patterns in use.**
</sota_updates>

<open_questions>
## Open Questions

1. **Default interval values**
   - What we know: SyncMonitoringDashboard tests suggest orders=10, customers=15, products=30, prices=60, ddt=20, invoices=20 (minutes)
   - What's unclear: Are these the desired production defaults?
   - Recommendation: Use these as defaults in the migration seed data, configurable via env vars for override

2. **Agent sync types: which are per-agent vs shared?**
   - What we know: Current scheduler treats customers/orders/ddt/invoices as per-agent, products/prices as shared (service-account)
   - What's unclear: Is this correct? Should DDT and invoices be per-agent?
   - Recommendation: Keep current grouping, it matches the data model (each agent has their own customers/orders/DDT/invoices, but products/prices are shared across all agents)
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Codebase analysis: sync-scheduler.ts, sync-status.ts, SyncControlPanel.tsx, SyncMonitoringDashboard.tsx, main.ts, server.ts, config.ts
- Codebase analysis: db/repositories/users.ts (getWhitelistedUsers already exists)
- Codebase analysis: db/migrations/003-agent-tables.sql (agents.users schema with whitelisted column)
- Context7 /taskforcesh/bullmq — upsertJobScheduler API, repeatable jobs patterns

### Secondary (MEDIUM confidence)
- BullMQ documentation — repeatable jobs vs job schedulers migration guidance

### Tertiary (LOW confidence)
- None — all findings from codebase analysis and official BullMQ docs
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Node.js setInterval scheduling, BullMQ integration
- Ecosystem: PostgreSQL settings persistence, Express API routes
- Patterns: Per-type scheduling, DB-backed config, agent registry from users table
- Pitfalls: Timer drift, race conditions, parser failures, cache strategy

**Confidence breakdown:**
- Standard stack: HIGH — all technologies already in project, no new deps
- Architecture: HIGH — based on existing codebase patterns and contracts
- Pitfalls: HIGH — derived from existing code analysis
- Code examples: HIGH — from actual project files

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days — stable, no external ecosystem changes)
</metadata>

---

*Phase: 04-sync-scheduler-auto-sync*
*Research completed: 2026-02-20*
*Ready for planning: yes*
