import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationsContext } from '../contexts/NotificationsContext';
import { formatRelativeTime } from '../components/NotificationItem';
import { getNotificationRoute } from '../services/notifications.service';
import type { Notification } from '../services/notifications.service';

type CategoryTab = 'all' | 'fedex' | 'sync' | 'delivered';

function getCategory(type: string): 'fedex' | 'sync' | 'delivered' | 'other' {
  if (type === 'fedex_exception') return 'fedex';
  if (type === 'fedex_delivered') return 'delivered';
  if (type === 'sync_anomaly' || type === 'product_missing_vat') return 'sync';
  return 'other';
}

type TableMeta = {
  tag: string; tagColor: string; tagBg: string;
  ordine: string; cliente: string; dettaglio: string; codice: string;
};

function getTableMeta(n: Notification): TableMeta {
  const data = n.data ?? {};
  const orderNumber = data.orderNumber as string | undefined;
  const customerName = data.customerName as string | undefined;
  const exType = data.exceptionType as string | undefined;

  switch (n.type) {
    case 'fedex_exception': {
      const tag =
        exType === 'held' ? '🏪 In giacenza' :
        exType === 'returning' ? '↩ In ritorno' :
        exType === 'canceled' ? '✖ Annullato' : '📦 Eccezione';
      const reason = data.reason as string | undefined;
      const codeMatch = reason?.match(/^(\w+):\s*(.+)/);
      const codice = codeMatch ? codeMatch[1] : '';
      const descrizione = codeMatch ? codeMatch[2] : (reason ?? n.body);
      return {
        tag, tagColor: '#cc0066', tagBg: 'rgba(204,0,102,0.15)',
        ordine: orderNumber ?? '—',
        cliente: customerName ?? '—',
        dettaglio: descrizione,
        codice,
      };
    }
    case 'fedex_delivered':
      return {
        tag: '✅ Consegnata', tagColor: '#2e7d32', tagBg: 'rgba(46,125,50,0.15)',
        ordine: orderNumber ?? '—',
        cliente: customerName ?? '—',
        dettaglio: 'Consegna completata',
        codice: 'DL',
      };
    case 'sync_anomaly':
    case 'product_missing_vat':
      return {
        tag: '⚠️ Sync', tagColor: '#e65100', tagBg: 'rgba(230,81,0,0.15)',
        ordine: '—', cliente: 'Sistema',
        dettaglio: n.body, codice: '',
      };
    default:
      return {
        tag: n.title, tagColor: '#aaa', tagBg: 'rgba(255,255,255,0.1)',
        ordine: orderNumber ?? '—',
        cliente: customerName ?? '—',
        dettaglio: n.body, codice: '',
      };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} · ${formatRelativeTime(iso)}`;
}

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left', padding: '10px 10px',
  fontSize: 11, color: 'rgba(255,255,255,0.45)',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  whiteSpace: 'nowrap',
};

function NotificationsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const {
    notifications, unreadCount,
    markRead, markAllRead, deleteNotification, loadMore, hasMore,
  } = useNotificationsContext();

  const fedexUnread    = notifications.filter(n => getCategory(n.type) === 'fedex'     && !n.readAt).length;
  const syncUnread     = notifications.filter(n => getCategory(n.type) === 'sync'      && !n.readAt).length;
  const delivUnread    = notifications.filter(n => getCategory(n.type) === 'delivered' && !n.readAt).length;

  const tabsConfig: Array<{ key: CategoryTab; label: string; count: number; color: string; bg: string }> = [
    { key: 'all',       label: 'Tutte',              count: unreadCount, color: '#fff',    bg: 'rgba(255,255,255,0.15)' },
    { key: 'fedex',     label: '📦 Eccezioni FedEx', count: fedexUnread, color: '#cc0066', bg: 'rgba(204,0,102,0.15)' },
    { key: 'sync',      label: '⚠️ Anomalie Sync',   count: syncUnread,  color: '#e65100', bg: 'rgba(230,81,0,0.15)' },
    { key: 'delivered', label: '✅ Consegnate',       count: delivUnread, color: '#2e7d32', bg: 'rgba(46,125,50,0.15)' },
  ];

  const visible = activeTab === 'all'
    ? notifications
    : notifications.filter(n => getCategory(n.type) === activeTab);

  const handleDeleteAllRead = () => {
    notifications.filter(n => n.readAt !== null).forEach(n => deleteNotification(n.id));
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>🔔 Centro Notifiche</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer' }}
            >
              Segna tutte lette
            </button>
          )}
          <button
            onClick={handleDeleteAllRead}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}
          >
            🗑 Elimina lette
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid rgba(255,255,255,0.08)', marginBottom: 0 }}>
        {tabsConfig.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', background: 'none', border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #cc0066' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: activeTab === t.key ? 700 : 400,
              transition: 'color 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '2px 7px',
                borderRadius: 8, background: t.bg, color: t.color, lineHeight: '16px',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '48px 0', fontSize: 13 }}>
          Nessuna notifica
        </p>
      ) : (
        <>
          <div style={{ background: '#1e293b', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 20 }} />
                  <th style={TH_STYLE}>Tipo</th>
                  <th style={TH_STYLE}>Ordine</th>
                  <th style={TH_STYLE}>Cliente</th>
                  <th style={TH_STYLE}>Dettaglio</th>
                  <th style={TH_STYLE}>Codice</th>
                  <th style={TH_STYLE}>Data</th>
                  <th style={TH_STYLE}>Azione</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(n => {
                  const meta = getTableMeta(n);
                  const isUnread = n.readAt === null;
                  const route = getNotificationRoute(n);
                  return (
                    <tr
                      key={n.id}
                      onClick={() => { if (isUnread) markRead(n.id); navigate(route); }}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: isUnread ? 'rgba(255,255,255,0.025)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <td style={{ paddingLeft: 14, width: 20 }}>
                        {isUnread && (
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#cc0066' }} />
                        )}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px',
                          borderRadius: 5, background: meta.tagBg, color: meta.tagColor,
                          whiteSpace: 'nowrap',
                        }}>
                          {meta.tag}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                        {meta.ordine}
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        {meta.cliente}
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
                        {meta.dettaglio}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        {meta.codice && (
                          <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                            {meta.codice}
                          </code>
                        )}
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
                        {formatDate(n.createdAt)}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (isUnread) markRead(n.id); navigate(route); }}
                          style={{
                            fontSize: 12, padding: '5px 12px',
                            background: '#cc0066', color: '#fff',
                            border: 'none', borderRadius: 6,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          → Vai
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ textAlign: 'center', paddingTop: 16 }}>
              <button
                onClick={loadMore}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', padding: '10px 24px', cursor: 'pointer', fontSize: 14 }}
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
