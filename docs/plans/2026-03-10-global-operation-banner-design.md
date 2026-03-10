# Global Operation Banner — Design Spec

## Problem

All order submission progress tracking lives in React state (`usePendingSync` → `jobTracking` Map). Any page refresh, PWA close, or navigation causes progress to be lost. The user has no way to know if an order is being processed, completed, or failed after returning to the app.

## Solution

A persistent global banner that shows active operations across all pages, surviving refresh/close via DB-backed recovery.

### Architecture — 3 Layers

1. **Backend**: persist `job_id` + `job_status` in `pending_orders` table when a job is enqueued/started/completed/failed
2. **Frontend Recovery**: on app mount, fetch pending orders with active jobs (`status = 'processing'`), verify real state via BullMQ API
3. **Frontend Banner**: `<GlobalOperationBanner>` rendered in root layout (above router), fed by `OperationTrackingContext`

### Data Flow

```
Backend (BullMQ job)
  → emits WS events (JOB_STARTED, JOB_PROGRESS, JOB_COMPLETED, JOB_FAILED)
  → updates pending_orders.job_id, pending_orders.status in DB

Frontend (OperationTrackingContext)
  → on mount: GET /api/pending-orders → filter status = "processing"
  → for each: GET /api/operations/:jobId/status → real BullMQ state
  → listen WS for live updates
  → feeds <GlobalOperationBanner>
```

### Banner Behavior

- **Position**: fixed below navbar, above page content, on ALL pages
- **Single order**: customer name + progress label + mini progress bar + clickable arrow
- **Multiple orders**: "3 ordini in elaborazione (2 completati, 1 in corso)" + aggregated mini bar
- **Completion**: green banner for 10 seconds, then auto-dismiss
- **Error**: red banner, stays until user closes (X button)
- **Click**: navigates to `/pending-orders`

### DB Migration

Add to `agents.pending_orders`:
- `job_id TEXT` — BullMQ job ID
- `job_started_at TIMESTAMPTZ` — when job started processing

Existing `status` column already supports needed values (`pending` → `processing` → completed/error).

### Files Involved

**Backend (3 files):**
- New migration `011-pending-orders-job-tracking.sql`
- `operation-processor.ts` — save `job_id` and update `status` in DB on job start/finish
- `pending-orders` repository — add `updateJobTracking()` function

**Frontend (4 files):**
- New `src/contexts/OperationTrackingContext.tsx` — global state + recovery + WS listener
- New `src/components/GlobalOperationBanner.tsx` — banner UI component
- `src/App.tsx` — wrap with context, render banner in layout
- `src/hooks/usePendingSync.ts` — delegate tracking to new context (avoid duplication)
