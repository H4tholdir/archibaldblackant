import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { ProductRow } from '../db/repositories/products';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

type ProductChange = {
  productId: string;
  changeType: string;
  changedAt: number;
  syncSessionId: string | null;
};

type ProductChangeStats = {
  created: number;
  updated: number;
  deleted: number;
};

type QueueLike = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
};

type ProductsRouterDeps = {
  queue: QueueLike;
  getProducts: (searchQuery?: string) => Promise<ProductRow[]>;
  getProductById: (productId: string) => Promise<ProductRow | undefined>;
  getProductCount: () => Promise<number>;
  getZeroPriceCount: () => Promise<number>;
  getNoVatCount: () => Promise<number>;
  getProductVariants: (articleName: string) => Promise<ProductRow[]>;
  updateProductPrice: (productId: string, price: number, vat: number | null, priceSource: string, vatSource: string | null) => Promise<boolean>;
  getLastSyncTime: () => Promise<number | null>;
  getProductChanges: (productId: string) => Promise<ProductChange[]>;
  getRecentProductChanges: (days: number, limit: number) => Promise<ProductChange[]>;
  getProductChangeStats: (days: number) => Promise<ProductChangeStats>;
};

const vatSchema = z.object({ vat: z.number().min(0).max(100) });
const priceSchema = z.object({ price: z.number().min(0) });

function createProductsRouter(deps: ProductsRouterDeps) {
  const {
    queue, getProducts, getProductById, getProductCount,
    getZeroPriceCount, getNoVatCount, getProductVariants,
    updateProductPrice, getLastSyncTime,
    getProductChanges, getRecentProductChanges, getProductChangeStats,
  } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const search = req.query.search as string | undefined;
      const products = await getProducts(search);
      res.json({ success: true, data: products });
    } catch (error) {
      logger.error('Error fetching products', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prodotti' });
    }
  });

  router.get('/search', async (req: AuthRequest, res) => {
    try {
      const query = req.query.q as string | undefined;
      const products = await getProducts(query);
      res.json({ success: true, data: products });
    } catch (error) {
      logger.error('Error searching products', { error });
      res.status(500).json({ success: false, error: 'Errore nella ricerca prodotti' });
    }
  });

  router.get('/count', async (_req: AuthRequest, res) => {
    try {
      const count = await getProductCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error counting products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti' });
    }
  });

  router.get('/zero-price-count', async (_req: AuthRequest, res) => {
    try {
      const count = await getZeroPriceCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error counting zero-price products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti senza prezzo' });
    }
  });

  router.get('/no-vat-count', async (_req: AuthRequest, res) => {
    try {
      const count = await getNoVatCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error counting no-vat products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti senza IVA' });
    }
  });

  router.get('/sync-status', async (_req: AuthRequest, res) => {
    try {
      const [count, lastSync] = await Promise.all([getProductCount(), getLastSyncTime()]);
      res.json({ success: true, count, lastSync });
    } catch (error) {
      logger.error('Error fetching products sync status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato sync' });
    }
  });

  router.get('/variations/recent/:days?', async (req: AuthRequest, res) => {
    try {
      const days = req.params.days ? parseInt(req.params.days, 10) : 30;
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ success: false, error: 'Parametro giorni non valido' });
      }
      const [changes, stats] = await Promise.all([
        getRecentProductChanges(days, 1000),
        getProductChangeStats(days),
      ]);
      res.json({ success: true, daysBack: days, stats, changes });
    } catch (error) {
      logger.error('Error fetching recent product variations', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero variazioni recenti' });
    }
  });

  router.get('/variations/product/:productId', async (req: AuthRequest, res) => {
    try {
      const history = await getProductChanges(req.params.productId);
      res.json({ success: true, productId: req.params.productId, historyCount: history.length, history });
    } catch (error) {
      logger.error('Error fetching product variation history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico variazioni prodotto' });
    }
  });

  router.post('/sync', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobId = await queue.enqueue('sync-products', userId, {});
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing product sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio sincronizzazione prodotti' });
    }
  });

  router.get('/:productId', async (req: AuthRequest, res) => {
    try {
      const product = await getProductById(req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Prodotto non trovato' });
      }
      res.json({ success: true, data: product });
    } catch (error) {
      logger.error('Error fetching product', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prodotto' });
    }
  });

  router.get('/:productId/variants', async (req: AuthRequest, res) => {
    try {
      const product = await getProductById(req.params.productId);
      const articleName = product?.name ?? req.params.productId;
      const variants = await getProductVariants(articleName);
      res.json({ success: true, data: variants });
    } catch (error) {
      logger.error('Error fetching product variants', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero varianti' });
    }
  });

  router.get('/:productId/changes', async (req: AuthRequest, res) => {
    try {
      const history = await getProductChanges(req.params.productId);
      res.json({ success: true, productId: req.params.productId, historyCount: history.length, history });
    } catch (error) {
      logger.error('Error fetching product changes', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico modifiche prodotto' });
    }
  });

  router.patch('/:productId/vat', async (req: AuthRequest, res) => {
    try {
      const parsed = vatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const product = await getProductById(req.params.productId);
      const currentPrice = product?.price ?? 0;
      await updateProductPrice(req.params.productId, currentPrice, parsed.data.vat, product?.price_source ?? 'sync', 'manual');
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating product VAT', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento IVA' });
    }
  });

  router.patch('/:productId/price', async (req: AuthRequest, res) => {
    try {
      const parsed = priceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const product = await getProductById(req.params.productId);
      const currentVat = product?.vat ?? null;
      await updateProductPrice(req.params.productId, parsed.data.price, currentVat, 'manual', product?.vat_source ?? null);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating product price', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento prezzo' });
    }
  });

  return router;
}

export { createProductsRouter, type ProductsRouterDeps, type ProductChange, type ProductChangeStats };
