import { describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDocumentsRouter } from './documents';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function buildApp(documentStore: { get: (key: string) => Promise<Buffer | null> }) {
  const app = express();
  app.use('/api/documents', createDocumentsRouter({ documentStore }));
  return app;
}

describe('createDocumentsRouter', () => {
  test('ritorna 200 con bytes PDF quando la chiave esiste', async () => {
    const pdfBuffer = Buffer.from('%PDF-fake');
    const documentStore = { get: vi.fn().mockResolvedValue(pdfBuffer) };

    const res = await request(buildApp(documentStore))
      .get(`/api/documents/download/${VALID_UUID}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(documentStore.get).toHaveBeenCalledWith(VALID_UUID);
  });

  test('ritorna 404 quando la chiave non esiste', async () => {
    const documentStore = { get: vi.fn().mockResolvedValue(null) };

    const res = await request(buildApp(documentStore))
      .get(`/api/documents/download/${VALID_UUID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Documento non trovato o scaduto' });
  });

  test('ritorna 400 per chiave non-UUID', async () => {
    const documentStore = { get: vi.fn() };

    const res = await request(buildApp(documentStore))
      .get('/api/documents/download/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Chiave non valida' });
    expect(documentStore.get).not.toHaveBeenCalled();
  });
});
