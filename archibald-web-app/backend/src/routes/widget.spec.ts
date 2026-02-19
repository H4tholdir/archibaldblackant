import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWidgetRouter, createMetricsRouter, type WidgetRouterDeps, type MetricsRouterDeps } from './widget';

// ============================================================================
// Widget Router Tests
// ============================================================================

function createMockWidgetDeps(): WidgetRouterDeps {
  return {
    getDashboardData: vi.fn().mockResolvedValue({
      heroStatus: { status: 'on-track', currentMonthRevenue: 15000 },
      kpiCards: [],
      bonusRoadmap: { steps: [], missingToNextBonus: 5000 },
      forecast: { projectedMonthRevenue: 25000 },
      actionSuggestion: { primaryGoal: 'monthly_target' },
      balance: { balance: 1000 },
      extraBudget: { visible: false },
      alerts: { visible: false },
    }),
    getOrdersForPeriod: vi.fn().mockResolvedValue({
      orders: [
        {
          id: 'ord-1',
          orderNumber: 'ORD/001',
          customerName: 'Rossi',
          totalAmount: '1.234,56 €',
          creationDate: '2026-02-01',
          excludedFromYearly: false,
          excludedFromMonthly: false,
          exclusionReason: null,
        },
      ],
      summary: {
        totalOrders: 1,
        includedCount: 1,
        excludedCount: 0,
        totalIncluded: 1234.56,
        totalExcluded: 0,
        grandTotal: 1234.56,
      },
      period: { year: 2026, month: 2, startDate: '2026-02-01', endDate: '2026-02-28' },
    }),
    setOrderExclusion: vi.fn().mockResolvedValue(undefined),
    getExcludedOrders: vi.fn().mockResolvedValue([]),
  };
}

function createWidgetApp(deps: WidgetRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/widget', createWidgetRouter(deps));
  return app;
}

describe('createWidgetRouter', () => {
  let deps: WidgetRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockWidgetDeps();
    app = createWidgetApp(deps);
  });

  describe('GET /api/widget/dashboard-data', () => {
    test('returns consolidated dashboard data', async () => {
      const res = await request(app).get('/api/widget/dashboard-data');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.heroStatus).toBeDefined();
      expect(res.body.data.kpiCards).toBeDefined();
      expect(deps.getDashboardData).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /api/widget/orders/:year/:month', () => {
    test('returns orders for the given period', async () => {
      const res = await request(app).get('/api/widget/orders/2026/2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.summary.totalOrders).toBe(1);
      expect(deps.getOrdersForPeriod).toHaveBeenCalledWith('user-1', 2026, 2);
    });

    test('returns 400 for invalid month', async () => {
      const res = await request(app).get('/api/widget/orders/2026/13');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 for non-numeric year', async () => {
      const res = await request(app).get('/api/widget/orders/abc/2');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/widget/orders/exclusions', () => {
    test('updates order exclusion', async () => {
      const res = await request(app)
        .post('/api/widget/orders/exclusions')
        .send({
          orderId: 'ord-1',
          excludeFromYearly: true,
          excludeFromMonthly: false,
          reason: 'Test exclusion',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.setOrderExclusion).toHaveBeenCalledWith(
        'user-1', 'ord-1', true, false, 'Test exclusion',
      );
    });

    test('returns 400 for missing orderId', async () => {
      const res = await request(app)
        .post('/api/widget/orders/exclusions')
        .send({ excludeFromYearly: true, excludeFromMonthly: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/widget/orders/exclusions', () => {
    test('returns excluded orders', async () => {
      const res = await request(app).get('/api/widget/orders/exclusions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.excluded).toEqual([]);
      expect(res.body.data.count).toBe(0);
      expect(deps.getExcludedOrders).toHaveBeenCalledWith('user-1');
    });
  });
});

// ============================================================================
// Metrics Router Tests
// ============================================================================

function createMockMetricsDeps(): MetricsRouterDeps {
  return {
    getBudgetMetrics: vi.fn().mockResolvedValue({
      currentBudget: 15000,
      targetBudget: 25000,
      currency: 'EUR',
      progress: 60.0,
      month: '2026-02',
    }),
    getOrderMetrics: vi.fn().mockResolvedValue({
      todayCount: 3,
      weekCount: 12,
      monthCount: 45,
      timestamp: '2026-02-19T10:00:00Z',
      comparisonYesterday: { previousValue: 2, currentValue: 3, absoluteDelta: 1, percentageDelta: 50, label: 'vs Ieri' },
      comparisonLastWeek: { previousValue: 10, currentValue: 12, absoluteDelta: 2, percentageDelta: 20, label: 'vs Sett. Scorsa' },
      comparisonLastMonth: { previousValue: 40, currentValue: 45, absoluteDelta: 5, percentageDelta: 12.5, label: 'vs Mese Scorso' },
    }),
  };
}

function createMetricsApp(deps: MetricsRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/metrics', createMetricsRouter(deps));
  return app;
}

describe('createMetricsRouter', () => {
  let deps: MetricsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockMetricsDeps();
    app = createMetricsApp(deps);
  });

  describe('GET /api/metrics/budget', () => {
    test('returns budget metrics', async () => {
      const res = await request(app).get('/api/metrics/budget');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentBudget).toBe(15000);
      expect(res.body.data.progress).toBe(60.0);
      expect(deps.getBudgetMetrics).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /api/metrics/orders', () => {
    test('returns order metrics with comparisons', async () => {
      const res = await request(app).get('/api/metrics/orders');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.todayCount).toBe(3);
      expect(res.body.data.weekCount).toBe(12);
      expect(res.body.data.monthCount).toBe(45);
      expect(res.body.data.comparisonYesterday).toBeDefined();
      expect(deps.getOrderMetrics).toHaveBeenCalledWith('user-1');
    });
  });
});
