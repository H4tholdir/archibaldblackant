---
phase: 30-websocket-client-reconnect
plan: 01
subsystem: frontend
tags: [websocket, react, hooks, offline-queue, auto-reconnect, exponential-backoff, typescript]

# Dependency graph
requires:
  - phase: 29-websocket-server-infrastructure
    provides: WebSocket server at ws://localhost:3000/ws/realtime with JWT auth
  - phase: 06-multi-user-authentication
    provides: JWT token storage in localStorage
provides:
  - Frontend WebSocket client hook with auto-reconnect
  - Offline queue with localStorage persistence
  - Event subscription pattern for real-time updates
  - Exponential backoff reconnection strategy
affects: [31-draft-orders-realtime-sync, 32-pending-orders-realtime-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [react-custom-hooks, event-subscription, offline-queue, exponential-backoff]

key-files:
  created: [archibald-web-app/frontend/src/hooks/useWebSocket.ts, archibald-web-app/frontend/src/services/websocket-queue.ts, archibald-web-app/frontend/src/types/websocket.ts]
  modified: []

key-decisions:
  - "Exponential backoff: 1s initial, 30s max, 2x multiplier prevents server overload"
  - "Offline queue max 100 items with 24h auto-cleanup prevents memory issues"
  - "localStorage key 'wsOfflineQueue' for queue persistence across sessions"
  - "Event subscription callback pattern with unsubscribe function return"
  - "Browser native WebSocket API (no external library) for simplicity"
  - "JWT token from localStorage key 'archibald_jwt' (Phase 6 convention)"

patterns-established:
  - "Custom React hook useWebSocket() with useRef for instance persistence"
  - "Event handlers Map<eventType, Set<callback>> for efficient subscriptions"
  - "Offline queue singleton pattern with localStorage sync on every operation"
  - "Auto-reconnect with exponential backoff capped at 30s"
  - "Cleanup on unmount prevents memory leaks"

issues-created: []

# Metrics
duration: 3min
completed: 2026-02-05
---

# Phase 30 Plan 01: WebSocket Client & Auto-Reconnect Summary

**Frontend WebSocket client con auto-reconnect, exponential backoff (1s→30s), offline queue (max 100 items), event subscriptions pronto per draft/pending real-time sync**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-05T10:31:55Z
- **Completed:** 2026-02-05T10:35:09Z
- **Tasks:** 3 (2 auto + 1 checkpoint automated)
- **Files modified:** 3

## Accomplishments

- **useWebSocket custom React hook** con full connection lifecycle management
- Connection states: `connecting`, `connected`, `disconnected`, `reconnecting`
- **Auto-reconnect** con exponential backoff (1s initial → 30s max, 2x multiplier)
- **Event subscription pattern**: `subscribe(eventType, callback)` returns unsubscribe function
- **Send method**: `send(type, payload)` con automatic offline queueing quando disconnesso
- **WebSocketQueue singleton service** con localStorage persistence
- Queue methods: `enqueue()`, `dequeue()`, `dequeueAll()`, `clear()`, `getAll()`, `size()`
- **Max queue size**: 100 items (enforced automatically)
- **Auto-cleanup**: removes items older than 24h on initialization
- **JWT authentication** da localStorage (`archibald_jwt` key from Phase 6)
- **Proper cleanup** on unmount to prevent memory leaks
- All React hooks follow best practices (no dependency warnings)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WebSocket Client Service Hook** - `af27159` (feat)
2. **Task 2: Implement Offline Queue with localStorage Persistence** - `0183eb8` (feat)

**Plan metadata:** (current commit)

## Files Created/Modified

- `archibald-web-app/frontend/src/hooks/useWebSocket.ts` - Custom React hook (279 lines): WebSocket connection management, auto-reconnect with exponential backoff, event subscription pattern, send method with offline queue integration, JWT auth from localStorage, proper cleanup on unmount
- `archibald-web-app/frontend/src/services/websocket-queue.ts` - Offline queue service (142 lines): Singleton class managing queue with localStorage persistence, max 100 items enforcement, 24h auto-cleanup, methods for enqueue/dequeue/clear/getAll/size
- `archibald-web-app/frontend/src/types/websocket.ts` - TypeScript types (23 lines): WebSocketState, WebSocketEvent, WebSocketEventHandler, WebSocketHookReturn interfaces

## Decisions Made

- **Exponential backoff strategy**: 1s initial delay, 30s max delay, 2x multiplier - prevents server overload during reconnection attempts
- **Offline queue max size**: 100 items - prevents unbounded memory growth while supporting typical offline scenarios
- **Queue persistence**: localStorage with key `wsOfflineQueue` - survives page refreshes and browser restarts
- **Auto-cleanup**: Items older than 24h removed on initialization - prevents stale operations from accumulating
- **Event subscription pattern**: Callback-based with unsubscribe function return - React-friendly, prevents memory leaks
- **No external WebSocket library**: Browser native API sufficient for our needs, reduces bundle size
- **JWT token source**: localStorage key `archibald_jwt` - consistent with Phase 6 authentication pattern
- **Connection endpoint**: `ws://localhost:3000/ws/realtime` (dev), configurable via `VITE_WS_HOST` for production

## Deviations from Plan

None - plan executed exactly as written.

## Automated Testing Results

All tests executed and passed:

1. ✅ TypeScript compilation: Success (npm run build)
2. ✅ Files exist and importable: useWebSocket and WebSocketQueue found
3. ✅ React hooks used correctly: useState, useEffect, useRef, useCallback all present
4. ✅ WebSocketQueue methods: enqueue, dequeue, dequeueAll, clear, getAll, size implemented
5. ✅ Max queue size: 100 items constant verified
6. ✅ Exponential backoff: 1s initial, 30s max, 2x multiplier verified
7. ✅ localStorage persistence: "wsOfflineQueue" key verified
8. ✅ TypeScript types: All interfaces properly defined

## Issues Encountered

None - implementation proceeded smoothly with all verifications passing on first attempt.

## Next Phase Readiness

Ready for Phase 31: Draft Orders Real-Time Sync

**What's ready:**
- WebSocket client infrastructure complete with auto-reconnect
- Event subscription pattern ready for `DRAFT_CREATED`, `DRAFT_UPDATED`, `DRAFT_DELETED`, `DRAFT_CONVERTED` events
- Offline queue ready for CREATE/UPDATE/DELETE operations during network interruptions
- Automatic queue replay on reconnect ensures no data loss
- Max queue size and auto-cleanup prevent memory issues

**What Phase 31 needs to implement:**
- Subscribe to DRAFT_* events from server
- Handle draft creation/update/deletion events
- Update local IndexedDB on event receipt
- Trigger UI updates via React state
- Remove polling mechanism (15s interval)
- Eliminate tombstone pattern (deferred to Phase 33)

**Integration points:**
- Server endpoint: `ws://localhost:3000/ws/realtime` (Phase 29)
- JWT authentication: localStorage `archibald_jwt` (Phase 6)
- Event types: DRAFT_CREATED, DRAFT_UPDATED, DRAFT_DELETED, DRAFT_CONVERTED (Phase 29 server)

---
*Phase: 30-websocket-client-reconnect*
*Completed: 2026-02-05*
