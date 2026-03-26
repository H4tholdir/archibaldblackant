import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { Notification, NotificationId, NotificationFilter } from '../db/repositories/notifications';

type BroadcastMsg = { type: string; payload: unknown; timestamp: string };

type NotificationsRouterDeps = {
  getNotifications: (userId: string, filter: NotificationFilter, limit: number, offset: number) => Promise<Notification[]>;
  getUnreadCount: (userId: string) => Promise<number>;
  markRead: (userId: string, id: NotificationId) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  deleteNotification: (userId: string, id: NotificationId) => Promise<void>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
};

function createNotificationsRouter(deps: NotificationsRouterDeps) {
  const { getNotifications, getUnreadCount, markRead, markAllRead, deleteNotification, broadcast } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const filter = (req.query.filter as NotificationFilter) ?? 'all';
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);
    const notifications = await getNotifications(userId, filter, limit, offset);
    res.json(notifications);
  });

  router.get('/count', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const count = await getUnreadCount(userId);
    res.json({ count });
  });

  router.patch('/read-all', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    await markAllRead(userId);
    broadcast(userId, { type: 'NOTIFICATION_READ_ALL', payload: null, timestamp: new Date().toISOString() });
    res.sendStatus(204);
  });

  router.patch('/:id/read', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const id = Number(req.params.id) as NotificationId;
    await markRead(userId, id);
    broadcast(userId, { type: 'NOTIFICATION_READ', payload: { id }, timestamp: new Date().toISOString() });
    res.sendStatus(204);
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const id = Number(req.params.id) as NotificationId;
    await deleteNotification(userId, id);
    res.sendStatus(204);
  });

  return router;
}

export { createNotificationsRouter, type NotificationsRouterDeps };
