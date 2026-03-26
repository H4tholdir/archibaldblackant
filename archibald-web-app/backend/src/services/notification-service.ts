import type { DbPool } from '../db/pool';
import type { User } from '../db/repositories/users';
import type { Notification, InsertNotificationParams, NotificationSeverity } from '../db/repositories/notifications';

type NotificationTarget = 'user' | 'admin' | 'all';

type BroadcastMsg = { type: string; payload: unknown; timestamp: string };

type NotificationServiceDeps = {
  pool: DbPool;
  getAllUsers: (pool: DbPool) => Promise<User[]>;
  insertNotification: (pool: DbPool, params: InsertNotificationParams) => Promise<Notification>;
  broadcast: (userId: string, msg: BroadcastMsg) => void;
};

type CreateNotificationParams = {
  target: NotificationTarget;
  userId?: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

async function createNotification(
  deps: NotificationServiceDeps,
  params: CreateNotificationParams,
): Promise<void> {
  const { pool, getAllUsers, insertNotification, broadcast } = deps;
  const { target, type, severity, title, body, data } = params;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (target === 'user') {
    if (!params.userId) throw new Error('userId required when target=user');
    const notification = await insertNotification(pool, { userId: params.userId, type, severity, title, body, data, expiresAt });
    broadcast(params.userId, { type: 'NOTIFICATION_NEW', payload: notification, timestamp: new Date().toISOString() });
    return;
  }

  const users = await getAllUsers(pool);
  const targets = target === 'admin' ? users.filter((u) => u.role === 'admin') : users;
  await Promise.all(targets.map(async (user) => {
    const notification = await insertNotification(pool, { userId: user.id, type, severity, title, body, data, expiresAt });
    broadcast(user.id, { type: 'NOTIFICATION_NEW', payload: notification, timestamp: new Date().toISOString() });
  }));
}

export {
  createNotification,
  type NotificationServiceDeps,
  type CreateNotificationParams,
  type NotificationTarget,
};
