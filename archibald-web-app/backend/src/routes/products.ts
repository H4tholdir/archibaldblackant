import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { ProductRow } from '../db/repositories/products';
import { logger } from '../logger';

type ProductsRouterDeps = {
  pool: DbPool;
  getProducts: (searchQuery?: string) => Promise<ProductRow[]>;
  getProductById: (productId: string) => Promise<ProductRow | undefined>;
  getProductCount: () => Promise<number>;
  getProductVariants: (articleName: string) => Promise<ProductRow[]>;
  updateProductPrice: (productId: string, price: number, vat: number | null, priceSource: string, vatSource: string | null) => Promise<boolean>;
  getLastSyncTime: () => Promise<number | null>;
};

const vatSchema = z.object({ vat: z.number().min(0).max(100) });
const priceSchema = z.object({ price: z.number().min(0) });

function createProductsRouter(deps: ProductsRouterDeps) {
  const { getProducts, getProductById, getProductCount, getProductVariants, updateProductPrice, getLastSyncTime } = deps;
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

  router.get('/count', async (_req: AuthRequest, res) => {
    try {
      const count = await getProductCount();
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error counting products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti' });
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

export { createProductsRouter, type ProductsRouterDeps };
