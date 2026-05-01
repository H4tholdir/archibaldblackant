export type TaskStatus = 'enqueued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPhase = 'in_progress' | 'erp_save_done' | 'db_committed' | 'completed';
export type ErrorClass = 'erp_unreachable' | 'application_error';

export type TaskType =
  | 'submit-order'
  | 'send-to-verona'
  | 'edit-order'
  | 'delete-order'
  | 'batch-send-to-verona'
  | 'batch-delete-orders';

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
};
