# Architecture

**Analysis Date:** 2026-02-22

## Pattern Overview

**Overall:** Monolithic Full-Stack Application with Event-Driven Sync Orchestration

**Key Characteristics:**
- PWA frontend + Node.js/Puppeteer backend proxy
- Browser automation against legacy ERP (Archibald)
- Event-driven sync with WebSocket real-time updates
- Offline-first with IndexedDB + SQLite backend
- Backend as single source of truth (IndexedDB eliminated per recent refactor)

## Layers

**Presentation Layer (Frontend):**
- Purpose: React PWA for mobile agents
- Contains: Pages, components, hooks, contexts
- Location: `archibald-web-app/frontend/src/`
- Depends on: API layer, services layer
- Used by: End users (Komet agents)

**API Integration Layer (Frontend):**
- Purpose: HTTP/WebSocket communication with backend
- Contains: Fetch-based API clients with JWT auth
- Location: `archibald-web-app/frontend/src/api/*.ts`
- Depends on: Backend REST endpoints
- Used by: Services and hooks

**Frontend Services Layer:**
- Purpose: Business logic for frontend (caching, offline, sync)
- Contains: OrderService, CustomerService, ProductService, PriceService
- Location: `archibald-web-app/frontend/src/services/*.ts`
- Depends on: API layer
- Used by: React hooks and components

**Backend Routes Layer:**
- Purpose: HTTP/WebSocket endpoint handlers
- Contains: Express route definitions
- Location: `archibald-web-app/backend/src/routes/*.ts` + `backend/src/index.ts`
- Depends on: Service layer, middleware
- Used by: Frontend API clients

**Backend Service Layer:**
- Purpose: Core business logic (sync, bot, queue)
- Contains: Sync services, orchestrator, bot, queue manager
- Location: `archibald-web-app/backend/src/*-service.ts`, `backend/src/sync-orchestrator.ts`
- Depends on: Data access layer, Puppeteer
- Used by: Routes layer

**Data Access Layer:**
- Purpose: SQLite database abstraction
- Contains: Database classes with CRUD operations
- Location: `archibald-web-app/backend/src/*-db.ts`
- Depends on: better-sqlite3
- Used by: Service layer

**Automation Layer:**
- Purpose: Puppeteer browser automation against Archibald ERP
- Contains: ArchibaldBot, BrowserPool, session management
- Location: `archibald-web-app/backend/src/archibald-bot.ts`, `backend/src/browser-pool.ts`
- Depends on: Puppeteer, Archibald ERP (external)
- Used by: Sync services, queue manager

## Data Flow

**Authentication Flow:**
1. Frontend sends credentials to `POST /api/auth/login`
2. Backend validates via Puppeteer against Archibald ERP
3. JWT generated (jose), returned to frontend
4. Frontend stores JWT, attaches to all requests
5. `jwtRefreshService` auto-refreshes before expiry

**Order Creation Flow:**
1. User fills OrderForm (frontend)
2. `POST /api/orders` with validated order data
3. Backend enqueues to BullMQ queue
4. QueueManager worker processes: ArchibaldBot.createOrder()
5. Puppeteer automates Archibald UI to create order
6. WebSocket pushes progress/completion to frontend

**Sync Flow (Customer/Product/Price/Orders):**
1. Manual trigger or auto-sync scheduler fires
2. SyncOrchestrator.enqueueSync() - mutex-protected queueing
3. Service executes (e.g., CustomerSyncService.sync())
4. Puppeteer downloads PDF from Archibald ERP
5. Python parser extracts data from PDF
6. Delta detection (MD5 hash) skips unchanged records
7. SQLite database updated
8. WebSocket pushes progress to all connected clients

**State Management:**
- Backend SQLite databases are single source of truth
- Frontend fetches from backend APIs
- WebSocket provides real-time updates for drafts/pending orders
- Offline: orders queued locally, synced when online

## Key Abstractions

**Singleton Services:**
- Purpose: Centralized instance management
- Examples: `CustomerDatabase.getInstance()`, `SyncOrchestrator.getInstance()`, `BrowserPool.getInstance()`
- Pattern: Private static instance, public getInstance()

**Sync Services (EventEmitter):**
- Purpose: Domain-specific data sync with progress tracking
- Examples: `CustomerSyncService`, `ProductSyncService`, `PriceSyncService`, `OrderSyncService`
- Pattern: Extend EventEmitter, emit progress/complete/error events

**Database Classes:**
- Purpose: SQLite CRUD abstraction per domain
- Examples: `CustomerDatabase`, `ProductDatabase`, `UserDatabase`, `OrderDatabaseNew`
- Pattern: Repository with insert/update/delete/search/getAll methods

**WebSocket Real-Time:**
- Purpose: Push updates to all connected devices
- Location: `archibald-web-app/backend/src/websocket-server.ts`
- Pattern: Connection pool Map<userId, Set<WebSocket>>, per-user broadcast

## Entry Points

**Backend Server:**
- Location: `archibald-web-app/backend/src/index.ts`
- Triggers: `npm start` or `tsx src/index.ts`
- Responsibilities: Express init, DB setup, route registration, WebSocket server, sync orchestration

**Frontend App:**
- Location: `archibald-web-app/frontend/src/main.tsx`
- Triggers: Browser loads PWA
- Responsibilities: React render, PWA registration, JWT refresh init

**App Router:**
- Location: `archibald-web-app/frontend/src/AppRouter.tsx`
- Triggers: React Router navigation
- Responsibilities: Protected routes, page rendering, layout

## Error Handling

**Strategy:** Try/catch at route level, EventEmitter error events for async operations

**Patterns:**
- Express routes wrap in try/catch, return 500 with error message
- Sync services emit 'error' events, orchestrator handles retry
- Frontend: fetchWithRetry utility for resilient API calls
- JWT 401 responses trigger auto-refresh or re-login

## Cross-Cutting Concerns

**Logging:**
- Winston logger (`backend/src/logger.ts`) with console + file output
- Levels: debug, info, warn, error
- Error logs: `logs/error.log`, Combined: `logs/combined.log`

**Validation:**
- Zod schemas at API boundary (`backend/src/schemas.ts`)
- Frontend form validation in components

**Authentication:**
- JWT middleware on protected routes (`backend/src/middleware/auth.ts`)
- `authenticateJWT` and `requireAdmin` middleware
- jose library for JWT operations

**Monitoring:**
- Prometheus metrics endpoint `/metrics` (`backend/src/metrics.ts`)
- Tracks: HTTP requests, queue jobs, browser pool, sync progress, DB records

---

*Architecture analysis: 2026-02-22*
*Update when major patterns change*
