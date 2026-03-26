import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import type { Notification, NotificationFilter } from '../services/notifications.service';

type NotificationsContextValue = {
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

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationsProvider');
  return ctx;
}

export { NotificationsProvider, useNotificationsContext };
