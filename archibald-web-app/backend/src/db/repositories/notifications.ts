import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type NotificationId = Brand<number, 'NotificationId'>;
type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
type NotificationFilter = 'all' | 'unread' | 'read';

type Notification = {
  id: NotificationId;
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
};

type InsertNotificationParams = {
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type NotificationRow = {
  id: number;
  user_id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  expires_at: string;
};

function mapRow(row: NotificationRow): Notification {
  return {
    id: row.id as NotificationId,
    userId: row.user_id,
    type: row.type,
    severity: row.severity as NotificationSeverity,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function insertNotification(pool: DbPool, params: InsertNotificationParams): Promise<Notification> {
  const { rows } = await pool.query<NotificationRow>(
    `INSERT INTO agents.notifications (user_id, type, severity, title, body, data, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')
     RETURNING *`,
    [params.userId, params.type, params.severity, params.title, params.body, params.data ?? null],
  );
  return mapRow(rows[0]);
}

async function getNotifications(
  pool: DbPool,
  userId: string,
  filter: NotificationFilter,
  limit: number,
  offset: number,
): Promise<Notification[]> {
  const filterClause =
    filter === 'unread' ? 'AND read_at IS NULL' :
    filter === 'read'   ? 'AND read_at IS NOT NULL' : '';

  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM agents.notifications
     WHERE user_id = $1 AND expires_at > NOW() ${filterClause}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows.map(mapRow);
}

async function getUnreadCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM agents.notifications
     WHERE user_id = $1 AND read_at IS NULL AND expires_at > NOW()`,
    [userId],
  );
  return rows[0].count;
}

async function markRead(pool: DbPool, userId: string, id: NotificationId): Promise<void> {
  await pool.query(
    `UPDATE agents.notifications SET read_at = NOW()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
}

async function markAllRead(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
}

async function deleteNotification(pool: DbPool, userId: string, id: NotificationId): Promise<void> {
  await pool.query(
    `DELETE FROM agents.notifications WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

async function deleteExpired(pool: DbPool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.notifications WHERE expires_at < NOW()`,
  );
  return rowCount ?? 0;
}

export {
  insertNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  deleteExpired,
  type Notification,
  type NotificationId,
  type NotificationSeverity,
  type NotificationFilter,
  type InsertNotificationParams,
};
