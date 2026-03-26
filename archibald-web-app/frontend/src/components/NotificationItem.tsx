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
  onMarkUnread?: (id: number) => void;
};

function NotificationItem({ notification, onDelete, onMarkUnread }: NotificationItemProps) {
  const color = SEVERITY_COLORS[notification.severity] ?? '#6b7280';
  const isUnread = notification.readAt === null;

  return (
    <div
      style={{
        padding: '12px 14px 10px',
        borderLeft: `4px solid ${color}`,
        background: isUnread ? 'rgba(59,130,246,0.07)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Riga titolo + pulsante elimina */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
        {isUnread && (
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
              marginTop: '4px',
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            fontWeight: isUnread ? 600 : 400,
            fontSize: '13px',
            color: isUnread ? '#fff' : 'rgba(255,255,255,0.72)',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}
        >
          {notification.title}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            fontSize: '17px',
            padding: '0 0 0 4px',
            flexShrink: 0,
            lineHeight: 1,
            marginTop: '-1px',
          }}
          title="Elimina notifica"
        >
          ×
        </button>
      </div>

      {/* Corpo */}
      <p
        style={{
          margin: '0 0 8px',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.58)',
          lineHeight: 1.55,
          wordBreak: 'break-word',
          paddingLeft: isUnread ? '13px' : '0',
        }}
      >
        {notification.body}
      </p>

      {/* Footer: segna da leggere (sx) + timestamp (dx) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: isUnread ? '13px' : '0',
        }}
      >
        {!isUnread && onMarkUnread ? (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkUnread(notification.id); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.38)',
              cursor: 'pointer',
              fontSize: '11px',
              padding: 0,
              lineHeight: 1,
            }}
            title="Segna come da leggere"
          >
            ↩ Da leggere
          </button>
        ) : (
          <span />
        )}
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap' }}>
          {formatRelativeTime(notification.createdAt)}
        </span>
      </div>
    </div>
  );
}

export { NotificationItem };
