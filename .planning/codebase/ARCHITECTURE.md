# Architecture

**Analysis Date:** 2026-01-11

## Pattern Overview

**Overall:** Full-stack web application with separated frontend and backend layers, specialized for mobile order entry with browser automation integration

**Key Characteristics:**
- Backend: Express.js API server with Puppeteer-based RPA (Robotic Process Automation)
- Frontend: React 19 PWA with offline capability
- Communication: REST API + WebSocket for real-time synchronization updates
- Data: SQLite for local caching + Redis for job queue persistence
- Browser Automation Pool: Pre-authenticated browser sessions for performance

## Layers

**Presentation Layer (Frontend):**
- Purpose: Mobile-first PWA for order entry with voice input
- Contains: React components, custom hooks, voice input parsing
- Location: `frontend/src/components/*.tsx`, `frontend/src/hooks/useVoiceInput.ts`
- Depends on: Backend REST API and WebSocket endpoints
- Used by: End users (mobile sales representatives)

**API Gateway Layer (Backend REST):**
- Purpose: HTTP endpoints for client-server communication
- Contains: Express route handlers, request validation (Zod schemas)
- Location: `backend/src/index.ts` (routes defined inline)
- Depends on: Service Layer
- Used by: Frontend application, API clients

**Service Layer (Business Logic):**
- Purpose: Core domain logic for synchronization and order processing
- Contains: Singleton service classes (CustomerSyncService, ProductSyncService, QueueManager)
- Location: `backend/src/*-service.ts`, `backend/src/*-manager.ts`
- Depends on: Data Access Layer, RPA Layer
- Used by: API Gateway Layer

**Browser Automation & RPA Layer:**
- Purpose: Automated interaction with Archibald ERP system via browser control
- Contains: ArchibaldBot (Puppeteer wrapper), BrowserPool (session management), SessionManager (cookie persistence)
- Location: `backend/src/archibald-bot.ts`, `backend/src/browser-pool.ts`, `backend/src/session-manager.ts`
- Depends on: Puppeteer, AdaptiveTimeoutManager
- Used by: Service Layer

**Data Access Layer:**
- Purpose: Abstraction over local SQLite databases
- Contains: CustomerDatabase, ProductDatabase, SyncCheckpointManager
- Location: `backend/src/customer-db.ts`, `backend/src/product-db.ts`, `backend/src/sync-checkpoint.ts`
- Depends on: better-sqlite3
- Used by: Service Layer

**Infrastructure Layer:**
- Purpose: Cross-cutting concerns (logging, configuration, timeout management)
- Contains: Winston logger, config loader, adaptive timeout manager
- Location: `backend/src/logger.ts`, `backend/src/config.ts`, `backend/src/adaptive-timeout-manager.ts`
- Depends on: Node.js built-ins
- Used by: All layers

## Data Flow

**Order Creation Flow:**

1. User creates order in frontend (`frontend/src/components/OrderForm.tsx`)
2. Frontend sends POST `/api/orders/create` with order data
3. API validates with Zod schema (`backend/src/schemas.ts`)
4. QueueManager creates BullMQ job with Redis persistence (`backend/src/queue-manager.ts`)
5. WebSocket broadcasts job status to frontend in real-time
6. Order Worker (async):
   a. Acquires global lock to prevent concurrent sync/order operations
   b. Cleanup zombie browsers (pkill chrome)
   c. Creates dedicated browser (not from pool) for isolation
   d. SessionManager loads cached cookies if valid (24-hour TTL)
   e. ArchibaldBot navigates to ERP, fills form, submits order
   f. Extracts order ID from response
   g. Closes browser, releases lock
7. Frontend polls `/api/orders/status/:jobId` for completion
8. Order success/failure displayed to user

**Sync Flow (Customers/Products/Prices):**

1. Frontend triggers POST `/api/sync/full` (or specific sync endpoint)
2. API acquires global lock (prevents order creation during sync)
3. SyncService executes:
   a. Loads checkpoint (resume from lastSuccessfulPage if interrupted)
   b. BrowserPool.acquire() → Pre-authenticated browser from pool
   c. Paginates through Archibald data (customers/products)
   d. Database.upsertCustomers() in transaction (with SHA256 change detection)
   e. Emits 'progress' events → WebSocket → Frontend real-time updates
   f. SyncCheckpointManager.updateProgress() after each page
   g. Returns browser to pool
4. Checkpoint marked as 'completed' with timestamp
5. Lock released → orders can resume

**WebSocket Real-time Updates:**
- Backend: EventEmitter 'progress' events from sync services (`backend/src/customer-sync-service.ts`)
- WebSocket server broadcasts to all connected clients (`backend/src/index.ts` line 22)
- Frontend: SyncBars component subscribes to WebSocket (`frontend/src/components/SyncBars.tsx`)
- Updates progress bars in real-time during synchronization

**State Management:**
- Frontend: React useState/useEffect for local UI state, no global state library
- Backend: Stateless HTTP (no sessions), job state in Redis, sync checkpoints in SQLite

## Key Abstractions

**Singleton Pattern:**
- Purpose: Ensures single shared instance of critical services
- Examples: CustomerDatabase, ProductDatabase, BrowserPool, QueueManager, SessionManager, SyncCheckpointManager
- Pattern: Static `getInstance()` method with private constructor
- Location: All major services in `backend/src/`

**EventEmitter Pattern:**
- Purpose: Decouple synchronization logic from UI updates
- Examples: CustomerSyncService, ProductSyncService, PriceSyncService extend EventEmitter
- Pattern: emit('progress', data) → WebSocket broadcast → Frontend update
- Location: `backend/src/*-sync-service.ts`

**Resource Pool Pattern:**
- Purpose: Reuse authenticated browser sessions (~25s saved per operation)
- Examples: BrowserPool maintains min/max browser instances with warmup
- Pattern: acquire() → use → release() cycle with wait queue
- Location: `backend/src/browser-pool.ts`

**Job Queue Pattern:**
- Purpose: Asynchronous order processing with retry and progress tracking
- Examples: BullMQ with Redis backend, max 3 concurrent workers
- Pattern: addOrder() → process() → updateProgress() → complete/fail
- Location: `backend/src/queue-manager.ts`

**Checkpoint/Resume Pattern:**
- Purpose: Recover from sync failures by resuming mid-operation
- Examples: SyncCheckpointManager tracks lastSuccessfulPage per sync type
- Pattern: Load checkpoint → process → update checkpoint per page → mark completed
- Location: `backend/src/sync-checkpoint.ts`

## Entry Points

**Backend:**
- Main server: `backend/src/index.ts`
  - Express app initialization
  - Middleware: helmet, cors, json parsing, request logging
  - WebSocket server on `/ws/sync`
  - REST routes defined inline
  - Server startup on port 3000 (configurable)

**Frontend:**
- Entry: `frontend/src/main.tsx` - ReactDOM root render
- App component: `frontend/src/App.tsx` - Layout with sync status and order form
- Build: `npm run build` → `frontend/dist/`
- Dev: `npm run dev` → Vite dev server on port 5173 with `/api` proxy to backend

**Test Scripts (Backend):**
- `npm run test:login` - `backend/src/scripts/test-login.ts` - Test ERP authentication
- `npm run test:order` - `backend/src/scripts/test-create-order.ts` - Test order creation
- `npm run test:queue` - `backend/src/scripts/test-queue.ts` - Test job queue

## Error Handling

**Strategy:** Try/catch at service boundaries, log errors with context, throw to caller

**Patterns:**
- Service methods throw errors with descriptive messages
- API route handlers catch errors, return appropriate HTTP status codes
- Winston logger captures error with metadata (user, operation, duration)
- Puppeteer operations wrapped in runOp() for timing and error tracking
- Sync errors stored in checkpoint for debugging

## Cross-Cutting Concerns

**Logging:**
- Winston logger with console + file output (`backend/logs/`)
- Structured logging with timing metadata (deltaMs, logSeq)
- Colored console output for development
- Location: `backend/src/logger.ts`

**Validation:**
- Zod schemas for API request validation
- Location: `backend/src/schemas.ts`
- Applied at API entry points before processing

**Lock Management:**
- Global activeOperation flag prevents sync during order creation
- Timeout: 60 seconds max wait for lock
- Prevents browser/database conflicts
- Location: `backend/src/index.ts` (lock variable and acquisition logic)

**Adaptive Learning:**
- AdaptiveTimeoutManager tracks operation success/failure rates
- Auto-adjusts timeouts based on performance (min 100ms, max 5000ms)
- Persists statistics to `backend/data/adaptive-timeouts.json`
- Location: `backend/src/adaptive-timeout-manager.ts`

---

*Architecture analysis: 2026-01-11*
*Update when major patterns change*
