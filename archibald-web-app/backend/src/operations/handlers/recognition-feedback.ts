import fs from 'fs';
import path from 'path';
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { getImageDataFromCache } from '../../db/repositories/recognition-cache';
import { insertGalleryImage } from '../../db/repositories/product-gallery';
import { logger } from '../../logger';

type RecognitionFeedbackData = {
  imageHash: string;
  productId: string;
  userId:    string;
};

type RecognitionFeedbackDeps = {
  pool:       DbPool;
  assetsDir?: string;
  sharpFn?:   (buf: Buffer) => Promise<Buffer>;
};

async function defaultResize(buf: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buf).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

function createRecognitionFeedbackHandler(deps: RecognitionFeedbackDeps): OperationHandler {
  const { pool } = deps;
  const assetsDir = deps.assetsDir ?? '/app/assets/product-images';
  const resizeFn  = deps.sharpFn  ?? defaultResize;

  return async (_context, data, _userId, onProgress) => {
    const { imageHash, productId, userId } = data as unknown as RecognitionFeedbackData;

    onProgress(0, 'Recupero immagine dalla cache...');
    const imageBuffer = await getImageDataFromCache(pool, imageHash);
    if (!imageBuffer) {
      logger.warn('[recognition-feedback] Image not in cache, skipping', { imageHash });
      return { queued: false };
    }

    onProgress(30, 'Ridimensionamento immagine...');
    const resized = await resizeFn(imageBuffer);

    const localDir = path.join(assetsDir, productId.replace(/\./g, '/'), 'field');
    fs.mkdirSync(localDir, { recursive: true });
    const filename  = `${Date.now()}_${userId.slice(0, 8)}.jpg`;
    const localPath = path.join(localDir, filename);
    fs.writeFileSync(localPath, resized);

    onProgress(70, 'Salvataggio in gallery...');
    const imageUrl = `/assets/product-images/${productId.replace(/\./g, '/')}/field/${filename}`;
    await insertGalleryImage(pool, {
      product_id: productId,
      image_url:  imageUrl,
      local_path: localPath,
      image_type: 'field_scan',
      source:     `agent:${userId}`,
      file_size:  resized.length,
    });

    onProgress(100, 'Immagine salvata in gallery');
    return { queued: true };
  };
}

export { createRecognitionFeedbackHandler };
