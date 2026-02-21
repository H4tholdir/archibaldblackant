const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'send-to-verona',
  'edit-order',
  'delete-order',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
] as const;

type OperationType = (typeof OPERATION_TYPES)[number];

const OPERATION_PRIORITIES: Record<OperationType, number> = {
  'submit-order': 1,
  'create-customer': 2,
  'update-customer': 3,
  'send-to-verona': 4,
  'edit-order': 5,
  'delete-order': 6,
  'download-ddt-pdf': 7,
  'download-invoice-pdf': 8,
  'sync-order-articles': 9,
  'sync-customers': 10,
  'sync-orders': 11,
  'sync-ddt': 12,
  'sync-invoices': 13,
  'sync-products': 14,
  'sync-prices': 15,
};

const WRITE_OPERATIONS: ReadonlySet<OperationType> = new Set([
  'submit-order',
  'create-customer',
  'update-customer',
  'send-to-verona',
  'edit-order',
  'delete-order',
]);

const SCHEDULED_SYNCS: ReadonlySet<OperationType> = new Set([
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
]);

const OPERATION_TIMEOUTS: Record<OperationType, number> = {
  'submit-order': 120_000,
  'create-customer': 120_000,
  'update-customer': 120_000,
  'send-to-verona': 120_000,
  'edit-order': 120_000,
  'delete-order': 60_000,
  'download-ddt-pdf': 60_000,
  'download-invoice-pdf': 60_000,
  'sync-order-articles': 180_000,
  'sync-customers': 300_000,
  'sync-orders': 300_000,
  'sync-ddt': 900_000,
  'sync-invoices': 300_000,
  'sync-products': 600_000,
  'sync-prices': 600_000,
};

function isWriteOperation(type: OperationType): boolean {
  return WRITE_OPERATIONS.has(type);
}

function isScheduledSync(type: OperationType): boolean {
  return SCHEDULED_SYNCS.has(type);
}

type OperationJobData = {
  type: OperationType;
  userId: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
  timestamp: number;
  _requeueCount?: number;
};

type OperationJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
};

export {
  OPERATION_TYPES,
  OPERATION_PRIORITIES,
  OPERATION_TIMEOUTS,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
};
