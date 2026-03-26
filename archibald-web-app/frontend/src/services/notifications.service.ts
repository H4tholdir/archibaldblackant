import { fetchWithRetry } from '../utils/fetch-with-retry';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

type Notification = {
  id: number;
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

type NotificationFilter = 'all' | 'unread' | 'read';

async function fetchNotifications(
  filter: NotificationFilter = 'all',
  limit = 20,
  offset = 0,
): Promise<Notification[]> {
  const params = new URLSearchParams({ filter, limit: String(limit), offset: String(offset) });
  const res = await fetchWithRetry(`/api/notifications?${params}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetchWithRetry('/api/notifications/count');
  if (!res.ok) throw new Error('Failed to fetch unread count');
  const data: { count: number } = await res.json();
  return data.count;
}

async function markNotificationRead(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark notification as read');
}

async function markAllNotificationsRead(): Promise<void> {
  const res = await fetchWithRetry('/api/notifications/read-all', { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark all notifications as read');
}

async function deleteNotificationById(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete notification');
}

export {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  type Notification,
  type NotificationFilter,
  type NotificationSeverity,
};
