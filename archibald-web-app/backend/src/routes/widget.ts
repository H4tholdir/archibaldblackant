import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';

type DashboardData = {
  heroStatus: unknown;
  kpiCards: unknown;
  bonusRoadmap: unknown;
  forecast: unknown;
  actionSuggestion: unknown;
  balance: unknown;
  extraBudget: unknown;
  alerts: unknown;
};

type OrderPeriodData = {
  orders: unknown[];
  summary: {
    totalOrders: number;
    includedCount: number;
    excludedCount: number;
    totalIncluded: number;
    totalExcluded: number;
    grandTotal: number;
  };
  period: { year: number; month: number; startDate: string; endDate: string };
};

type ExcludedOrder = {
  orderId: string;
  orderNumber: string;
  excludedFromYearly: boolean;
  excludedFromMonthly: boolean;
  reason: string | null;
};

type BudgetMetrics = {
  currentBudget: number;
  targetBudget: number;
  currency: string;
  progress: number;
  month: string;
};

type OrderMetrics = {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  timestamp: string;
  comparisonYesterday: unknown;
  comparisonLastWeek: unknown;
  comparisonLastMonth: unknown;
};

type WidgetRouterDeps = {
  getDashboardData: (userId: string) => Promise<DashboardData>;
  getOrdersForPeriod: (userId: string, year: number, month: number) => Promise<OrderPeriodData>;
  setOrderExclusion: (userId: string, orderId: string, excludeFromYearly: boolean, excludeFromMonthly: boolean, reason?: string) => Promise<void>;
  getExcludedOrders: (userId: string) => Promise<ExcludedOrder[]>;
};

type MetricsRouterDeps = {
  getBudgetMetrics: (userId: string) => Promise<BudgetMetrics>;
  getOrderMetrics: (userId: string) => Promise<OrderMetrics>;
};

const exclusionSchema = z.object({
  orderId: z.string().min(1),
  excludeFromYearly: z.boolean(),
  excludeFromMonthly: z.boolean(),
  reason: z.string().optional(),
});

function createWidgetRouter(deps: WidgetRouterDeps) {
  const { getDashboardData, getOrdersForPeriod, setOrderExclusion, getExcludedOrders } = deps;
  const router = Router();

  router.get('/dashboard-data', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const data = await getDashboardData(userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting dashboard data', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.get('/orders/exclusions', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const excluded = await getExcludedOrders(userId);
      res.json({ success: true, data: { excluded, count: excluded.length } });
    } catch (error) {
      logger.error('Error getting excluded orders', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.get('/orders/:year/:month', async (req: AuthRequest, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ success: false, error: 'Anno o mese non valido' });
      }

      const userId = req.user!.userId;
      const data = await getOrdersForPeriod(userId, year, month);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting widget orders', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/orders/exclusions', async (req: AuthRequest, res) => {
    try {
      const parsed = exclusionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      const { orderId, excludeFromYearly, excludeFromMonthly, reason } = parsed.data;

      await setOrderExclusion(userId, orderId, excludeFromYearly, excludeFromMonthly, reason);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating order exclusion', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

function createMetricsRouter(deps: MetricsRouterDeps) {
  const { getBudgetMetrics, getOrderMetrics } = deps;
  const router = Router();

  router.get('/budget', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const data = await getBudgetMetrics(userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting budget metrics', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.get('/orders', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const data = await getOrderMetrics(userId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting order metrics', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
}

export { createWidgetRouter, createMetricsRouter, type WidgetRouterDeps, type MetricsRouterDeps };
