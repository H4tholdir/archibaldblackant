import type { DbPool } from '../db/pool';
import type { WebSocketMessage } from './websocket-server';
import type { ScalarField } from '../db/repositories/order-drafts.repo';
import { applyItemDelta, applyScalarUpdate } from '../db/repositories/order-drafts.repo';
import { logger } from '../logger';

type DraftMessageHandlerDeps = {
  pool: DbPool;
  broadcast: (userId: string, message: WebSocketMessage) => void;
};

function createDraftMessageHandler({ pool, broadcast }: DraftMessageHandlerDeps) {
  async function handleAsync(userId: string, message: WebSocketMessage): Promise<void> {
    if (message.type !== 'draft:delta') return;

    const raw = message.payload as Record<string, unknown>;
    if (typeof raw?.draftId !== 'string' || typeof raw?.op !== 'string') return;
    const { draftId, op, payload, seq } = raw as { draftId: string; op: string; payload: unknown; seq: number };

    if (op === 'item:add' || op === 'item:remove' || op === 'item:edit') {
      await applyItemDelta(pool, draftId, userId, op, payload);
    } else if (op === 'scalar:update') {
      const { field, value } = payload as { field: string; value: unknown };
      await applyScalarUpdate(pool, draftId, userId, field as ScalarField, value);
    } else {
      return;
    }

    broadcast(userId, {
      type: 'draft:delta:applied',
      payload: { op, payload, seq },
      timestamp: new Date().toISOString(),
    });
  }

  return function handleDraftMessage(userId: string, message: WebSocketMessage): void {
    handleAsync(userId, message).catch((error) => {
      logger.error('Error handling draft delta', { error, userId });
    });
  };
}

export { createDraftMessageHandler };
