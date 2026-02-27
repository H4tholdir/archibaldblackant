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

  test('sync-prices has lowest priority (16)', () => {
    expect(OPERATION_PRIORITIES['sync-prices']).toBe(16);
  });

  test('all 16 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(16);
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
    'sync-order-states',
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
    'sync-order-articles',
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
    'sync-order-states',
  ];

  test.each(scheduledSyncs)('%s is a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(true);
  });

  test.each(nonScheduledSyncs)('%s is NOT a scheduled sync', (op) => {
    expect(isScheduledSync(op)).toBe(false);
  });
});
