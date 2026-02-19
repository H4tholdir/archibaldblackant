import { describe, expect, test } from 'vitest';
import {
  OPERATION_PRIORITIES,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
} from './operation-types';

describe('OPERATION_PRIORITIES', () => {
  test('submit-order has highest priority (1)', () => {
    expect(OPERATION_PRIORITIES['submit-order']).toBe(1);
  });

  test('sync-prices has lowest priority (15)', () => {
    expect(OPERATION_PRIORITIES['sync-prices']).toBe(15);
  });

  test('all 15 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(15);
  });
});

describe('isWriteOperation', () => {
  const writeOps: OperationType[] = [
    'submit-order',
    'create-customer',
    'update-customer',
    'send-to-verona',
    'edit-order',
    'delete-order',
  ];

  const nonWriteOps: OperationType[] = [
    'download-ddt-pdf',
    'download-invoice-pdf',
    'sync-order-articles',
    'sync-customers',
    'sync-orders',
    'sync-ddt',
    'sync-invoices',
    'sync-products',
    'sync-prices',
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
  ];

  const nonScheduledSyncs: OperationType[] = [
    'submit-order',
    'create-customer',
    'update-customer',
    'send-to-verona',
    'edit-order',
    'delete-order',
    'download-ddt-pdf',
    'download-invoice-pdf',
    'sync-order-articles',
  ];

  test.each(scheduledSyncs)('%s is a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(true);
  });

  test.each(nonScheduledSyncs)('%s is NOT a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(false);
  });
});
