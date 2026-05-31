export type TaskStatus = 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPhase = 'in_progress' | 'erp_save_done' | 'db_committed' | 'completed';
export type ErrorClass = 'erp_unreachable' | 'application_error' | 'verification_mismatch';

export type TaskType =
  // ERP Write — P=10
  | 'submit-order'
  | 'send-to-verona'
  | 'edit-order'
  | 'delete-order'
  | 'batch-send-to-verona'
  | 'batch-delete-orders'
  | 'create-customer'
  | 'update-customer'
  // On-demand read — P=50/100
  | 'sync-order-articles'
  | 'read-vat-status'
  | 'bg-validate-vat'
  | 'refresh-customer'
  | 'download-ddt-pdf'
  | 'download-invoice-pdf'
  | 'cache-invoice-pdf'
  // Background sync — P=500
  | 'sync-orders'
  | 'sync-customers'
  | 'sync-ddt'
  | 'sync-invoices'
  | 'sync-customer-addresses'
  | 'sync-products'
  | 'sync-prices'
  | 'sync-order-states'
  | 'sync-tracking'
  | 'recognition-feedback'; // Future: image recognition feedback — stub until feature complete

export const TASK_PRIORITY: Record<TaskType, number> = {
  'submit-order': 10,
  'edit-order': 10,
  'delete-order': 10,
  'send-to-verona': 10,
  'batch-send-to-verona': 10,
  'batch-delete-orders': 10,
  'create-customer': 10,
  'update-customer': 10,
  'sync-order-articles': 50,
  'read-vat-status': 100,
  'bg-validate-vat': 500,
  'refresh-customer': 100,
  'download-ddt-pdf': 100,
  'download-invoice-pdf': 100,
  'cache-invoice-pdf': 600,
  'sync-orders': 500,
  'sync-customers': 500,
  'sync-ddt': 500,
  'sync-invoices': 500,
  'sync-customer-addresses': 500,
  'sync-products': 500,
  'sync-prices': 500,
  'sync-order-states': 500,
  'sync-tracking': 500,
  'recognition-feedback': 10,
};

export type TaskRow = {
  taskId: bigint;
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId: string | null;
  position: number;
  enqueuedAt: Date;
  status: TaskStatus;
  phase: TaskPhase | null;
  erpOrderId: string | null;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  retryCount: number;
  maxRetries: number;
  errorClass: ErrorClass | null;
  errorMessage: string | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  // Nuovi campi Fase 1
  priority: number;
  runAfter: Date | null;
  requiresBrowser: boolean;
  dedupKeyExternal: string | null;
  preemptRequested: boolean;
};
