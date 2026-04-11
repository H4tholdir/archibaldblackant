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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  router.get('/download/:key', async (req: AuthRequest, res) => {
    const { key } = req.params;

    if (!UUID_RE.test(key)) {
      return res.status(400).json({ success: false, error: 'Chiave non valida' });
    }

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
