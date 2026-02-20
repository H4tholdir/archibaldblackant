import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createFileSystemPdfStore, cleanupExpiredPdfs } from './pdf-store';
import type { PdfMetadata } from './pdf-store';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-store-test-'));
}

function removeTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('createFileSystemPdfStore', () => {
  let tempDir: string;
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test('creates storeDir if it does not exist', () => {
    const nestedDir = path.join(tempDir, 'sub', 'dir');

    createFileSystemPdfStore(nestedDir, baseUrl);

    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  describe('save', () => {
    test('writes pdf and metadata files, returns id and url', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const pdfContent = Buffer.from('fake-pdf-content');
      const originalName = 'test-doc.pdf';

      const { id, url } = store.save(pdfContent, originalName, {});

      expect(id).toMatch(/^pdf-\d+-[0-9a-f]{8}$/);
      expect(url).toBe(`${baseUrl}/api/share/pdf/${id}`);

      const savedPdf = fs.readFileSync(path.join(tempDir, `${id}.pdf`));
      expect(savedPdf).toEqual(pdfContent);

      const savedMeta: PdfMetadata = JSON.parse(
        fs.readFileSync(path.join(tempDir, `${id}.meta.json`), 'utf-8'),
      );
      expect(savedMeta.originalName).toBe(originalName);
      expect(savedMeta.createdAt).toEqual(expect.any(Number));
    });

    test('generates unique ids across calls', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const buf = Buffer.from('x');

      const r1 = store.save(buf, 'a.pdf', {});
      const r2 = store.save(buf, 'b.pdf', {});

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('get', () => {
    test('returns saved buffer and originalName', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const pdfContent = Buffer.from('hello-pdf');
      const originalName = 'report.pdf';

      const { id } = store.save(pdfContent, originalName, {});
      const result = store.get(id);

      expect(result).toEqual({ buffer: pdfContent, originalName });
    });

    test('returns null for missing id', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);

      expect(store.get('nonexistent-id')).toBeNull();
    });

    test('returns null when pdf file is missing but meta exists', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const { id } = store.save(Buffer.from('data'), 'test.pdf', {});

      fs.unlinkSync(path.join(tempDir, `${id}.pdf`));

      expect(store.get(id)).toBeNull();
    });
  });

  describe('delete', () => {
    test('removes both pdf and metadata files', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const { id } = store.save(Buffer.from('content'), 'file.pdf', {});

      store.delete(id);

      expect(fs.existsSync(path.join(tempDir, `${id}.pdf`))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, `${id}.meta.json`))).toBe(false);
    });

    test('does not throw for missing id', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);

      expect(() => store.delete('does-not-exist')).not.toThrow();
    });
  });

  describe('save/get/delete lifecycle', () => {
    test('full lifecycle: save -> get -> delete -> get returns null', () => {
      const store = createFileSystemPdfStore(tempDir, baseUrl);
      const content = Buffer.from('lifecycle-test');
      const name = 'lifecycle.pdf';

      const { id } = store.save(content, name, {});
      expect(store.get(id)).toEqual({ buffer: content, originalName: name });

      store.delete(id);
      expect(store.get(id)).toBeNull();
    });
  });
});

describe('cleanupExpiredPdfs', () => {
  let tempDir: string;
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  function writeMetaWithAge(dir: string, id: string, ageMs: number) {
    const meta: PdfMetadata = {
      originalName: `${id}.pdf`,
      createdAt: Date.now() - ageMs,
    };
    fs.writeFileSync(path.join(dir, `${id}.pdf`), Buffer.from('pdf-data'));
    fs.writeFileSync(path.join(dir, `${id}.meta.json`), JSON.stringify(meta));
  }

  test('removes pdfs older than maxAgeMs', () => {
    const maxAge = 60_000;
    writeMetaWithAge(tempDir, 'old-pdf', maxAge + 10_000);

    const deleted = cleanupExpiredPdfs(tempDir, maxAge);

    expect(deleted).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'old-pdf.pdf'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'old-pdf.meta.json'))).toBe(false);
  });

  test('preserves pdfs younger than maxAgeMs', () => {
    const maxAge = 60_000;
    writeMetaWithAge(tempDir, 'fresh-pdf', maxAge - 10_000);

    const deleted = cleanupExpiredPdfs(tempDir, maxAge);

    expect(deleted).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'fresh-pdf.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'fresh-pdf.meta.json'))).toBe(true);
  });

  test('handles mix of expired and fresh pdfs', () => {
    const maxAge = 60_000;
    writeMetaWithAge(tempDir, 'expired-1', maxAge + 5_000);
    writeMetaWithAge(tempDir, 'expired-2', maxAge + 20_000);
    writeMetaWithAge(tempDir, 'recent-1', maxAge - 30_000);

    const deleted = cleanupExpiredPdfs(tempDir, maxAge);

    expect(deleted).toBe(2);
    expect(fs.existsSync(path.join(tempDir, 'recent-1.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'recent-1.meta.json'))).toBe(true);
  });

  test('returns 0 when storeDir is empty', () => {
    expect(cleanupExpiredPdfs(tempDir, 60_000)).toBe(0);
  });

  test('returns 0 when storeDir does not exist', () => {
    expect(cleanupExpiredPdfs(path.join(tempDir, 'missing'), 60_000)).toBe(0);
  });

  test('skips corrupted metadata files', () => {
    const maxAge = 60_000;
    writeMetaWithAge(tempDir, 'valid-old', maxAge + 5_000);
    fs.writeFileSync(path.join(tempDir, 'corrupt.meta.json'), 'not-json');
    fs.writeFileSync(path.join(tempDir, 'corrupt.pdf'), Buffer.from('data'));

    const deleted = cleanupExpiredPdfs(tempDir, maxAge);

    expect(deleted).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'corrupt.pdf'))).toBe(true);
  });

  test('integrates with store save then cleanup', () => {
    const store = createFileSystemPdfStore(tempDir, baseUrl);

    const { id: recentId } = store.save(Buffer.from('recent'), 'recent.pdf', {});

    const oldId = 'pdf-old-test';
    writeMetaWithAge(tempDir, oldId, 3 * 60 * 60 * 1000);

    const maxAge = 2 * 60 * 60 * 1000;
    const deleted = cleanupExpiredPdfs(tempDir, maxAge);

    expect(deleted).toBe(1);
    expect(store.get(recentId)).not.toBeNull();
    expect(store.get(oldId)).toBeNull();
  });
});
