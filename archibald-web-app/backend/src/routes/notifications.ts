import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { Notification, NotificationId, NotificationFilter } from '../db/repositories/notifications';
import { logger } from '../logger';

type BroadcastMsg = { type: string; payload: unknown; timestamp: string };

type NotificationsRouterDeps = {
  getNotifications: (userId: string, filter: NotificationFilter, limit: number, offset: number) => Promise<Notification[]>;
  getUnreadCount: (userId: string) => Promise<number>;
  markRead: (userId: string, id: NotificationId) => Promise<void>;
  markUnread: (userId: string, id: NotificationId) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  deleteNotification: (userId: string, id: NotificationId) => Promise<void>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
};

const VALID_FILTERS: NotificationFilter[] = ['all', 'unread', 'read'];

function createNotificationsRouter(deps: NotificationsRouterDeps) {
  const { getNotifications, getUnreadCount, markRead, markUnread, markAllRead, deleteNotification, broadcast } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const rawFilter = req.query.filter as NotificationFilter;
      const filter: NotificationFilter = VALID_FILTERS.includes(rawFilter) ? rawFilter : 'all';
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
      const notifications = await getNotifications(userId, filter, limit, offset);
      res.json(notifications);
    } catch (error) {
      logger.error('Error fetching notifications', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero notifiche' });
    }
  });

  router.get('/count', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const count = await getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      logger.error('Error fetching unread notification count', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero contatore notifiche' });
    }
  });

  router.patch('/read-all', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      await markAllRead(userId);
      broadcast(userId, { type: 'NOTIFICATION_READ_ALL', payload: null, timestamp: new Date().toISOString() });
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error marking all notifications read', { error });
      res.status(500).json({ success: false, error: 'Errore nel segnare tutte le notifiche come lette' });
    }
  });

  router.patch('/:id/unread', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid notification id' });
      await markUnread(userId, id as NotificationId);
      broadcast(userId, { type: 'NOTIFICATION_UNREAD', payload: { id }, timestamp: new Date().toISOString() });
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error marking notification unread', { error });
      res.status(500).json({ success: false, error: 'Errore nel segnare la notifica come da leggere' });
    }
  });

  router.patch('/:id/read', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid notification id' });
      await markRead(userId, id as NotificationId);
      broadcast(userId, { type: 'NOTIFICATION_READ', payload: { id }, timestamp: new Date().toISOString() });
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error marking notification read', { error });
      res.status(500).json({ success: false, error: 'Errore nel segnare la notifica come letta' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid notification id' });
      await deleteNotification(userId, id as NotificationId);
      res.sendStatus(204);
    } catch (error) {
      logger.error('Error deleting notification', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione della notifica' });
    }
  });

  return router;
}

export { createNotificationsRouter, type NotificationsRouterDeps };
