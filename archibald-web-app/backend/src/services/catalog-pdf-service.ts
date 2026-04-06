import { execFile } from 'child_process'
import { mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })
}

export type CatalogPdfService = {
  getPageAsBase64(pageNumber: number): Promise<string>
  getTotalPages(): Promise<number>
}

export function createCatalogPdfService(pdfPath: string): CatalogPdfService {
  return {
    async getPageAsBase64(pageNumber) {
      const tmpDir = await mkdtemp(join(tmpdir(), `komet-p${pageNumber}-`))
      const outPrefix = join(tmpDir, 'page')
      try {
        await runCommand('pdftoppm', [
          '-png', '-r', '150',
          '-f', String(pageNumber), '-l', String(pageNumber),
          pdfPath, outPrefix,
        ])
        const files = await readdir(tmpDir)
        if (files.length === 0) throw new Error(`pdftoppm produced no output for page ${pageNumber}`)
        const outFile = join(tmpDir, files[0]!)
        const buf = await readFile(outFile)
        return buf.toString('base64')
      } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    },

    async getTotalPages() {
      const { stdout } = await runCommand('pdfinfo', [pdfPath])
      const m = stdout.match(/Pages:\s+(\d+)/)
      return m ? parseInt(m[1]!, 10) : 782
    },
  }
}
