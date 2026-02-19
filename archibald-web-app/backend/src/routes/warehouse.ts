import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { WarehouseBox, WarehouseBoxDetail, WarehouseItem } from '../db/repositories/warehouse';
import { logger } from '../logger';

type WarehouseRouterDeps = {
  pool: DbPool;
  getBoxes: (userId: string) => Promise<WarehouseBox[]>;
  createBox: (userId: string, name: string, description?: string, color?: string) => Promise<WarehouseBoxDetail>;
  renameBox: (userId: string, oldName: string, newName: string) => Promise<void>;
  deleteBox: (userId: string, name: string) => Promise<boolean>;
  getItemsByBox: (userId: string, boxName: string) => Promise<WarehouseItem[]>;
  addItem: (userId: string, articleCode: string, description: string, quantity: number, boxName: string, deviceId: string) => Promise<WarehouseItem>;
  updateItemQuantity: (userId: string, itemId: number, quantity: number) => Promise<boolean>;
  deleteItem: (userId: string, itemId: number) => Promise<boolean>;
  moveItems: (userId: string, itemIds: number[], destinationBox: string) => Promise<number>;
  clearAllItems: (userId: string) => Promise<number>;
  getItemById: (userId: string, itemId: number) => Promise<WarehouseItem | null>;
  ensureBoxExists: (userId: string, boxName: string) => Promise<void>;
  getAllItems: (userId: string) => Promise<WarehouseItem[]>;
  bulkStoreItems: (userId: string, items: Array<{ articleCode: string; description: string; quantity: number; boxName: string; deviceId: string }>, clearExisting: boolean) => Promise<number>;
  batchReserve: (userId: string, itemIds: number[], orderId: string, tracking?: { customerName?: string; subClientName?: string; orderDate?: string; orderNumber?: string }) => Promise<{ reserved: number; skipped: number }>;
  batchRelease: (userId: string, orderId: string) => Promise<number>;
  batchMarkSold: (userId: string, orderId: string, tracking?: { customerName?: string; subClientName?: string; orderDate?: string; orderNumber?: string }) => Promise<number>;
  batchTransfer: (userId: string, fromOrderIds: string[], toOrderId: string) => Promise<number>;
  getMetadata: (userId: string) => Promise<{ totalItems: number; totalQuantity: number; boxesCount: number; reservedCount: number; soldCount: number }>;
  validateArticle?: (articleCode: string) => Promise<{ valid: boolean; productName?: string }>;
  importExcel?: (userId: string, buffer: Buffer, filename: string) => Promise<{ success: boolean; imported?: number; skipped?: number; errors?: string[] }>;
};

const createBoxSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});

const addItemSchema = z.object({
  articleCode: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  boxName: z.string().min(1),
});

const moveItemsSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
  destinationBox: z.string().min(1),
});

const manualAddSchema = z.object({
  articleCode: z.string().min(1),
  quantity: z.number().int().positive(),
  boxName: z.string().min(1),
});

const bulkStoreSchema = z.object({
  items: z.array(z.object({
    articleCode: z.string().min(1),
    description: z.string(),
    quantity: z.number().int().positive(),
    boxName: z.string().min(1),
    deviceId: z.string().optional(),
  })).min(1),
  clearExisting: z.boolean().optional().default(false),
});

const trackingSchema = z.object({
  customerName: z.string().optional(),
  subClientName: z.string().optional(),
  orderDate: z.string().optional(),
  orderNumber: z.string().optional(),
}).optional();

const batchReserveSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
  orderId: z.string().min(1),
  tracking: trackingSchema,
});

const batchReleaseSchema = z.object({
  orderId: z.string().min(1),
});

const batchMarkSoldSchema = z.object({
  orderId: z.string().min(1),
  tracking: trackingSchema,
});

const batchTransferSchema = z.object({
  fromOrderIds: z.array(z.string().min(1)).min(1),
  toOrderId: z.string().min(1),
});

const warehouseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function createWarehouseRouter(deps: WarehouseRouterDeps) {
  const {
    getBoxes, createBox, renameBox, deleteBox, getItemsByBox, addItem,
    updateItemQuantity, deleteItem, moveItems, clearAllItems, ensureBoxExists,
    getAllItems, bulkStoreItems, batchReserve, batchRelease, batchMarkSold, batchTransfer, getMetadata, getItemById,
  } = deps;
  const router = Router();

  router.get('/boxes', async (req: AuthRequest, res) => {
    try {
      const boxes = await getBoxes(req.user!.userId);
      res.json({ success: true, boxes });
    } catch (error) {
      logger.error('Error fetching boxes', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero scatole' });
    }
  });

  router.post('/boxes', async (req: AuthRequest, res) => {
    try {
      const parsed = createBoxSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const box = await createBox(req.user!.userId, parsed.data.name, parsed.data.description, parsed.data.color);
      res.status(201).json({ success: true, box });
    } catch (error) {
      logger.error('Error creating box', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione scatola' });
    }
  });

  router.put('/boxes/:oldName', async (req: AuthRequest, res) => {
    try {
      const { newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        return res.status(400).json({ success: false, error: 'Nome richiesto' });
      }
      await renameBox(req.user!.userId, req.params.oldName, newName);
      res.json({ success: true, updatedItems: 0, updatedOrders: 0 });
    } catch (error) {
      logger.error('Error renaming box', { error });
      res.status(500).json({ success: false, error: 'Errore nella rinomina scatola' });
    }
  });

  router.delete('/boxes/:name', async (req: AuthRequest, res) => {
    try {
      const deleted = await deleteBox(req.user!.userId, req.params.name);
      if (!deleted) {
        return res.status(409).json({ success: false, error: 'La scatola contiene ancora articoli' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting box', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione scatola' });
    }
  });

  router.get('/boxes/:name/items', async (req: AuthRequest, res) => {
    try {
      const items = await getItemsByBox(req.user!.userId, req.params.name);
      res.json({ success: true, data: items });
    } catch (error) {
      logger.error('Error fetching box items', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero articoli' });
    }
  });

  router.post('/items', async (req: AuthRequest, res) => {
    try {
      const parsed = addItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { articleCode, description, quantity, boxName } = parsed.data;
      const deviceId = req.user!.deviceId || 'unknown';
      await ensureBoxExists(req.user!.userId, boxName);
      const item = await addItem(req.user!.userId, articleCode, description, quantity, boxName, deviceId);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      logger.error('Error adding item', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'aggiunta articolo' });
    }
  });

  router.put('/items/:id', async (req: AuthRequest, res) => {
    try {
      const { quantity } = req.body;
      if (typeof quantity !== 'number' || quantity < 0) {
        return res.status(400).json({ success: false, error: 'Quantità non valida' });
      }
      const itemId = parseInt(req.params.id, 10);
      const updated = await updateItemQuantity(req.user!.userId, itemId, quantity);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Articolo non trovato o non modificabile' });
      }
      const item = await getItemById(req.user!.userId, itemId);
      res.json({ success: true, data: { item } });
    } catch (error) {
      logger.error('Error updating item', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'aggiornamento articolo' });
    }
  });

  router.delete('/items/:id', async (req: AuthRequest, res) => {
    try {
      const deleted = await deleteItem(req.user!.userId, parseInt(req.params.id, 10));
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Articolo non trovato o non eliminabile' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting item', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione articolo' });
    }
  });

  router.post('/items/move', async (req: AuthRequest, res) => {
    try {
      const parsed = moveItemsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      await ensureBoxExists(req.user!.userId, parsed.data.destinationBox);
      const moved = await moveItems(req.user!.userId, parsed.data.itemIds, parsed.data.destinationBox);
      res.json({ success: true, movedCount: moved, skippedCount: 0 });
    } catch (error) {
      logger.error('Error moving items', { error });
      res.status(500).json({ success: false, error: 'Errore nello spostamento articoli' });
    }
  });

  router.delete('/clear-all', async (req: AuthRequest, res) => {
    try {
      const deleted = await clearAllItems(req.user!.userId);
      res.json({ success: true, itemsDeleted: deleted, boxesDeleted: 0 });
    } catch (error) {
      logger.error('Error clearing warehouse', { error });
      res.status(500).json({ success: false, error: 'Errore nella pulizia magazzino' });
    }
  });

  router.get('/items', async (req: AuthRequest, res) => {
    try {
      const items = await getAllItems(req.user!.userId);
      res.json({ success: true, items });
    } catch (error) {
      logger.error('Error fetching all items', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero articoli' });
    }
  });

  router.post('/items/manual-add', async (req: AuthRequest, res) => {
    try {
      const parsed = manualAddSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { articleCode, quantity, boxName } = parsed.data;
      const deviceId = req.user!.deviceId || 'unknown';
      await ensureBoxExists(req.user!.userId, boxName);
      const item = await addItem(req.user!.userId, articleCode, articleCode, quantity, boxName, deviceId);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      logger.error('Error manually adding item', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'aggiunta manuale articolo' });
    }
  });

  router.post('/items/bulk', async (req: AuthRequest, res) => {
    try {
      const parsed = bulkStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const deviceId = req.user!.deviceId || 'unknown';
      const items = parsed.data.items.map((item) => ({
        ...item,
        deviceId: item.deviceId ?? deviceId,
      }));
      const inserted = await bulkStoreItems(req.user!.userId, items, parsed.data.clearExisting);
      res.json({ success: true, inserted });
    } catch (error) {
      logger.error('Error bulk storing items', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'inserimento massivo articoli' });
    }
  });

  router.post('/items/batch-reserve', async (req: AuthRequest, res) => {
    try {
      const parsed = batchReserveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const result = await batchReserve(req.user!.userId, parsed.data.itemIds, parsed.data.orderId, parsed.data.tracking ?? undefined);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error batch reserving items', { error });
      res.status(500).json({ success: false, error: 'Errore nella prenotazione articoli' });
    }
  });

  router.post('/items/batch-release', async (req: AuthRequest, res) => {
    try {
      const parsed = batchReleaseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const released = await batchRelease(req.user!.userId, parsed.data.orderId);
      res.json({ success: true, released });
    } catch (error) {
      logger.error('Error batch releasing items', { error });
      res.status(500).json({ success: false, error: 'Errore nel rilascio articoli' });
    }
  });

  router.post('/items/batch-mark-sold', async (req: AuthRequest, res) => {
    try {
      const parsed = batchMarkSoldSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const sold = await batchMarkSold(req.user!.userId, parsed.data.orderId, parsed.data.tracking ?? undefined);
      res.json({ success: true, sold });
    } catch (error) {
      logger.error('Error batch marking items as sold', { error });
      res.status(500).json({ success: false, error: 'Errore nella marcatura articoli come venduti' });
    }
  });

  router.post('/items/batch-transfer', async (req: AuthRequest, res) => {
    try {
      const parsed = batchTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const transferred = await batchTransfer(req.user!.userId, parsed.data.fromOrderIds, parsed.data.toOrderId);
      res.json({ success: true, transferred });
    } catch (error) {
      logger.error('Error batch transferring items', { error });
      res.status(500).json({ success: false, error: 'Errore nel trasferimento articoli' });
    }
  });

  router.get('/metadata', async (req: AuthRequest, res) => {
    try {
      const metadata = await getMetadata(req.user!.userId);
      res.json({ success: true, metadata });
    } catch (error) {
      logger.error('Error fetching warehouse metadata', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero metadati magazzino' });
    }
  });

  router.post('/upload', warehouseUpload.single('file'), async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'File Excel richiesto' });
      }
      if (!deps.importExcel) {
        return res.status(501).json({ success: false, error: 'Import Excel non configurato' });
      }
      const result = await deps.importExcel(req.user!.userId, file.buffer, file.originalname);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error uploading warehouse file', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'upload file magazzino' });
    }
  });

  router.get('/items/validate', async (req: AuthRequest, res) => {
    try {
      const articleCode = req.query.articleCode as string | undefined;
      if (!articleCode) {
        return res.status(400).json({ success: false, error: 'Codice articolo richiesto' });
      }
      if (!deps.validateArticle) {
        return res.status(501).json({ success: false, error: 'Validazione articoli non configurata' });
      }
      const result = await deps.validateArticle(articleCode);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error validating article', { error });
      res.status(500).json({ success: false, error: 'Errore nella validazione articolo' });
    }
  });

  return router;
}

export { createWarehouseRouter, type WarehouseRouterDeps };
