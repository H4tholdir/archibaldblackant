import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { DocumentStoreLike } from '../services/document-store';
import { logger } from '../logger';

type DocumentsRouterDeps = {
  documentStore: DocumentStoreLike;
};

function createDocumentsRouter(deps: DocumentsRouterDeps) {
  const { documentStore } = deps;
  const router = Router();

  router.get('/download/:key', async (req: AuthRequest, res) => {
    const { key } = req.params;

    try {
      const buffer = await documentStore.get(key);

      if (!buffer) {
        return res.status(404).json({ success: false, error: 'Documento non trovato o scaduto' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${key}.pdf"`);
      res.send(buffer);
    } catch (error) {
      logger.error('Failed to retrieve document', { key, error });
      res.status(500).json({ success: false, error: 'Errore nel recupero del documento' });
    }
  });

  return router;
}

export { createDocumentsRouter, type DocumentsRouterDeps };
