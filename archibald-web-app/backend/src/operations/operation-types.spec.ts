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

  test('sync-customer-addresses has lowest priority (19)', () => {
    expect(OPERATION_PRIORITIES['sync-customer-addresses']).toBe(19);
  });

  test('all 21 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(21);
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

