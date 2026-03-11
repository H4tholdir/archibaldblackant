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
  article_code: string;
  article_description: string | null;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  vat_percent: number | null;
  line_total_with_vat: number | null;
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
};

type HistoryParams = {
  customerProfileId?: string;
  customerName?: string;
  subClientCodice?: string;
};

function mapOrderArticleRows(rows: OrderArticleRow[]): FullHistoryOrder[] {
  const ordersMap = new Map<string, FullHistoryOrder>();

  for (const row of rows) {
    if (!ordersMap.has(row.order_id)) {
      ordersMap.set(row.order_id, {
        source: 'orders',
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderDate: row.order_date,
        totalAmount: 0,
        orderDiscountPercent: 0,
        articles: [],
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
      vatPercent: row.vat_percent ?? 22,
      lineTotalWithVat,
    };
    order.articles.push(article);
    order.totalAmount = Math.round((order.totalAmount + lineTotalWithVat) * 100) / 100;
  }

  return Array.from(ordersMap.values());
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
      return {
        articleCode: item.articleCode,
        articleDescription: item.description ?? item.productName ?? '',
        quantity: item.quantity,
        unitPrice: item.price,
        discountPercent: disc,
        vatPercent: item.vat,
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
      articles,
    };
  });
}

async function getCustomerFullHistory(
  pool: DbPool,
  userId: string,
  params: HistoryParams,
): Promise<FullHistoryOrder[]> {
  const { customerProfileId, customerName, subClientCodice } = params;
  if (!customerProfileId && !customerName && !subClientCodice) return [];

  const hasCustomerSearch = !!(customerProfileId || customerName);

  const [ordersResult, fresisResult] = await Promise.all([
    hasCustomerSearch
      ? pool.query<OrderArticleRow>(
          `SELECT
             o.id AS order_id,
             o.order_number,
             o.creation_date AS order_date,
             a.article_code,
             a.article_description,
             a.quantity,
             a.unit_price,
             a.discount_percent,
             a.vat_percent,
             a.line_total_with_vat
           FROM agents.order_records o
           JOIN agents.order_articles a ON a.order_id = o.id AND a.user_id = o.user_id
           WHERE o.user_id = $1
             AND (
               o.customer_profile_id = (
                 SELECT c.internal_id FROM agents.customers c
                 WHERE c.user_id = $1 AND c.customer_profile = $2 AND c.internal_id IS NOT NULL
                 LIMIT 1
               )
               OR LOWER(o.customer_name) = LOWER($3)
             )
             AND o.articles_synced_at IS NOT NULL
             AND o.gross_amount NOT LIKE '-%'
             AND NOT EXISTS (
               SELECT 1 FROM agents.order_records cn
               WHERE cn.user_id = o.user_id
                 AND cn.customer_name = o.customer_name
                 AND cn.gross_amount LIKE '-%'
                 AND ABS(
                   CASE WHEN cn.gross_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(cn.gross_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                   + CASE WHEN o.gross_amount ~ '^-?[0-9.,]+ ?€?$'
                     THEN CAST(REPLACE(REPLACE(REPLACE(o.gross_amount, '.', ''), ',', '.'), ' €', '') AS NUMERIC)
                     ELSE 0 END
                 ) < 1.0
                 AND cn.creation_date >= o.creation_date
             )
           ORDER BY o.creation_date DESC, a.article_code ASC`,
          [userId, customerProfileId ?? '', customerName ?? ''],
        )
      : Promise.resolve({ rows: [] as OrderArticleRow[] }),

    (subClientCodice || customerProfileId)
      ? pool.query<FresisHistoryRow>(
          `SELECT id, archibald_order_id, archibald_order_number, invoice_number,
              discount_percent, target_total_with_vat, created_at, items
           FROM agents.fresis_history
           WHERE user_id = $1
             AND (
               ($2 != '' AND REGEXP_REPLACE(sub_client_codice, '^[Cc]0*', '') =
                   REGEXP_REPLACE($2, '^[Cc]0*', ''))
               OR ($2 = '' AND $3 != '' AND sub_client_codice = (
                 SELECT codice FROM shared.sub_clients
                 WHERE matched_customer_profile_id = $3
                 LIMIT 1
               ))
             )
           ORDER BY created_at DESC`,
          [userId, subClientCodice ?? '', customerProfileId ?? ''],
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
