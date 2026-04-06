import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { parseKometCode } from '../../recognition/komet-code-parser';
import { upsertInstrumentFeatures, countUnmappedProducts } from '../../db/repositories/instrument-features';
import { logger } from '../../logger';

type KometCodeParserDeps = {
  pool: DbPool;
};

function createKometCodeParserHandler(deps: KometCodeParserDeps): OperationHandler {
  const { pool } = deps;

  return async (_context, _data, _userId, onProgress) => {
    onProgress(0, 'Caricamento prodotti...');

    const { rows: products } = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM shared.products WHERE name ~ '^[A-Za-z0-9]+\\.[A-Za-z0-9]{3}\\.[A-Za-z0-9]' AND deleted_at IS NULL ORDER BY id`,
    );

    let processed = 0;
    let skipped   = 0;
    const total   = products.length;

    for (let i = 0; i < products.length; i++) {
      const product = products[i]!;
      const features = parseKometCode(product.name);

      if (!features) {
        skipped++;
        continue;
      }

      await upsertInstrumentFeatures(pool, {
        product_id:        product.id,
        shape_family:      features.shape_family,
        material:          features.material,
        grit_ring_color:   features.grit_ring_color,
        shank_type:        features.shank_type,
        shank_diameter_mm: features.shank_diameter_mm,
        head_size_code:    features.head_size_code,
        head_size_mm:      features.head_size_mm,
        family_code:       features.family_code,
      });
      processed++;

      if (i % 50 === 0) {
        onProgress(Math.floor((i / total) * 100), `${i}/${total} prodotti processati`);
      }
    }

    const unmapped = await countUnmappedProducts(pool);
    logger.info('[komet-code-parser] Completed', { processed, skipped, total, unmapped });

    return { processed, skipped, total };
  };
}

export { createKometCodeParserHandler };
