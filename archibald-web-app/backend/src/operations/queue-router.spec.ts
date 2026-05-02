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
import type { QueueName } from './queue-router';

// Tutte le 13 op "attive" che richiedono il bot Puppeteer ERP sono ora sul Conductor.
// Restano in BullMQ solo le sync periodiche e catalog/AI image processing.
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
]);

describe('getQueueForOperation', () => {
  // Routing residuo: solo i task NON-Conductor (sync periodiche + catalog/AI)
  const expectedRouting: Partial<Record<OperationType, QueueName>> = {
    'sync-customers': 'agent-sync',
    'sync-orders': 'agent-sync',
    'sync-ddt': 'agent-sync',
    'sync-invoices': 'agent-sync',
    'sync-order-states': 'enrichment',
    'sync-tracking': 'enrichment',
    'sync-customer-addresses': 'enrichment',
    'sync-products': 'shared-sync',
    'sync-prices': 'shared-sync',
    'catalog-ingestion': 'enrichment',
    'catalog-product-enrichment': 'enrichment',
    'web-product-enrichment': 'enrichment',
    'recognition-feedback': 'enrichment',
    're-extract-pictograms': 'enrichment',
  };

  test.each(
    OPERATION_TYPES
      .filter(type => !EXPECTED_CONDUCTOR_OPS.has(type))
      .map(type => [type, expectedRouting[type]] as const),
  )('%s routes to %s (BullMQ)', (operationType, expectedQueue) => {
    expect(getQueueForOperation(operationType)).toBe(expectedQueue);
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

  test('isConductorOperation identifica le 13 task attive ERP', () => {
    for (const op of EXPECTED_CONDUCTOR_OPS) {
      expect(isConductorOperation(op)).toBe(true);
    }
    for (const op of OPERATION_TYPES.filter(t => !EXPECTED_CONDUCTOR_OPS.has(t))) {
      expect(isConductorOperation(op)).toBe(false);
    }
  });

  test('CONDUCTOR_OPERATIONS contiene esattamente le 13 task type', () => {
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

  test('bot-queue contiene 0 operations (legacy migrato)', () => {
    const botQueueOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'bot-queue');
    expect(botQueueOps).toHaveLength(0);
  });

  test('agent-sync queue contains 4 operations', () => {
    const agentSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'agent-sync');
    expect(agentSyncOps).toHaveLength(4);
  });

  test('enrichment queue contains 8 operations (sync-order-articles migrato al Conductor)', () => {
    const enrichmentOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'enrichment');
    expect(enrichmentOps).toHaveLength(8);
  });

  test('shared-sync queue contains 2 operations', () => {
    const sharedSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'shared-sync');
    expect(sharedSyncOps).toHaveLength(2);
  });

  test('bot-queue resta in QUEUE_NAMES per drain legacy', () => {
    expect(QUEUE_NAMES).toContain('bot-queue');
  });
});
