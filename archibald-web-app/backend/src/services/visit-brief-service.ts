import type { DbPool } from '../db/pool';
import type { CustomerSourceType } from '../db/repositories/visit-planning-types';
import { normalizeId, calcProbabilitaRiordino } from './visit-scoring-service';

type OrderItem = { articleCode?: string; description?: string; quantity?: number; code?: string; qty?: number };

export type VisitBriefOrder = {
  docRef:           string;
  date:             string;
  amountImponibile: number;
  source:           'archibald' | 'fresis';
  items:            Array<{ code: string; description: string; qty: number }>;
};

export type VisitBriefResult = {
  lastOrders:          VisitBriefOrder[];
  reorderCycleDays:    number | null;
  daysSinceLastOrder:  number | null;
  reorderProbability:  'high' | 'medium' | 'low' | 'unknown';
  suggestedCategories: string[];
  activePromotions:    Array<{ id: string; name: string; tagline: string | null; validTo: string }>;
  openReminders:       Array<{ id: number; note: string | null; dueAt: string }>;
};

function daysSince(dateStr: string | Date): number {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function probLabel(p: number): 'high' | 'medium' | 'low' {
  if (p >= 0.7) return 'high';
  if (p >= 0.4) return 'medium';
  return 'low';
}

export async function buildVisitBrief(
  pool: DbPool,
  userId: string,
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<VisitBriefResult> {
  // 1. Ordini Fresis per questo cliente
  const fresisWhere = sourceType === 'archibald'
    ? `fh.customer_id = $2`     // customer_id è erp_id in fresis_history
    : `fh.sub_client_codice = $2`;

  const { rows: fresisRows } = await pool.query(
    `SELECT fh.sub_client_codice, fh.sub_client_name, fh.archibald_order_id,
            fh.target_total_with_vat, fh.created_at, fh.items
     FROM agents.fresis_history fh
     WHERE fh.user_id = $1 AND ${fresisWhere}
       AND fh.target_total_with_vat > 0
     ORDER BY fh.created_at DESC LIMIT 20`,
    [userId, sourceId],
  );

  // 2. Ordini Archibald diretti (solo per clienti archibald)
  const coveredIds = new Set(
    fresisRows
      .filter(r => r.archibald_order_id)
      .map(r => normalizeId(r.archibald_order_id)),
  );

  const { rows: archRows } = await pool.query(
    sourceType === 'archibald'
      ? `SELECT o.id, o.order_number, o.creation_date, o.total_amount
         FROM agents.order_records o
         JOIN agents.customers c ON c.account_num = o.customer_account_num AND c.user_id = o.user_id
         WHERE o.user_id = $1 AND c.erp_id = $2
           AND o.customer_account_num NOT IN ('1002328','049421')
         ORDER BY o.creation_date DESC LIMIT 10`
      : `SELECT NULL AS id, NULL AS order_number, NULL AS creation_date, NULL AS total_amount WHERE FALSE`,
    [userId, sourceId],
  );

  // 3. Lista ordini deduplicata
  const orders: VisitBriefOrder[] = [];

  for (const r of fresisRows) {
    orders.push({
      docRef: r.sub_client_name ? `FT ${r.sub_client_codice}` : 'FT',
      date: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
      amountImponibile: parseFloat(r.target_total_with_vat) / 1.22,
      source: 'fresis',
      items: Array.isArray(r.items)
        ? r.items.slice(0, 3).map((it: OrderItem) => ({
            code: it.articleCode ?? it.code ?? '',
            description: it.description ?? '',
            qty: it.quantity ?? it.qty ?? 1,
          }))
        : [],
    });
  }

  for (const r of archRows) {
    if (!r.id || coveredIds.has(normalizeId(r.id))) continue;
    if (!r.total_amount || !/^-?\d/.test(r.total_amount)) continue;
    const val = parseFloat(r.total_amount);
    if (!Number.isFinite(val) || val <= 0) continue;
    orders.push({
      docRef: r.order_number ?? r.id,
      date: typeof r.creation_date === 'string' ? r.creation_date : new Date(r.creation_date).toISOString(),
      amountImponibile: val,
      source: 'archibald',
      items: [],
    });
  }

  orders.sort((a, b) => b.date.localeCompare(a.date));

  // 4. Metriche riordino
  const daysSinceLastOrder = orders.length > 0 ? daysSince(orders[0].date) : null;

  let reorderCycleDays: number | null = null;
  if (orders.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(orders.length - 1, 6); i++) {
      gaps.push(Math.abs(daysSince(orders[i + 1].date) - daysSince(orders[i].date)));
    }
    reorderCycleDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const reorderProbabilityScore = orders.length === 0
    ? 0
    : calcProbabilitaRiordino({ daysSinceLastOrder, avgCycleDays: reorderCycleDays });
  const reorderProbability = orders.length === 0
    ? 'unknown'
    : probLabel(reorderProbabilityScore);

  // 5. Promozioni attive
  const today = new Date().toISOString().slice(0, 10);
  const { rows: promoRows } = await pool.query(
    `SELECT id, name, tagline, valid_to FROM system.promotions
     WHERE is_active = TRUE AND valid_from <= $1 AND valid_to >= $1
     ORDER BY valid_to LIMIT 3`,
    [today],
  );
  const activePromotions = promoRows.map(r => ({
    id: r.id, name: r.name, tagline: r.tagline,
    validTo: typeof r.valid_to === 'string' ? r.valid_to : (r.valid_to as Date).toISOString().slice(0, 10),
  }));

  // 6. Reminder aperti (solo per clienti Archibald)
  const { rows: reminderRows } = sourceType === 'archibald'
    ? await pool.query(
        `SELECT id, note, due_at FROM agents.customer_reminders
         WHERE user_id = $1 AND customer_erp_id = $2
           AND status = 'active' ORDER BY due_at LIMIT 5`,
        [userId, sourceId],
      )
    : { rows: [] };
  const openReminders = reminderRows.map(r => ({
    id: r.id, note: r.note,
    dueAt: r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at,
  }));

  return {
    lastOrders: orders.slice(0, 10),
    reorderCycleDays,
    daysSinceLastOrder,
    reorderProbability,
    suggestedCategories: [], // v1: vuoto — implementato in Fase 2
    activePromotions,
    openReminders,
  };
}
