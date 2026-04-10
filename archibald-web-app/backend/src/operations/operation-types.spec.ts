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

  test('all 27 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(27);
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

describe('refresh-customer operation type', () => {
  test('è incluso in OPERATION_TYPES', () => {
    expect(OPERATION_TYPES).toContain('refresh-customer');
  });

  test('ha una priorità definita', () => {
    expect(OPERATION_PRIORITIES['refresh-customer']).toBe(4);
  });

  test('non è una write operation', () => {
    expect(isWriteOperation('refresh-customer')).toBe(false);
  });

  test('non è uno scheduled sync', () => {
    expect(isScheduledSync('refresh-customer')).toBe(false);
  });
});

describe('recognition operation types', () => {
  const recognitionOps = [
    'catalog-ingestion',
    'catalog-product-enrichment',
    'web-product-enrichment',
    'recognition-feedback',
  ] as const;

  test('all 4 recognition ops are in OPERATION_TYPES', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_TYPES).toContain(op);
    }
  });

  test('all 4 recognition ops have priorities', () => {
    for (const op of recognitionOps) {
      expect(OPERATION_PRIORITIES[op as keyof typeof OPERATION_PRIORITIES]).toBeGreaterThan(0);
    }
  });

  test('all 4 recognition ops route to enrichment queue', () => {
    for (const op of recognitionOps) {
      expect(QUEUE_ROUTING[op as keyof typeof QUEUE_ROUTING]).toBe('enrichment');
    }
  });

  test('catalog ops are NOT scheduled syncs', () => {
    expect(SCHEDULED_SYNCS.has('catalog-ingestion' as any)).toBe(false);
    expect(SCHEDULED_SYNCS.has('catalog-product-enrichment' as any)).toBe(false);
    expect(SCHEDULED_SYNCS.has('web-product-enrichment' as any)).toBe(false);
  });
});

