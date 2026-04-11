import { describe, expect, test } from 'vitest';
import { OPERATION_TYPES } from './operation-types';
import type { OperationType } from './operation-types';
import { getQueueForOperation, QUEUE_ROUTING, QUEUE_NAMES } from './queue-router';
import type { QueueName } from './queue-router';

describe('getQueueForOperation', () => {
  const expectedRouting: Record<OperationType, QueueName> = {
    'submit-order': 'bot-queue',
    'create-customer': 'writes',
    'update-customer': 'writes',
    'read-vat-status': 'writes',
    'refresh-customer': 'writes',
    'send-to-verona': 'writes',
    'batch-send-to-verona': 'writes',
    'edit-order': 'writes',
    'delete-order': 'writes',
    'batch-delete-orders': 'writes',
    'download-ddt-pdf': 'writes',
    'download-invoice-pdf': 'writes',
    'sync-customers': 'agent-sync',
    'sync-orders': 'agent-sync',
    'sync-ddt': 'agent-sync',
    'sync-invoices': 'agent-sync',
    'sync-order-articles': 'enrichment',
    'sync-order-states': 'enrichment',
    'sync-tracking': 'enrichment',
    'sync-customer-addresses': 'enrichment',
    'sync-products': 'shared-sync',
    'sync-prices': 'shared-sync',
    'catalog-ingestion':          'enrichment',
    'catalog-product-enrichment': 'enrichment',
    'web-product-enrichment':     'enrichment',
    'recognition-feedback':       'enrichment',
    'build-visual-index':         'enrichment',
    're-extract-pictograms':      'enrichment',
    'index-catalog-pages':        'enrichment',
    'index-web-image':            'enrichment',
  };

  test.each(OPERATION_TYPES.map(type => [type, expectedRouting[type]] as const))(
    '%s routes to %s',
    (operationType, expectedQueue) => {
      expect(getQueueForOperation(operationType)).toBe(expectedQueue);
    },
  );

  test('QUEUE_ROUTING covers every OperationType', () => {
    const routedTypes = Object.keys(QUEUE_ROUTING).sort();
    const allTypes = [...OPERATION_TYPES].sort();
    expect(routedTypes).toEqual(allTypes);
  });

  test('every routed queue name is a known QueueName', () => {
    const routedQueues = new Set(Object.values(QUEUE_ROUTING));
    for (const q of routedQueues) {
      expect(QUEUE_NAMES).toContain(q);
    }
  });

  test('instrada submit-order su bot-queue', () => {
    expect(getQueueForOperation('submit-order')).toBe('bot-queue');
  });

  test('include bot-queue in QUEUE_NAMES', () => {
    expect(QUEUE_NAMES).toContain('bot-queue');
  });

  test('non instrada create-customer su bot-queue', () => {
    expect(getQueueForOperation('create-customer')).toBe('writes');
  });

  test('writes queue contains 11 operations', () => {
    const writesOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'writes');
    expect(writesOps).toHaveLength(11);
  });

  test('bot-queue contains 1 operation', () => {
    const botQueueOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'bot-queue');
    expect(botQueueOps).toHaveLength(1);
  });

  test('agent-sync queue contains 4 operations', () => {
    const agentSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'agent-sync');
    expect(agentSyncOps).toHaveLength(4);
  });

  test('enrichment queue contains 12 operations', () => {
    const enrichmentOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'enrichment');
    expect(enrichmentOps).toHaveLength(12);
  });

  test('shared-sync queue contains 2 operations', () => {
    const sharedSyncOps = OPERATION_TYPES.filter(t => getQueueForOperation(t) === 'shared-sync');
    expect(sharedSyncOps).toHaveLength(2);
  });
});
