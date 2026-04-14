import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Compresses a PDF in-place using Ghostscript (/ebook = 150dpi images).
 * Replaces the original file only if compression succeeds and reduces size.
 * Silently leaves the original untouched on any error.
 */
export async function compressPdf(filePath: string): Promise<void> {
  const tmpPath = `${filePath}.compressed.pdf`
  try {
    await execFileAsync('gs', [
      '-dBATCH',
      '-dNOPAUSE',
      '-dQUIET',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/ebook',
      `-sOutputFile=${tmpPath}`,
      filePath,
    ])

    const [origStat, compStat] = await Promise.all([
      fs.stat(filePath),
      fs.stat(tmpPath),
    ])

    if (compStat.size < origStat.size) {
      await fs.rename(tmpPath, filePath)
    } else {
      await fs.unlink(tmpPath).catch(() => {})
    }
  } catch {
    await fs.unlink(tmpPath).catch(() => {})
  }
}
