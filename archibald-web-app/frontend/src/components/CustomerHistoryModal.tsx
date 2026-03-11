// archibald-web-app/frontend/src/components/CustomerHistoryModal.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CustomerFullHistoryOrder } from '../api/customer-full-history';
import { getCustomerFullHistory } from '../api/customer-full-history';
import type { PendingOrderItem } from '../types/pending-order';
import { priceService } from '../services/prices.service';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerProfileId: string | null;
  subClientCodice: string | null;
  isFresisClient: boolean;
  currentOrderItems: PendingOrderItem[];
  onAddArticle: (item: PendingOrderItem, replace: boolean) => void;
  onAddOrder: (items: PendingOrderItem[], replace: boolean) => void;
};

type PendingAction =
  | { type: 'single'; item: PendingOrderItem; existingCode: string }
  | { type: 'order'; items: PendingOrderItem[]; skipped: string[] };

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CustomerHistoryModal({
  isOpen, onClose, customerName, customerProfileId, subClientCodice,
  isFresisClient, currentOrderItems, onAddArticle, onAddOrder,
}: Props) {
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [skippedDialog, setSkippedDialog] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    getCustomerFullHistory({
      customerProfileId: customerProfileId ?? undefined,
      subClientCodice: subClientCodice ?? undefined,
    })
      .then(setOrders)
      .catch(() => setError('Errore nel caricamento dello storico'))
      .finally(() => setLoading(false));
  }, [isOpen, customerProfileId, subClientCodice]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return orders;
    return orders
      .map((order) => {
        if (order.orderNumber.toLowerCase().includes(q)) return order;
        const matched = order.articles.filter(
          (a) =>
            a.articleCode.toLowerCase().includes(q) ||
            a.articleDescription.toLowerCase().includes(q),
        );
        return matched.length > 0 ? { ...order, articles: matched } : null;
      })
      .filter((o): o is CustomerFullHistoryOrder => o !== null);
  }, [orders, searchQuery]);

  const buildPendingItem = useCallback(
    async (a: CustomerFullHistoryOrder['articles'][number]): Promise<PendingOrderItem & { _priceWarning?: boolean }> => {
      if (isFresisClient) {
        return {
          articleCode: a.articleCode,
          productName: a.articleDescription,
          description: a.articleDescription,
          quantity: a.quantity,
          price: a.unitPrice,
          vat: a.vatPercent,
          discount: a.discountPercent,
        };
      }

      // Direct client: fetch current list price and calculate discount
      const priceInfo = await priceService.getPriceAndVat(a.articleCode);
      const currentListPrice = priceInfo?.price ?? a.unitPrice;
      const lineAmountNoVat = a.lineTotalWithVat / (1 + a.vatPercent / 100);
      const calculatedDiscount =
        currentListPrice > 0
          ? (1 - lineAmountNoVat / (a.quantity * currentListPrice)) * 100
          : -1;
      const isValid = calculatedDiscount >= 0 && calculatedDiscount <= 100;

      return {
        articleCode: a.articleCode,
        productName: a.articleDescription,
        description: a.articleDescription,
        quantity: a.quantity,
        price: currentListPrice,
        vat: priceInfo?.vat ?? a.vatPercent,
        discount: isValid ? Math.round(calculatedDiscount * 100) / 100 : 0,
        _priceWarning: !isValid,
      } as PendingOrderItem & { _priceWarning?: boolean };
    },
    [isFresisClient],
  );

  const handleAddSingle = useCallback(
    async (article: CustomerFullHistoryOrder['articles'][number]) => {
      const item = await buildPendingItem(article);
      // Show dialog ONLY if this same code is already in the order
      const alreadyPresent = currentOrderItems.some((i) => i.articleCode === article.articleCode);
      if (alreadyPresent) {
        setPendingAction({ type: 'single', item, existingCode: article.articleCode });
        return;
      }
      onAddArticle(item, false);
    },
    [buildPendingItem, currentOrderItems, onAddArticle],
  );

  const handleCopyOrder = useCallback(
    async (order: CustomerFullHistoryOrder) => {
      const validItems: PendingOrderItem[] = [];
      const skipped: string[] = [];

      for (const a of order.articles) {
        const priceInfo = isFresisClient
          ? { price: a.unitPrice, vat: a.vatPercent }
          : await priceService.getPriceAndVat(a.articleCode);

        if (!priceInfo) {
          skipped.push(`${a.articleCode} — ${a.articleDescription}`);
          continue;
        }
        validItems.push(await buildPendingItem(a));
      }

      const action: PendingAction = { type: 'order', items: validItems, skipped };
      if (currentOrderItems.length > 0) {
        setPendingAction(action);
        return;
      }
      onAddOrder(validItems, false);
      if (skipped.length > 0) setSkippedDialog(skipped);
    },
    [buildPendingItem, currentOrderItems.length, isFresisClient, onAddOrder],
  );

  const handleConflictChoice = useCallback(
    (replace: boolean) => {
      if (!pendingAction) return;
      if (pendingAction.type === 'single') {
        onAddArticle(pendingAction.item, replace);
      } else {
        onAddOrder(pendingAction.items, replace);
        if (pendingAction.skipped.length > 0) setSkippedDialog(pendingAction.skipped);
      }
      setPendingAction(null);
    },
    [onAddArticle, onAddOrder, pendingAction],
  );

  if (!isOpen) return null;

  const ordersCount = orders.filter((o) => o.source === 'orders').length;
  const fresisCount = orders.filter((o) => o.source === 'fresis').length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(15,23,42,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 1100,
        height: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        {/* HEADER */}
        <div style={{
          background: '#1e293b', color: 'white', padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Storico Ordini — {customerName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Storico ordini + Storico Fresis · Ordinati per data ↓
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
            width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* FILTER BAR */}
        <div style={{
          padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="Cerca articolo, codice, numero ordine..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1, minWidth: 0, padding: '8px 12px',
              border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
            }}
          />
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
            Ordini: {ordersCount}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', whiteSpace: 'nowrap' }}>
            Fresis: {fresisCount}
          </span>
          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
            {orders.length} ordini · {orders.reduce((s, o) => s + o.articles.length, 0)} articoli
          </span>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Caricamento storico...</div>}
          {error && <div style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}</div>}
          {!loading && !error && filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onAddArticle={(article) => handleAddSingle(article)}
              onCopyOrder={() => handleCopyOrder(order)}
            />
          ))}
          {!loading && !error && filteredOrders.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Nessun ordine trovato</div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Hover su una riga → <strong>+ Aggiungi</strong> per inserire · <strong>⊕ Copia tutto l'ordine</strong> per copiare l'ordine
          </span>
          <button onClick={onClose} style={{
            background: '#f1f5f9', color: '#475569', border: 'none',
            padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Chiudi</button>
        </div>
      </div>

      {pendingAction && (
        <ConflictDialog
          existingCount={currentOrderItems.length}
          isOrderCopy={pendingAction.type === 'order'}
          onAppend={() => handleConflictChoice(false)}
          onReplace={() => handleConflictChoice(true)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {skippedDialog.length > 0 && (
        <SkippedDialog skipped={skippedDialog} onClose={() => setSkippedDialog([])} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

type OrderCardProps = {
  order: CustomerFullHistoryOrder;
  onAddArticle: (article: CustomerFullHistoryOrder['articles'][number]) => void;
  onCopyOrder: () => void;
};

function OrderCard({ order, onAddArticle, onCopyOrder }: OrderCardProps) {
  const isFresis = order.source === 'fresis';
  const accent = isFresis ? '#8b5cf6' : '#3b82f6';
  const totalAmount = order.articles.reduce((s, a) => s + a.lineTotalWithVat, 0);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderLeft: `4px solid ${accent}`, borderRadius: 8, width: '100%' }}>
      <div style={{
        background: '#f8fafc', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order.orderNumber}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{new Date(order.orderDate).toLocaleDateString('it-IT')}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: isFresis ? '#ede9fe' : '#dbeafe',
          color: isFresis ? '#7c3aed' : '#1d4ed8',
        }}>{isFresis ? 'Storico Fresis' : 'Storico ordini'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: '#059669' }}>€ {formatEur(totalAmount)}</span>
        <button onClick={onCopyOrder} style={{
          background: '#1e293b', color: 'white', border: 'none',
          padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>⊕ Copia tutto l'ordine</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '13%' }} /><col style={{ width: '30%' }} />
          <col style={{ width: '7%' }} /><col style={{ width: '11%' }} />
          <col style={{ width: '9%' }} /><col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} /><col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['Codice', 'Descrizione', 'Qtà', 'Prezzo unit.', 'Sconto', 'IVA', 'Tot. + IVA', ''].map((h, i) => (
              <th key={i} style={{
                padding: '7px 8px', textAlign: i >= 2 && i <= 6 ? 'right' : 'left',
                fontSize: 10, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid #e2e8f0',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.articles.map((article, idx) => (
            <ArticleRow key={idx} article={article} onAdd={() => onAddArticle(article)} />
          ))}
        </tbody>
      </table>

      <div style={{
        background: '#f8fafc', borderTop: '2px solid #e2e8f0',
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap', borderRadius: '0 0 8px 8px',
      }}>
        <FooterItem label="N. articoli" value={String(order.articles.length)} />
        <Divider />
        <FooterItem label="Imponibile" value={`€ ${formatEur(order.articles.reduce((s, a) => s + a.lineTotalWithVat / (1 + a.vatPercent / 100), 0))}`} />
        <Divider />
        <FooterItem label="IVA" value={`€ ${formatEur(order.articles.reduce((s, a) => s + (a.lineTotalWithVat - a.lineTotalWithVat / (1 + a.vatPercent / 100)), 0))}`} />
        <Divider />
        <FooterItem label="Totale documento" value={`€ ${formatEur(totalAmount)}`} green />
      </div>
    </div>
  );
}

function ArticleRow({ article, onAdd }: {
  article: CustomerFullHistoryOrder['articles'][number];
  onAdd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: '1px solid #f1f5f9', background: hovered ? '#eff6ff' : 'white' }}
    >
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6366f1', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleCode}
        </span>
      </td>
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontSize: 12, color: '#1e293b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleDescription}
        </span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{article.quantity}</td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{formatEur(article.unitPrice)}</td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
        <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{article.discountPercent}%</span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
        <span style={{ background: '#f0fdf4', color: '#166534', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{article.vatPercent}%</span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{formatEur(article.lineTotalWithVat)}</td>
      <td style={{ padding: '8px 8px' }}>
        <button onClick={onAdd} style={{
          opacity: hovered ? 1 : 0, background: '#6366f1', color: 'white',
          border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 10,
          fontWeight: 600, cursor: 'pointer', width: '100%', whiteSpace: 'nowrap',
        }}>+ Aggiungi</button>
      </td>
    </tr>
  );
}

function FooterItem({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontWeight: 700, color: green ? '#059669' : '#1e293b', fontSize: green ? 15 : 13 }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 30, background: '#e2e8f0' }} />;
}

function ConflictDialog({ existingCount, isOrderCopy, onAppend, onReplace, onCancel }: {
  existingCount: number;
  isOrderCopy: boolean;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Ordine non vuoto</div>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>
          Hai già <strong>{existingCount}</strong> {existingCount === 1 ? 'articolo' : 'articoli'} nell'ordine.{' '}
          {isOrderCopy
            ? "Vuoi aggiungere gli articoli in coda o sovrascrivere tutto l'ordine?"
            : 'Questo articolo è già presente. Vuoi aggiungerlo in coda o sostituire quello esistente?'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={onReplace} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sovrascrivi</button>
          <button onClick={onAppend} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Aggiungi in coda</button>
        </div>
      </div>
    </div>
  );
}

function SkippedDialog({ skipped, onClose }: { skipped: string[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, maxWidth: 480, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Articoli non trovati nel catalogo</div>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
          I seguenti articoli non sono stati copiati perché non trovati nel catalogo attuale:
        </p>
        <ul style={{ fontSize: 12, color: '#64748b', paddingLeft: 18, marginBottom: 20 }}>
          {skipped.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Capito</button>
        </div>
      </div>
    </div>
  );
}
