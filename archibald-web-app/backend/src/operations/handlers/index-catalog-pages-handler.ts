import sharp from 'sharp'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { DbPool } from '../../db/pool'
import type { CatalogPdfService } from '../../services/catalog-pdf-service'
import type { VisualEmbeddingService } from '../../recognition/visual-embedding-service'
import type { OperationHandler } from '../operation-processor'
import {
  upsertFamilyImage,
  updateEmbedding,
  getIndexedCatalogFamilyKeys,
} from '../../db/repositories/catalog-family-images'
import { logger } from '../../logger'

export const CATALOG_PAGES_DIR = process.env.CATALOG_PAGES_DIR ?? '/app/data/recognition-images/catalog-pages'

type Deps = {
  pool:        DbPool
  catalogPdf:  CatalogPdfService
  embeddingSvc: VisualEmbeddingService
}

type CatalogEntryRow = {
  catalog_page: number
  family_codes: string[]
}

const INTER_PAGE_DELAY_MS = 300
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

async function pngToJpeg(pngBase64: string): Promise<Buffer> {
  return sharp(Buffer.from(pngBase64, 'base64'))
    .jpeg({ quality: 90 })
    .toBuffer()
}

export function createIndexCatalogPagesHandler(deps: Deps): OperationHandler {
  return async function (_context, _data, _userId, onProgress) {
    const { pool, catalogPdf, embeddingSvc } = deps

    await mkdir(CATALOG_PAGES_DIR, { recursive: true })

    const { rows: entries } = await pool.query<CatalogEntryRow>(
      `SELECT catalog_page, family_codes
       FROM shared.catalog_entries
       WHERE catalog_page IS NOT NULL
       ORDER BY catalog_page`,
    )

    // Group family codes by catalog page number
    const byPage = new Map<number, Set<string>>()
    for (const { catalog_page, family_codes } of entries) {
      const existing = byPage.get(catalog_page) ?? new Set<string>()
      for (const fc of family_codes) existing.add(fc)
      byPage.set(catalog_page, existing)
    }

    const alreadyIndexed = await getIndexedCatalogFamilyKeys(pool)

    let indexed = 0
    let errors  = 0
    const pages = [...byPage.entries()]

    for (let i = 0; i < pages.length; i++) {
      const [page, familyCodes] = pages[i]!
      const pageFilePath = join(CATALOG_PAGES_DIR, `${page}.jpg`)

      const newFamilies = [...familyCodes].filter(
        fc => !alreadyIndexed.has(`${fc}|${pageFilePath}`),
      )
      if (newFamilies.length === 0) continue

      onProgress(
        Math.round((i / pages.length) * 95),
        `Pagina ${page} (${i + 1}/${pages.length})`,
      )

      // Extract and save the page image (reuse cached file if present)
      let jpegBuffer: Buffer
      try {
        if (await fileExists(pageFilePath)) {
          const { readFile } = await import('node:fs/promises')
          jpegBuffer = await readFile(pageFilePath)
        } else {
          const pngBase64 = await catalogPdf.getPageAsBase64(page)
          jpegBuffer = await pngToJpeg(pngBase64)
          await writeFile(pageFilePath, jpegBuffer)
        }
      } catch (err) {
        logger.warn('[index-catalog-pages] Page extraction failed', { page, err })
        errors++
        continue
      }

      // Embed once per page
      let embedding: number[]
      try {
        await sleep(INTER_PAGE_DELAY_MS)
        embedding = await embeddingSvc.embedImage(jpegBuffer.toString('base64'), 'retrieval.passage')
      } catch (err) {
        logger.warn('[index-catalog-pages] Embedding failed', { page, err })
        errors++
        continue
      }

      // Store one row per family on this page
      for (const familyCode of newFamilies) {
        try {
          const id = await upsertFamilyImage(pool, {
            family_code: familyCode,
            source_type: 'catalog_pdf',
            source_url:  null,
            local_path:  pageFilePath,
            priority:    3,
            metadata:    { catalog_page: page },
          })
          await updateEmbedding(pool, id, embedding)
          alreadyIndexed.add(`${familyCode}|${pageFilePath}`)
          indexed++
        } catch (err) {
          logger.warn('[index-catalog-pages] DB store failed', { page, familyCode, err })
        }
      }
    }

    onProgress(100, `${indexed} famiglie indicizzate, ${errors} errori`)
    logger.info('[index-catalog-pages] Complete', { indexed, errors, totalPages: pages.length })
    return { indexed, errors }
  }
}
