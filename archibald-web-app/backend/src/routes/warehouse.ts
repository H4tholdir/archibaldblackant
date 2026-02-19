import { Router } from 'express';
import { z } from 'zod';
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
  validateArticle?: (articleCode: string) => Promise<{ valid: boolean; productName?: string }>;
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

function createWarehouseRouter(deps: WarehouseRouterDeps) {
  const { getBoxes, createBox, renameBox, deleteBox, getItemsByBox, addItem, updateItemQuantity, deleteItem, moveItems, clearAllItems, ensureBoxExists } = deps;
  const router = Router();

  router.get('/boxes', async (req: AuthRequest, res) => {
    try {
      const boxes = await getBoxes(req.user!.userId);
      res.json({ success: true, data: boxes });
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
      res.status(201).json({ success: true, data: box });
    } catch (error) {
      logger.error('Error creating box', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione scatola' });
    }
  });

  router.put('/boxes/:oldName', async (req: AuthRequest, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ success: false, error: 'Nome richiesto' });
      }
      await renameBox(req.user!.userId, req.params.oldName, name);
      res.json({ success: true });
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
      const updated = await updateItemQuantity(req.user!.userId, parseInt(req.params.id, 10), quantity);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Articolo non trovato o non modificabile' });
      }
      res.json({ success: true });
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
      res.json({ success: true, moved });
    } catch (error) {
      logger.error('Error moving items', { error });
      res.status(500).json({ success: false, error: 'Errore nello spostamento articoli' });
    }
  });

  router.delete('/clear-all', async (req: AuthRequest, res) => {
    try {
      const deleted = await clearAllItems(req.user!.userId);
      res.json({ success: true, deleted });
    } catch (error) {
      logger.error('Error clearing warehouse', { error });
      res.status(500).json({ success: false, error: 'Errore nella pulizia magazzino' });
    }
  });

  return router;
}

export { createWarehouseRouter, type WarehouseRouterDeps };
