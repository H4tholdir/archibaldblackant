# Technology Stack

**Analysis Date:** 2026-01-11

## Languages

**Primary:**
- TypeScript 5.3+ - All application code (backend and frontend)

**Secondary:**
- JavaScript (JSX/TSX) - React component files in frontend
- CSS - Styling (`frontend/src/App.css`, `frontend/src/index.css`)

## Runtime

**Environment:**
- Node.js 18+ - Backend (no explicit version pinning in `.nvmrc`)
- Modern browsers with Speech Recognition API support - Frontend (Chrome, Safari iOS 14.5+, Edge)

**Package Manager:**
- npm - Both backend and frontend
- Lockfiles: `backend/package-lock.json` and `frontend/package-lock.json`

## Frameworks

**Core:**
- Express.js 4.18.2 - `backend/package.json` - HTTP API server
- React 19.2.3 - `frontend/package.json` - UI framework

**Testing:**
- Vitest 1.2.1 - `backend/package.json` - Test runner (configured but no tests present)

**Build/Dev:**
- Vite 7.3.1 - `frontend/vite.config.ts` - Build tool and dev server
- TypeScript 5.3.3 (backend) / 5.9.3 (frontend) - Type safety
- tsx 4.7.0 - `backend/package.json` - TypeScript executor for Node

## Key Dependencies

**Critical:**
- puppeteer 22.0.0 - `backend/src/archibald-bot.ts` - Browser automation for ERP integration
- better-sqlite3 12.5.0 - `backend/src/customer-db.ts`, `backend/src/product-db.ts` - Local embedded SQL databases
- bullmq 5.66.4 - `backend/src/queue-manager.ts` - Job queue system for order processing
- ioredis 5.9.1 - `backend/src/queue-manager.ts` - Redis client for job queue backend
- zod 3.22.4 - `backend/src/schemas.ts` - Schema validation

**Infrastructure:**
- ws 8.19.0 - `backend/src/index.ts` - WebSocket server for real-time sync updates
- winston 3.11.0 - `backend/src/logger.ts` - Structured logging
- helmet 7.1.0 - `backend/src/index.ts` - HTTP security headers
- cors 2.8.5 - `backend/src/index.ts` - CORS middleware
- vite-plugin-pwa 1.2.0 - `frontend/vite.config.ts` - Progressive Web App support (Workbox service worker)

## Configuration

**Environment:**
- .env files for backend configuration (`backend/.env`, `backend/.env.example`)
- Environment variables: ARCHIBALD_URL, ARCHIBALD_USERNAME, ARCHIBALD_PASSWORD, PORT, NODE_ENV, LOG_LEVEL, REDIS_HOST, REDIS_PORT
- Frontend: No environment-specific configuration detected

**Build:**
- Backend: `backend/tsconfig.json` - TypeScript compiler (CommonJS, ES2022 target, strict mode)
- Frontend: `frontend/tsconfig.json` - TypeScript compiler (ESNext modules, React JSX, strict mode)
- Frontend: `frontend/vite.config.ts` - Vite build config with PWA plugin

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js)
- Redis server required (for BullMQ job queue)
- Chrome/Chromium for Puppeteer automation

**Production:**
- Not detected - No Dockerfile or deployment configuration found
- Manual local deployment implied
- Redis server required for production operation

---

*Stack analysis: 2026-01-11*
*Update after major dependency changes*
