import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

type PdfStoreLike = {
  save: (buffer: Buffer, originalName: string, req: unknown) => { id: string; url: string };
  get: (id: string) => { buffer: Buffer; originalName: string } | null;
  delete: (id: string) => void;
};

type PdfMetadata = {
  originalName: string;
  createdAt: number;
};

type CleanupSchedulerHandle = ReturnType<typeof setInterval>;

function createFileSystemPdfStore(storeDir: string, baseUrl: string): PdfStoreLike {
  fs.mkdirSync(storeDir, { recursive: true });

  return {
    save(buffer: Buffer, originalName: string, _req: unknown) {
      const id = `pdf-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const pdfPath = path.join(storeDir, `${id}.pdf`);
      const metaPath = path.join(storeDir, `${id}.meta.json`);

      const metadata: PdfMetadata = { originalName, createdAt: Date.now() };

      fs.writeFileSync(pdfPath, buffer);
      fs.writeFileSync(metaPath, JSON.stringify(metadata));

      const url = `${baseUrl}/api/share/pdf/${id}`;
      return { id, url };
    },

    get(id: string) {
      const pdfPath = path.join(storeDir, `${id}.pdf`);
      const metaPath = path.join(storeDir, `${id}.meta.json`);

      try {
        const buffer = fs.readFileSync(pdfPath);
        const meta: PdfMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        return { buffer, originalName: meta.originalName };
      } catch {
        return null;
      }
    },

    delete(id: string) {
      const pdfPath = path.join(storeDir, `${id}.pdf`);
      const metaPath = path.join(storeDir, `${id}.meta.json`);

      try { fs.unlinkSync(pdfPath); } catch { /* ignore missing */ }
      try { fs.unlinkSync(metaPath); } catch { /* ignore missing */ }
    },
  };
}

function cleanupExpiredPdfs(storeDir: string, maxAgeMs: number): number {
  let deletedCount = 0;

  let entries: string[];
  try {
    entries = fs.readdirSync(storeDir);
  } catch {
    return 0;
  }

  const now = Date.now();

  for (const entry of entries) {
    if (!entry.endsWith('.meta.json')) continue;

    const metaPath = path.join(storeDir, entry);
    try {
      const meta: PdfMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (now - meta.createdAt > maxAgeMs) {
        const id = entry.replace('.meta.json', '');
        const pdfPath = path.join(storeDir, `${id}.pdf`);

        try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
        try { fs.unlinkSync(metaPath); } catch { /* ignore */ }
        deletedCount++;
      }
    } catch {
      // corrupted metadata -- skip
    }
  }

  if (deletedCount > 0) {
    logger.info('PDF cleanup completed', { deletedCount, storeDir });
  }

  return deletedCount;
}

function startCleanupScheduler(
  storeDir: string,
  intervalMs = 30 * 60 * 1000,
  maxAgeMs = 2 * 60 * 60 * 1000,
): CleanupSchedulerHandle {
  return setInterval(() => cleanupExpiredPdfs(storeDir, maxAgeMs), intervalMs);
}

export {
  createFileSystemPdfStore,
  cleanupExpiredPdfs,
  startCleanupScheduler,
};
export type { PdfStoreLike, PdfMetadata, CleanupSchedulerHandle };
