import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';

const emailSchema = z.object({
  to: z.string().email('Formato email non valido'),
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
});

const ALLOWED_PDF_MIME_TYPES = ['application/pdf'];

type PdfStoreLike = {
  save: (buffer: Buffer, originalName: string, req: Request) => { id: string; url: string };
  get: (id: string) => { buffer: Buffer; originalName: string } | null;
  delete: (id: string) => void;
};

type ShareRouterDeps = {
  pdfStore: PdfStoreLike;
  sendEmail: (to: string, subject: string, body: string, fileBuffer: Buffer, fileName: string) => Promise<{ messageId: string }>;
  uploadToDropbox: (fileBuffer: Buffer, fileName: string) => Promise<{ path: string }>;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function createShareRouter(deps: ShareRouterDeps) {
  const { pdfStore, sendEmail, uploadToDropbox } = deps;
  const router = Router();

  router.post('/upload-pdf', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Nessun file caricato' });
      }

      const { id, url } = pdfStore.save(req.file.buffer, req.file.originalname || 'preventivo.pdf', req);

      logger.info('PDF uploaded for sharing', { id, user: req.user?.username });
      res.json({ success: true, url, id });
    } catch (error) {
      logger.error('Failed to upload PDF for sharing', { error });
      res.status(500).json({ success: false, error: 'Errore durante il caricamento' });
    }
  });

  router.get('/pdf/:id', (req: Request, res: Response) => {
    const id = req.params.id.replace(/\.pdf$/, '');
    const pdf = pdfStore.get(id);

    if (!pdf) {
      return res.status(404).json({ success: false, error: 'PDF non trovato o scaduto' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdf.originalName}"`);
    res.send(pdf.buffer);
  });

  router.post('/email', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Nessun file caricato' });
      }

      if (!ALLOWED_PDF_MIME_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({ success: false, error: 'Solo file PDF sono accettati' });
      }

      const parsed = emailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' });
      }

      const { to, subject, body } = parsed.data;

      const result = await sendEmail(
        to,
        subject || 'Preventivo',
        body || '',
        req.file.buffer,
        req.file.originalname || 'preventivo.pdf',
      );

      res.json({ success: true, messageId: result.messageId });
    } catch (error) {
      logger.error('Failed to send email', { error });
      const message = error instanceof Error ? error.message : 'Errore durante l\'invio';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/dropbox', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Nessun file caricato' });
      }

      const { fileName } = req.body;
      const result = await uploadToDropbox(
        req.file.buffer,
        fileName || req.file.originalname || 'preventivo.pdf',
      );

      res.json({ success: true, path: result.path });
    } catch (error) {
      logger.error('Failed to upload to Dropbox', { error });
      const message = error instanceof Error ? error.message : 'Errore durante l\'upload';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

export { createShareRouter, type ShareRouterDeps };
