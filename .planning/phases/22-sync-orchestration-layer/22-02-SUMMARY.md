# Phase 22, Plan 02: Staggered Scheduling - Summary

**Status**: ✅ Complete
**Date**: 2026-01-22

## Objective

Implement staggered sync scheduling with approved frequencies and start-time offsets to prevent resource spikes.

## What Was Built

### 1. Staggered Auto-Sync Scheduling (`sync-orchestrator.ts`)

**Commit**: `d46dd29` - feat(22-02): add staggered scheduling to SyncOrchestrator

Added staggered scheduling functionality to SyncOrchestrator with:

- **Timer Management**:
  - `autoSyncTimers: NodeJS.Timeout[]` - Track setTimeout IDs for initial delays
  - `autoSyncIntervals: NodeJS.Timeout[]` - Track setInterval IDs for recurring syncs

- **startStaggeredAutoSync() Method**:
  - Configures 6 sync types with variable intervals based on research-approved frequencies
  - Implements 5-minute staggered start times to prevent resource spikes
  - Logs comprehensive startup information for monitoring

- **Approved Sync Frequencies**:
  - **Orders**: 10min (T+0) - High priority, real-time data (90% customers expect <15min)
  - **Customers**: 30min (T+5) - Medium priority, needed for orders
  - **Prices**: 30min (T+10) - CRITICAL, pricing errors cause 1.8% margin loss
  - **Invoices**: 30min (T+15) - Financial data, important
  - **DDT**: 45min (T+20) - Transport documents, less frequent
  - **Products**: 90min (T+30) - Catalog changes rare, save resources

- **stopAutoSync() Method**:
  - Cleans up all setTimeout and setInterval timers
  - Prevents memory leaks when stopping auto-sync
  - Logs cleanup for monitoring

**Key Design Decisions**:
- Variable intervals (10min to 90min) optimized per entity freshness requirements
- 5-minute staggering prevents all syncs from starting simultaneously
- Separate tracking of initial timers vs recurring intervals for proper cleanup
- Uses `requestSync()` to leverage existing mutex and queueing

### 2. Sync Schedule Configuration Endpoints (`index.ts`)

**Commit**: `1f6a721` - feat(22-02): add configurable sync schedule endpoints

Added two new API endpoints for schedule configuration:

- **GET /api/sync/schedule**: Returns current sync schedule configuration
  ```json
  {
    "success": true,
    "data": {
      "orders": { "interval": 10, "startDelay": 0, "unit": "minutes" },
      "customers": { "interval": 30, "startDelay": 5, "unit": "minutes" },
      "prices": { "interval": 30, "startDelay": 10, "unit": "minutes" },
      "invoices": { "interval": 30, "startDelay": 15, "unit": "minutes" },
      "ddt": { "interval": 45, "startDelay": 20, "unit": "minutes" },
      "products": { "interval": 90, "startDelay": 30, "unit": "minutes" }
    }
  }
  ```

- **POST /api/sync/schedule**: Validates input for future dynamic reconfiguration
  - Validates sync type (must be one of 6 valid types)
  - Validates interval range (5-180 minutes)
  - Returns current configuration with TODO for dynamic implementation
  - Includes admin-only comment for future role-based access control

**Design Decisions**:
- GET endpoint for monitoring and visibility of current schedule
- POST endpoint validates input but returns fixed config (future-proofing)
- Changed response type from `Response<ApiResponse>` to `Response` to allow `currentConfig` field
- Includes unit field ("minutes") for clarity in API responses

## Files Changed

### Modified
- `archibald-web-app/backend/src/sync-orchestrator.ts` - Added timer tracking, startStaggeredAutoSync(), stopAutoSync()
- `archibald-web-app/backend/src/index.ts` - Added GET and POST /api/sync/schedule endpoints

## Testing Performed

- ✅ TypeScript type checking passes (backend)
- ✅ Manual code review of scheduling logic
- ✅ Verified timer management (setTimeout + setInterval)
- ✅ Verified cleanup logic (clearTimeout + clearInterval)
- ✅ Verified staggered start times (T+0, T+5, T+10, T+15, T+20, T+30)
- ✅ Verified approved frequencies (10min, 30min, 30min, 30min, 45min, 90min)
- ✅ Verified endpoint input validation

## Architectural Decisions

1. **Variable Intervals**: Different sync frequencies based on entity requirements rather than uniform interval for all
2. **Staggered Starts**: 5-minute offsets prevent resource spikes when multiple syncs would otherwise start simultaneously
3. **Timer Tracking**: Separate arrays for setTimeout and setInterval enable proper cleanup
4. **Future-Proofing**: POST endpoint validates input for future dynamic reconfiguration without implementing it yet
5. **Delegation to requestSync()**: Leverages existing mutex and priority queueing instead of bypassing orchestrator

## Research-Based Intervals

The variable intervals are based on research findings:

- **Orders (10min)**: 90% of customers expect order visibility within 15 minutes; 10-minute sync provides buffer
- **Prices (30min)**: Pricing errors cause 1.8% margin loss; 30-minute sync balances freshness with resource usage
- **Products (90min)**: Catalog changes are rare; longer interval saves resources without impacting user experience
- **Others (30-45min)**: Balanced between data freshness requirements and system load

## Known Limitations

1. **No Dynamic Reconfiguration**: Schedule is fixed at startup; changing intervals requires restart
2. **No Timezone Awareness**: Start delays are relative to server startup, not clock time
3. **No Conditional Scheduling**: Syncs run at fixed intervals regardless of data change frequency
4. **No Integration Call**: Backend doesn't automatically call `startStaggeredAutoSync()` on startup (will be added in Plan 22-03)

## Next Steps

Per ROADMAP.md, proceed with:
- **Plan 22-03**: Comprehensive testing and verification checkpoint
  - Integrate auto-sync into backend startup
  - Test full orchestration flow
  - Verify mutex prevents overlapping syncs
  - Verify Smart Customer Sync interactions
  - Document final architecture

## Metrics

- **Files Created**: 1 (SUMMARY.md)
- **Files Modified**: 2 (sync-orchestrator.ts, index.ts)
- **Lines Added**: ~150
- **Lines Removed**: ~0
- **Commits**: 2 (per-task atomic commits)
- **Build Status**: ✅ Passing
- **Type Check**: ✅ Passing
