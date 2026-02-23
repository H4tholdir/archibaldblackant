import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { Subclient } from '../db/repositories/subclients';
import { logger } from '../logger';

const searchSchema = z.object({
  search: z.string().min(1).max(200).optional(),
});

const codiceSchema = z.object({
  codice: z.string().min(1).max(50),
});

type SubclientsRouterDeps = {
  getAllSubclients: () => Promise<Subclient[]>;
  searchSubclients: (query: string) => Promise<Subclient[]>;
  getSubclientByCodice: (codice: string) => Promise<Subclient | null>;
  deleteSubclient: (codice: string) => Promise<boolean>;
};

function createSubclientsRouter(deps: SubclientsRouterDeps) {
  const { getAllSubclients, searchSubclients, getSubclientByCodice, deleteSubclient } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const parsed = searchSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { search } = parsed.data;
      const data = search ? await searchSubclients(search) : await getAllSubclients();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching subclients', { error });
      res.status(500).json({ success: false, error: 'Errore recupero sottoclienti' });
    }
  });

  router.get('/:codice', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const client = await getSubclientByCodice(parsed.data.codice);
      if (!client) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true, data: client });
    } catch (error) {
      logger.error('Error fetching subclient', { error });
      res.status(500).json({ success: false, error: 'Errore recupero sottocliente' });
    }
  });

  router.delete('/:codice', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const deleted = await deleteSubclient(parsed.data.codice);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting subclient', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione sottocliente' });
    }
  });

  return router;
}

export { createSubclientsRouter, type SubclientsRouterDeps };
