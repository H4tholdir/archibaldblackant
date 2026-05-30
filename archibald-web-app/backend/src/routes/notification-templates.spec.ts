import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createNotificationTemplatesRouter } from './notification-templates';

function createMockPool() {
  return { query: vi.fn() };
}

function createApp(pool: ReturnType<typeof createMockPool>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'u1' };
    next();
  });
  app.use('/api/notification-templates', createNotificationTemplatesRouter({ pool: pool as any }));
  return app;
}

describe('GET /api/notification-templates', () => {
  it('restituisce template agente (senza customerErpId)', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, event_type: 'overdue_step', tone: 'cordiale', channel: 'email', subject_tmpl: 'Test soggetto', body_tmpl: 'Test corpo', customer_erp_id: null }],
      rowCount: 1,
    });

    const res = await request(createApp(pool)).get('/api/notification-templates');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customer_erp_id).toBeNull();
  });

  it('filtra per cliente specifico con ?customerErpId=55.226', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp(pool)).get('/api/notification-templates?customerErpId=55.226');

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('customer_erp_id = $2'),
      ['u1', '55.226'],
    );
  });

  it('usa query con IS NULL senza customerErpId', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp(pool)).get('/api/notification-templates');

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('customer_erp_id IS NULL'),
      ['u1'],
    );
  });
});

describe('PUT /api/notification-templates', () => {
  it('restituisce 400 con body_tmpl mancante', async () => {
    const pool = createMockPool();

    const res = await request(createApp(pool))
      .put('/api/notification-templates')
      .send({ event_type: 'overdue_step', tone: 'cordiale', channel: 'email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('restituisce 400 con body_tmpl troppo corto (< 10 caratteri)', async () => {
    const pool = createMockPool();

    const res = await request(createApp(pool))
      .put('/api/notification-templates')
      .send({ event_type: 'overdue_step', tone: 'cordiale', channel: 'email', body_tmpl: 'corto' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('restituisce 400 con event_type non valido', async () => {
    const pool = createMockPool();

    const res = await request(createApp(pool))
      .put('/api/notification-templates')
      .send({ event_type: 'invalid_event', tone: 'cordiale', channel: 'email', body_tmpl: 'Testo personalizzato lungo' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('restituisce 200 con body valido', async () => {
    const pool = createMockPool();
    const templateRow = {
      id: 1,
      event_type: 'overdue_step',
      tone: 'cordiale',
      channel: 'email',
      subject_tmpl: null,
      body_tmpl: 'Testo personalizzato',
      customer_erp_id: null,
    };
    // Prima query: INSERT/ON CONFLICT upsert
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // Seconda query: SELECT per restituire la riga aggiornata
    pool.query.mockResolvedValueOnce({ rows: [templateRow], rowCount: 1 });

    const res = await request(createApp(pool))
      .put('/api/notification-templates')
      .send({ event_type: 'overdue_step', tone: 'cordiale', channel: 'email', body_tmpl: 'Testo personalizzato' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.body_tmpl).toBe('Testo personalizzato');
  });
});

describe('DELETE /api/notification-templates/:id', () => {
  it('restituisce 200 dopo delete', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(createApp(pool)).delete('/api/notification-templates/42');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM agents.notification_message_templates'),
      ['42', 'u1'],
    );
  });
});
