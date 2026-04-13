import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import type { DbPool } from '../db/pool'
import type { Request, Response } from 'express'
import { requireAdmin } from '../middleware/auth'
import {
  getAllPromotions, getActivePromotions, getPromotionById,
  createPromotion, updatePromotion, deletePromotion,
} from '../db/repositories/promotions.repository'

export type PromotionsRouterDeps = {
  pool: DbPool
  uploadDir: string
}

export function createPromotionsRouter({ pool, uploadDir }: PromotionsRouterDeps): Router {
  const router = Router()

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  })
  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true)
      else cb(new Error('Solo file PDF'))
    },
  })

  // GET /api/promotions/active — tutti gli agenti autenticati
  router.get('/active', async (_req, res) => {
    try {
      const rows = await getActivePromotions(pool)
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // GET /api/promotions — solo admin
  router.get('/', requireAdmin, async (_req, res) => {
    try {
      const rows = await getAllPromotions(pool)
      res.json(rows)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // POST /api/promotions — solo admin
  router.post('/', requireAdmin, async (req, res) => {
    const { name, tagline, validFrom, validTo, triggerRules, sellingPoints, promoPrice, listPrice, isActive } = req.body
    if (!name || !validFrom || !validTo || !Array.isArray(triggerRules) || !Array.isArray(sellingPoints)) {
      res.status(400).json({ error: 'name, validFrom, validTo, triggerRules, sellingPoints sono obbligatori' })
      return
    }
    try {
      const row = await createPromotion(pool, { name, tagline, validFrom, validTo, triggerRules, sellingPoints, promoPrice, listPrice, isActive })
      res.status(201).json(row)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // PATCH /api/promotions/:id — solo admin
  router.patch('/:id', requireAdmin, async (req, res) => {
    try {
      const row = await updatePromotion(pool, req.params.id, req.body)
      if (!row) { res.status(404).json({ error: 'Not found' }); return }
      res.json(row)
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // DELETE /api/promotions/:id — solo admin
  router.delete('/:id', requireAdmin, async (req, res) => {
    try {
      const result = await deletePromotion(pool, req.params.id)
      if (!result) { res.status(404).json({ error: 'Not found' }); return }
      if (result.pdfKey) {
        const filePath = path.join(uploadDir, result.pdfKey)
        await fs.unlink(filePath).catch(() => { /* ignora se già assente */ })
      }
      res.status(204).end()
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // POST /api/promotions/:id/pdf — solo admin
  router.post('/:id/pdf', requireAdmin, (req: Request, res: Response, next) => {
    upload.single('pdf')(req, res, (err) => {
      if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' }); return }
      next()
    })
  }, async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'File PDF mancante' }); return }
    try {
      // Recupera promo per cancellare eventuale PDF precedente
      const existing = await getPromotionById(pool, req.params.id)
      if (!existing) {
        await fs.unlink(req.file.path).catch(() => {})
        res.status(404).json({ error: 'Not found' })
        return
      }
      if (existing.pdf_key) {
        await fs.unlink(path.join(uploadDir, existing.pdf_key)).catch(() => {})
      }
      const row = await updatePromotion(pool, req.params.id, { pdfKey: req.file.filename })
      res.json(row)
    } catch (e) {
      await fs.unlink(req.file.path).catch(() => {})
      res.status(500).json({ error: 'Internal error' })
    }
  })

  // GET /api/promotions/:id/pdf — tutti gli agenti autenticati
  router.get('/:id/pdf', async (req, res) => {
    try {
      const promo = await getPromotionById(pool, req.params.id)
      if (!promo?.pdf_key) { res.status(404).json({ error: 'PDF non disponibile' }); return }
      const filePath = path.join(uploadDir, promo.pdf_key)
      res.setHeader('Content-Type', 'application/pdf')
      res.sendFile(filePath, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'File non trovato' })
      })
    } catch (e) {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
