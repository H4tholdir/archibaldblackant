import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    readdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    mkdtemp: vi.fn(),
  }
})

describe('createCatalogPdfService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('getPageAsBase64 returns non-empty base64 string when pdftoppm produces output', async () => {
    const { execFile } = await import('child_process')
    const fs = await import('fs/promises')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    const pngData = Buffer.from('PNG_DATA')
    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null, '', ''); return {} as any })
    vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/komet-p1-abc')
    vi.mocked(fs.readdir).mockResolvedValue(['page-000001.png'] as any)
    vi.mocked(fs.readFile).mockResolvedValue(pngData as any)
    vi.mocked(fs.rm).mockResolvedValue(undefined)

    const svc = createCatalogPdfService('/app/catalog/test.pdf')
    const result = await svc.getPageAsBase64(1)
    expect(result).toBe(pngData.toString('base64'))
  })

  test('getPageAsBase64 calls pdftoppm with correct page range and png flag', async () => {
    const { execFile } = await import('child_process')
    const fs = await import('fs/promises')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null, '', ''); return {} as any })
    vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/komet-p42-abc')
    vi.mocked(fs.readdir).mockResolvedValue(['page-000042.png'] as any)
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('img') as any)
    vi.mocked(fs.rm).mockResolvedValue(undefined)

    const svc = createCatalogPdfService('/app/catalog/komet.pdf')
    await svc.getPageAsBase64(42)

    const [cmd, args] = vi.mocked(execFile).mock.calls[0]!
    expect(cmd).toBe('pdftoppm')
    const argList = args as string[]
    expect(argList).toContain('-png')
    expect(argList).toContain('-f')
    expect(argList[argList.indexOf('-f') + 1]).toBe('42')
    expect(argList).toContain('-l')
    expect(argList[argList.indexOf('-l') + 1]).toBe('42')
    expect(argList).toContain('/app/catalog/komet.pdf')
  })

  test('getPageAsBase64 throws when pdftoppm produces no output files', async () => {
    const { execFile } = await import('child_process')
    const fs = await import('fs/promises')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => { cb(null, '', ''); return {} as any })
    vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/komet-p5-abc')
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.rm).mockResolvedValue(undefined)

    const svc = createCatalogPdfService('/app/catalog/test.pdf')
    await expect(svc.getPageAsBase64(5)).rejects.toThrow('pdftoppm produced no output')
  })

  test('getTotalPages reads page count from pdfinfo stdout', async () => {
    const { execFile } = await import('child_process')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
      cb(null, 'Creator: Adobe\nPages:           782\nFile size: 1234 bytes', '')
      return {} as any
    })

    const svc = createCatalogPdfService('/app/catalog/test.pdf')
    const pages = await svc.getTotalPages()
    expect(pages).toBe(782)
  })

  test('getTotalPages returns 782 as default when pdfinfo output lacks Pages field', async () => {
    const { execFile } = await import('child_process')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
      cb(null, 'No pages info here', '')
      return {} as any
    })

    const svc = createCatalogPdfService('/app/catalog/test.pdf')
    const pages = await svc.getTotalPages()
    expect(pages).toBe(782)
  })

  test('getTotalPages calls pdfinfo with the configured pdf path', async () => {
    const { execFile } = await import('child_process')
    const { createCatalogPdfService } = await import('./catalog-pdf-service')

    vi.mocked(execFile).mockImplementation((_cmd, _args, cb: any) => {
      cb(null, 'Pages: 100', '')
      return {} as any
    })

    const pdfPath = '/app/catalog/komet-catalog-2025.pdf'
    const svc = createCatalogPdfService(pdfPath)
    await svc.getTotalPages()

    const [cmd, args] = vi.mocked(execFile).mock.calls[0]!
    expect(cmd).toBe('pdfinfo')
    expect((args as string[])).toContain(pdfPath)
  })
})
