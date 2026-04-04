import type { DbPool } from '../pool';
import type { FullHistoryArticle, FullHistoryOrder } from '../../types/full-history';

type PendingOrderItemRaw = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  vat: number;
  discount?: number;
};

type OrderArticleRow = {
  order_id: string;
  order_number: string;
  order_date: string;
  customer_profile_id: string | null;
  customer_city: string | null;
  customer_rag_sociale: string | null;
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  vat_percent: number | null;
  line_total_with_vat: number | null;
  line_amount: number | null;
  raw_order_total: string | null;
};

type FresisHistoryRow = {
  id: string;
  archibald_order_id: string | null;
  archibald_order_number: string | null;
  invoice_number: string | null;
  discount_percent: number | null;
  target_total_with_vat: number | null;
  created_at: string;
  items: unknown;
  sub_client_codice: string | null;
  sub_client_city: string | null;
  sub_client_rag_sociale: string | null;
};

type HistoryParams = {
  customerErpIds?: string[];
  customerName?: string;
  subClientCodices?: string[];
};

function parseItalianAmount(raw: string | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

type OrderAccumulator = FullHistoryOrder & { rawOrderTotal: string | null };

function mapOrderArticleRows(rows: OrderArticleRow[]): FullHistoryOrder[] {
  const ordersMap = new Map<string, OrderAccumulator>();

  for (const row of rows) {
    if (!ordersMap.has(row.order_id)) {
      ordersMap.set(row.order_id, {
        source: 'orders',
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderDate: row.order_date,
        totalAmount: 0,
        orderDiscountPercent: 0,
        customerErpId: row.customer_profile_id ?? undefined,
        customerCity: row.customer_city ?? undefined,
        customerRagioneSociale: row.customer_rag_sociale ?? undefined,
        articles: [],
        rawOrderTotal: row.raw_order_total,
      });
    }
    const order = ordersMap.get(row.order_id)!;
    const lineTotalWithVat = row.line_total_with_vat ?? 0;
    const article: FullHistoryArticle = {
      articleCode: row.article_code,
      articleDescription: row.article_description ?? '',
      quantity: row.quantity,
      unitPrice: row.unit_price ?? 0,
      discountPercent: row.discount_percent ?? 0,
      vatPercent: row.vat_percent || 22,
      lineAmount: row.line_amount ?? 0,
      lineTotalWithVat,
    };
    order.articles.push(article);
    order.totalAmount = Math.round((order.totalAmount + lineTotalWithVat) * 100) / 100;
  }

  return Array.from(ordersMap.values()).map((order) => {
    if (order.totalAmount === 0) {
      const fallback = parseItalianAmount(order.rawOrderTotal);
      if (fallback > 0) order.totalAmount = fallback;
    }
    const { rawOrderTotal: _rawOrderTotal, ...rest } = order;
    return rest;
  });
}

function mapFresisRows(rows: FresisHistoryRow[]): FullHistoryOrder[] {
  return rows.map((row) => {
    const rawItems = Array.isArray(row.items)
      ? (row.items as PendingOrderItemRaw[])
      : (JSON.parse(row.items as string) as PendingOrderItemRaw[]);

    // First pass: calculate raw totals to determine global discount
    const rawTotal = rawItems.reduce((s, item) => {
      const disc = item.discount ?? 0;
      return s + Math.round(item.quantity * item.price * (1 - disc / 100) * (1 + item.vat / 100) * 100) / 100;
    }, 0);
    const targetTotal = row.target_total_with_vat;
    let orderDiscountPercent = row.discount_percent ?? 0;
    if (!orderDiscountPercent && targetTotal && rawTotal > 0 && targetTotal < rawTotal) {
      orderDiscountPercent = Math.round((1 - targetTotal / rawTotal) * 10000) / 100;
    }
    const globalFactor = orderDiscountPercent > 0 ? 1 - orderDiscountPercent / 100 : 1;

    // Second pass: build articles with global discount applied to lineTotalWithVat
    const articles: FullHistoryArticle[] = rawItems.map((item) => {
      const disc = item.discount ?? 0;
      const lineRaw = item.quantity * item.price * (1 - disc / 100) * (1 + item.vat / 100);
      const lineTotalWithVat = Math.round(lineRaw * globalFactor * 100) / 100;
      const lineAmount = Math.round(item.quantity * item.price * (1 - disc / 100) * globalFactor * 100) / 100;
      return {
        articleCode: item.articleCode,
        articleDescription: item.description ?? item.productName ?? '',
        quantity: item.quantity,
        unitPrice: item.price,
        discountPercent: disc,
        vatPercent: item.vat,
        lineAmount,
        lineTotalWithVat,
      };
    });

    const totalAmount = targetTotal ?? Math.round(articles.reduce((s, a) => s + a.lineTotalWithVat, 0) * 100) / 100;

    const orderNumber = row.archibald_order_number
      || row.invoice_number
      || (row.archibald_order_id ? `Ord. ${row.archibald_order_id}` : row.id);

    return {
      source: 'fresis' as const,
      orderId: row.id,
      orderNumber,
      orderDate: row.created_at,
      totalAmount,
      orderDiscountPercent,
      subClientCodice: row.sub_client_codice ?? undefined,
      subClientCity: row.sub_client_city ?? undefined,
      subClientRagioneSociale: row.sub_client_rag_sociale ?? undefined,
      articles,
    };
  });
}

async function getCustomerFullHistory(
  pool: DbPool,
  userId: string,
  params: HistoryParams,
): Promise<FullHistoryOrder[]> {
  const {
    customerErpIds = [],
    customerName,
    subClientCodices = [],
  } = params;

  const hasCustomerIds = customerErpIds.length > 0;
  const hasCustomerName = !!(customerName?.trim());
  const hasSubClients = subClientCodices.length > 0;

  if (!hasCustomerIds && !hasCustomerName && !hasSubClients) return [];

  const hasCustomerSearch = hasCustomerIds || hasCustomerName;

  const [ordersResult, fresisResult] = await Promise.all([
    hasCustomerSearch
      ? pool.query<OrderArticleRow>(
          `SELECT
             o.id AS order_id,
             o.order_number,
             o.creation_date AS order_date,
             c2.erp_id AS customer_profile_id,
             c2.city AS customer_city,
             c2.name AS customer_rag_sociale,
             a.article_code,
             a.article_description,
             a.quantity,
             a.unit_price,
             a.discount_percent,
             a.vat_percent,
             a.line_total_with_vat,
             a.line_amount,
             o.total_amount AS raw_order_total
           FROM agents.order_records o
           JOIN agents.order_articles a ON a.order_id = o.id AND a.user_id = o.user_id
           LEFT JOIN agents.customers c2 ON c2.user_id = o.user_id AND c2.account_num = o.customer_account_num
           WHERE o.user_id = $1
             AND (
               ($2::text[] != '{}' AND o.customer_account_num IN (
                 SELECT c.account_num FROM agents.customers c
                 WHERE c.user_id = $1 AND c.erp_id = ANY($2::text[]) AND c.account_num IS NOT NULL
               ))
               OR ($3 != '' AND LOWER(o.customer_name) = LOWER($3))
             )
             AND o.articles_synced_at IS NOT NULL
             AND o.total_amount NOT LIKE '-%'
             AND NOT EXISTS (
               SELECT 1 FROM agents.order_records cn
               WHERE cn.user_id = o.user_id
                 AND cn.customer_name = o.customer_name
                 AND cn.total_amount LIKE '-%'
                 AND ABS(
                   CASE WHEN cn.total_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(cn.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                   + CASE WHEN o.total_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(o.total_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                 ) < 1.0
                 AND cn.creation_date >= o.creation_date
             )
           ORDER BY o.creation_date DESC, a.article_code ASC`,
          [userId, customerErpIds, customerName ?? ''],
        )
      : Promise.resolve({ rows: [] as OrderArticleRow[] }),

    hasSubClients
      ? pool.query<FresisHistoryRow>(
          `SELECT fh.id, fh.archibald_order_id, fh.archibald_order_number, fh.invoice_number,
              fh.discount_percent, fh.target_total_with_vat, fh.created_at, fh.items, fh.sub_client_codice,
              sc.localita AS sub_client_city,
              sc.ragione_sociale AS sub_client_rag_sociale
           FROM agents.fresis_history fh
           LEFT JOIN shared.sub_clients sc ON sc.codice = fh.sub_client_codice
           WHERE fh.user_id = $1
             AND fh.sub_client_codice = ANY($2::text[])
             AND (fh.archibald_order_number IS NULL OR fh.archibald_order_number NOT LIKE 'KT %')
           ORDER BY fh.created_at DESC`,
          [userId, subClientCodices],
        )
      : Promise.resolve({ rows: [] as FresisHistoryRow[] }),
  ]);

  const orderOrders = mapOrderArticleRows(ordersResult.rows);
  const fresisOrders = mapFresisRows(fresisResult.rows);

  return [...orderOrders, ...fresisOrders].sort(
    (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
  );
}

export { getCustomerFullHistory };
