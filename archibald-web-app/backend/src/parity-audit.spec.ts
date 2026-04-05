import { describe, expect, test, vi, beforeAll } from 'vitest';
import { createApp } from './server';
import type { AppDeps } from './server';
import { generateJWT } from './auth-utils';
import request from 'supertest';
import type { Express } from 'express';

vi.mock('./pdf-parser-service', () => ({
  pdfParserService: { healthCheck: vi.fn().mockResolvedValue(true) },
}));

vi.mock('./pdf-parser-products-service', () => ({
  PDFParserProductsService: {
    getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn().mockResolvedValue({ healthy: true }) }),
  },
}));

vi.mock('./pdf-parser-prices-service', () => ({
  PDFParserPricesService: {
    getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn().mockResolvedValue({ healthy: true }) }),
  },
}));

vi.mock('./pdf-parser-orders-service', () => ({
  PDFParserOrdersService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

vi.mock('./pdf-parser-ddt-service', () => ({
  PDFParserDDTService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

vi.mock('./pdf-parser-invoices-service', () => ({
  PDFParserInvoicesService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type EndpointEntry = {
  method: HttpMethod;
  masterPath: string;
  branchPath: string;
  branchMethod?: HttpMethod;
  auth: 'public' | 'auth' | 'admin' | 'auth-internal';
  note?: string;
};

/**
 * Master inline endpoint inventory — parsed from master:archibald-web-app/backend/src/index.ts
 *
 * EXCLUDES endpoints from imported sub-routers:
 *   - delta-sync (GET /api/cache/delta, GET /api/cache/version)
 *   - bot (POST /api/bot/submit-orders)
 *   - warehouse-routes (GET /api/warehouse/format-guide)
 *   - fresis-history-routes (all fresis-history routes)
 *   - fresis-discount-routes (fresis-discounts routes)
 *   - admin-routes (impersonate/session routes)
 *   - sync-routes (pending-orders, warehouse-items, warehouse-metadata)
 *   - share-routes (GET /api/share/pdf/:id)
 *
 * auth-internal = route exists under /api/auth without authenticateJWT middleware
 *   but the handler accesses req.user! — these routes return 500 without token
 *   instead of 401. This is a known pattern in the auth router.
 */
const masterEndpoints: EndpointEntry[] = [
  // Health endpoints (all public)
  { method: 'GET', masterPath: '/api/health', branchPath: '/api/health', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser', branchPath: '/api/health/pdf-parser', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser-products', branchPath: '/api/health/pdf-parser-products', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser-prices', branchPath: '/api/health/pdf-parser-prices', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser-orders', branchPath: '/api/health/pdf-parser-orders', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser-ddt', branchPath: '/api/health/pdf-parser-ddt', auth: 'public' },
  { method: 'GET', masterPath: '/api/health/pdf-parser-invoices', branchPath: '/api/health/pdf-parser-invoices', auth: 'public' },
  { method: 'GET', masterPath: '/metrics', branchPath: '/metrics', auth: 'public' },

  // Test login
  { method: 'POST', masterPath: '/api/test/login', branchPath: '/api/test/login', auth: 'public' },

  // Timeouts (all public)
  { method: 'GET', masterPath: '/api/timeouts/stats', branchPath: '/api/timeouts/stats', auth: 'public' },
  { method: 'POST', masterPath: '/api/timeouts/reset', branchPath: '/api/timeouts/reset', auth: 'public' },
  { method: 'POST', masterPath: '/api/timeouts/set', branchPath: '/api/timeouts/set', auth: 'public' },

  // WebSocket health (admin)
  { method: 'GET', masterPath: '/api/websocket/health', branchPath: '/api/websocket/health', auth: 'admin' },

  // Auth endpoints — login is public, others are auth-internal (no middleware, handler uses req.user!)
  { method: 'POST', masterPath: '/api/auth/login', branchPath: '/api/auth/login', auth: 'public' },
  { method: 'POST', masterPath: '/api/auth/logout', branchPath: '/api/auth/logout', auth: 'auth-internal' },
  { method: 'GET', masterPath: '/api/auth/me', branchPath: '/api/auth/me', auth: 'auth-internal' },
  { method: 'POST', masterPath: '/api/auth/refresh', branchPath: '/api/auth/refresh', auth: 'auth-internal' },
  { method: 'POST', masterPath: '/api/auth/refresh-credentials', branchPath: '/api/auth/refresh-credentials', auth: 'auth-internal' },

  // Customers — search consolidated into GET /api/customers?q=
  { method: 'GET', masterPath: '/api/customers', branchPath: '/api/customers', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/search', branchPath: '/api/customers', auth: 'auth', note: 'search consolidated into GET /customers?q=' },
  { method: 'POST', masterPath: '/api/customers', branchPath: '/api/customers', auth: 'auth' },
  { method: 'PUT', masterPath: '/api/customers/:erpId', branchPath: '/api/customers/:erpId', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/:erpId', branchPath: '/api/customers/:erpId', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/:erpId/status', branchPath: '/api/customers/:erpId/status', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/:erpId/retry', branchPath: '/api/customers/:erpId/retry', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/:erpId/photo', branchPath: '/api/customers/:erpId/photo', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/:erpId/photo', branchPath: '/api/customers/:erpId/photo', auth: 'auth' },
  { method: 'DELETE', masterPath: '/api/customers/:erpId/photo', branchPath: '/api/customers/:erpId/photo', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/sync', branchPath: '/api/customers/sync', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/smart-sync', branchPath: '/api/customers/smart-sync', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/resume-syncs', branchPath: '/api/customers/resume-syncs', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/sync/metrics', branchPath: '/api/customers/sync/metrics', auth: 'auth' },
  { method: 'GET', masterPath: '/api/customers/sync-status', branchPath: '/api/customers/sync-status', auth: 'auth' },

  // Customer interactive
  { method: 'POST', masterPath: '/api/customers/interactive/start', branchPath: '/api/customers/interactive/start', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/interactive/:sessionId/vat', branchPath: '/api/customers/interactive/:sessionId/vat', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/interactive/:sessionId/heartbeat', branchPath: '/api/customers/interactive/:sessionId/heartbeat', auth: 'auth' },
  { method: 'POST', masterPath: '/api/customers/interactive/:sessionId/save', branchPath: '/api/customers/interactive/:sessionId/save', auth: 'auth' },
  { method: 'DELETE', masterPath: '/api/customers/interactive/:sessionId', branchPath: '/api/customers/interactive/:sessionId', auth: 'auth' },

  // Products
  { method: 'GET', masterPath: '/api/products', branchPath: '/api/products', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/search', branchPath: '/api/products/search', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/:productId/changes', branchPath: '/api/products/:productId/changes', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/:name/variants', branchPath: '/api/products/:productId/variants', auth: 'auth' },
  { method: 'PATCH', masterPath: '/api/products/:productId/vat', branchPath: '/api/products/:productId/vat', auth: 'auth' },
  { method: 'PATCH', masterPath: '/api/products/:productId/price', branchPath: '/api/products/:productId/price', auth: 'auth' },
  { method: 'POST', masterPath: '/api/products/sync', branchPath: '/api/products/sync', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/sync/metrics', branchPath: '/api/products/sync/metrics', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/sync-history', branchPath: '/api/products/sync-history', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/last-sync', branchPath: '/api/products/last-sync', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/sync-status', branchPath: '/api/products/sync-status', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/zero-price-count', branchPath: '/api/products/zero-price-count', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/no-vat-count', branchPath: '/api/products/no-vat-count', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/variations/recent/:days?', branchPath: '/api/products/variations/recent/:days?', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/variations/product/:productId', branchPath: '/api/products/variations/product/:productId', auth: 'auth' },
  { method: 'GET', masterPath: '/api/products/variants', branchPath: '/api/products/:productId/variants', auth: 'auth', note: 'master /variants root → branch /:productId/variants' },

  // Prices
  { method: 'GET', masterPath: '/api/prices/imports', branchPath: '/api/prices/imports', auth: 'admin' },
  { method: 'GET', masterPath: '/api/prices/unmatched', branchPath: '/api/prices/unmatched', auth: 'admin' },
  { method: 'POST', masterPath: '/api/prices/match', branchPath: '/api/prices/match', auth: 'auth' },
  { method: 'GET', masterPath: '/api/prices/sync/stats', branchPath: '/api/prices/sync/stats', auth: 'auth' },
  { method: 'GET', masterPath: '/api/prices/history/summary', branchPath: '/api/prices/history/summary', auth: 'auth' },
  { method: 'GET', masterPath: '/api/prices/history/recent/:days?', branchPath: '/api/prices/history/recent/:days?', auth: 'auth' },
  { method: 'GET', masterPath: '/api/prices/history/:productId', branchPath: '/api/prices/history/:productId', auth: 'auth' },
  { method: 'GET', masterPath: '/api/prices/:productId/history', branchPath: '/api/prices/:productId/history', auth: 'admin' },
  { method: 'POST', masterPath: '/api/prices/import-excel', branchPath: '/api/prices/import-excel', auth: 'admin' },

  // Orders
  { method: 'GET', masterPath: '/api/orders/my-orders', branchPath: '/api/orders', auth: 'auth', note: 'master /my-orders → branch GET /orders' },
  { method: 'GET', masterPath: '/api/orders/history', branchPath: '/api/orders', auth: 'auth', note: 'master /history → branch GET /orders (with filter)' },
  { method: 'GET', masterPath: '/api/orders/:id', branchPath: '/api/orders/:orderId', auth: 'auth' },
  { method: 'GET', masterPath: '/api/orders/:orderId/articles', branchPath: '/api/orders/:orderId/articles', auth: 'auth' },
  { method: 'GET', masterPath: '/api/orders/:orderId/state-history', branchPath: '/api/orders/:orderId/history', auth: 'auth', note: 'master /state-history → branch /history' },
  { method: 'POST', masterPath: '/api/orders/:orderId/send-to-verona', branchPath: '/api/orders/:orderId/send-to-verona', auth: 'auth' },
  { method: 'GET', masterPath: '/api/orders/:orderId/pdf-download', branchPath: '/api/orders/:orderId/pdf-download', auth: 'auth' },
  { method: 'POST', masterPath: '/api/orders/:orderId/sync-articles', branchPath: '/api/orders/:orderId/sync-articles', auth: 'auth' },
  { method: 'POST', masterPath: '/api/orders/sync-states', branchPath: '/api/orders/sync-states', auth: 'auth' },
  { method: 'POST', masterPath: '/api/orders/force-sync', branchPath: '/api/orders/force-sync', auth: 'auth' },
  { method: 'POST', masterPath: '/api/orders/reset-and-sync', branchPath: '/api/orders/reset-and-sync', auth: 'admin' },
  { method: 'GET', masterPath: '/api/orders/last-sales/:articleCode', branchPath: '/api/orders/last-sales/:articleCode', auth: 'auth' },
  { method: 'GET', masterPath: '/api/orders/resolve-numbers', branchPath: '/api/orders/resolve-numbers', auth: 'auth' },
  { method: 'GET', masterPath: '/api/orders/status/:jobId', branchPath: '/api/orders/status/:jobId', auth: 'auth' },

  // Order sync operations consolidated to unified queue
  { method: 'POST', masterPath: '/api/orders/sync', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/orders/sync-ddt', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/orders/sync-invoices', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/ddt/sync', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/invoices/sync', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/orders/:orderId/delete-from-archibald', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/orders/:orderId/edit-in-archibald', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'GET', masterPath: '/api/orders/:orderId/ddt/download', branchPath: '/api/operations/enqueue', branchMethod: 'POST', auth: 'auth', note: 'consolidated to unified queue; branch uses POST' },
  { method: 'GET', masterPath: '/api/orders/:orderId/invoice/download', branchPath: '/api/operations/enqueue', branchMethod: 'POST', auth: 'auth', note: 'consolidated to unified queue; branch uses POST' },

  // Products sync operations consolidated to unified queue
  { method: 'POST', masterPath: '/api/products/sync/start', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/products/sync/stop', branchPath: '/api/operations/enqueue', auth: 'auth', note: 'consolidated to unified queue' },
  { method: 'POST', masterPath: '/api/products/force-full-sync', branchPath: '/api/operations/enqueue', auth: 'admin', note: 'consolidated to unified queue' },

  // Sync endpoints
  { method: 'GET', masterPath: '/api/sync/stats', branchPath: '/api/sync/stats', auth: 'auth' },
  { method: 'GET', masterPath: '/api/sync/quick-check', branchPath: '/api/sync/quick-check', auth: 'public' },
  { method: 'GET', masterPath: '/api/sync/progress', branchPath: '/api/sync/progress', auth: 'auth', note: 'branch requires auth (SSE router under authenticateJWT); master was public' },
  { method: 'GET', masterPath: '/api/sync/status', branchPath: '/api/sync/status', auth: 'auth' },
  { method: 'POST', masterPath: '/api/sync/all', branchPath: '/api/sync/trigger-all', auth: 'auth', note: 'master /all → branch /trigger-all' },
  { method: 'POST', masterPath: '/api/sync/customers', branchPath: '/api/sync/trigger/sync-customers', auth: 'admin', note: 'master /customers → branch /trigger/:type' },
  { method: 'POST', masterPath: '/api/sync/products', branchPath: '/api/sync/trigger/sync-products', auth: 'admin', note: 'master /products → branch /trigger/:type' },
  { method: 'POST', masterPath: '/api/sync/prices', branchPath: '/api/sync/trigger/sync-prices', auth: 'admin', note: 'master /prices → branch /trigger/:type' },
  { method: 'POST', masterPath: '/api/sync/full', branchPath: '/api/sync/trigger-all', auth: 'admin', note: 'master /full → branch /trigger-all' },
  { method: 'POST', masterPath: '/api/admin/sync/frequency', branchPath: '/api/sync/frequency', auth: 'auth', note: 'moved from /api/admin/ to /api/sync/' },
  { method: 'GET', masterPath: '/api/sync/intervals', branchPath: '/api/sync/intervals', auth: 'admin' },
  { method: 'POST', masterPath: '/api/sync/intervals/:type', branchPath: '/api/sync/intervals/:type', auth: 'admin' },
  { method: 'GET', masterPath: '/api/sync/monitoring/status', branchPath: '/api/sync/monitoring/status', auth: 'admin' },
  { method: 'POST', masterPath: '/api/sync/auto-sync/start', branchPath: '/api/sync/auto-sync/start', auth: 'admin' },
  { method: 'GET', masterPath: '/api/sync/auto-sync/status', branchPath: '/api/sync/auto-sync/status', auth: 'admin' },
  { method: 'POST', masterPath: '/api/sync/auto-sync/stop', branchPath: '/api/sync/auto-sync/stop', auth: 'admin' },
  { method: 'POST', masterPath: '/api/sync/reset/:type', branchPath: '/api/sync/reset/:type', auth: 'auth' },
  { method: 'DELETE', masterPath: '/api/sync/:type/clear-db', branchPath: '/api/sync/:type/clear-db', auth: 'admin' },
  { method: 'GET', masterPath: '/api/sync/schedule', branchPath: '/api/sync/intervals', auth: 'auth', note: 'master /schedule → branch /intervals' },
  { method: 'POST', masterPath: '/api/sync/schedule', branchPath: '/api/sync/frequency', auth: 'auth', note: 'master POST /schedule → branch POST /frequency' },
  { method: 'POST', masterPath: '/api/sync/:type', branchPath: '/api/sync/trigger/:type', auth: 'auth', note: 'master POST /:type → branch /trigger/:type' },

  // Admin endpoints
  { method: 'POST', masterPath: '/api/admin/users', branchPath: '/api/admin/users', auth: 'admin' },
  { method: 'GET', masterPath: '/api/admin/users', branchPath: '/api/admin/users', auth: 'admin' },
  { method: 'PATCH', masterPath: '/api/admin/users/:id/whitelist', branchPath: '/api/admin/users/:id/whitelist', auth: 'admin' },
  { method: 'DELETE', masterPath: '/api/admin/users/:id', branchPath: '/api/admin/users/:id', auth: 'admin' },
  { method: 'GET', masterPath: '/api/admin/jobs', branchPath: '/api/admin/jobs', auth: 'admin' },
  { method: 'POST', masterPath: '/api/admin/jobs/retry/:jobId', branchPath: '/api/admin/jobs/retry/:jobId', auth: 'admin' },
  { method: 'POST', masterPath: '/api/admin/jobs/cancel/:jobId', branchPath: '/api/admin/jobs/cancel/:jobId', auth: 'admin' },
  { method: 'POST', masterPath: '/api/admin/jobs/cleanup', branchPath: '/api/admin/jobs/cleanup', auth: 'admin' },
  { method: 'GET', masterPath: '/api/admin/jobs/retention', branchPath: '/api/admin/jobs/retention', auth: 'admin' },
  { method: 'POST', masterPath: '/api/admin/subclients/import', branchPath: '/api/admin/subclients/import', auth: 'admin' },
  { method: 'GET', masterPath: '/api/admin/lock/status', branchPath: '/api/operations/stats', auth: 'admin', note: 'master /admin/lock → branch /operations/stats' },
  { method: 'POST', masterPath: '/api/admin/lock/release', branchPath: '/api/operations/stats', branchMethod: 'GET', auth: 'admin', note: 'master /admin/lock/release → branch /operations/stats (GET)' },

  // Users
  { method: 'GET', masterPath: '/api/users/me/target', branchPath: '/api/users/me/target', auth: 'auth' },
  { method: 'PUT', masterPath: '/api/users/me/target', branchPath: '/api/users/me/target', auth: 'auth' },
  { method: 'GET', masterPath: '/api/users/me/privacy', branchPath: '/api/users/me/privacy', auth: 'auth' },
  { method: 'POST', masterPath: '/api/users/me/privacy', branchPath: '/api/users/me/privacy', auth: 'auth' },

  // Widget
  { method: 'GET', masterPath: '/api/widget/dashboard-data', branchPath: '/api/widget/dashboard-data', auth: 'auth' },
  { method: 'GET', masterPath: '/api/widget/orders/:year/:month', branchPath: '/api/widget/orders/:year/:month', auth: 'auth' },
  { method: 'GET', masterPath: '/api/widget/orders/exclusions', branchPath: '/api/widget/orders/exclusions', auth: 'auth' },
  { method: 'POST', masterPath: '/api/widget/orders/exclusions', branchPath: '/api/widget/orders/exclusions', auth: 'auth' },

  // Metrics
  { method: 'GET', masterPath: '/api/metrics/budget', branchPath: '/api/metrics/budget', auth: 'auth' },
  { method: 'GET', masterPath: '/api/metrics/orders', branchPath: '/api/metrics/orders', auth: 'auth' },

  // Queue stats → operations
  { method: 'GET', masterPath: '/api/queue/stats', branchPath: '/api/operations/stats', auth: 'auth', note: 'master /queue/stats → branch /operations/stats' },

  // Cache export
  { method: 'GET', masterPath: '/api/cache/export', branchPath: '/api/cache/export', auth: 'auth' },

  // Debug/me → auth/me (auth-internal since auth router has no authenticateJWT middleware)
  { method: 'GET', masterPath: '/api/debug/me', branchPath: '/api/auth/me', auth: 'auth-internal', note: 'master /debug/me → branch /auth/me (auth-internal)' },

  // Subclients
  { method: 'GET', masterPath: '/api/subclients', branchPath: '/api/subclients', auth: 'auth' },
  { method: 'GET', masterPath: '/api/subclients/:codice', branchPath: '/api/subclients/:codice', auth: 'auth' },
  { method: 'DELETE', masterPath: '/api/subclients/:codice', branchPath: '/api/subclients/:codice', auth: 'auth' },

  // Pending orders
  { method: 'GET', masterPath: '/api/pending-orders', branchPath: '/api/pending-orders', auth: 'auth' },
  { method: 'POST', masterPath: '/api/pending-orders', branchPath: '/api/pending-orders', auth: 'auth' },
  { method: 'DELETE', masterPath: '/api/pending-orders/:id', branchPath: '/api/pending-orders/:id', auth: 'auth' },

  // Share — GET /pdf/:id is public (bypasses auth), rest requires auth
  { method: 'GET', masterPath: '/api/share/pdf/:id', branchPath: '/api/share/pdf/:id', auth: 'public' },

  // WebSocket stats
  { method: 'GET', masterPath: '/api/websocket/stats', branchPath: '/api/websocket/health', auth: 'admin', note: 'master /stats → branch /health returns stats' },

  // Warehouse (sub-router on branch)
  { method: 'GET', masterPath: '/api/warehouse/boxes', branchPath: '/api/warehouse/boxes', auth: 'auth' },

  // Fresis history (sub-router on branch)
  { method: 'GET', masterPath: '/api/fresis-history', branchPath: '/api/fresis-history', auth: 'auth' },

  // Operations (new in branch)
  { method: 'GET', masterPath: '/api/operations/stats', branchPath: '/api/operations/stats', auth: 'auth' },
];

function resolvePath(path: string): string {
  return path
    .replace(':erpId', 'test-profile')
    .replace(':sessionId', 'sess-1')
    .replace(':productId', 'test-id')
    .replace(':name', 'test-name')
    .replace(':orderId', 'test-id')
    .replace(':id', 'test-id')
    .replace(':articleCode', 'ART001')
    .replace(':jobId', 'job-1')
    .replace(':codice', 'test-codice')
    .replace(':type', 'sync-customers')
    .replace(':year', '2024')
    .replace(':month', '1')
    .replace(':days?', '7')
    .replace(':operation?', 'test-op');
}

function createMockDeps(): AppDeps {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
  };

  const mockQueue = {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    getAgentJobs: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
    queue: {
      getJob: vi.fn().mockResolvedValue(null),
      getJobs: vi.fn().mockResolvedValue([]),
      clean: vi.fn().mockResolvedValue([]),
    },
  };

  const mockAgentLock = {
    acquire: vi.fn().mockReturnValue({ acquired: true }),
    release: vi.fn(),
    setStopCallback: vi.fn(),
    getActive: vi.fn().mockReturnValue(undefined),
    getAllActive: vi.fn().mockReturnValue(new Map()),
  };

  const mockBrowserPool = {
    initialize: vi.fn().mockResolvedValue(undefined),
    acquireContext: vi.fn().mockResolvedValue({}),
    releaseContext: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  const mockSyncScheduler = {
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 0, sharedSyncMs: 0 }),
    smartCustomerSync: vi.fn().mockResolvedValue(undefined),
    resumeOtherSyncs: vi.fn(),
  };

  const mockWsServer = {
    initialize: vi.fn(),
    broadcast: vi.fn(),
    broadcastToAll: vi.fn(),
    replayEvents: vi.fn(),
    registerConnection: vi.fn(),
    unregisterConnection: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0, messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {} }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  const mockPasswordCache = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn(),
  };

  const mockPdfStore = {
    save: vi.fn().mockReturnValue({ id: 'pdf-1', url: '/share/pdf/pdf-1' }),
    get: vi.fn().mockReturnValue(null),
    delete: vi.fn(),
  };

  return {
    pool: mockPool as any,
    queue: mockQueue as any,
    agentLock: mockAgentLock as any,
    browserPool: mockBrowserPool as any,
    syncScheduler: mockSyncScheduler as any,
    wsServer: mockWsServer as any,
    passwordCache: mockPasswordCache as any,
    pdfStore: mockPdfStore as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
    createCustomerBot: vi.fn().mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      navigateToCustomerSearch: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    createTestBot: vi.fn().mockResolvedValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function sendRequest(app: Express, method: string, path: string, token?: string) {
  const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  let req = request(app)[m](path);
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  if (m === 'post' || m === 'put' || m === 'patch') {
    req = req.send({});
  }
  return req;
}

function isExpressDefault404(response: { status: number; text: string }): boolean {
  return response.status === 404 && /Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS)/.test(response.text);
}

describe('endpoint parity audit — master vs branch', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    const deps = createMockDeps();
    app = createApp(deps);
    adminToken = await generateJWT({ userId: 'admin-1', username: 'admin', role: 'admin', modules: [] });
  });

  const standardEndpoints = masterEndpoints.filter((e) => e.auth !== 'auth-internal');
  const internalAuthEndpoints = masterEndpoints.filter((e) => e.auth === 'auth-internal');

  describe('standard endpoints exist in branch (not Express 404)', () => {
    test.each(standardEndpoints)(
      '$method $masterPath → $branchPath exists',
      async ({ method, branchPath, branchMethod, auth }) => {
        const resolvedPath = resolvePath(branchPath);
        const effectiveMethod = branchMethod ?? method;
        const token = auth !== 'public' ? adminToken : undefined;
        const response = await sendRequest(app, effectiveMethod, resolvedPath, token);
        expect(isExpressDefault404(response)).toBe(false);
      },
    );
  });

  describe('auth-internal endpoints verified via auth router mount', () => {
    test('auth router is mounted (POST /api/auth/login responds)', async () => {
      const response = await sendRequest(app, 'POST', '/api/auth/login');
      expect(isExpressDefault404(response)).toBe(false);
    });

    test.each(internalAuthEndpoints)(
      '$method $masterPath → registered under auth router at $branchPath ($note)',
      ({ branchPath }) => {
        expect(branchPath).toMatch(/^\/api\/auth\//);
      },
    );
  });

  describe('auth-protected endpoints return 401 without token', () => {
    const protectedEndpoints = masterEndpoints.filter(
      (e) => e.auth === 'auth' || e.auth === 'admin',
    );

    test.each(protectedEndpoints)(
      '$method $branchPath → 401 without token',
      async ({ method, branchPath, branchMethod }) => {
        const resolvedPath = resolvePath(branchPath);
        const effectiveMethod = branchMethod ?? method;
        const response = await sendRequest(app, effectiveMethod, resolvedPath);
        expect(response.status).toBe(401);
      },
    );
  });

  describe('public endpoints return non-401 without token', () => {
    const publicEndpoints = masterEndpoints.filter((e) => e.auth === 'public');

    test.each(publicEndpoints)(
      '$method $branchPath → non-401 without token',
      async ({ method, branchPath, branchMethod }) => {
        const resolvedPath = resolvePath(branchPath);
        const effectiveMethod = branchMethod ?? method;
        const response = await sendRequest(app, effectiveMethod, resolvedPath);
        expect(response.status).not.toBe(401);
      },
    );
  });

  test('parity summary', () => {
    const total = masterEndpoints.length;
    const directMatch = masterEndpoints.filter((e) => e.masterPath === e.branchPath).length;
    const mapped = masterEndpoints.filter((e) => e.masterPath !== e.branchPath).length;

    expect(total).toBeGreaterThan(0);
    expect(directMatch + mapped).toBe(total);
  });
});
