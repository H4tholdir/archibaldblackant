import { describe, expect, test } from 'vitest';
import {
  OPERATION_TYPES,
  OPERATION_PRIORITIES,
  SCHEDULED_SYNCS,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
} from './operation-types';
import { QUEUE_ROUTING } from './queue-router';

describe('OPERATION_PRIORITIES', () => {
  test('submit-order has highest priority (1)', () => {
    expect(OPERATION_PRIORITIES['submit-order']).toBe(1);
  });

  test('sync-customer-addresses has lowest priority (19)', () => {
    expect(OPERATION_PRIORITIES['sync-customer-addresses']).toBe(19);
  });

  test('all 24 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(24);
  });
});

describe('isWriteOperation', () => {
  const writeOps: OperationType[] = [
    'submit-order',
    'create-customer',
    'update-customer',
    'send-to-verona',
    'batch-send-to-verona',
    'edit-order',
    'delete-order',
    'batch-delete-orders',
  ];

  const nonWriteOps: OperationType[] = [
    'read-vat-status',
    'download-ddt-pdf',
    'download-invoice-pdf',
    'sync-order-articles',
    'sync-order-states',
    'sync-customers',
    'sync-orders',
    'sync-ddt',
    'sync-invoices',
    'sync-products',
    'sync-prices',
    'sync-tracking',
    'sync-customer-addresses',
  ];

  test.each(writeOps)('%s is a write operation', (op) => {
    expect(isWriteOperation(op)).toBe(true);
  });

  test.each(nonWriteOps)('%s is NOT a write operation', (op) => {
    expect(isWriteOperation(op)).toBe(false);
  });
});

describe('isScheduledSync', () => {
  const scheduledSyncs: OperationType[] = [
    'sync-customers',
    'sync-orders',
    'sync-ddt',
    'sync-invoices',
    'sync-products',
    'sync-prices',
    'sync-order-articles',
    'sync-tracking',
    'sync-customer-addresses',
    'sync-order-states',
  ];

  const nonScheduledSyncs: OperationType[] = [
    'submit-order',
    'create-customer',
    'update-customer',
    'read-vat-status',
    'send-to-verona',
    'batch-send-to-verona',
    'edit-order',
    'delete-order',
    'batch-delete-orders',
    'download-ddt-pdf',
    'download-invoice-pdf',
  ];

  test.each(scheduledSyncs)('%s is a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(true);
  });

  test.each(nonScheduledSyncs)('%s is NOT a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(false);
  });
});

describe('recognition operation types', () => {
  const recognitionOps = [
    'komet-code-parser',
    'komet-web-scraper',
    'recognition-feedback',
  ] as const;

  test('all 3 recognition ops are in OPERATION_TYPES', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_TYPES).toContain(op);
    }
  });

  test('all 3 recognition ops have priorities', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_PRIORITIES[op as keyof typeof OPERATION_PRIORITIES]).toBeGreaterThan(0);
    }
  });

  test('all 3 recognition ops route to enrichment queue', () => {
    for (const op of recognitionOps) {
      expect(QUEUE_ROUTING[op as keyof typeof QUEUE_ROUTING]).toBe('enrichment');
    }
  });

  test('komet-code-parser and komet-web-scraper are scheduled syncs', () => {
    expect(SCHEDULED_SYNCS.has('komet-code-parser' as any)).toBe(true);
    expect(SCHEDULED_SYNCS.has('komet-web-scraper' as any)).toBe(true);
  });
});

