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

async function markNotificationUnread(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}/unread`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark notification as unread');
}

async function deleteNotificationById(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/notifications/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete notification');
}

function getNotificationRoute(notification: Notification): string {
  switch (notification.type) {
    case 'fedex_exception':
    case 'fedex_delivered':
      return notification.data?.orderNumber
        ? `/orders?highlight=${notification.data.orderNumber}`
        : '/orders';
    case 'erp_customer_deleted':
    case 'erp_customer_restored':
      return '/customers';
    case 'customer_inactive':
      return notification.data?.erpId && notification.data?.customerName
        ? `/customers?highlight=${String(notification.data.erpId)}&search=${encodeURIComponent(String(notification.data.customerName))}`
        : '/customers';
    case 'price_change':
      return '/prezzi-variazioni';
    case 'product_change':
      return '/prodotti-variazioni';
    case 'product_missing_vat':
    case 'sync_anomaly':
      return '/admin';
    case 'order_expiring':
      return notification.data?.orderNumber
        ? `/orders?highlight=${String(notification.data.orderNumber)}`
        : '/orders';
    case 'budget_milestone':
      return '/revenue-report';
    default:
      return '/notifications';
  }
}

export {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotificationById,
  getNotificationRoute,
  type Notification,
  type NotificationFilter,
  type NotificationSeverity,
};
