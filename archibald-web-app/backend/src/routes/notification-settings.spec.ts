import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createNotificationSettingsRouter } from './notification-settings';

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
  app.use('/api/notification-settings', createNotificationSettingsRouter({ pool: pool as any }));
  return app;
}

describe('GET /api/notification-settings/profiles', () => {
  it('restituisce lista profili', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Gentile', is_default: true, steps: [] }],
      rowCount: 1,
    });

    const res = await request(createApp(pool)).get('/api/notification-settings/profiles');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Gentile');
  });

  it('restituisce lista vuota quando non ci sono profili', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp(pool)).get('/api/notification-settings/profiles');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/notification-settings/:erpId/log', () => {
  it('restituisce log vuoto quando non ci sono notifiche', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp(pool)).get('/api/notification-settings/55.226/log');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('restituisce le righe di log quando presenti', async () => {
    const pool = createMockPool();
    const logRow = {
      event_type: 'overdue_step',
      channel: 'email',
      step_index: 1,
      tone: 'cordiale',
      sent_at: '2026-05-01T10:00:00Z',
      days_past_due: 30,
      message_preview: null,
      invoice_number: 'FAT-001',
    };
    pool.query.mockResolvedValueOnce({ rows: [logRow], rowCount: 1 });

    const res = await request(createApp(pool)).get('/api/notification-settings/55.226/log');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].event_type).toBe('overdue_step');
  });
});

describe('PUT /api/notification-settings/:erpId', () => {
  it('restituisce 400 con body non valido (enabled non booleano)', async () => {
    const pool = createMockPool();

    const res = await request(createApp(pool))
      .put('/api/notification-settings/55.226')
      .send({ enabled: 'not-a-boolean' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('restituisce 400 con emailOverride non valida', async () => {
    const pool = createMockPool();

    const res = await request(createApp(pool))
      .put('/api/notification-settings/55.226')
      .send({ emailOverride: 'non-una-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('restituisce 200 con body valido', async () => {
    const pool = createMockPool();
    const settingsRow = {
      id: 'uuid-1',
      customer_erp_id: '55.226',
      enabled: true,
      profile_id: null,
      override_steps: null,
      email_override: null,
      whatsapp_override: null,
      notify_new_invoice: true,
      notify_pre_due: true,
      pre_due_days: 7,
      periodic_statement_enabled: false,
      periodic_statement_days: 30,
      periodic_statement_content: {},
      effective_email: 'test@test.it',
      effective_whatsapp: null,
    };
    // upsertNotificationSettings → 1 query INSERT/ON CONFLICT
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // getNotificationSettings → 1 query SELECT
    pool.query.mockResolvedValueOnce({ rows: [settingsRow], rowCount: 1 });

    const res = await request(createApp(pool))
      .put('/api/notification-settings/55.226')
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enabled).toBe(true);
  });
});
