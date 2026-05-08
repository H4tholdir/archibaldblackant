import { describe, expect, test } from 'vitest';
import { OPERATION_TYPES } from './operation-types';
import type { OperationType } from './operation-types';
import {
  getQueueForOperation,
  isConductorOperation,
  CONDUCTOR_OPERATIONS,
  QUEUE_ROUTING,
  QUEUE_NAMES,
} from './queue-router';
// Tutte le 23 op attive (ERP/sync senza browser/recognition) sono ora sul Conductor.
const EXPECTED_CONDUCTOR_OPS: ReadonlySet<OperationType> = new Set([
  // 6 originali (ordini)
  'submit-order',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
  // 7 estese (clienti, validazioni, download, sync articoli)
  'create-customer',
  'update-customer',
  'read-vat-status',
  'refresh-customer',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  // Task 13: sync indirizzi
  'sync-customer-addresses',
  // Task 14: sync ordini e clienti
  'sync-orders',
  'sync-customers',
  // Task 15: sync DDT e fatture
  'sync-ddt',
  'sync-invoices',
  // Task 16: sync prodotti e prezzi condivisi
  'sync-products',
  'sync-prices',
  // Task 17: sync senza browser (DB/API-only)
  'sync-order-states',
  'sync-tracking',
  // Future: image recognition feedback (stub)
  'recognition-feedback',
]);

describe('getQueueForOperation', () => {
  test('QUEUE_ROUTING is empty — all operations are now Conductor or removed', () => {
    expect(Object.keys(QUEUE_ROUTING)).toHaveLength(0);
  });

  test.each([...EXPECTED_CONDUCTOR_OPS])(
    '%s ritorna undefined (deve passare via Conductor)',
    (conductorOp) => {
      expect(getQueueForOperation(conductorOp)).toBeUndefined();
    },
  );

  test('QUEUE_ROUTING copre tutti gli OperationType non-Conductor', () => {
    const nonConductorTypes = OPERATION_TYPES.filter(t => !EXPECTED_CONDUCTOR_OPS.has(t)).sort();
    const routedTypes = Object.keys(QUEUE_ROUTING).sort();
    expect(routedTypes).toEqual(nonConductorTypes);
  });

  test('isConductorOperation identifica le 23 task attive ERP', () => {
    for (const op of EXPECTED_CONDUCTOR_OPS) {
      expect(isConductorOperation(op)).toBe(true);
    }
    for (const op of OPERATION_TYPES.filter(t => !EXPECTED_CONDUCTOR_OPS.has(t))) {
      expect(isConductorOperation(op)).toBe(false);
    }
  });

  test('CONDUCTOR_OPERATIONS contiene esattamente le 23 task type', () => {
    expect(new Set(CONDUCTOR_OPERATIONS)).toEqual(EXPECTED_CONDUCTOR_OPS);
  });

  test('every routed queue name is a known QueueName', () => {
    const routedQueues = new Set(Object.values(QUEUE_ROUTING));
    for (const q of routedQueues) {
      expect(QUEUE_NAMES).toContain(q);
    }
  });

  test('writes queue contains 0 operations (tutte spostate al Conductor)', () => {
    const writesOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'writes');
    expect(writesOps).toHaveLength(0);
  });

  test('agent-sync queue contains 0 operations (sync agenti migrate al Conductor)', () => {
    const agentSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'agent-sync');
    expect(agentSyncOps).toHaveLength(0);
  });

  test('enrichment queue contains 0 operations (catalog/AI ops rimossi in Task 2)', () => {
    const enrichmentOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'enrichment');
    expect(enrichmentOps).toHaveLength(0);
  });

  test('shared-sync queue contains 0 operations (sync prodotti/prezzi migrate al Conductor)', () => {
    const sharedSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'shared-sync');
    expect(sharedSyncOps).toHaveLength(0);
  });
});
