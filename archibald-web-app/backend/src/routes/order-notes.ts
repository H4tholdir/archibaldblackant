import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { OrderNote } from '../db/repositories/order-notes';
import { logger } from '../logger';

type OrderNotesRouterDeps = {
  getNotes: (userId: string, orderId: string) => Promise<OrderNote[]>;
  getNotesSummary: (userId: string, orderIds: string[]) => Promise<Map<string, { total: number; checked: number }>>;
  getNotesPreviews: (userId: string, orderIds: string[]) => Promise<Map<string, Array<{ text: string; checked: boolean }>>>;
  createNote: (userId: string, orderId: string, text: string) => Promise<OrderNote>;
  updateNote: (userId: string, noteId: number, updates: { text?: string; checked?: boolean }) => Promise<OrderNote | null>;
  deleteNote: (userId: string, noteId: number) => Promise<boolean>;
};

const createNoteSchema = z.object({
  text: z.string().min(1).max(500),
});

const updateNoteSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  checked: z.boolean().optional(),
}).refine((data) => data.text !== undefined || data.checked !== undefined, {
  message: 'At least one of text or checked must be provided',
});

const notesSummarySchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(500),
});

function createOrderNotesRouter(deps: OrderNotesRouterDeps) {
  const { getNotes, getNotesSummary, getNotesPreviews, createNote, updateNote, deleteNote } = deps;
  const router = Router();

  router.get('/:orderId/notes', async (req: AuthRequest, res) => {
    try {
      const notes = await getNotes(req.user!.userId, req.params.orderId);
      res.json({ success: true, notes });
    } catch (error) {
      logger.error('Error fetching order notes', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero note ordine' });
    }
  });

  router.post('/notes-summary', async (req: AuthRequest, res) => {
    try {
      const parsed = notesSummarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const userId = req.user!.userId;
      const orderIds = parsed.data.orderIds;
      const [summaryMap, previewsMap] = await Promise.all([
        getNotesSummary(userId, orderIds),
        getNotesPreviews(userId, orderIds),
      ]);
      const summary: Record<string, { total: number; checked: number }> = {};
      for (const [orderId, counts] of summaryMap) {
        summary[orderId] = counts;
      }
      const previews: Record<string, Array<{ text: string; checked: boolean }>> = {};
      for (const [orderId, items] of previewsMap) {
        previews[orderId] = items;
      }
      res.json({ success: true, summary, previews });
    } catch (error) {
      logger.error('Error fetching notes summary', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero riepilogo note' });
    }
  });

  router.post('/:orderId/notes', async (req: AuthRequest, res) => {
    try {
      const parsed = createNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const note = await createNote(req.user!.userId, req.params.orderId, parsed.data.text);
      res.status(201).json({ success: true, note });
    } catch (error) {
      logger.error('Error creating order note', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione nota ordine' });
    }
  });

  router.patch('/:orderId/notes/:noteId', async (req: AuthRequest, res) => {
    try {
      const parsed = updateNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const noteId = parseInt(req.params.noteId, 10);
      if (isNaN(noteId)) {
        return res.status(400).json({ success: false, error: 'ID nota non valido' });
      }
      const note = await updateNote(req.user!.userId, noteId, parsed.data);
      if (!note) {
        return res.status(404).json({ success: false, error: 'Nota non trovata' });
      }
      res.json({ success: true, note });
    } catch (error) {
      logger.error('Error updating order note', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'aggiornamento nota ordine' });
    }
  });

  router.delete('/:orderId/notes/:noteId', async (req: AuthRequest, res) => {
    try {
      const noteId = parseInt(req.params.noteId, 10);
      if (isNaN(noteId)) {
        return res.status(400).json({ success: false, error: 'ID nota non valido' });
      }
      const deleted = await deleteNote(req.user!.userId, noteId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Nota non trovata' });
      }
      res.json({ success: true, deleted: true });
    } catch (error) {
      logger.error('Error deleting order note', { error });
      res.status(500).json({ success: false, error: 'Errore nell\'eliminazione nota ordine' });
    }
  });

  return router;
}

export { createOrderNotesRouter, type OrderNotesRouterDeps };
