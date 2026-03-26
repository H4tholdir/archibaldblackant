import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createNotificationsRouter, type NotificationsRouterDeps } from './notifications';
import type { Notification, NotificationId } from '../db/repositories/notifications';

const TEST_USER_ID = 'user-abc-123';

const sampleNotification: Notification = {
  id: 1 as NotificationId,
  userId: TEST_USER_ID,
  type: 'erp_customer_deleted',
  severity: 'error',
  title: 'Cliente eliminato',
  body: 'Il cliente Rossi è stato eliminato da ERP',
  data: null,
  readAt: null,
  createdAt: new Date('2026-03-26T10:00:00Z'),
  expiresAt: new Date('2026-04-02T10:00:00Z'),
};

function createMockDeps(): NotificationsRouterDeps {
  return {
    getNotifications: vi.fn().mockResolvedValue([sampleNotification]),
    getUnreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn(),
  };
}

function createApp(deps: NotificationsRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: TEST_USER_ID, username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/notifications', createNotificationsRouter(deps));
  return app;
}

describe('createNotificationsRouter', () => {
  let deps: NotificationsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/notifications', () => {
    test('returns notifications for authenticated user', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          ...sampleNotification,
          createdAt: sampleNotification.createdAt.toISOString(),
          expiresAt: sampleNotification.expiresAt.toISOString(),
        },
      ]);
      expect(deps.getNotifications).toHaveBeenCalledWith(TEST_USER_ID, 'all', 20, 0);
    });

    test('passes filter, limit, offset query params', async () => {
      await request(app).get('/api/notifications?filter=unread&limit=10&offset=5');
      expect(deps.getNotifications).toHaveBeenCalledWith(TEST_USER_ID, 'unread', 10, 5);
    });
  });

  describe('GET /api/notifications/count', () => {
    test('returns unread count', async () => {
      const res = await request(app).get('/api/notifications/count');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 1 });
      expect(deps.getUnreadCount).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    test('marks notification as read and broadcasts', async () => {
      const res = await request(app).patch('/api/notifications/1/read');
      expect(res.status).toBe(204);
      expect(deps.markRead).toHaveBeenCalledWith(TEST_USER_ID, 1);
      expect(deps.broadcast).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ type: 'NOTIFICATION_READ', payload: { id: 1 } }),
      );
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    test('marks all as read and broadcasts', async () => {
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(204);
      expect(deps.markAllRead).toHaveBeenCalledWith(TEST_USER_ID);
      expect(deps.broadcast).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ type: 'NOTIFICATION_READ_ALL' }),
      );
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    test('deletes notification for user', async () => {
      const res = await request(app).delete('/api/notifications/1');
      expect(res.status).toBe(204);
      expect(deps.deleteNotification).toHaveBeenCalledWith(TEST_USER_ID, 1);
    });
  });
});
