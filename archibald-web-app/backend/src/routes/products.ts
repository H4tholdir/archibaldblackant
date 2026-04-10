import { Router } from 'express';
import { z } from 'zod';
import { parseKometFeatures } from '../utils/komet-code-parser';
import type { AuthRequest } from '../middleware/auth';
import type { ProductRow } from '../db/repositories/products';
import type { SyncSession, SyncStats } from '../db/repositories/sync-sessions';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';
import type { GalleryRow } from '../db/repositories/product-gallery';
import { getProductDetails } from '../db/repositories/product-details';
import type { ProductDetailsRow } from '../db/repositories/product-details';
import type { WebResourceRow } from '../db/repositories/product-web-resources';

function mapProductRow(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupCode: row.group_code,
    searchName: row.search_name,
    priceUnit: row.price_unit,
    productGroupId: row.product_group_id,
    productGroupDescription: row.product_group_description,
    packageContent: row.package_content,
    minQty: row.min_qty,
    multipleQty: row.multiple_qty,
    maxQty: row.max_qty,
    price: row.price,
    priceSource: row.price_source,
    priceUpdatedAt: row.price_updated_at,
    vat: row.vat,
    vatSource: row.vat_source,
    vatUpdatedAt: row.vat_updated_at,
    hash: row.hash,
    lastSync: row.last_sync,
    figure: row.figure,
    size: row.size,
    bulkArticleId: row.bulk_article_id,
    legPackage: row.leg_package,
    configurationId: row.configuration_id,
    createdBy: row.created_by,
    createdDate: row.created_date_field,
    dataAreaId: row.data_area_id,
    defaultQty: row.default_qty,
    displayProductNumber: row.display_product_number,
    totalAbsoluteDiscount: row.total_absolute_discount,
    productId: row.product_id_ext,
    lineDiscount: row.line_discount,
    modifiedBy: row.modified_by,
    modifiedDatetime: row.modified_datetime,
    orderableArticle: row.orderable_article,
    stopped: row.stopped,
    purchPrice: row.purch_price,
    pcsStandardConfigurationId: row.pcs_standard_configuration_id,
    standardQty: row.standard_qty,
    unitId: row.unit_id,
    isRetired: row.deleted_at !== null,
  };
}

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

type FuzzySearchResult = {
  product: ProductRow;
  confidence: number;
  matchReason: 'exact' | 'normalized' | 'fuzzy';
};

type ProductsRouterDeps = {
  queue: QueueLike;
  getProducts: (filters?: string | {
    searchQuery?: string;
    vatFilter?: 'missing';
    priceFilter?: 'zero';
    discountFilter?: 'missing';
    userId?: string;
    limit?: number;
  }) => Promise<ProductRow[]>;
  getProductById: (productId: string) => Promise<ProductRow | undefined>;
  getProductCount: () => Promise<number>;
  getZeroPriceCount: () => Promise<number>;
  getNoVatCount: () => Promise<number>;
  getMissingFresisDiscountCount: (userId: string) => Promise<number>;
  getProductVariants: (articleName: string) => Promise<ProductRow[]>;
  updateProductPrice: (productId: string, price: number, vat: number | null, priceSource: string, vatSource: string | null) => Promise<boolean>;
  getLastSyncTime: () => Promise<number | null>;
  getProductChanges: (productId: string) => Promise<ProductChange[]>;
  getRecentProductChanges: (days: number, limit: number) => Promise<ProductChange[]>;
  getProductChangeStats: (days: number) => Promise<ProductChangeStats>;
  getSyncHistory?: (limit: number) => Promise<SyncSession[]>;
  getLastSyncSession?: () => Promise<SyncSession | null>;
  getSyncStats?: () => Promise<SyncStats>;
  fuzzySearchProducts?: (query: string, limit: number) => Promise<FuzzySearchResult[]>;
  getDistinctProductNames: (searchQuery?: string, limit?: number) => Promise<string[]>;
  getDistinctProductNamesCount: (searchQuery?: string) => Promise<number>;
  getVariantPackages: (articleName: string) => Promise<string[]>;
  getVariantPriceRange: (articleName: string) => Promise<{ min: number | null; max: number | null }>;
  getProductPricesByNames?: (names: string[]) => Promise<Map<string, { price: number; vat: number } | null>>;
  getProductGallery?: (productId: string) => Promise<GalleryRow[]>;
  getRecognitionHistory?: (productId: string, limit: number) => Promise<Array<{ scanned_at: Date; agent_id: string; confidence: number | null; cache_hit: boolean }>>;
  getProductVariantsForEnrichment?: (articleName: string) => Promise<ProductRow[]>;
  getProductDetails?: (productId: string) => Promise<ProductDetailsRow | null>;
  getProductWebResources?: (productId: string) => Promise<WebResourceRow[]>;
  getShankLengthMm?: (productId: string, shankCode: string) => Promise<number | null>;
  getProductPictograms?: (productId: string) => Promise<Array<{ symbol: string; labelIt: string }>>;
};

const vatSchema = z.object({ vat: z.number().min(0).max(100) });
const priceSchema = z.object({ price: z.number().min(0) });

function createProductsRouter(deps: ProductsRouterDeps) {
  const {
    queue, getProducts, getProductById, getProductCount,
    getZeroPriceCount, getNoVatCount, getMissingFresisDiscountCount, getProductVariants,
    updateProductPrice, getLastSyncTime,
    getProductChanges, getRecentProductChanges, getProductChangeStats,
    getDistinctProductNames, getDistinctProductNamesCount,
    getVariantPackages, getVariantPriceRange,
  } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const search = req.query.search as string | undefined;
      const grouped = req.query.grouped === 'true';
      const vatFilter = req.query.vatFilter === 'missing' ? 'missing' as const : undefined;
      const priceFilter = req.query.priceFilter === 'zero' ? 'zero' as const : undefined;
      const discountFilter = req.query.discountFilter === 'missing' ? 'missing' as const : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      if (grouped && !vatFilter && !priceFilter && !discountFilter) {
        const groupedLimit = limit ?? 200;
        const productNames = await getDistinctProductNames(search, groupedLimit);
        const baseProducts = await Promise.all(
          productNames.map(async (name) => {
            const variants = await getProductVariants(name);
            return variants.length > 0 ? variants[variants.length - 1] : null;
          }),
        );
        const validProducts = baseProducts.filter(Boolean) as ProductRow[];

        const enriched = await Promise.all(
          validProducts.map(async (p) => {
            const [packages, priceRange] = await Promise.all([
              getVariantPackages(p.name),
              getVariantPriceRange(p.name),
            ]);
            return {
              ...mapProductRow(p),
              variantPackages: packages,
              variantPriceMin: priceRange.min,
              variantPriceMax: priceRange.max,
            };
          }),
        );

        const totalCount = await getDistinctProductNamesCount(search);

        res.json({
          success: true,
          data: {
            products: enriched,
            totalCount,
            returnedCount: enriched.length,
            limited: enriched.length >= groupedLimit,
            grouped: true,
          },
        });
        return;
      }

      const products = await getProducts({
        searchQuery: search,
        vatFilter,
        priceFilter,
        discountFilter,
        userId: discountFilter ? req.user!.userId : undefined,
        limit,
      });
      res.json({
        success: true,
        data: {
          products: products.map(mapProductRow),
          totalCount: products.length,
          returnedCount: products.length,
          limited: false,
        },
      });
    } catch (error) {
      logger.error('Error fetching products', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prodotti' });
    }
  });

  router.get('/search', async (req: AuthRequest, res) => {
    try {
      const query = req.query.q as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!query || query.trim().length === 0) {
        res.status(400).json({ success: false, error: "Query parameter 'q' is required" });
        return;
      }

      if (deps.fuzzySearchProducts) {
        const results = await deps.fuzzySearchProducts(query, limit);
        res.json({
          success: true,
          data: results.map((r) => ({
            id: r.product.id,
            name: r.product.name,
            description: r.product.description,
            packageContent: r.product.package_content,
            multipleQty: r.product.multiple_qty,
            price: r.product.price,
            confidence: Math.round(r.confidence * 100),
            matchReason: r.matchReason,
          })),
        });
      } else {
        const products = await getProducts(query);
        res.json({ success: true, data: products });
      }
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
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error('Error counting zero-price products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti senza prezzo' });
    }
  });

  router.get('/no-vat-count', async (_req: AuthRequest, res) => {
    try {
      const count = await getNoVatCount();
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error('Error counting no-vat products', { error });
      res.status(500).json({ success: false, error: 'Errore nel conteggio prodotti senza IVA' });
    }
  });

  router.get('/missing-fresis-discount-count', async (req: AuthRequest, res) => {
    try {
      const count = await getMissingFresisDiscountCount(req.user!.userId);
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error('Error fetching missing Fresis discount count', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero conteggio sconti mancanti' });
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

  router.get('/sync/metrics', async (_req: AuthRequest, res) => {
    if (!deps.getSyncStats) {
      return res.status(501).json({ success: false, error: 'Sync metrics non configurate' });
    }
    try {
      const stats = await deps.getSyncStats();
      res.json({ success: true, metrics: stats, history: stats.recentHistory });
    } catch (error) {
      logger.error('Error fetching sync metrics', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero metriche sync' });
    }
  });

  router.get('/sync-history', async (req: AuthRequest, res) => {
    if (!deps.getSyncHistory) {
      return res.status(501).json({ success: false, error: 'Sync history non configurata' });
    }
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const sessions = await deps.getSyncHistory(limit);
      res.json({ success: true, sessions, count: sessions.length });
    } catch (error) {
      logger.error('Error fetching sync history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico sync' });
    }
  });

  router.get('/last-sync', async (_req: AuthRequest, res) => {
    if (!deps.getLastSyncSession) {
      return res.status(501).json({ success: false, error: 'Last sync non configurato' });
    }
    try {
      const session = await deps.getLastSyncSession();
      res.json({ success: true, session });
    } catch (error) {
      logger.error('Error fetching last sync session', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ultima sessione sync' });
    }
  });

  router.get('/prices', async (req: AuthRequest, res) => {
    if (!deps.getProductPricesByNames) {
      return res.status(501).json({ success: false, error: 'Endpoint prezzi batch non configurato' });
    }
    try {
      const raw = req.query.names as string | undefined;
      if (!raw || raw.trim() === '') {
        return res.status(400).json({ success: false, error: "Query parameter 'names' è obbligatorio" });
      }
      const names = raw.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length > 200) {
        return res.status(400).json({ success: false, error: 'Massimo 200 articoli per richiesta' });
      }
      const priceMap = await deps.getProductPricesByNames(names);
      const data: Record<string, { price: number; vat: number } | null> = {};
      for (const [name, value] of priceMap) data[name] = value;
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching product prices by names', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prezzi articoli' });
    }
  });

  router.get('/:productId', async (req: AuthRequest, res) => {
    try {
      const product = await getProductById(req.params.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Prodotto non trovato' });
      }
      res.json({ success: true, data: mapProductRow(product) });
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
      res.json({
        success: true,
        data: {
          productName: articleName,
          variantCount: variants.length,
          variants: variants.map(mapProductRow),
        },
      });
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

  router.get('/:productId/enrichment', async (req: AuthRequest, res) => {
    const { productId } = req.params;
    try {
      const [gallery, history, details, webResources] = await Promise.all([
        deps.getProductGallery        ? deps.getProductGallery(productId)           : Promise.resolve([]),
        deps.getRecognitionHistory    ? deps.getRecognitionHistory(productId, 10)   : Promise.resolve([]),
        deps.getProductDetails        ? deps.getProductDetails(productId)           : Promise.resolve(null),
        deps.getProductWebResources   ? deps.getProductWebResources(productId)      : Promise.resolve([]),
      ]);

      const sizeVariants: Array<{ id: string; name: string; price: number | null }> = [];
      if (deps.getProductVariantsForEnrichment && deps.getProductById) {
        const product = await deps.getProductById(productId);
        if (product?.name) {
          const variants = await deps.getProductVariantsForEnrichment(product.name);
          for (const v of variants) {
            sizeVariants.push({ id: v.id, name: v.name, price: v.price });
          }
        }
      }

      const shankCode = productId.split('.')[1] ?? '';
      const [shankLengthMm, pictograms] = await Promise.all([
        deps.getShankLengthMm ? deps.getShankLengthMm(productId, shankCode) : Promise.resolve(null),
        deps.getProductPictograms ? deps.getProductPictograms(productId) : Promise.resolve([]),
      ]);

      const mappedGallery = gallery.map(g => ({
        id:        g.id,
        url:       g.url,
        imageType: g.image_type,
        source:    g.source,
        altText:   g.alt_text,
        sortOrder: g.sort_order,
      }));

      const videoUrl = webResources.find(r => r.resource_type === 'video')?.url
        ?? details?.video_url
        ?? null;
      const pdfUrl = webResources.find(r => r.resource_type === 'pdf')?.url
        ?? details?.pdf_url
        ?? null;

      const mappedDetails = details ? {
        clinicalDescription: details.clinical_indications,
        procedures:          details.usage_notes,
        rpmMax:              details.rpm_max,
        packagingUnits:      details.packaging_units,
        sterile:             details.sterile,
        singleUse:           details.single_use,
        notes:               details.notes,
        videoUrl,
        pdfUrl,
        sourceUrl:           details.source_url,
      } : null;

      res.json({
        gallery: mappedGallery,
        details: mappedDetails,
        competitors: [],
        sizeVariants,
        shankLengthMm,
        pictograms,
        features: parseKometFeatures(productId),
        recognitionHistory: history.length > 0 ? history.map((h) => ({
          scannedAt:  h.scanned_at,
          agentId:    h.agent_id,
          confidence: h.confidence,
          cacheHit:   h.cache_hit,
        })) : null,
      });
    } catch (error) {
      logger.error('Failed to fetch product enrichment', { productId, error });
      res.status(500).json({ error: 'Internal server error' });
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
