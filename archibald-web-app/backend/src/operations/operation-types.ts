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
  'sync-order-states',
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
  'sync-order-states': 10,
  'sync-customers': 11,
  'sync-orders': 12,
  'sync-ddt': 13,
  'sync-invoices': 14,
  'sync-products': 15,
  'sync-prices': 16,
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
  'sync-order-articles',
]);

function isWriteOperation(type: OperationType): boolean {
  return WRITE_OPERATIONS.has(type);
}

function isScheduledSync(type: OperationType): boolean {
  return SCHEDULED_SYNCS.has(type);
}

const AGENT_SYNC_CHAIN: readonly OperationType[] = [
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
];

const SHARED_SYNC_CHAIN: readonly OperationType[] = [
  'sync-products',
  'sync-prices',
];

function getNextSyncInChain(type: OperationType): OperationType | null {
  for (const chain of [AGENT_SYNC_CHAIN, SHARED_SYNC_CHAIN]) {
    const idx = chain.indexOf(type);
    if (idx >= 0 && idx < chain.length - 1) {
      return chain[idx + 1];
    }
  }
  return null;
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
  AGENT_SYNC_CHAIN,
  SHARED_SYNC_CHAIN,
  isWriteOperation,
  isScheduledSync,
  getNextSyncInChain,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
};
