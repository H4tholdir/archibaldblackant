import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
  familyCode:   string
  imageUrl?:    string
  imageBase64?: string
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, err => { if (err) reject(err); else resolve() })
  })
}

async function fetchRaw(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const contentType = res.headers.get('content-type') ?? ''
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

async function pdfFirstPageToJpeg(pdfBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'komet-web-img-'))
  const pdfPath = join(tmpDir, 'source.pdf')
  const outPrefix = join(tmpDir, 'page')
  try {
    await writeFile(pdfPath, pdfBuffer)
    await runCommand('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath, outPrefix])
    const files = await readdir(tmpDir)
    const pngFile = files.find(f => f.endsWith('.png'))
    if (!pngFile) throw new Error('pdftoppm produced no output')
    const pngBuffer = await readFile(join(tmpDir, pngFile))
    return sharp(pngBuffer).jpeg({ quality: 90 }).toBuffer()
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function fetchAsJpeg(imageUrl: string): Promise<Buffer> {
  const { buffer, contentType } = await fetchRaw(imageUrl)
  if (contentType.includes('pdf') || imageUrl.toLowerCase().includes('.pdf')) {
    return pdfFirstPageToJpeg(buffer)
  }
  return sharp(buffer).jpeg({ quality: 90 }).toBuffer()
}

export function createIndexWebImageHandler(deps: Deps): OperationHandler {
  return async function (_context, data, _userId, onProgress) {
    const { pool, embeddingSvc } = deps
    const { familyCode, imageUrl, imageBase64 } = data as IndexWebImageData

    if (!familyCode || (!imageUrl && !imageBase64)) {
      throw new Error('familyCode and either imageUrl or imageBase64 are required')
    }

    onProgress(10, `Elaboro immagine per ${familyCode}…`)

    await mkdir(WEB_IMAGES_DIR, { recursive: true })
    const localPath = join(WEB_IMAGES_DIR, `${familyCode}.jpg`)

    let jpegBuffer: Buffer
    if (imageBase64) {
      jpegBuffer = await sharp(Buffer.from(imageBase64, 'base64')).jpeg({ quality: 90 }).toBuffer()
      await writeFile(localPath, jpegBuffer)
    } else {
      try {
        jpegBuffer = await fetchAsJpeg(imageUrl!)
        await writeFile(localPath, jpegBuffer)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[index-web-image] fetch failed', { familyCode, imageUrl, err: msg })
        throw new Error(`Fetch fallito: ${msg}`)
      }
    }

    onProgress(50, `Calcolo embedding per ${familyCode}…`)

    const embedding = await embeddingSvc.embedImage(
      jpegBuffer.toString('base64'),
      'retrieval.passage',
    )

    const sourceUrl = imageUrl ?? null
    const id = await upsertFamilyImage(pool, {
      family_code: familyCode,
      source_type: 'website',
      source_url:  sourceUrl,
      local_path:  localPath,
      priority:    1,
      metadata:    { indexedFrom: sourceUrl ?? 'upload' },
    })
    await updateEmbedding(pool, id, embedding)

    onProgress(100, `${familyCode} indicizzata`)
    logger.info('[index-web-image] Complete', { familyCode, source: sourceUrl ?? 'upload', id })
    return { familyCode, id }
  }
}
