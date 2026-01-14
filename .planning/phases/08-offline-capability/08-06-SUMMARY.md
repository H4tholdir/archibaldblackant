---
phase: 08-offline-capability
plan: 06
status: completed
type: execute
date: 2026-01-14
---

# Phase 8.6 Summary: Offline Indicator UI

## Objective
Implement network status detection and banking app style offline indicator UI matching Intesa/UniCredit UX standards.

## Implementation

### Task 1: Create useNetworkStatus Hook
**Status:** ✅ Completed
**Commit:** `bf0a853` - feat(08-06): add useNetworkStatus hook for network status detection

Created custom React hook for network status detection:
- Leverages `navigator.onLine` API (97% browser support)
- Listens to `online` and `offline` browser events
- Returns `{ isOnline, isOffline }` state
- Logs network state changes for debugging
- Properly cleans up event listeners on unmount

**File created:** [useNetworkStatus.ts](archibald-web-app/frontend/src/hooks/useNetworkStatus.ts)

### Task 2: Create OfflineBanner Component (Banking App Style)
**Status:** ✅ Completed
**Commit:** `54a4fa3` - feat(08-06): add banking app style offline banner UI

Implemented prominent yellow offline banner matching banking app UX requirements from 08-CONTEXT.md:

**Design characteristics:**
- **Fixed position** at top of screen (impossible to miss)
- **Yellow background** (#ffc107) with orange border (#ff9800)
- **High z-index** (9999) to stay above all content
- **Banking app reference:** Matches Intesa Sanpaolo/UniCredit offline indicators
- **Reassuring message:** "Puoi continuare a lavorare. Gli ordini saranno inviati quando torni online."
- **Prominent, not subtle:** Clear 12px padding, 14px bold text, shadow

**Integration with App.tsx:**
- Added `<OfflineBanner />` at root level (outside main app div)
- Uses `useNetworkStatus()` hook for reactive offline state
- App content pushed down 64px when banner visible (prevents overlap)
- Banner disappears immediately when network restored

**Files modified:**
- Created: [OfflineBanner.tsx](archibald-web-app/frontend/src/components/OfflineBanner.tsx)
- Modified: [App.tsx](archibald-web-app/frontend/src/App.tsx#L119-L123)

### Task 3: Human Verification Checkpoint
**Status:** ✅ Completed

User verified:
- Yellow banner appears when offline (DevTools Network → Offline)
- Banner is prominent, unmissable, banking app style
- Reassuring message present
- App content not covered (pushed down correctly)
- Banner disappears when back online
- No console errors

## Technical Details

### Files Created
- `archibald-web-app/frontend/src/hooks/useNetworkStatus.ts` - Network status detection hook
- `archibald-web-app/frontend/src/components/OfflineBanner.tsx` - Banking app style offline banner

### Files Modified
- `archibald-web-app/frontend/src/App.tsx` - Integrated OfflineBanner with layout adjustment

### Network Status Detection
Uses standard browser APIs with excellent support:
- `navigator.onLine` - 97% browser support
- `online` / `offline` events - 96% browser support
- Works across desktop, iOS, Android

### Banking App UX Standards Met
From 08-CONTEXT.md requirements:
✅ Banner giallo prominent in alto quando offline: "Modalità Offline"
✅ Impossibile non notare, rassicurante
✅ Riferimento: Intesa Sanpaolo o UniCredit quando sei offline
✅ Non minimale - deve essere chiaro e visibile

## Verification

✅ useNetworkStatus hook returns correct online/offline state
✅ Yellow banner appears when offline
✅ Banner is prominent (top of screen, impossible to miss)
✅ Banking app style (yellow, reassuring message)
✅ App content not covered by banner
✅ Banner disappears when back online
✅ Human verification passed

## Success Criteria Met

- ✅ useNetworkStatus hook with navigator.onLine events
- ✅ OfflineBanner component matching banking app UX
- ✅ Prominent yellow banner (08-CONTEXT.md requirement)
- ✅ Reassuring offline message
- ✅ App content pushed down (no overlap)
- ✅ Human verification checkpoint passed

## Commits

1. `bf0a853` - feat(08-06): add useNetworkStatus hook for network status detection
2. `54a4fa3` - feat(08-06): add banking app style offline banner UI

## Performance Metrics

**Duration:** 11 minutes (2026-01-14 22:15 → 22:26 UTC)
**Tasks completed:** 3/3 (including human verification)
**Files created:** 2
**Files modified:** 1
**Commits:** 2

## Next Steps

Phase 8.6 is complete. The offline indicator UI is now fully functional and matches banking app UX standards. Users receive clear, prominent visual feedback when offline with a reassuring message.

**Next plan:** 08-07 - Implement pending order queue for offline submission
- Design offline queue persistence
- Implement retry logic with exponential backoff
- Add UI for viewing queued orders
- Handle conflict resolution for stale data

## Notes

The implementation prioritizes user experience with:
- **Immediate feedback:** Banner appears/disappears instantly on network change
- **Non-blocking:** Banner doesn't interfere with app usage
- **Reassuring:** Message emphasizes continuity ("Puoi continuare a lavorare")
- **Professional:** Matches trusted banking app standards for consistency

This completes the visual feedback portion of Phase 8. The offline functionality is now user-visible and follows best practices from consumer banking apps that users trust.
