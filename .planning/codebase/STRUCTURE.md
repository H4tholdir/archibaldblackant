# Codebase Structure

**Analysis Date:** 2026-02-22

## Directory Layout

```
Archibald/
├── archibald-web-app/
│   ├── frontend/           # React PWA (Vite + TypeScript)
│   │   ├── src/
│   │   │   ├── api/        # HTTP client modules
│   │   │   ├── components/ # React components
│   │   │   ├── contexts/   # React Context providers
│   │   │   ├── hooks/      # Custom React hooks
│   │   │   ├── pages/      # Full-page components
│   │   │   ├── services/   # Business logic services
│   │   │   ├── types/      # TypeScript type definitions
│   │   │   ├── utils/      # Utility functions
│   │   │   ├── test/       # Test setup and fixtures
│   │   │   ├── main.tsx    # App entry point
│   │   │   └── AppRouter.tsx # Route definitions
│   │   ├── e2e/            # Playwright E2E tests
│   │   ├── public/         # Static assets
│   │   ├── vite.config.ts  # Vite + PWA config
│   │   └── playwright.config.ts
│   │
│   ├── backend/            # Express server (TypeScript)
│   │   ├── src/
│   │   │   ├── routes/     # Express route handlers
│   │   │   ├── middleware/  # JWT auth middleware
│   │   │   ├── services/   # Business services
│   │   │   ├── migrations/ # SQLite schema migrations
│   │   │   ├── test-fixtures/ # Test data
│   │   │   ├── scripts/    # CLI utilities & Python parsers
│   │   │   ├── index.ts    # Server entry point
│   │   │   ├── config.ts   # Environment config
│   │   │   ├── *-db.ts     # Database access classes
│   │   │   ├── *-service.ts # Sync/business services
│   │   │   └── archibald-bot.ts # Puppeteer automation
│   │   └── data/           # SQLite database files
│   │
│   └── load-tests/         # K6 load testing scripts
│
├── .planning/              # GSD planning structure
├── package.json            # Root workspace manifest
└── VPS-ACCESS-CREDENTIALS.md # Production access (gitignored)
```

## Directory Purposes

**`archibald-web-app/frontend/src/api/`:**
- Purpose: HTTP client functions for backend communication
- Contains: `auth.ts`, `customers.ts`, `products.ts`, `pending-orders.ts`, `warehouse.ts`, `fresis-history.ts`, `fresis-discounts.ts`
- Pattern: Fetch-based with JWT bearer token, fetchWithRetry wrapper

**`archibald-web-app/frontend/src/components/`:**
- Purpose: Reusable React components
- Contains: `OrderFormSimple.tsx`, `LoginModal.tsx`, `SyncBanner.tsx`, `WebSocketSync.tsx`, `ExcelPriceManager.tsx`
- Subdirectories: `new-order-form/` (Phase 28.2 rewrite), `arca/` (ARCA format), `widgets/`

**`archibald-web-app/frontend/src/pages/`:**
- Purpose: Full-page route components
- Contains: `Dashboard.tsx`, `OrderHistory.tsx`, `PendingOrdersPage.tsx`, `AdminPage.tsx`, `CustomerList.tsx`, `FresisHistoryPage.tsx`

**`archibald-web-app/frontend/src/services/`:**
- Purpose: Frontend business logic (singleton services)
- Contains: `orders.service.ts`, `customers.service.ts`, `products.service.ts`, `prices.service.ts`, `credential-store.ts`, `pdf-export.service.ts`

**`archibald-web-app/frontend/src/hooks/`:**
- Purpose: Custom React hooks for state and side effects
- Contains: `useAuth.ts`, `useSyncProgress.ts`, `usePendingSync.ts`, `useNetworkStatus.ts`

**`archibald-web-app/backend/src/routes/`:**
- Purpose: Express route handlers (partially extracted from index.ts)
- Contains: `sync-routes.ts`, `warehouse-routes.ts`, `admin-routes.ts`, `share-routes.ts`, `fresis-history-routes.ts`, `fresis-discount-routes.ts`, `bot.ts`, `delta-sync.ts`

**`archibald-web-app/backend/src/migrations/`:**
- Purpose: SQLite schema evolution (34+ migrations)
- Contains: Numbered migration files for all database tables

**`archibald-web-app/backend/data/`:**
- Purpose: SQLite database files
- Contains: `customers.db`, `products.db`, `prices.db`, `orders-new.db`, `auth.db`, `sync-checkpoints.db`, `subclients.db`

## Key File Locations

**Entry Points:**
- `archibald-web-app/backend/src/index.ts` - Backend server (8,181 lines)
- `archibald-web-app/frontend/src/main.tsx` - Frontend app root
- `archibald-web-app/frontend/src/AppRouter.tsx` - Route definitions

**Configuration:**
- `archibald-web-app/backend/src/config.ts` - Environment config centralized
- `archibald-web-app/backend/tsconfig.json` - Backend TypeScript config
- `archibald-web-app/frontend/tsconfig.json` - Frontend TypeScript config
- `archibald-web-app/frontend/vite.config.ts` - Vite + PWA config

**Core Logic:**
- `archibald-web-app/backend/src/archibald-bot.ts` - Puppeteer automation (12,148 lines)
- `archibald-web-app/backend/src/sync-orchestrator.ts` - Sync coordination
- `archibald-web-app/backend/src/queue-manager.ts` - BullMQ job queue
- `archibald-web-app/backend/src/browser-pool.ts` - Browser instance pool

**Data Access:**
- `archibald-web-app/backend/src/customer-db.ts` - Customer database
- `archibald-web-app/backend/src/product-db.ts` - Product database
- `archibald-web-app/backend/src/price-db.ts` - Price database
- `archibald-web-app/backend/src/order-db-new.ts` - Order database
- `archibald-web-app/backend/src/user-db.ts` - User/auth database

**Authentication:**
- `archibald-web-app/backend/src/auth-utils.ts` - JWT generation
- `archibald-web-app/backend/src/middleware/auth.ts` - JWT middleware
- `archibald-web-app/backend/src/schemas.ts` - Zod validation schemas

**Testing:**
- `archibald-web-app/backend/src/*.spec.ts` - Backend unit tests (co-located)
- `archibald-web-app/frontend/src/**/*.spec.ts(x)` - Frontend unit tests (co-located)
- `archibald-web-app/frontend/e2e/` - Playwright E2E tests
- `archibald-web-app/load-tests/` - K6 load tests

## Naming Conventions

**Files:**
- `kebab-case.ts` for service/utility modules (e.g., `customer-sync-service.ts`)
- `PascalCase.tsx` for React components (e.g., `OrderFormSimple.tsx`)
- `kebab-case-db.ts` for database classes (e.g., `customer-db.ts`)
- `*.spec.ts` for test files, co-located with source

**Directories:**
- kebab-case for all directories
- Plural for collections: `components/`, `services/`, `hooks/`, `routes/`

**Special Patterns:**
- `use*.ts` for React hooks
- `*-db.ts` for database access classes
- `*-sync-service.ts` for sync services
- `*.service.ts` for frontend services

## Where to Add New Code

**New Backend Route:**
- Definition: `archibald-web-app/backend/src/routes/{name}-routes.ts`
- Registration: `archibald-web-app/backend/src/index.ts`
- Tests: `archibald-web-app/backend/src/routes/{name}-routes.spec.ts`

**New Frontend Page:**
- Component: `archibald-web-app/frontend/src/pages/{PageName}.tsx`
- Route: `archibald-web-app/frontend/src/AppRouter.tsx`
- Tests: `archibald-web-app/frontend/src/pages/{PageName}.spec.tsx`

**New Frontend Component:**
- Implementation: `archibald-web-app/frontend/src/components/{ComponentName}.tsx`
- Tests: `archibald-web-app/frontend/src/components/{ComponentName}.spec.tsx`

**New Service (Backend):**
- Implementation: `archibald-web-app/backend/src/{name}-service.ts`
- Tests: `archibald-web-app/backend/src/{name}-service.spec.ts`

**New Database:**
- Database class: `archibald-web-app/backend/src/{name}-db.ts`
- Data file: `archibald-web-app/backend/data/{name}.db`
- Migration: `archibald-web-app/backend/src/migrations/NNN-{description}.ts`

## Special Directories

**`archibald-web-app/frontend/dist/`:**
- Purpose: Vite build output
- Committed: No (gitignored)

**`archibald-web-app/backend/data/`:**
- Purpose: SQLite database files
- Committed: Partially (some .db files in git)

**`archibald-web-app/frontend/playwright-report/`:**
- Purpose: Playwright test reports
- Committed: No (untracked)

---

*Structure analysis: 2026-02-22*
*Update when directory structure changes*
