import { describe, expect, test, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { PDFParserProductsService } from './pdf-parser-products-service';

function createMockProcess(exitCode: number, stdoutData: string, stderrData: string) {
  const proc = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  Object.assign(proc, { stdout, stderr });

  setImmediate(() => {
    if (stdoutData) stdout.emit('data', stdoutData);
    if (stderrData) stderr.emit('data', stderrData);
    proc.emit('close', exitCode);
  });

  return proc;
}

const validProductsJson = JSON.stringify({
  products: [{ id_articolo: 'P001', nome_articolo: 'Prodotto Test' }],
  count: 1,
  source: 'test.pdf',
});

const cycleSizeChangedWarning =
  'CYCLE_SIZE_WARNING:{"parser":"products","detected":5,"expected":8,"status":"CHANGED"}';

describe('PDFParserProductsService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance between tests
    (PDFParserProductsService as unknown as { instance: undefined }).instance = undefined;
  });

  describe('parsePDF', () => {
    test('resolves with products when Python exits 0 with valid JSON', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(0, validProductsJson, '') as never,
      );

      const service = PDFParserProductsService.getInstance();
      const products = await service.parsePDF('/tmp/test.pdf');

      expect(products).toEqual([{ id_articolo: 'P001', nome_articolo: 'Prodotto Test' }]);
    });

    test('rejects when Python exits non-zero with no CYCLE_SIZE_WARNING', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, JSON.stringify({ error: 'Parse failed: memory error' }), 'RuntimeError: out of memory') as never,
      );

      const service = PDFParserProductsService.getInstance();
      await expect(service.parsePDF('/tmp/test.pdf')).rejects.toThrow('Python script exited with code 1');
    });

    test('rejects when Python exits non-zero and stdout is empty despite CYCLE_SIZE_WARNING', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, '', cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      await expect(service.parsePDF('/tmp/test.pdf')).rejects.toThrow('Python script exited with code 1');
    });

    test('resolves with products when Python exits non-zero but CYCLE_SIZE_WARNING CHANGED with valid stdout', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, validProductsJson, cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      const products = await service.parsePDF('/tmp/test.pdf');

      expect(products).toEqual([{ id_articolo: 'P001', nome_articolo: 'Prodotto Test' }]);
    });

    test('records CHANGED warning in getLastWarnings after recovery', async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(1, validProductsJson, cycleSizeChangedWarning) as never,
      );

      const service = PDFParserProductsService.getInstance();
      await service.parsePDF('/tmp/test.pdf');

      expect(service.getLastWarnings()).toEqual([{
        parser: 'products',
        detected: 5,
        expected: 8,
        status: 'CHANGED',
      }]);
    });
  });
});
