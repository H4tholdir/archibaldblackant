# External Integrations

**Analysis Date:** 2026-01-11

## APIs & External Services

**Archibald ERP System (Primary Integration):**
- Service: Legacy web application at `https://4.231.124.90/Archibald`
- Purpose: Source of truth for customers, products, prices; target for order creation
- Integration method: Browser automation via Puppeteer (`backend/src/archibald-bot.ts`)
- Auth: Username/password credentials (WARNING: stored in `backend/.env`)
  - Username: `[REDACTED-USERNAME]`
  - Password: `[REDACTED-PASSWORD]`
  - Session: Cookies cached for 24 hours (`backend/data/archibald-session.json`)
- Operations:
  - Customer data extraction (pagination, ~50 per page)
  - Product catalog extraction (pagination)
  - Price list extraction
  - Order creation (form filling and submission)
- Files: `backend/src/archibald-bot.ts`, `backend/src/customer-sync-service.ts`, `backend/src/product-sync-service.ts`, `backend/src/price-sync-service.ts`

## Data Storage

**Databases:**
- SQLite (better-sqlite3 12.5.0) - Local embedded databases
  - `data/customers.db` - Customer data cache
    - Client: CustomerDatabase singleton (`backend/src/customer-db.ts`)
    - Schema: Customers table with SHA256 hash for change detection
  - `data/products.db` - Product catalog cache
    - Client: ProductDatabase singleton (`backend/src/product-db.ts`)
    - Schema: Products, prices, descriptions, groups
  - `data/sync-checkpoints.db` - Sync resume state
    - Client: SyncCheckpointManager (`backend/src/sync-checkpoint.ts`)
    - Schema: Checkpoints with lastSuccessfulPage, completion timestamp

**Caching:**
- Redis (ioredis 5.9.1) - Job queue backend for BullMQ
  - Connection: `localhost:6379` (default, configurable via REDIS_HOST/REDIS_PORT)
  - Client: QueueManager (`backend/src/queue-manager.ts`)
  - Purpose: Job persistence, worker coordination, status tracking
  - Data: Order jobs, retry attempts, progress updates

**File Storage:**
- Local JSON persistence:
  - `data/archibald-session.json` - Puppeteer cookies (24-hour TTL)
  - `data/adaptive-timeouts.json` - Timeout learning statistics

## Authentication & Identity

**Archibald ERP Auth:**
- Method: Username/password form authentication
- Implementation: Puppeteer automated login (`backend/src/archibald-bot.ts`)
- Session: Cookies stored in SessionManager (`backend/src/session-manager.ts`)
- Token storage: Cookies persisted to JSON file for 24 hours
- Session reuse: Pre-authenticated browser pool saves ~25s per operation

**Frontend Auth:**
- None - No user authentication required (internal tool)

## Monitoring & Observability

**Error Tracking:**
- None configured (manual log review only)

**Analytics:**
- None configured

**Logs:**
- Winston logger (`backend/src/logger.ts`)
  - Console output (colored)
  - File output:
    - `logs/error.log` - Errors only
    - `logs/combined.log` - All levels
  - Structured logging with timing metadata

**Performance Tracking:**
- AdaptiveTimeoutManager (`backend/src/adaptive-timeout-manager.ts`)
  - Tracks operation timing and success rates
  - Auto-adjusts timeouts based on performance
  - Statistics persisted to `data/adaptive-timeouts.json`

## CI/CD & Deployment

**Hosting:**
- Not configured - Manual local deployment only
- No Dockerfile or deployment scripts found

**CI Pipeline:**
- None configured
- No GitHub Actions or CI/CD workflows detected

## Environment Configuration

**Development:**
- Required env vars:
  - `ARCHIBALD_URL` - ERP base URL (default: `https://4.231.124.90/Archibald`)
  - `ARCHIBALD_USERNAME` - ERP login username
  - `ARCHIBALD_PASSWORD` - ERP login password
  - `PORT` - Express server port (default: 3000)
  - `NODE_ENV` - Environment type (default: development)
  - `LOG_LEVEL` - Winston log level (default: info)
  - `REDIS_HOST` - Redis server hostname (default: localhost)
  - `REDIS_PORT` - Redis server port (default: 6379)
- Secrets location: `backend/.env` (WARNING: committed to repository with actual credentials)
- Dependencies: Redis server required (`brew install redis && brew services start redis` on macOS)

**Staging:**
- Not configured

**Production:**
- Not configured

## Webhooks & Callbacks

**Incoming:**
- None configured

**Outgoing:**
- None configured

## WebSocket Communication

**Real-time Sync Updates:**
- Endpoint: `ws://localhost:3000/ws/sync`
- Protocol: Native WebSocket API
- Purpose: Broadcast sync progress to connected clients
- Implementation: `backend/src/index.ts` (line 22)
- Messages:
  ```typescript
  {
    type: 'progress',
    data: {
      status: 'idle' | 'syncing' | 'completed' | 'error',
      currentPage: number,
      totalPages: number,
      customersProcessed: number,
      message: string
    }
  }
  ```
- Clients: Frontend `SyncBars.tsx` component subscribes for real-time progress updates
- Reconnection: Automatic with 5-second retry on disconnect

## Browser Automation Infrastructure

**Puppeteer:**
- Version: 22.0.0
- Configuration (`backend/src/config.ts`):
  ```typescript
  puppeteer: {
    headless: false,        // Browser visible (for debugging)
    slowMo: 200,           // 200ms delay between operations
    timeout: 30000         // 30s default timeout
  }
  ```
- Browser Pool: `backend/src/browser-pool.ts`
  - Min: 1 pre-authenticated browser
  - Max: 3 concurrent browsers
  - Warmup: 30s after pool creation
  - Cleanup: Zombie browser detection and kill

## External Dependencies at Risk

**Critical Runtime Dependencies:**
- Redis server - Required for job queue (BullMQ)
  - Impact: Order processing stops if Redis unavailable
  - Mitigation: Manual Redis restart, no clustering configured

- Archibald ERP availability - Single point of failure
  - Impact: All sync and order operations fail
  - Mitigation: Checkpoint/resume for sync, retry logic for orders

---

*Integration audit: 2026-01-11*
*Update when adding/removing external services*
