---
phase: 25-sync-monitoring-dashboard
date: 2026-01-22
---

<vision>
## How This Should Work

When an admin opens the Sync Monitoring Dashboard, they see **6 cards** (one per sync type: Orders, Customers, Products, Prices, DDT, Invoices).

**Each card shows:**
- **Status section** (top): Real-time status with health indicator (🟢/🟡/🔴), current state (Running/Success/Error/Idle), last execution timestamp, duration, and next scheduled execution time
- **Sync interval configuration**: Editable input field showing current interval (e.g., "10 minutes") with a save button to modify it
- **History table** (below status): Chronological list of past executions for that sync type, showing timestamp, duration, success/failure, and error preview if failed

**User interactions:**
1. **View status**: Cards auto-refresh every 5 seconds (same pattern as SyncControlPanel from Phase 23) to show live sync activity
2. **Configure intervals**: Admin can change the sync interval for any type (e.g., Orders from 10min → 15min) and save - the backend updates the orchestrator scheduling
3. **Inspect errors**: When a sync fails (red indicator), the history row shows an error preview. Clicking on it opens a **modal popup** with full error details: error message, stack trace, timestamp, and execution context
4. **Adjust history size**: Dropdown at top of each card allows admin to choose how many past executions to display: 10 / 20 / 50 / 100 (default: 20)

**Visual organization:**
- 6 cards arranged in grid (2 columns on desktop, 1 column on mobile)
- Each card is self-contained: status at top, config in middle, history at bottom
- Color coding: Green (healthy), Orange (degraded/warning), Red (error), Blue (running)
- Consistent with existing SyncControlPanel design (inline styles, semantic colors)

**Data flow:**
- Dashboard polls `GET /api/sync/monitoring/status` every 5 seconds
- Returns: current status for all 6 types + last N executions per type (N = user's history size setting)
- Interval changes sent to `POST /api/sync/intervals/:type` with new value
- Backend updates orchestrator scheduling dynamically (stopAutoSync → update config → startAutoSync)

</vision>

<essential>
## What Must Be Nailed

1. **Real-time status for all 6 sync types** - Dashboard shows live state (running/success/error/idle) with health indicators for: orders, customers, products, prices, ddt, invoices

2. **Execution times (duration + timestamps)** - Every sync execution must display:
   - When it ran (timestamp)
   - How long it took (duration in seconds/minutes)
   - When next execution is scheduled (for active auto-sync)

3. **Full error details with stack traces** - When a sync fails:
   - Modal popup triggered by clicking error row
   - Full error message
   - Complete stack trace for debugging
   - Execution context (which sync type, timestamp, what was being synced)

4. **Chronological history per sync type** - Each card shows last N executions:
   - Configurable by user (10/20/50/100 via dropdown)
   - Sorted newest first
   - Success/failure clearly indicated
   - Error preview visible in row (first 50 chars of error message)

5. **Editable sync intervals** - Admin can modify scheduling:
   - Input field showing current interval (e.g., "10 minutes")
   - Save button to apply changes
   - Backend updates orchestrator scheduling dynamically
   - Validation: intervals must be ≥ 5 minutes

6. **Auto-refresh every 5 seconds** - Consistent with SyncControlPanel pattern:
   - Automatic polling during active syncs
   - No WebSocket complexity
   - Immediate feedback when sync states change

</essential>

<boundaries>
## What's Out of Scope

1. **Email/Slack notifications** - No automatic alerts when syncs fail. Dashboard is purely UI-based monitoring. Notifications could be Phase 26+.

2. **Advanced filtering/search in logs** - No full-text search, date range filters, or complex queries. Just simple chronological list. Advanced search could be Phase 26+.

3. **Export logs to CSV/JSON** - No download/export functionality. Dashboard is view-only for history. Export could be Phase 26+.

4. **WebSocket real-time push** - Stick with polling (5s interval). WebSocket adds complexity without major benefit for 5s refresh rate.

5. **Sync execution control from dashboard** - This dashboard is monitoring-only. Start/stop sync buttons remain in SyncControlPanel (Phase 23). No duplicate controls.

6. **User permissions/role management** - Admin-only access (JWT + requireAdmin middleware). No granular permissions for different admin types.

</boundaries>

<specifics>
## Specific Ideas

**Layout Structure:**
- 6 cards in CSS grid: `grid-template-columns: repeat(auto-fit, minmax(500px, 1fr))`
- Card order by priority: Orders, Customers, Products, Prices, DDT, Invoices
- Each card has 3 sections:
  1. Status section (colored border based on health)
  2. Configuration section (interval input + save button)
  3. History section (table with scrollable area if > 10 rows)

**Status Indicators:**
- 🟢 Healthy: Last sync succeeded, no recent errors
- 🟡 Degraded: Last sync succeeded but had warnings/retries
- 🔴 Unhealthy: Last sync failed with error
- 🔵 Running: Sync currently executing (animated spinner)

**History Table Columns:**
- Timestamp (relative time: "2 minutes ago" + absolute on hover)
- Duration (e.g., "1.2s", "45s", "2m 15s")
- Status (✅ Success / ❌ Error badge)
- Error preview (first 50 chars of error message, truncated with "...")
- Action (👁️ "View Details" button → opens modal)

**Interval Configuration:**
- Input field with validation (min 5 minutes, max 1440 minutes = 24 hours)
- Save button disabled during active sync for that type
- Success message: "✅ Interval updated to X minutes. Next sync at HH:MM"
- Error handling: validation failures, orchestrator update failures

**Error Modal:**
- Width: 80vw, max-width: 900px
- Sections:
  - Header: Sync type + timestamp
  - Error Message (red box with full text)
  - Stack Trace (monospace font, scrollable)
  - Context: what was being synced (e.g., "Syncing orders from 2025-01-01 to 2025-01-22")
- Close button + click outside to dismiss

**API Endpoints Needed:**
- `GET /api/sync/monitoring/status` - Returns status + history for all 6 types
  - Response: `{ success: true, types: { orders: { status, lastRun, nextRun, duration, health, history: [...] }, ... } }`
- `GET /api/sync/monitoring/history/:type?limit=20` - Get history for specific type
- `POST /api/sync/intervals/:type` - Update interval for sync type
  - Body: `{ intervalMinutes: 15 }`
  - Validates, stops auto-sync, updates config, restarts auto-sync
- `GET /api/sync/intervals` - Get current intervals for all types

**Backend Changes:**
- Add `syncHistory` tracking to SyncOrchestrator:
  - In-memory array (max 100 entries per type)
  - Store: `{ timestamp, duration, success, error, syncType }`
  - Persist to DB? Optional - could use SQLite table `sync_history`
- Add `updateInterval(type, minutes)` method to SyncOrchestrator:
  - Stop auto-sync
  - Update internal config
  - Restart auto-sync with new intervals
- Extend `isAutoSyncRunning()` to return more details:
  - Current intervals per type
  - Next scheduled execution times

**Frontend Component:**
- `SyncMonitoringDashboard.tsx` - Main component with 6 cards
- `SyncMonitorCard.tsx` - Individual card component (reusable)
- `SyncHistoryTable.tsx` - History table with pagination
- `ErrorDetailsModal.tsx` - Modal for full error display
- State management: useState for status, history, intervals, modal state
- Polling: useEffect with 5s setInterval (cleanup on unmount)

**Integration:**
- Add to AdminPage.tsx after SyncControlPanel
- New section: "📊 Sync Monitoring Dashboard"
- Both panels visible: SyncControlPanel (manual controls) + SyncMonitoringDashboard (monitoring/config)

**References:**
- Phase 23 (SyncControlPanel): Reuse polling pattern, inline styles, color scheme
- Phase 24 (Background Sync): Integrate with orchestrator's auto-sync system
- Phase 10-06 (Banking App): Inline-styled card layouts, modal patterns

</specifics>
