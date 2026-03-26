import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationsContext } from '../contexts/NotificationsContext';
import { NotificationItem } from './NotificationItem';
import { getNotificationRoute } from '../services/notifications.service';

type DropdownPos = { top: number; right: number };

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 64, right: 8 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markUnread, markAllRead, deleteNotification } = useNotificationsContext();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  };

  const preview = notifications.slice(0, 5);

  const panelContent = (
    <>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Notifiche</span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', padding: 0 }}
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {preview.length === 0 ? (
          <p style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '13px' }}>
            Nessuna notifica
          </p>
        ) : (
          preview.map((n) => (
            <div
              key={n.id}
              onClick={() => { if (n.readAt === null) markRead(n.id); setOpen(false); navigate(getNotificationRoute(n)); }}
              style={{ cursor: 'pointer' }}
            >
              <NotificationItem
                notification={n}
                onDelete={(id) => deleteNotification(id)}
                onMarkUnread={(id) => markUnread(id)}
              />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', textAlign: 'center', flexShrink: 0 }}>
        <button
          onClick={() => { setOpen(false); navigate('/notifications'); }}
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '13px', cursor: 'pointer' }}
        >
          Vedi tutte →
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Campanella */}
      <button
        onClick={handleToggle}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '6px 10px',
          position: 'relative',
          lineHeight: 1,
        }}
        title="Notifiche"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '4px',
              background: '#ef4444',
              color: '#fff',
              borderRadius: '9999px',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop dropdown */}
      {open && !isMobile && (
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '360px',
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: '480px',
            background: '#1e293b',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {panelContent}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && isMobile && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 9998,
            }}
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#1e293b',
              borderRadius: '16px 16px 0 0',
              zIndex: 9999,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.25)' }} />
            </div>
            {panelContent}
          </div>
        </>
      )}
    </div>
  );
}

export { NotificationBell };
