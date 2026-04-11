import type { DbPool } from '../../db/pool'
import type { VisualEmbeddingService } from '../../recognition/visual-embedding-service'
import type { OperationHandler } from '../operation-processor'
import { CAMPIONARIO_STRIPS } from '../../recognition/campionario-strip-map'
import { cropStripForFamilies } from '../../recognition/campionario-strip-cropper'
import { upsertFamilyImage, updateEmbedding, countIndexed, getIndexedFamilyStripKeys } from '../../db/repositories/catalog-family-images'
import { logger } from '../../logger'

type Deps = { pool: DbPool; embeddingSvc: VisualEmbeddingService }

const DELAY_MS = 200
const sleep    = (ms: number) => new Promise(r => setTimeout(r, ms))

export function createBuildVisualIndexHandler(deps: Deps): OperationHandler {
  return async function (_context, _data, _userId, onProgress) {
    const { pool, embeddingSvc } = deps
    const seen        = await getIndexedFamilyStripKeys(pool)
    let   indexed     = 0
    const totalStrips = CAMPIONARIO_STRIPS.length

    for (let stripIdx = 0; stripIdx < CAMPIONARIO_STRIPS.length; stripIdx++) {
      const strip = CAMPIONARIO_STRIPS[stripIdx]!
      onProgress(Math.round((stripIdx / totalStrips) * 95), `Strip ${stripIdx + 1}/${totalStrips}`)

      let crops: Awaited<ReturnType<typeof cropStripForFamilies>>
      try { crops = await cropStripForFamilies(strip) }
      catch (err) {
        logger.warn('[build-visual-index] strip failed', { path: strip.path, err })
        continue
      }

      for (const crop of crops) {
        const stripKey = `${crop.familyCode}|${crop.stripPath}`
        if (seen.has(stripKey)) continue
        try {
          const id = await upsertFamilyImage(pool, {
            family_code: crop.familyCode, source_type: 'campionario',
            source_url: null, local_path: crop.stripPath, priority: 3,
            metadata: { strip_family_index: crop.familyIndex, strip_family_count: crop.familyCount },
          })
          await sleep(DELAY_MS)
          const embedding = await embeddingSvc.embedImage(crop.imageBuffer.toString('base64'), 'retrieval.passage')
          await updateEmbedding(pool, id, embedding)
          seen.add(stripKey)
          indexed++
        } catch (err) {
          logger.warn('[build-visual-index] family failed', { familyCode: crop.familyCode, err })
        }
      }
    }

    const total = await countIndexed(pool)
    onProgress(100, `${total} famiglie indicizzate`)
    logger.info('[build-visual-index] Complete', { newlyIndexed: indexed, totalIndexed: total })
    return { indexed: total }
  }
}
