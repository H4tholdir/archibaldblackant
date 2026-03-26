import type { DbPool } from '../pool';

export type TrackingException = {
  id: number;
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string | null;
  exceptionDescription: string;
  exceptionType: 'exception' | 'held' | 'returning' | 'canceled';
  occurredAt: Date;
  resolvedAt: Date | null;
  resolution: 'delivered' | 'returned' | 'claimed' | null;
  claimStatus: 'open' | 'submitted' | 'resolved' | null;
  claimSubmittedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

export type LogExceptionParams = {
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string;
  exceptionDescription: string;
  exceptionType: TrackingException['exceptionType'];
  occurredAt: string;
};

export type ExceptionFilters = {
  status?: 'open' | 'closed' | 'all';
  from?: string;
  to?: string;
};

function toException(row: Record<string, unknown>): TrackingException {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    orderNumber: row.order_number as string,
    trackingNumber: row.tracking_number as string,
    exceptionCode: row.exception_code as string | null,
    exceptionDescription: row.exception_description as string,
    exceptionType: row.exception_type as TrackingException['exceptionType'],
    occurredAt: row.occurred_at as Date,
    resolvedAt: row.resolved_at as Date | null,
    resolution: row.resolution as TrackingException['resolution'],
    claimStatus: row.claim_status as TrackingException['claimStatus'],
    claimSubmittedAt: row.claim_submitted_at as Date | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as Date,
  };
}

export async function logTrackingException(pool: DbPool, params: LogExceptionParams): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO agents.tracking_exceptions
       (user_id, order_number, tracking_number, exception_code, exception_description,
        exception_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tracking_number, occurred_at) DO NOTHING`,
    [params.userId, params.orderNumber, params.trackingNumber,
     params.exceptionCode || null, params.exceptionDescription,
     params.exceptionType, params.occurredAt],
  );
  return (rowCount ?? 0) > 0;
}

export async function resolveOpenExceptions(
  pool: DbPool,
  orderNumber: string,
  resolution: 'delivered' | 'returned',
): Promise<void> {
  await pool.query(
    `UPDATE agents.tracking_exceptions
     SET resolved_at = NOW(), resolution = $2
     WHERE order_number = $1 AND resolved_at IS NULL`,
    [orderNumber, resolution],
  );
}

export async function getExceptionsByUser(
  pool: DbPool,
  userId: string | undefined,
  filters: ExceptionFilters,
): Promise<TrackingException[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (userId) { conditions.push(`user_id = $${idx++}`); values.push(userId); }
  if (filters.status === 'open') {
    conditions.push('resolved_at IS NULL');
  } else if (filters.status === 'closed') {
    conditions.push('resolved_at IS NOT NULL');
  }
  if (filters.from) { conditions.push(`occurred_at::date >= $${idx++}::date`); values.push(filters.from); }
  if (filters.to)   { conditions.push(`occurred_at::date <= $${idx++}::date`); values.push(filters.to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM agents.tracking_exceptions
     ${where}
     ORDER BY occurred_at DESC`,
    values,
  );
  return rows.map(toException);
}

export async function getExceptionStats(
  pool: DbPool,
  filters: { userId?: string; from?: string; to?: string },
): Promise<{
  total: number;
  exceptionActive: number;
  held: number;
  returning: number;
  byCode: Array<{ code: string | null; description: string; count: number }>;
  claimsSummary: { open: number; submitted: number; resolved: number };
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.userId) { conditions.push(`user_id = $${idx++}`); values.push(filters.userId); }
  if (filters.from)   { conditions.push(`occurred_at::date >= $${idx++}::date`); values.push(filters.from); }
  if (filters.to)     { conditions.push(`occurred_at::date <= $${idx++}::date`); values.push(filters.to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  type TotalsRow = { total: number; exception_active: number; held: number; returning: number };
  type ByCodeRow = { code: string | null; description: string; count: number };
  type ClaimsRow = { open: number; submitted: number; resolved: number };

  const [totals, byCode, claims] = await Promise.all([
    pool.query<TotalsRow>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE exception_type = 'exception' AND resolved_at IS NULL)::int AS exception_active,
         COUNT(*) FILTER (WHERE exception_type = 'held' AND resolved_at IS NULL)::int AS held,
         COUNT(*) FILTER (WHERE exception_type = 'returning' AND resolved_at IS NULL)::int AS returning
       FROM agents.tracking_exceptions ${where}`,
      values,
    ),
    pool.query<ByCodeRow>(
      `SELECT exception_code AS code, exception_description AS description, COUNT(*)::int AS count
       FROM agents.tracking_exceptions ${where}
       GROUP BY exception_code, exception_description
       ORDER BY count DESC`,
      values,
    ),
    pool.query<ClaimsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE claim_status = 'open')::int AS open,
         COUNT(*) FILTER (WHERE claim_status = 'submitted')::int AS submitted,
         COUNT(*) FILTER (WHERE claim_status = 'resolved')::int AS resolved
       FROM agents.tracking_exceptions ${where}`,
      values,
    ),
  ]);

  return {
    total: totals.rows[0].total,
    exceptionActive: totals.rows[0].exception_active,
    held: totals.rows[0].held,
    returning: totals.rows[0].returning,
    byCode: byCode.rows,
    claimsSummary: claims.rows[0],
  };
}

export async function updateClaimStatus(
  pool: DbPool,
  id: number,
  claimStatus: 'open' | 'submitted' | 'resolved',
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.tracking_exceptions
     SET claim_status = $1, claim_submitted_at = CASE WHEN $1 = 'submitted' THEN NOW() ELSE claim_submitted_at END
     WHERE id = $2 AND user_id = $3`,
    [claimStatus, id, userId],
  );
}

export async function getExceptionById(
  pool: DbPool,
  id: number,
): Promise<TrackingException | null> {
  const { rows } = await pool.query(
    'SELECT * FROM agents.tracking_exceptions WHERE id = $1',
    [id],
  );
  return rows.length > 0 ? toException(rows[0]) : null;
}
