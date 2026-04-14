import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
  },
}))
vi.mock('util', () => ({
  promisify: (fn: unknown) => fn,
}))

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { compressPdf } from './compress-pdf'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>
const mockStat = fs.stat as unknown as ReturnType<typeof vi.fn>
const mockRename = fs.rename as unknown as ReturnType<typeof vi.fn>
const mockUnlink = fs.unlink as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockRename.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
})

describe('compressPdf', () => {
  test('sostituisce il file originale se il compresso è più piccolo', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    mockStat
      .mockResolvedValueOnce({ size: 5_000_000 }) // originale 5 MB
      .mockResolvedValueOnce({ size: 1_200_000 }) // compresso 1.2 MB

    await compressPdf('/uploads/promotions/abc.pdf')

    expect(mockRename).toHaveBeenCalledWith(
      '/uploads/promotions/abc.pdf.compressed.pdf',
      '/uploads/promotions/abc.pdf',
    )
    expect(mockUnlink).not.toHaveBeenCalled()
  })

  test('elimina il temporaneo se il compresso è più grande', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    mockStat
      .mockResolvedValueOnce({ size: 500_000 })   // originale 500 KB
      .mockResolvedValueOnce({ size: 600_000 })   // compresso 600 KB (peggio)

    await compressPdf('/uploads/promotions/abc.pdf')

    expect(mockUnlink).toHaveBeenCalledWith('/uploads/promotions/abc.pdf.compressed.pdf')
    expect(mockRename).not.toHaveBeenCalled()
  })

  test('non lancia errori se gs non è disponibile', async () => {
    mockExecFile.mockRejectedValue(new Error('gs: not found'))

    await expect(compressPdf('/uploads/promotions/abc.pdf')).resolves.toBeUndefined()
    expect(mockRename).not.toHaveBeenCalled()
  })

  test('passa i flag ghostscript corretti', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    mockStat
      .mockResolvedValueOnce({ size: 2_000_000 })
      .mockResolvedValueOnce({ size: 800_000 })

    await compressPdf('/tmp/test.pdf')

    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('gs')
    expect(args).toContain('-dPDFSETTINGS=/ebook')
    expect(args).toContain('-sOutputFile=/tmp/test.pdf.compressed.pdf')
    expect(args).toContain('/tmp/test.pdf')
  })
})
