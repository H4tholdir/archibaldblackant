# External Integrations

**Analysis Date:** 2026-02-22

## APIs & External Services

**Archibald ERP (Primary Business Integration):**
- Purpose: Source of truth for customers, products, prices, orders, DDTs, invoices
- Integration method: Puppeteer browser automation (headless Chrome)
- Auth: Username/password login via `ARCHIBALD_URL`, `ARCHIBALD_USERNAME`, `ARCHIBALD_PASSWORD` env vars
- Default URL: `https://4.231.124.90/Archibald`
- Implementation:
  - Main bot: `archibald-web-app/backend/src/archibald-bot.ts`
  - Browser pool: `archibald-web-app/backend/src/browser-pool.ts`
  - 6 sync services: customer, product, price, order, DDT, invoice

**Dropbox (Cloud PDF Storage):**
- Purpose: Upload and host shared PDF previews
- SDK: `dropbox` 10.34.0
- Auth: OAuth refresh token via `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`
- Base path: `DROPBOX_BASE_PATH` (default: `/Archibald/Preventivi`)
- Implementation: `archibald-web-app/backend/src/routes/share-routes.ts`

**SMTP Email Service:**
- Purpose: Send emails with PDF attachments (order sharing)
- Library: `nodemailer` 8.0.1
- Auth: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Implementation: `archibald-web-app/backend/src/routes/share-routes.ts`

## Data Storage

**Databases (SQLite via better-sqlite3):**
- `customers.db` - Customer master data - `backend/src/customer-db.ts`
- `products.db` - Product catalog with variants - `backend/src/product-db.ts`
- `prices.db` - Current pricing data - `backend/src/price-db.ts`
- `orders-new.db` - Order records with status - `backend/src/order-db-new.ts`
- `auth.db` - User accounts and roles - `backend/src/user-db.ts`
- `sync-checkpoints.db` - Sync progress tracking - `backend/src/sync-checkpoint.ts`
- `subclients.db` - Sub-customer hierarchies - `backend/src/subclient-db.ts`
- Connection: File path in `backend/data/` directory

**Caching:**
- Redis (ioredis 5.9.1) - BullMQ job queue backend
- Session cache: `backend/src/session-cache-manager.ts`
- Password cache: `backend/src/password-cache.ts` (in-memory, 1h TTL)

## Authentication & Identity

**Auth Provider:**
- Custom JWT authentication via jose library
- Implementation: `backend/src/auth-utils.ts`, `backend/src/middleware/auth.ts`
- Token storage: localStorage on frontend
- Session management: JWT with auto-refresh (`frontend/src/services/jwt-refresh-service.ts`)
- Expiry: 8 hours

**User Roles:**
- `agent` - Standard user (order creation, viewing)
- `admin` - Full access (sync control, user management)

## Monitoring & Observability

**Metrics:**
- Prometheus client (prom-client 15.1.3) at `/metrics`
- Implementation: `backend/src/metrics.ts`
- Tracks: HTTP requests, queue jobs, browser pool, sync progress, DB records, order metrics

**Logging:**
- Winston logger (console + file)
- Error logs: `logs/error.log`
- Combined logs: `logs/combined.log`
- Configurable via `LOG_LEVEL` env var

## CI/CD & Deployment

**Hosting:**
- VPS: formicanera.com (91.98.136.198)
- Docker Compose deployment (Nginx + Node + Redis)
- SSL via Let's Encrypt
- Domain: archibaldblackant.it

**CI Pipeline:**
- Not automated (manual deployment via SSH/SCP)

## Environment Configuration

**Development:**
- Required: `ARCHIBALD_URL`, `ARCHIBALD_USERNAME`, `ARCHIBALD_PASSWORD`, `JWT_SECRET`
- Optional: `SMTP_*`, `DROPBOX_*`, `SEND_TO_MILANO_ENABLED`
- Redis required locally for BullMQ
- `.env.example` files in both frontend and backend

**Production:**
- VPS credentials in `VPS-ACCESS-CREDENTIALS.md` (gitignored)
- Database location: `/home/deploy/archibald-app/data/orders-new.db`
- SSH access: `deploy@91.98.136.198`

## Webhooks & Callbacks

**Incoming:**
- WebSocket `/ws/realtime` - Real-time sync events (drafts, pending orders)
- WebSocket `/ws/sync` - Sync progress tracking

**Outgoing:**
- None (all integrations are pull-based via Puppeteer)

## Third-Party Data Integrations

**Fresis (Sub-client Management):**
- Purpose: Customer discount profiles and sub-client hierarchies
- Implementation: `backend/src/fresis-history-realtime.service.ts`, `backend/src/routes/fresis-discount-routes.ts`
- Data import: Excel files via `backend/src/subclient-excel-importer.ts`

**ARCA (Accounting System):**
- Purpose: Import/export accounting data
- Format: DBF files (dBASE format) via `dbffile` library
- Implementation: `backend/src/arca-import-service.ts`, `backend/src/arca-export-service.ts`

**Send to Milano:**
- Purpose: Forward orders to Milano location
- Implementation: `backend/src/send-to-milano-service.ts`
- Feature flag: `SEND_TO_MILANO_ENABLED` (disabled by default)

---

*Integration audit: 2026-02-22*
*Update when adding/removing external services*
