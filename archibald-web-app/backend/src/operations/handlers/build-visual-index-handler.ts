import type { DbPool } from '../../db/pool'
import type { OperationHandler } from '../operation-processor'
import { CAMPIONARIO_STRIPS } from '../../recognition/campionario-strip-map'
import { cropStripForFamilies } from '../../recognition/campionario-strip-cropper'
import { upsertFamilyImage } from '../../db/repositories/catalog-family-images'
import { logger } from '../../logger'

type Deps = { pool: DbPool }

export function createBuildVisualIndexHandler(deps: Deps): OperationHandler {
  return async function (_context, _data, _userId) {
    const { pool } = deps
    const seen    = new Set<string>()
    let   indexed = 0

    for (const strip of CAMPIONARIO_STRIPS) {
      let crops: Awaited<ReturnType<typeof cropStripForFamilies>>
      try { crops = await cropStripForFamilies(strip) }
      catch (err) {
        logger.warn('[build-visual-index] strip failed', { path: strip.path, err })
        continue
      }

      for (const crop of crops) {
        if (seen.has(crop.familyCode)) continue
        try {
          await upsertFamilyImage(pool, {
            family_code: crop.familyCode, source_type: 'campionario',
            source_url: null, local_path: crop.stripPath, priority: 3,
            metadata: { strip_family_index: crop.familyIndex, strip_family_count: crop.familyCount },
          })
          seen.add(crop.familyCode)
          indexed++
        } catch (err) {
          logger.warn('[build-visual-index] family failed', { familyCode: crop.familyCode, err })
        }
      }
    }

    logger.info('[build-visual-index] Complete', { indexed })
    return { indexed }
  }
}
