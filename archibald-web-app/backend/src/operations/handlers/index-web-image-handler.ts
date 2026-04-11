import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DbPool } from '../../db/pool'
import type { VisualEmbeddingService } from '../../recognition/visual-embedding-service'
import type { OperationHandler } from '../operation-processor'
import { upsertFamilyImage, updateEmbedding } from '../../db/repositories/catalog-family-images'
import { logger } from '../../logger'

const WEB_IMAGES_DIR = process.env.WEB_IMAGES_DIR ?? '/tmp/web-images'

type Deps = {
  pool:        DbPool
  embeddingSvc: VisualEmbeddingService
}

type IndexWebImageData = {
  familyCode: string
  imageUrl:   string
}

async function fetchAsJpeg(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${imageUrl}`)
  const arrayBuffer = await res.arrayBuffer()
  return sharp(Buffer.from(arrayBuffer))
    .jpeg({ quality: 90 })
    .toBuffer()
}

export function createIndexWebImageHandler(deps: Deps): OperationHandler {
  return async function (_context, data, _userId, onProgress) {
    const { pool, embeddingSvc } = deps
    const { familyCode, imageUrl } = data as IndexWebImageData

    if (!familyCode || !imageUrl) {
      throw new Error('familyCode and imageUrl are required')
    }

    onProgress(10, `Scarico immagine per ${familyCode}…`)

    await mkdir(WEB_IMAGES_DIR, { recursive: true })
    const localPath = join(WEB_IMAGES_DIR, `${familyCode}.jpg`)

    let jpegBuffer: Buffer
    try {
      jpegBuffer = await fetchAsJpeg(imageUrl)
      await writeFile(localPath, jpegBuffer)
    } catch (err) {
      logger.warn('[index-web-image] fetch failed', { familyCode, imageUrl, err })
      throw err
    }

    onProgress(50, `Calcolo embedding per ${familyCode}…`)

    const embedding = await embeddingSvc.embedImage(
      jpegBuffer.toString('base64'),
      'retrieval.passage',
    )

    const id = await upsertFamilyImage(pool, {
      family_code: familyCode,
      source_type: 'website',
      source_url:  imageUrl,
      local_path:  localPath,
      priority:    1,
      metadata:    { indexedFrom: imageUrl },
    })
    await updateEmbedding(pool, id, embedding)

    onProgress(100, `${familyCode} indicizzata`)
    logger.info('[index-web-image] Complete', { familyCode, imageUrl, id })
    return { familyCode, id }
  }
}
