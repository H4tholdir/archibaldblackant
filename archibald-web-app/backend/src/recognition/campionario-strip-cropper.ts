import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { CAMPIONARIO_BASE_DIR } from './campionario-strip-map'
import type { StripEntry } from './campionario-strip-map'

export type StripCrop = {
  familyCode:  string
  imageBuffer: Buffer
  stripPath:   string
  familyIndex: number
  familyCount: number
}

/**
 * Slices a campionario strip into per-family JPEG buffers using equal-width vertical crops.
 * Strip has N families → N crops of width floor(W/N); last crop absorbs rounding remainder.
 */
export async function cropStripForFamilies(entry: StripEntry): Promise<StripCrop[]> {
  const fileBuffer = await readFile(`${CAMPIONARIO_BASE_DIR}/${entry.path}`)
  const { width: imgWidth, height: imgHeight } = await sharp(fileBuffer).metadata()

  if (!imgWidth || !imgHeight) {
    throw new Error(`Cannot read image metadata for ${entry.path}`)
  }

  const n         = entry.families.length
  const cropWidth = Math.floor(imgWidth / n)

  return Promise.all(
    entry.families.map(async (familyCode, i) => {
      const left = i * cropWidth
      const w    = i === n - 1 ? imgWidth - left : cropWidth
      const imageBuffer = await sharp(fileBuffer)
        .extract({ left, top: 0, width: w, height: imgHeight })
        .jpeg({ quality: 90 })
        .toBuffer()
      return { familyCode, imageBuffer, stripPath: entry.path, familyIndex: i, familyCount: n }
    }),
  )
}

/**
 * Re-crops a single family from a strip by index. Used at query time to supply
 * reference images to Claude without re-embedding.
 */
export async function cropSingleFamily(
  stripPath:   string,
  familyIndex: number,
  familyCount: number,
): Promise<Buffer> {
  const fileBuffer = await readFile(`${CAMPIONARIO_BASE_DIR}/${stripPath}`)
  const { width: imgWidth, height: imgHeight } = await sharp(fileBuffer).metadata()

  if (!imgWidth || !imgHeight) {
    throw new Error(`Cannot read image metadata for ${stripPath}`)
  }

  const cropWidth = Math.floor(imgWidth / familyCount)
  const left      = familyIndex * cropWidth
  const w         = familyIndex === familyCount - 1 ? imgWidth - left : cropWidth

  return sharp(fileBuffer)
    .extract({ left, top: 0, width: w, height: imgHeight })
    .jpeg({ quality: 90 })
    .toBuffer()
}
