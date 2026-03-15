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
  customerProfileIds: string[];
  subClientCodices: string[];
  isFresisClient: boolean;
  onAddArticle: (item: PendingOrderItem, replace: boolean) => void;
  onAddOrder: (items: PendingOrderItem[], replace: boolean) => void;
  onEditMatching?: () => void;
};

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CustomerHistoryModal({
  isOpen, onClose, customerName, customerProfileIds, subClientCodices,
  isFresisClient, onAddArticle, onAddOrder, onEditMatching,
}: Props) {
  const [orders, setOrders] = useState<CustomerFullHistoryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [skippedDialog, setSkippedDialog] = useState<string[]>([]);

  // Listino prices: Map<articleCode, { price: number; vat: number } | null>
  const [listinoPrices, setListinoPrices] = useState<Map<string, { price: number; vat: number } | null>>(new Map());
  // Codici sostituiti via fuzzy match: Map<oldCode, newCode>
  const [codeSubstitutions, setCodeSubstitutions] = useState<Map<string, string>>(new Map());
  // Contatore articoli aggiunti
  const [addedCount, setAddedCount] = useState(0);
  // Badge counter per riga: Map<articleCode, count>
  const [articleBadges, setArticleBadges] = useState<Map<string, number>>(new Map());
  // Flash rows
  const [flashingArticles, setFlashingArticles] = useState<Set<string>>(new Set());
  // Copy order overlay
  const [copyingOrderId, setCopyingOrderId] = useState<string | null>(null);
  const [copiedOrderIds, setCopiedOrderIds] = useState<Set<string>>(new Set());

  // Serializzato per evitare re-render infiniti con array come dipendenze
  const profileIdsKey = customerProfileIds.join(',');
  const subClientCodicesKey = subClientCodices.join(',');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    getCustomerFullHistory({
      customerProfileIds: customerProfileIds.length > 0 ? customerProfileIds : undefined,
      customerName: customerName || undefined,
      subClientCodices: subClientCodices.length > 0 ? subClientCodices : undefined,
    })
      .then(setOrders)
      .catch(() => setError('Errore nel caricamento dello storico'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profileIdsKey, customerName, subClientCodicesKey]);

  useEffect(() => {
    if (!isOpen || orders.length === 0) return;
    const codes = Array.from(new Set(orders.flatMap((o) => o.articles.map((a) => a.articleCode))));
    priceService.getPriceAndVatBatch(codes)
      .then((map) => setListinoPrices(map))
      .catch(() => {});
  }, [isOpen, orders]);

  // Per i codici non trovati nel catalogo, cerca corrispondenze fuzzy
  useEffect(() => {
    if (!isOpen || listinoPrices.size === 0) return;
    const nullCodes = [...listinoPrices.entries()]
      .filter(([, v]) => v === null)
      .map(([code]) => code);
    if (nullCodes.length === 0) return;
    Promise.allSettled(
      nullCodes.map(async (code) => {
        const match = await priceService.fuzzyMatchArticleCode(code);
        return match !== null ? ([code, match] as const) : null;
      }),
    ).then((results) => {
      const subs = new Map<string, string>();
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) subs.set(r.value[0], r.value[1]);
      }
      setCodeSubstitutions(subs);
    });
  }, [isOpen, listinoPrices]);

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
    async (
      a: CustomerFullHistoryOrder['articles'][number],
      orderDiscountPercent: number,
      substituteCode?: string,
    ): Promise<PendingOrderItem & { _priceWarning?: boolean }> => {
      const effectiveCode = substituteCode ?? a.articleCode;
      const combinedDiscount = orderDiscountPercent > 0
        ? Math.round((1 - (1 - a.discountPercent / 100) * (1 - orderDiscountPercent / 100)) * 10000) / 100
        : a.discountPercent;

      if (isFresisClient) {
        return {
          articleCode: effectiveCode,
          productName: effectiveCode,
          description: a.articleDescription,
          quantity: a.quantity,
          price: a.unitPrice,
          vat: a.vatPercent,
          discount: combinedDiscount,
        };
      }

      // Direct client: fetch current list price and calculate discount
      const priceInfo = await priceService.getPriceAndVat(effectiveCode);
      const currentListPrice = priceInfo?.price ?? a.unitPrice;
      const lineAmountNoVat = a.lineTotalWithVat / (1 + a.vatPercent / 100);
      const calculatedDiscount =
        currentListPrice > 0
          ? (1 - lineAmountNoVat / (a.quantity * currentListPrice)) * 100
          : -1;
      const isValid = calculatedDiscount >= 0 && calculatedDiscount <= 100;

      return {
        articleCode: effectiveCode,
        productName: effectiveCode,
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
    async (
      article: CustomerFullHistoryOrder['articles'][number],
      orderDiscountPercent: number,
      orderSource: 'orders' | 'fresis',
    ) => {
      const substituteCode = orderSource === 'fresis' ? codeSubstitutions.get(article.articleCode) : undefined;
      const item = await buildPendingItem(article, orderDiscountPercent, substituteCode);
      onAddArticle(item, false);
      setAddedCount((c) => c + 1);
      setArticleBadges((prev) => {
        const m = new Map(prev);
        m.set(article.articleCode, (m.get(article.articleCode) ?? 0) + 1);
        return m;
      });
      setFlashingArticles((prev) => new Set([...prev, article.articleCode]));
      setTimeout(() => {
        setFlashingArticles((prev) => { const s = new Set(prev); s.delete(article.articleCode); return s; });
      }, 1200);
    },
    [buildPendingItem, onAddArticle, codeSubstitutions],
  );

  const handleCopyOrder = useCallback(
    async (order: CustomerFullHistoryOrder) => {
      setCopyingOrderId(order.orderId);
      const validPairs: Array<{ originalCode: string; item: PendingOrderItem }> = [];
      const skipped: string[] = [];

      for (const a of order.articles) {
        const inCatalog = listinoPrices.get(a.articleCode) !== null;
        const substituteCode = order.source === 'fresis' ? codeSubstitutions.get(a.articleCode) : undefined;
        // skipOnMissing: Fresis source (always) OR direct orders for non-Fresis customer
        const skipOnMissing = order.source === 'fresis' || !isFresisClient;
        if (skipOnMissing && !inCatalog && substituteCode === undefined) {
          skipped.push(`${a.articleCode} — ${a.articleDescription}`);
          continue;
        }
        validPairs.push({
          originalCode: a.articleCode,
          item: await buildPendingItem(a, order.orderDiscountPercent, substituteCode),
        });
      }

      const validItems = validPairs.map((p) => p.item);
      onAddOrder(validItems, false);
      if (skipped.length > 0) setSkippedDialog(skipped);

      setAddedCount((c) => c + validItems.length);
      for (const { originalCode } of validPairs) {
        setArticleBadges((prev) => {
          const m = new Map(prev);
          m.set(originalCode, (m.get(originalCode) ?? 0) + 1);
          return m;
        });
      }
      setCopiedOrderIds((prev) => new Set([...prev, order.orderId]));
      setTimeout(() => {
        setCopyingOrderId(null);
        setCopiedOrderIds((prev) => { const s = new Set(prev); s.delete(order.orderId); return s; });
      }, 1300);
    },
    [buildPendingItem, isFresisClient, listinoPrices, codeSubstitutions, onAddOrder],
  );

  if (!isOpen) return null;

  const ordersCount = orders.filter((o) => o.source === 'orders').length;
  const fresisCount = orders.filter((o) => o.source === 'fresis').length;

  return (
    <>
      <style>{`
        @keyframes artFlash { 0%,100% { background: inherit; } 30% { background: #dcfce7; } }
        @keyframes badgePop { 0% { transform: scale(0.6); opacity: 0; } 80% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes badgeBump { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
        @keyframes counterBump { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes checkPop { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 80% { transform: scale(1.1) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
      `}</style>
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Storico Ordini — {customerName}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                Storico ordini + Storico Fresis · Ordinati per data ↓
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {addedCount > 0 && (
                <div id="cart-counter" style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(5,150,105,0.25)', borderRadius: 20,
                  padding: '4px 12px', fontSize: 12, color: '#6ee7b7', fontWeight: 700,
                  animation: 'counterBump 0.3s ease',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  {addedCount} articol{addedCount === 1 ? 'o' : 'i'} nell'ordine
                </div>
              )}
              {onEditMatching && (
                <button onClick={onEditMatching} style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8',
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                }}>✎ Modifica collegamenti</button>
              )}
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0,
              }}>✕</button>
            </div>
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
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, background: '#f1f5f9' }}>
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Caricamento storico...</div>}
            {error && <div style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}</div>}
            {!loading && !error && filteredOrders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                listinoPrices={listinoPrices}
                articleBadges={articleBadges}
                flashingArticles={flashingArticles}
                codeSubstitutions={codeSubstitutions}
                isCopying={copyingOrderId === order.orderId}
                isCopied={copiedOrderIds.has(order.orderId)}
                onAddArticle={(article) => handleAddSingle(article, order.orderDiscountPercent, order.source)}
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
              <strong>+ Aggiungi</strong> per inserire una riga · <strong>⊕ Copia tutto l'ordine</strong> per copiare l'intero ordine
            </span>
            <button onClick={onClose} style={{
              background: '#f1f5f9', color: '#475569', border: 'none',
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Chiudi</button>
          </div>
        </div>

        {skippedDialog.length > 0 && (
          <SkippedDialog skipped={skippedDialog} onClose={() => setSkippedDialog([])} />
        )}
      </div>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

type OrderCardProps = {
  order: CustomerFullHistoryOrder;
  listinoPrices: Map<string, { price: number; vat: number } | null>;
  articleBadges: Map<string, number>;
  flashingArticles: Set<string>;
  codeSubstitutions: Map<string, string>;
  isCopying: boolean;
  isCopied: boolean;
  onAddArticle: (article: CustomerFullHistoryOrder['articles'][number]) => void;
  onCopyOrder: () => void;
};

function OrderCard({ order, listinoPrices, articleBadges, flashingArticles, codeSubstitutions, isCopying, isCopied, onAddArticle, onCopyOrder }: OrderCardProps) {
  const isFresis = order.source === 'fresis';
  const accent = isFresis ? '#8b5cf6' : '#3b82f6';
  const totalAmount = order.articles.reduce((s, a) => s + a.lineTotalWithVat, 0);

  return (
    <div style={{ position: 'relative', border: '1px solid #e2e8f0', borderLeft: `4px solid ${accent}`, borderRadius: 8, width: '100%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      {(isCopying || isCopied) && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(5,150,105,0.15)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}>
          <div style={{ animation: 'checkPop 0.4s ease', fontSize: 48, color: '#059669' }}>✓</div>
        </div>
      )}
      <div style={{
        background: '#f8fafc', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
            {order.orderNumber}
            {' '}
            <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>{new Date(order.orderDate).toLocaleDateString('it-IT')}</span>
          </span>
          {(order.customerProfileId || order.customerCity || order.customerRagioneSociale) && (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Cliente: {[order.customerProfileId, order.customerRagioneSociale, order.customerCity].filter(Boolean).join(' · ')}
            </div>
          )}
          {isFresis && order.subClientCodice && (
            <div style={{ fontSize: 11, color: '#a78bfa' }}>
              Sottocliente: {[order.subClientCodice, order.subClientRagioneSociale, order.subClientCity].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {order.orderDiscountPercent > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
            background: '#fef9c3', color: '#854d0e',
          }}>Sconto {order.orderDiscountPercent}%</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: '#059669' }}>€ {formatEur(totalAmount)}</span>
        <button onClick={onCopyOrder} disabled={isCopying} style={{
          background: isCopying ? '#475569' : '#1e293b', color: 'white', border: 'none',
          padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600,
          cursor: isCopying ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}>{isCopying ? '⏳ Copiando...' : '⊕ Copia tutto l\'ordine'}</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '11%' }} /><col style={{ width: '22%' }} />
          <col style={{ width: '5%' }} />
          {/* storico */}
          <col style={{ width: '8%' }} />
          {/* listino unit NEW */}
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '5%' }} />
          {/* tot storico */}
          <col style={{ width: '9%' }} />
          {/* tot listino NEW */}
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Codice</th>
            <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Descrizione</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>Qtà</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #e2e8f0' }}>P.unit. storico</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', background: '#f5f3ff', borderBottom: '1px solid #e2e8f0' }}>Listino unit.</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #e2e8f0' }}>Sconto</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>IVA</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid #e2e8f0' }}>Tot.+IVA storico</th>
            <th style={{ padding: '7px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', background: '#f5f3ff', borderBottom: '1px solid #e2e8f0' }}>Tot. listino+IVA</th>
            <th style={{ padding: '7px 8px', borderBottom: '1px solid #e2e8f0' }}></th>
          </tr>
        </thead>
        <tbody>
          {order.articles.map((article, idx) => (
            <ArticleRow
              key={idx}
              article={article}
              listinoInfo={listinoPrices.get(article.articleCode) ?? null}
              badgeCount={articleBadges.get(article.articleCode) ?? 0}
              isFlashing={flashingArticles.has(article.articleCode)}
              substituteCode={isFresis ? codeSubstitutions.get(article.articleCode) : undefined}
              isUnmatched={isFresis && listinoPrices.get(article.articleCode) === null && !codeSubstitutions.has(article.articleCode)}
              onAdd={() => onAddArticle(article)}
            />
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

function ArticleRow({ article, listinoInfo, badgeCount, isFlashing, substituteCode, isUnmatched, onAdd }: {
  article: CustomerFullHistoryOrder['articles'][number];
  listinoInfo: { price: number; vat: number } | null;
  badgeCount: number;
  isFlashing: boolean;
  substituteCode?: string;
  isUnmatched?: boolean;
  onAdd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const listinoUnit = listinoInfo ? listinoInfo.price : null;
  const listinoTot = listinoInfo !== null && listinoUnit !== null
    ? Math.round(article.quantity * listinoUnit * (1 + article.vatPercent / 100) * 100) / 100
    : null;
  const delta = listinoUnit !== null && article.unitPrice > 0
    ? Math.round((listinoUnit / article.unitPrice - 1) * 10000) / 100
    : null;

  const rowBg = isFlashing ? undefined : (hovered ? '#eff6ff' : 'white');

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid #f1f5f9',
        background: rowBg,
        animation: isFlashing ? 'artFlash 1.2s ease' : undefined,
      }}
    >
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6366f1', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleCode}
        </span>
        {substituteCode && (
          <span style={{ display: 'block', fontSize: 9, color: '#d97706', fontWeight: 600 }}>→ {substituteCode}</span>
        )}
        {isUnmatched && (
          <span style={{ display: 'block', fontSize: 9, color: '#dc2626' }}>non nel catalogo</span>
        )}
      </td>
      <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
        <span style={{ fontSize: 12, color: '#1e293b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.articleDescription}
        </span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{article.quantity}</td>

      {/* P.unit. storico */}
      <td style={{ padding: '8px 8px', textAlign: 'right', color: '#64748b', borderLeft: '2px solid #f1f5f9' }}>{formatEur(article.unitPrice)}</td>

      {/* Listino unit. (NEW) */}
      <td style={{ padding: '8px 8px', textAlign: 'right', background: '#fafaff' }}>
        {listinoUnit !== null ? (
          <>
            <span style={{ fontWeight: 700, color: '#6366f1' }}>{formatEur(listinoUnit)}</span>
            {article.unitPrice > listinoUnit && (
              <span
                title="Prezzo storico superiore al listino attuale — l'articolo verrà aggiunto a prezzo listino con sconto 0%"
                style={{ display: 'block', fontSize: 8, color: '#f97316', cursor: 'help' }}
              >⚠</span>
            )}
            {delta !== null && Math.abs(delta) > 0.001 && (
              <span style={{ display: 'block', fontSize: 8, fontWeight: 600, color: delta > 0 ? '#dc2626' : '#059669' }}>
                {delta > 0 ? `▲ +${delta}%` : `▼ −${Math.abs(delta)}%`}
              </span>
            )}
            {delta !== null && Math.abs(delta) <= 0.001 && (
              <span style={{ display: 'block', fontSize: 8, color: '#94a3b8' }}>= invariato</span>
            )}
          </>
        ) : <span style={{ color: '#94a3b8' }}>—</span>}
      </td>

      <td style={{ padding: '8px 8px', textAlign: 'right', borderLeft: '2px solid #f1f5f9' }}>
        <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{article.discountPercent}%</span>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
        <span style={{ background: '#f0fdf4', color: '#166534', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{article.vatPercent}%</span>
      </td>

      {/* Tot.+IVA storico */}
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, borderLeft: '2px solid #f1f5f9' }}>{formatEur(article.lineTotalWithVat)}</td>

      {/* Tot. listino+IVA (NEW) */}
      <td style={{ padding: '8px 8px', textAlign: 'right', background: '#fafaff', fontWeight: 700, color: '#6366f1' }}>
        {listinoTot !== null ? formatEur(listinoTot) : <span style={{ color: '#94a3b8' }}>—</span>}
      </td>

      <td style={{ padding: '8px 8px', position: 'relative' }}>
        <button onClick={onAdd} disabled={isUnmatched} style={{
          background: isUnmatched ? '#94a3b8' : isFlashing ? '#16a34a' : '#6366f1',
          color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 10,
          fontWeight: 600, cursor: isUnmatched ? 'not-allowed' : 'pointer',
          width: '100%', whiteSpace: 'nowrap', transition: 'background 0.15s',
        }}>
          {isUnmatched ? '⚠ Non trovato' : isFlashing ? 'Aggiunto ✓' : '+ Aggiungi'}
        </button>
        {badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#4ade80', color: '#14532d',
            borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700,
            animation: badgeCount === 1 ? 'badgePop 0.3s ease' : 'badgeBump 0.2s ease',
            pointerEvents: 'none', lineHeight: '14px',
          }}>
            ✓ ×{badgeCount}
          </span>
        )}
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
