import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createShareRouter, type ShareRouterDeps } from './share';

function createMockDeps(): ShareRouterDeps {
  return {
    pdfStore: {
      save: vi.fn().mockReturnValue({ id: 'pdf-123', url: 'http://localhost/api/share/pdf/pdf-123.pdf' }),
      get: vi.fn().mockReturnValue({ buffer: Buffer.from('fake-pdf'), originalName: 'test.pdf' }),
      delete: vi.fn(),
    },
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/Preventivi/test.pdf' }),
  };
}

function createApp(deps: ShareRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/share', createShareRouter(deps));
  return app;
}

describe('createShareRouter', () => {
  let deps: ShareRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('POST /api/share/upload-pdf', () => {
    test('uploads PDF and returns URL', async () => {
      const res = await request(app)
        .post('/api/share/upload-pdf')
        .attach('file', Buffer.from('fake-pdf'), 'test.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('pdf-123');
      expect(res.body.url).toContain('pdf-123');
    });

    test('returns 400 when no file', async () => {
      const res = await request(app)
        .post('/api/share/upload-pdf');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/share/pdf/:id', () => {
    test('returns PDF file', async () => {
      const res = await request(app).get('/api/share/pdf/pdf-123.pdf');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    test('returns 404 for expired PDF', async () => {
      (deps.pdfStore.get as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const res = await request(app).get('/api/share/pdf/expired.pdf');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/share/email', () => {
    test('sends email with PDF', async () => {
      const res = await request(app)
        .post('/api/share/email')
        .attach('file', Buffer.from('fake-pdf'), 'test.pdf')
        .field('to', 'test@example.com')
        .field('subject', 'Preventivo');

      expect(res.status).toBe(200);
      expect(res.body.messageId).toBe('msg-123');
    });

    test('returns 400 when no recipient', async () => {
      const res = await request(app)
        .post('/api/share/email')
        .attach('file', Buffer.from('fake-pdf'), 'test.pdf');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/share/dropbox', () => {
    test('uploads to Dropbox', async () => {
      const res = await request(app)
        .post('/api/share/dropbox')
        .attach('file', Buffer.from('fake-pdf'), 'test.pdf')
        .field('fileName', 'preventivo.pdf');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('/Preventivi/test.pdf');
    });
  });
});
