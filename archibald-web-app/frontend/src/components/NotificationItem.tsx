import type { Notification } from '../services/notifications.service';

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Ora';
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

type NotificationItemProps = {
  notification: Notification;
  onDelete: (id: number) => void;
};

function NotificationItem({ notification, onDelete }: NotificationItemProps) {
  const color = SEVERITY_COLORS[notification.severity] ?? '#6b7280';
  const isUnread = notification.readAt === null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        borderLeft: `4px solid ${color}`,
        background: isUnread ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontWeight: isUnread ? 600 : 400, fontSize: '14px', color: '#fff' }}>
            {notification.title}
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
          {notification.body}
        </p>
      </div>
      <button
        onClick={() => onDelete(notification.id)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.4)',
          cursor: 'pointer',
          fontSize: '16px',
          padding: '2px 4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
        title="Elimina"
      >
        ×
      </button>
    </div>
  );
}

export { NotificationItem };
