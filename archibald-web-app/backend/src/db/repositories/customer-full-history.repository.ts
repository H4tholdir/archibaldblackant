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
  archibald_order_number: string | null;
  created_at: string;
  items: unknown;
};

type HistoryParams = {
  customerProfileId?: string;
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

    const articles: FullHistoryArticle[] = rawItems.map((item) => {
      const disc = item.discount ?? 0;
      const lineTotalWithVat =
        Math.round(item.quantity * item.price * (1 - disc / 100) * (1 + item.vat / 100) * 100) / 100;
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

    const totalAmount = Math.round(articles.reduce((s, a) => s + a.lineTotalWithVat, 0) * 100) / 100;

    return {
      source: 'fresis' as const,
      orderId: row.id,
      orderNumber: row.archibald_order_number ?? row.id,
      orderDate: row.created_at,
      totalAmount,
      articles,
    };
  });
}

async function getCustomerFullHistory(
  pool: DbPool,
  userId: string,
  params: HistoryParams,
): Promise<FullHistoryOrder[]> {
  const { customerProfileId, subClientCodice } = params;
  if (!customerProfileId && !subClientCodice) return [];

  const [ordersResult, fresisResult] = await Promise.all([
    pool.query<OrderArticleRow>(
      `SELECT
         o.id AS order_id,
         o.order_number,
         o.order_date,
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
         AND $2 IS NOT NULL
         AND o.customer_profile_id = $2
         AND o.articles_synced_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM agents.order_records nc
           WHERE nc.user_id = o.user_id
             AND nc.customer_profile_id = o.customer_profile_id
             AND nc.gross_amount = -o.gross_amount
         )
       ORDER BY o.order_date DESC, a.article_code ASC`,
      [userId, customerProfileId ?? null],
    ),

    pool.query<FresisHistoryRow>(
      `SELECT id, archibald_order_number, created_at, items
       FROM agents.fresis_history
       WHERE user_id = $1
         AND $2 IS NOT NULL
         AND REGEXP_REPLACE(sub_client_codice, '^[Cc]0*', '') =
             REGEXP_REPLACE($2, '^[Cc]0*', '')
       ORDER BY created_at DESC`,
      [userId, subClientCodice ?? null],
    ),
  ]);

  const orderOrders = mapOrderArticleRows(ordersResult.rows);
  const fresisOrders = mapFresisRows(fresisResult.rows);

  return [...orderOrders, ...fresisOrders].sort(
    (a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
  );
}

export { getCustomerFullHistory };
