import type { DbPool } from '../pool';

type GalleryImageType = 'instrument_white_bg' | 'marketing' | 'microscope' | 'clinical' | 'field_scan';

type GalleryRow = {
  id:         number
  product_id: string
  image_url:  string
  local_path: string | null
  image_type: GalleryImageType
  source:     string
  sort_order: number
  width:      number | null
  height:     number | null
  created_at: Date
};

async function insertGalleryImage(
  pool: DbPool,
  img: {
    product_id: string
    image_url:  string
    local_path?: string | null
    image_type: GalleryImageType
    source:     string
    sort_order?: number
    width?:      number | null
    height?:     number | null
    file_size?:  number | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.product_gallery
       (product_id, image_url, local_path, image_type, source, sort_order, width, height, file_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (product_id, image_url) DO UPDATE SET
       local_path = EXCLUDED.local_path,
       sort_order = EXCLUDED.sort_order`,
    [
      img.product_id,
      img.image_url,
      img.local_path ?? null,
      img.image_type,
      img.source,
      img.sort_order ?? 0,
      img.width      ?? null,
      img.height     ?? null,
      img.file_size  ?? null,
    ],
  );
}

async function getGalleryByProduct(pool: DbPool, productId: string): Promise<GalleryRow[]> {
  const { rows } = await pool.query<GalleryRow>(
    `SELECT id, product_id, image_url, local_path, image_type, source, sort_order, width, height, created_at
     FROM shared.product_gallery
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [productId],
  );
  return rows;
}

export { insertGalleryImage, getGalleryByProduct };
export type { GalleryRow, GalleryImageType };
