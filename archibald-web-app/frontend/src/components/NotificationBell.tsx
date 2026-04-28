import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationsContext } from '../contexts/NotificationsContext';
import { formatRelativeTime } from './NotificationItem';
import { getNotificationRoute } from '../services/notifications.service';
import type { Notification } from '../services/notifications.service';

type DropdownPos = { top: number; right: number };
type TabKey = 'all' | 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments';

function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'clients' | 'payments' | 'other' {
  if (type === 'fedex_exception') return 'fedex';
  if (type === 'fedex_delivered') return 'delivered';
  if (type === 'sync_anomaly' || type === 'product_missing_vat' || type === 'product_change') return 'sync';
  if (type === 'customer_inactive' || type === 'erp_customer_deleted' || type === 'erp_customer_restored' || type === 'customer_reminder') return 'clients';
  if (type === 'order_expiring' || type === 'budget_milestone') return 'payments';
  return 'other';
}

type RowInfo = {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string | undefined;
  description: string | undefined;
  tag: string;
  tagColor: string;
  tagBg: string;
};

function extractDescription(reason: string | undefined, body: string): string {
  if (!reason) return body;
  // "17: testo descrizione" → "testo descrizione"
  const match = reason.match(/^\w+:\s*(.+)/);
  return match ? match[1] : reason;
}

function getRowInfo(n: Notification): RowInfo {
  const data = n.data ?? {};
  const exType = data.exceptionType as string | undefined;
  switch (n.type) {
    case 'fedex_exception': {
      const tag =
        exType === 'held' ? 'In giacenza' :
        exType === 'returning' ? 'In ritorno' :
        exType === 'canceled' ? 'Annullato' : 'Eccezione';
      const reason = data.reason as string | undefined;
      return {
        icon: '📦', iconBg: 'rgba(204,0,102,0.18)',
        title: (data.orderNumber as string) ?? n.title,
        subtitle: data.customerName as string | undefined,
        description: extractDescription(reason, n.body),
        tag, tagColor: '#ff6699', tagBg: 'rgba(204,0,102,0.18)',
      };
    }
    case 'fedex_delivered':
      return {
        icon: '✅', iconBg: 'rgba(46,125,50,0.18)',
        title: (data.orderNumber as string) ?? n.title,
        subtitle: data.customerName as string | undefined,
        description: 'Consegna avvenuta con successo',
        tag: 'Consegnato', tagColor: '#66bb6a', tagBg: 'rgba(46,125,50,0.18)',
      };
    case 'sync_anomaly':
    case 'product_missing_vat':
      return {
        icon: '⚠️', iconBg: 'rgba(230,81,0,0.18)',
        title: n.title, subtitle: undefined,
        description: n.body,
        tag: 'Anomalia', tagColor: '#ffa040', tagBg: 'rgba(230,81,0,0.18)',
      };
    case 'customer_inactive':
      return {
        icon: '👤', iconBg: 'rgba(245,158,11,0.18)',
        title: n.title,
        subtitle: data.customerName as string | undefined,
        description: n.body,
        tag: 'Esclusività', tagColor: '#f59e0b', tagBg: 'rgba(245,158,11,0.18)',
      };
    case 'order_expiring': {
      const daysPastDue = data.daysPastDue as number | undefined;
      return {
        icon: '💰', iconBg: 'rgba(239,68,68,0.18)',
        title: (data.orderNumber as string) ?? n.title,
        subtitle: data.customerName as string | undefined,
        description: daysPastDue != null ? `${daysPastDue} gg fuori scadenza` : n.body,
        tag: 'Scaduto', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.18)',
      };
    }
    case 'erp_customer_deleted':
      return {
        icon: '🗑️', iconBg: 'rgba(239,68,68,0.18)',
        title: n.title,
        subtitle: data.customerName as string | undefined,
        description: n.body,
        tag: 'Cancellato ERP', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.18)',
      };
    case 'erp_customer_restored':
      return {
        icon: '🔄', iconBg: 'rgba(46,125,50,0.18)',
        title: n.title,
        subtitle: data.customerName as string | undefined,
        description: n.body,
        tag: 'Ripristinato ERP', tagColor: '#66bb6a', tagBg: 'rgba(46,125,50,0.18)',
      };
    case 'budget_milestone':
      return {
        icon: '🏆', iconBg: 'rgba(250,204,21,0.18)',
        title: n.title,
        subtitle: data.conditionTitle as string | undefined,
        description: n.body,
        tag: 'Traguardo', tagColor: '#facc15', tagBg: 'rgba(250,204,21,0.18)',
      };
    case 'customer_reminder':
      return {
        icon: '🔔', iconBg: 'rgba(96,165,250,0.18)',
        title: n.title,
        subtitle: data.customerErpId as string | undefined,
        description: n.body,
        tag: 'Promemoria', tagColor: '#60a5fa', tagBg: 'rgba(96,165,250,0.18)',
      };
    case 'product_change': {
      const changeType = data.changeType as string | undefined;
      if (changeType === 'new') return {
        icon: '🆕', iconBg: 'rgba(46,125,50,0.18)',
        title: n.title, subtitle: undefined, description: n.body,
        tag: 'Nuovi prodotti', tagColor: '#66bb6a', tagBg: 'rgba(46,125,50,0.18)',
      };
      if (changeType === 'removed') return {
        icon: '🗑️', iconBg: 'rgba(239,68,68,0.18)',
        title: n.title, subtitle: undefined, description: n.body,
        tag: 'Rimossi', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.18)',
      };
      return {
        icon: '✏️', iconBg: 'rgba(96,165,250,0.18)',
        title: n.title, subtitle: undefined, description: n.body,
        tag: 'Aggiornati', tagColor: '#60a5fa', tagBg: 'rgba(96,165,250,0.18)',
      };
    }
    default:
      return {
        icon: '🔔', iconBg: 'rgba(255,255,255,0.08)',
        title: n.title, subtitle: undefined,
        description: n.body,
        tag: '', tagColor: '#aaa', tagBg: 'rgba(255,255,255,0.08)',
      };
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 64, right: 8 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsContext();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  const fedexCount    = notifications.filter(n => getCategory(n.type) === 'fedex'     && !n.readAt).length;
  const syncCount     = notifications.filter(n => getCategory(n.type) === 'sync'      && !n.readAt).length;
  const delivCount    = notifications.filter(n => getCategory(n.type) === 'delivered' && !n.readAt).length;
  const clientsCount  = notifications.filter(n => getCategory(n.type) === 'clients'   && !n.readAt).length;
  const paymentsCount = notifications.filter(n => getCategory(n.type) === 'payments'  && !n.readAt).length;

  const tabsConfig: Array<{ key: TabKey; label: string; count: number; color: string; bg: string }> = [
    { key: 'all',      label: 'Tutte', count: unreadCount,   color: '#fff',    bg: 'rgba(255,255,255,0.15)' },
    { key: 'fedex',    label: '📦',    count: fedexCount,    color: '#ff6699', bg: 'rgba(204,0,102,0.25)' },
    { key: 'sync',     label: '⚠️',    count: syncCount,     color: '#ffa040', bg: 'rgba(230,81,0,0.25)' },
    { key: 'delivered',label: '✅',    count: delivCount,    color: '#66bb6a', bg: 'rgba(46,125,50,0.25)' },
    { key: 'clients',  label: '👤',    count: clientsCount,  color: '#f59e0b', bg: 'rgba(245,158,11,0.25)' },
    { key: 'payments', label: '💰',    count: paymentsCount, color: '#f87171', bg: 'rgba(239,68,68,0.25)' },
  ];

  const filtered = (activeTab === 'all'
    ? notifications.filter(n => getCategory(n.type) !== 'sync')
    : notifications.filter(n => getCategory(n.type) === activeTab)
  ).slice(0, 5);

  const panelContent = (
    <>
      {/* Header */}
      <div style={{
        padding: '12px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>🔔 Notifiche</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                Segna lette
              </button>
            )}
            <button
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              style={{ background: 'none', border: 'none', color: '#cc0066', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Vedi tutte →
            </button>
          </div>
        </div>

        {/* Mini tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid rgba(255,255,255,0.08)', paddingBottom: 0 }}>
          {tabsConfig.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', background: 'none', border: 'none',
                borderBottom: activeTab === t.key ? '2px solid #cc0066' : '2px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.45)',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 6, background: t.bg, color: t.color, lineHeight: '14px' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {filtered.length === 0 ? (
          <p style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
            Nessuna notifica
          </p>
        ) : (
          filtered.map(n => {
            const info = getRowInfo(n);
            const isUnread = n.readAt === null;
            return (
              <div
                key={n.id}
                onClick={() => { if (isUnread) markRead(n.id); setOpen(false); navigate(getNotificationRoute(n)); }}
                style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  background: isUnread ? 'rgba(255,255,255,0.03)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Unread dot */}
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: isUnread ? '#cc0066' : 'transparent', flexShrink: 0, marginTop: 7 }} />
                {/* Icon */}
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: info.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {info.icon}
                </div>
                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {info.title}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', flexShrink: 0, marginLeft: 6 }}>
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  {info.subtitle && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 3 }}>
                      {info.subtitle}
                    </div>
                  )}
                  {info.description && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4, marginBottom: 4 }}>
                      {info.description}
                    </div>
                  )}
                  {info.tag && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: info.tagBg, color: info.tagColor }}>
                      {info.tag}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 16px', textAlign: 'center', flexShrink: 0 }}>
        <button
          onClick={() => { setOpen(false); navigate('/notifications'); }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}
        >
          📋 Vedi tutte le notifiche
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Campanella */}
      <button
        onClick={handleToggle}
        style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', padding: '6px 10px', position: 'relative', lineHeight: 1 }}
        title="Notifiche"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '2px', right: '4px',
            background: '#ef4444', color: '#fff', borderRadius: '9999px',
            fontSize: '10px', fontWeight: 700, minWidth: '16px', height: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop dropdown */}
      {open && !isMobile && (
        <div style={{
          position: 'fixed', top: dropdownPos.top, right: dropdownPos.right,
          width: '380px', maxWidth: 'calc(100vw - 16px)', maxHeight: '480px',
          background: '#1e293b', borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 99999,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {panelContent}
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && isMobile && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 99998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: '#1e293b', borderRadius: '16px 16px 0 0',
            zIndex: 99999, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
          }}>
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
