/**
 * build-visual-index.ts
 * Run: npx tsx src/scripts/build-visual-index.ts
 * Env: PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD
 */
import { Pool } from 'pg'
import { config } from '../config'
import { CAMPIONARIO_STRIPS } from '../recognition/campionario-strip-map'
import { cropStripForFamilies } from '../recognition/campionario-strip-cropper'
import { upsertFamilyImage } from '../db/repositories/catalog-family-images'
import { logger } from '../logger'

async function main() {
  const pool = new Pool({
    host: config.database.host, port: config.database.port,
    database: config.database.database, user: config.database.user,
    password: config.database.password,
  })
  const seenFamilies  = new Set<string>()
  let indexed = 0, errors = 0

  for (const strip of CAMPIONARIO_STRIPS) {
    let crops: Awaited<ReturnType<typeof cropStripForFamilies>>
    try { crops = await cropStripForFamilies(strip) }
    catch (err) { logger.error('[index] strip crop failed', { path: strip.path, err }); errors++; continue }

    for (const crop of crops) {
      if (seenFamilies.has(crop.familyCode)) continue
      try {
        const id = await upsertFamilyImage(pool, {
          family_code: crop.familyCode, source_type: 'campionario',
          source_url: null, local_path: crop.stripPath, priority: 3,
          metadata: { strip_family_index: crop.familyIndex, strip_family_count: crop.familyCount },
        })
        seenFamilies.add(crop.familyCode)
        indexed++
        logger.info(`[index] Indexed ${crop.familyCode} (id=${id})`)
      } catch (err) {
        logger.error('[index] failed to index family', { familyCode: crop.familyCode, err })
        errors++
      }
    }
  }

  logger.info('[index] Done', { indexed, errors })
  await pool.end()
}

main().catch(err => { logger.error('[index] Fatal', { err }); process.exit(1) })
