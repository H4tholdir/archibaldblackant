# Codebase Structure

**Analysis Date:** 2026-01-11

## Directory Layout

```
Archibald/
└── archibald-web-app/
    ├── backend/                    # Node.js Express API + Puppeteer automation
    │   ├── src/                   # TypeScript source code
    │   │   ├── scripts/          # Manual test/debug scripts
    │   │   └── *.ts              # Service classes and utilities
    │   ├── data/                 # SQLite databases + JSON persistence
    │   ├── logs/                 # Winston log files
    │   ├── dist/                 # Compiled JavaScript (gitignored)
    │   ├── node_modules/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── .env                  # Environment variables (WARNING: credentials committed)
    │
    └── frontend/                  # React 19 PWA
        ├── src/                   # TypeScript/TSX source code
        │   ├── components/       # React components
        │   ├── hooks/            # Custom React hooks
        │   ├── utils/            # Utility functions
        │   ├── types/            # TypeScript type definitions
        │   ├── main.tsx          # React entry point
        │   └── App.tsx           # Main app component
        ├── public/               # Static assets (PWA icons)
        ├── dist/                 # Vite build output (gitignored)
        ├── node_modules/
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        └── index.html            # HTML entry
```

## Directory Purposes

**backend/src/**
- Purpose: All backend TypeScript source code
- Contains: Service classes, database wrappers, API routes, bot automation
- Key files:
  - `index.ts` - Express app, routes, WebSocket server
  - `archibald-bot.ts` - Puppeteer browser automation (2777 lines)
  - `queue-manager.ts` - BullMQ job queue for order processing
  - `customer-sync-service.ts` - Customer data synchronization (720 lines)
  - `product-sync-service.ts` - Product data synchronization (791 lines)
  - `price-sync-service.ts` - Price list synchronization
  - `browser-pool.ts` - Pre-authenticated browser pool management
  - `session-manager.ts` - Cookie persistence (24-hour TTL)
  - `customer-db.ts` - SQLite customer database wrapper
  - `product-db.ts` - SQLite product database wrapper
  - `sync-checkpoint.ts` - Checkpoint manager for resumable sync
  - `adaptive-timeout-manager.ts` - Learning timeout system
  - `logger.ts` - Winston logger configuration
  - `config.ts` - Environment variable loader
  - `types.ts` - TypeScript interfaces
  - `schemas.ts` - Zod validation schemas
- Subdirectories: `scripts/` (manual test utilities)

**backend/src/scripts/**
- Purpose: Manual integration test scripts for development
- Contains:
  - `test-login.ts` - Test Archibald ERP authentication
  - `test-create-order.ts` - Test order creation flow
  - `test-queue.ts` - Test job queue functionality

**backend/data/**
- Purpose: Runtime data persistence
- Contains:
  - `customers.db` - SQLite database (customer data cache)
  - `products.db` - SQLite database (product catalog cache)
  - `sync-checkpoints.db` - SQLite database (sync resume state)
  - `archibald-session.json` - Cached Puppeteer cookies
  - `adaptive-timeouts.json` - Timeout learning statistics

**backend/logs/**
- Purpose: Winston log file output
- Contains:
  - `error.log` - Error-level logs only
  - `combined.log` - All log levels

**frontend/src/components/**
- Purpose: React UI components
- Contains:
  - `OrderForm.tsx` - Main order entry interface with autocomplete
  - `OrderStatus.tsx` - Order creation status tracking (polling)
  - `SyncBanner.tsx` - Sync notification banner
  - `SyncBars.tsx` - Real-time progress bars (customers/products/prices)
  - `SyncButton.tsx` - Manual sync trigger buttons

**frontend/src/hooks/**
- Purpose: Custom React hooks
- Contains:
  - `useVoiceInput.ts` - Web Speech API integration for voice input

**frontend/src/utils/**
- Purpose: Utility functions
- Contains:
  - `orderParser.ts` - Voice input parsing and normalization

**frontend/src/types/**
- Purpose: TypeScript type definitions
- Contains:
  - `order.ts` - Order-related interfaces
  - `speech-recognition.d.ts` - Web Speech API type declarations

## Key File Locations

**Entry Points:**
- Backend: `backend/src/index.ts` - Express server startup
- Frontend: `frontend/src/main.tsx` - React app mount

**Configuration:**
- Backend: `backend/tsconfig.json` - TypeScript config (CommonJS, ES2022, strict)
- Backend: `backend/.env` - Environment variables (WARNING: credentials present)
- Backend: `backend/.env.example` - Environment template
- Backend: `backend/src/config.ts` - Config loader
- Frontend: `frontend/tsconfig.json` - TypeScript config (ESNext, React JSX, strict)
- Frontend: `frontend/vite.config.ts` - Vite + PWA plugin config

**Core Logic:**
- Backend services: `backend/src/*-service.ts`, `backend/src/*-manager.ts`
- Backend database access: `backend/src/*-db.ts`
- Frontend components: `frontend/src/components/*.tsx`
- Frontend hooks: `frontend/src/hooks/*.ts`

**Testing:**
- Backend manual tests: `backend/src/scripts/test-*.ts`
- No unit test files found (Vitest configured but unused)

**Documentation:**
- `archibald-web-app/PROPOSTA_TECNICA.md` - Technical proposal
- `archibald-web-app/ANALISI_GESTIONALE.md` - Management analysis
- `archibald-web-app/GUIDA_TEST.md` - Test guide
- `archibald-web-app/backend/README.md` - Backend quick start
- `archibald-web-app/backend/ADAPTIVE-TIMEOUTS.md` - Adaptive timeout feature docs
- `archibald-web-app/frontend/README.md` - Frontend quick start

## Naming Conventions

**Files:**
- Backend: kebab-case.ts for all TypeScript files
  - Services: `customer-sync-service.ts`, `product-sync-service.ts`
  - Databases: `customer-db.ts`, `product-db.ts`
  - Managers: `queue-manager.ts`, `session-manager.ts`
  - Simple files: `config.ts`, `logger.ts`, `types.ts`, `schemas.ts`
- Frontend: PascalCase.tsx for React components, camelCase.ts for utilities
  - Components: `OrderForm.tsx`, `SyncBanner.tsx`, `SyncBars.tsx`
  - Hooks: `useVoiceInput.ts`
  - Utils: `orderParser.ts`

**Directories:**
- kebab-case: `sync-checkpoint/` (if subdirectories existed)
- Plural for collections: `components/`, `hooks/`, `utils/`, `types/`, `scripts/`

**Special Patterns:**
- `index.ts` - Backend entry point
- `main.tsx` - Frontend entry point
- `App.tsx` - Main React component
- `*.test.ts` - Test files (pattern exists but no tests written)

## Where to Add New Code

**New Backend Service:**
- Implementation: `backend/src/{name}-service.ts`
- Database access (if needed): `backend/src/{name}-db.ts`
- Types: Add to `backend/src/types.ts`
- Validation: Add Zod schema to `backend/src/schemas.ts`
- Routes: Add to `backend/src/index.ts`
- Tests: Create `backend/src/{name}-service.test.ts`

**New Frontend Component:**
- Implementation: `frontend/src/components/{ComponentName}.tsx`
- Types: `frontend/src/types/{domain}.ts`
- Hooks (if custom): `frontend/src/hooks/use{HookName}.ts`
- Utils (if shared): `frontend/src/utils/{utilName}.ts`

**New API Endpoint:**
- Route definition: `backend/src/index.ts` (add to Express app)
- Handler logic: Extract complex logic to service in `backend/src/*-service.ts`
- Validation: Define Zod schema in `backend/src/schemas.ts`

**New Database Table:**
- Schema: Define in relevant `*-db.ts` file (e.g., `customer-db.ts`)
- Migrations: Execute manually via better-sqlite3 (no migration framework)
- Types: Add interface to `backend/src/types.ts`

**Utilities:**
- Backend: Add to `backend/src/{util-name}.ts` (e.g., existing `logger.ts`, `config.ts`)
- Frontend: Add to `frontend/src/utils/{utilName}.ts`

## Special Directories

**backend/data/**
- Purpose: Runtime-generated data (SQLite databases, session cache)
- Source: Created by application at runtime
- Committed: No (in .gitignore)

**backend/dist/**
- Purpose: TypeScript compilation output (JavaScript)
- Source: Generated by `tsc` compiler
- Committed: No (in .gitignore)

**frontend/dist/**
- Purpose: Vite build output (optimized production bundle)
- Source: Generated by `vite build`
- Committed: No (in .gitignore)

**backend/logs/**
- Purpose: Winston log file output
- Source: Generated at runtime by logger
- Committed: No (in .gitignore)

**node_modules/**
- Purpose: npm package dependencies
- Source: Installed via `npm install`
- Committed: No (in .gitignore)

---

*Structure analysis: 2026-01-11*
*Update when directory structure changes*
