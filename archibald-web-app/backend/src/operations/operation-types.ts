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
  idempotencyKey: string;
  timestamp: number;
};

type OperationJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
};

export {
  OPERATION_TYPES,
  OPERATION_PRIORITIES,
  WRITE_OPERATIONS,
  SCHEDULED_SYNCS,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
};
