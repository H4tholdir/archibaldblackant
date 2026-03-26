import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from '../components/NotificationItem';
import type { Notification, NotificationFilter } from '../services/notifications.service';

const FILTER_LABELS: Record<NotificationFilter, string> = {
  all: 'Tutte',
  unread: 'Non lette',
  read: 'Lette',
};

function groupByDate(items: Notification[]): Record<string, Notification[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const groups: Record<string, Notification[]> = {};
  for (const item of items) {
    const d = new Date(item.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d >= today ? 'Oggi' : d >= yesterday ? 'Ieri' : d >= weekAgo ? 'Questa settimana' : 'Precedenti';
    groups[key] = [...(groups[key] ?? []), item];
  }
  return groups;
}

const GROUP_ORDER = ['Oggi', 'Ieri', 'Questa settimana', 'Precedenti'];

function NotificationsPage() {
  const {
    notifications, unreadCount, filter, setFilter,
    markRead, markAllRead, deleteNotification, loadMore, hasMore,
  } = useNotifications();

  const grouped = groupByDate(notifications);

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#fff' }}>Notifiche</h1>
          {unreadCount > 0 && (
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{unreadCount} non lette</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              background: '#3b82f6', border: 'none', borderRadius: '6px',
              color: '#fff', fontSize: '13px', padding: '8px 14px', cursor: 'pointer',
            }}
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {(['all', 'unread', 'read'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              background: filter === f ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: filter === f ? '#fff' : 'rgba(255,255,255,0.7)',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {notifications.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '40px 0' }}>
          Nessuna notifica
        </p>
      ) : (
        <>
          {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
            <div key={group} style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                {group}
              </h3>
              <div style={{ borderRadius: '8px', overflow: 'hidden', background: '#1e293b' }}>
                {grouped[group].map((n) => (
                  <div key={n.id} onClick={() => markRead(n.id)} style={{ cursor: n.readAt ? 'default' : 'pointer' }}>
                    <NotificationItem notification={n} onDelete={deleteNotification} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button
                onClick={loadMore}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
                  color: '#fff', padding: '10px 24px', cursor: 'pointer', fontSize: '14px',
                }}
              >
                Carica altre
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { NotificationsPage };
