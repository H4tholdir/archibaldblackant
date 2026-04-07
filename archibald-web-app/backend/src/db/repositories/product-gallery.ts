import type { DbPool } from '../pool';

type GalleryImageType = 'catalog_render' | 'product_photo' | 'application_photo' | 'web';

type GalleryRow = {
  id:         number
  product_id: string
  url:        string
  image_type: GalleryImageType
  source:     string
  alt_text:   string | null
  sort_order: number
  created_at: Date
};

async function insertGalleryImage(
  pool: DbPool,
  img: {
    product_id: string
    url:        string
    image_type: GalleryImageType
    source:     string
    alt_text?:  string | null
    sort_order?: number
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO shared.product_gallery
       (product_id, url, image_type, source, alt_text, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (product_id, url) DO UPDATE SET
       alt_text   = EXCLUDED.alt_text,
       sort_order = EXCLUDED.sort_order`,
    [
      img.product_id,
      img.url,
      img.image_type,
      img.source,
      img.alt_text   ?? null,
      img.sort_order ?? 0,
    ],
  );
}

async function getGalleryByProduct(pool: DbPool, productId: string): Promise<GalleryRow[]> {
  const { rows } = await pool.query<GalleryRow>(
    `SELECT id, product_id, url, image_type, source, alt_text, sort_order, created_at
     FROM shared.product_gallery
     WHERE product_id = $1
     ORDER BY sort_order, id`,
    [productId],
  );
  return rows;
}

export { insertGalleryImage, getGalleryByProduct };
export type { GalleryRow, GalleryImageType };
