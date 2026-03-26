import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  type Notification,
  type NotificationFilter,
} from '../services/notifications.service';

type UseNotificationsResult = {
  notifications: Notification[];
  unreadCount: number;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  deleteNotification: (id: number) => void;
  loadMore: () => void;
  hasMore: boolean;
};

const PAGE_SIZE = 20;

function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilterState] = useState<NotificationFilter>('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const { subscribe } = useWebSocketContext();
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);

  const load = useCallback(async (currentFilter: NotificationFilter, currentOffset: number) => {
    const [items, count] = await Promise.all([
      fetchNotifications(currentFilter, PAGE_SIZE, currentOffset),
      fetchUnreadCount(),
    ]);
    setNotifications((prev) => currentOffset === 0 ? items : [...prev, ...items]);
    setUnreadCount(count);
    setHasMore(items.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    setOffset(0);
    load(filter, 0).catch((err) => console.error('Failed to load notifications:', err));
  }, [filter, load]);

  useEffect(() => {
    const unsub1 = subscribe('NOTIFICATION_NEW', (payload: unknown) => {
      const notification = payload as Notification;
      setNotifications((prev) => filterRef.current !== 'read' ? [notification, ...prev] : prev);
      setUnreadCount((c) => c + 1);
    });

    const unsub2 = subscribe('NOTIFICATION_READ', (payload: unknown) => {
      const { id } = payload as { id: number };
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });

    const unsub3 = subscribe('NOTIFICATION_READ_ALL', () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [subscribe]);

  const setFilter = useCallback((f: NotificationFilter) => {
    setFilterState(f);
    setOffset(0);
  }, []);

  const markRead = useCallback((id: number) => {
    markNotificationRead(id)
      .then(() => {
        setNotifications((prev) =>
          prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      })
      .catch((err) => console.error('Failed to mark notification as read:', err));
  }, []);

  const markAllRead = useCallback(() => {
    markAllNotificationsRead()
      .then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
        setUnreadCount(0);
      })
      .catch((err) => console.error('Failed to mark all notifications as read:', err));
  }, []);

  const deleteNotification = useCallback((id: number) => {
    deleteNotificationById(id)
      .then(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      })
      .catch((err) => console.error('Failed to delete notification:', err));
  }, []);

  const loadMore = useCallback(() => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    load(filter, newOffset);
  }, [offset, filter, load]);

  return { notifications, unreadCount, filter, setFilter, markRead, markAllRead, deleteNotification, loadMore, hasMore };
}

export { useNotifications };
