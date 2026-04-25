const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'read-vat-status',
  'refresh-customer',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
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
  'catalog-ingestion',
  'catalog-product-enrichment',
  'web-product-enrichment',
  'recognition-feedback',
  're-extract-pictograms',
] as const;

type OperationType = (typeof OPERATION_TYPES)[number];

const OPERATION_PRIORITIES: Record<OperationType, number> = {
  'submit-order': 1,
  'create-customer': 2,
  'update-customer': 3,
  'read-vat-status': 4,
  'refresh-customer': 4,
  'send-to-verona': 5,
  'batch-send-to-verona': 5,
  'edit-order': 6,
  'delete-order': 7,
  'batch-delete-orders': 7,
  'download-ddt-pdf': 8,
  'download-invoice-pdf': 9,
  'sync-order-states': 10,
  'sync-customers': 11,
  'sync-orders': 12,
  'sync-order-articles': 8,
  'sync-ddt': 14,
  'sync-invoices': 15,
  'sync-products': 16,
  'sync-prices': 17,
  'sync-tracking': 18,
  'sync-customer-addresses': 19,
  'catalog-ingestion':          5,
  'catalog-product-enrichment': 3,
  'web-product-enrichment':     2,
  'recognition-feedback':       5,
  're-extract-pictograms':      4,
};

const WRITE_OPERATIONS: ReadonlySet<OperationType> = new Set([
  'submit-order',
  'create-customer',
  'update-customer',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
]);

const SCHEDULED_SYNCS: ReadonlySet<OperationType> = new Set([
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
