# Technology Stack

**Analysis Date:** 2026-02-22

## Languages

**Primary:**
- TypeScript 5.3.3 (backend) / 5.9.3 (frontend) - All application code

**Secondary:**
- Python - PDF parsing scripts (`backend/scripts/parse-clienti-pdf.py`, `backend/scripts/parse-products-pdf.py`)
- JavaScript - Build scripts, K6 load tests

## Runtime

**Environment:**
- Node.js (ES2022 backend, ES2020 frontend)
- Browser runtime (PWA with Service Worker)

**Package Manager:**
- npm with workspaces (monorepo)
- Lockfile: `package-lock.json` present
- Workspaces: `archibald-web-app/frontend`, `archibald-web-app/backend`, `archibald-web-app/load-tests`

## Frameworks

**Core:**
- React 19.2.3 - Frontend UI framework - `archibald-web-app/frontend/package.json`
- Express 4.18.2 - Backend HTTP server - `archibald-web-app/backend/package.json`
- React Router DOM 7.12.0 - Frontend routing

**Testing:**
- Vitest 4.0.17 (frontend) / 1.2.1 (backend) - Unit & integration tests
- Playwright 1.58.1 - E2E testing - `archibald-web-app/frontend/playwright.config.ts`
- Testing Library (React) - Component testing
- fast-check 4.5.3 - Property-based testing

**Build/Dev:**
- Vite 7.3.1 - Frontend bundler - `archibald-web-app/frontend/vite.config.ts`
- TypeScript compiler - Backend compilation
- tsx 4.7.0 - TypeScript script execution

## Key Dependencies

**Critical:**
- Puppeteer 22.0.0 - Headless Chrome for Archibald ERP automation - `archibald-web-app/backend/src/archibald-bot.ts`
- better-sqlite3 12.5.0 - Local SQLite databases - `archibald-web-app/backend/src/*-db.ts`
- BullMQ 5.66.4 + ioredis 5.9.1 - Job queue for async order processing - `archibald-web-app/backend/src/queue-manager.ts`
- ws 8.19.0 - WebSocket real-time sync - `archibald-web-app/backend/src/websocket-server.ts`
- jose 6.1.3 - JWT authentication - `archibald-web-app/backend/src/auth-utils.ts`

**Infrastructure:**
- Winston 3.11.0 - Structured logging - `archibald-web-app/backend/src/logger.ts`
- prom-client 15.1.3 - Prometheus metrics - `archibald-web-app/backend/src/metrics.ts`
- Zod 3.22.4 - Schema validation - `archibald-web-app/backend/src/schemas.ts`
- Helmet 7.1.0 - Security headers
- vite-plugin-pwa 1.2.0 - PWA/Service Worker support

**Data Processing:**
- jsPDF 4.0.0 + jsPDF AutoTable 5.0.7 - PDF generation
- XLSX 0.18.5 - Excel file parsing
- dbffile 1.12.0 - DBF database file reading (ARCA import)
- Decimal.js 10.6.0 - Precision math for prices
- Fuse.js 7.1.0 - Fuzzy search

**Communication:**
- Nodemailer 8.0.1 - Email sending - `archibald-web-app/backend/src/routes/share-routes.ts`
- Dropbox SDK 10.34.0 - Cloud PDF storage - `archibald-web-app/backend/src/routes/share-routes.ts`

## Configuration

**Environment:**
- `.env` files for configuration (dotenv 16.4.1)
- `archibald-web-app/backend/.env.example` - Server & integration configs
- `archibald-web-app/frontend/.env.example` - Feature flags
- Key vars: `ARCHIBALD_URL`, `JWT_SECRET`, `SMTP_*`, `DROPBOX_*`

**Build:**
- `archibald-web-app/frontend/vite.config.ts` - Frontend build + PWA config
- `archibald-web-app/frontend/tsconfig.json` - Frontend TS (ES2020, JSX react-jsx, strict)
- `archibald-web-app/backend/tsconfig.json` - Backend TS (ES2022, CommonJS, strict)

## Platform Requirements

**Development:**
- macOS/Linux (any platform with Node.js)
- Redis server (for BullMQ job queue)
- Python 3.x (for PDF parsing scripts)
- Chromium (for Puppeteer)

**Production:**
- VPS: formicanera.com (91.98.136.198)
- Docker Compose (Nginx + Node + Redis)
- SSL via Let's Encrypt
- Domain: archibaldblackant.it

---

*Stack analysis: 2026-02-22*
*Update after major dependency changes*
