import type { DbPool } from '../db/pool';
import { logger } from '../logger';

export type DryRunUpsert = {
  id: string;
  action: 'insert' | 'update';
  fields: Record<string, unknown>;
};

export type DryRunArtifact = {
  syncType: string;
  userId: string;
  runAt: Date;
  bullmqBaseline: {
    capturedAt: Date;
    rowCount: number;
    checksum: string;
  } | null;
  conductorExpected: {
    upserts: DryRunUpsert[];
    deletes: string[];
  };
  discrepancies: string[];
  success: boolean;
};

export class DryRunLogger {
  private upserts: DryRunUpsert[] = [];
  private deletes: string[] = [];

  recordUpsert(id: string, action: 'insert' | 'update', fields: Record<string, unknown>): void {
    this.upserts.push({ id, action, fields });
  }

  recordDelete(id: string): void {
    this.deletes.push(id);
  }

  buildArtifact(
    syncType: string,
    userId: string,
    baseline: DryRunArtifact['bullmqBaseline'],
  ): DryRunArtifact {
    const discrepancies: string[] = [];

    if (this.deletes.length > 0) {
      discrepancies.push(
        `[DRY-RUN] Would delete ${this.deletes.length} rows: ${this.deletes.slice(0, 5).join(', ')}${this.deletes.length > 5 ? '...' : ''}`
      );
    }

    const artifact: DryRunArtifact = {
      syncType,
      userId,
      runAt: new Date(),
      bullmqBaseline: baseline,
      conductorExpected: { upserts: this.upserts, deletes: this.deletes },
      discrepancies,
      success: true,
    };

    logger.info('[DryRun] Artifact', {
      syncType, userId,
      upserts: this.upserts.length,
      deletes: this.deletes.length,
      discrepancies: discrepancies.length,
    });

    return artifact;
  }
}

export async function captureBaseline(
  pool: DbPool,
  tableName: string,
  userId: string,
): Promise<DryRunArtifact['bullmqBaseline']> {
  const { rows } = await pool.query<{ count: string; checksum: string }>(
    `SELECT COUNT(*)::text AS count,
            MD5(STRING_AGG(id::text, ',' ORDER BY id)) AS checksum
     FROM ${tableName}
     WHERE user_id = $1`,
    [userId]
  );
  return {
    capturedAt: new Date(),
    rowCount: parseInt(rows[0].count, 10),
    checksum: rows[0].checksum ?? '',
  };
}
