import type { DbPool } from '../db/pool';
import type * as agentCircuitStateRepo from '../db/repositories/agent-circuit-state';
import { createCircuitBreaker } from '../sync/circuit-breaker';

type CircuitStateRepo = typeof agentCircuitStateRepo;
export type ProbeFn = (userId: string) => Promise<boolean>;

type SyncCb = {
  recordFailure: (userId: string, syncType: string, error: string) => Promise<void>;
  isPaused: (userId: string, syncType: string) => Promise<boolean>;
};

const BOT_WRITE_SYNC_TYPE = 'erp_bot_write';

export class CircuitBreaker {
  private readonly syncCb: SyncCb | null;

  constructor(
    private readonly repository: CircuitStateRepo,
    private readonly probeFn: ProbeFn,
    private readonly pool: DbPool | null = null,
    syncCb?: SyncCb,
  ) {
    this.syncCb = syncCb ?? (pool ? createCircuitBreaker(pool) : null);
  }

  async onBotWriteFailure(userId: string, errorMessage: string): Promise<void> {
    if (!this.syncCb) return;
    await this.syncCb.recordFailure(userId, BOT_WRITE_SYNC_TYPE, errorMessage);
  }

  async isBotWritePaused(userId: string): Promise<boolean> {
    if (!this.syncCb) return false;
    return this.syncCb.isPaused(userId, BOT_WRITE_SYNC_TYPE);
  }

  async onErpFailure(userId: string, errorMessage: string): Promise<void> {
    const result = await this.repository.recordErpFailure(this.pool as DbPool, userId, errorMessage);
    if (result.shouldOpen) {
      await this.repository.openCircuit(this.pool as DbPool, userId);
    }
  }

  async onErpSuccess(userId: string): Promise<void> {
    await this.repository.recordErpSuccess(this.pool as DbPool, userId);
  }

  async isOpen(userId: string): Promise<boolean> {
    const state = await this.repository.getState(this.pool as DbPool, userId);
    return state?.state === 'open';
  }

  async probeAll(): Promise<string[]> {
    const userIds = await this.repository.findCircuitsToProbe(this.pool as DbPool);
    const recovered: string[] = [];
    for (const userId of userIds) {
      const reachable = await this.probeFn(userId).catch(() => false);
      if (reachable) {
        await this.repository.setHalfOpen(this.pool as DbPool, userId);
        recovered.push(userId);
      } else {
        await this.repository.rescheduleProbe(this.pool as DbPool, userId);
      }
    }
    return recovered;
  }
}

export type DefaultProbeOptions = { erpUrl: string; timeoutMs: number };

export function createDefaultProbe(options: DefaultProbeOptions): ProbeFn {
  return async (_userId: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeoutMs);
    try {
      const res = await fetch(options.erpUrl, { method: 'HEAD', signal: ctrl.signal });
      return res.status >= 200 && res.status < 400;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}
