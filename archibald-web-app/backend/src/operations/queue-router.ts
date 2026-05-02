import type { OperationType } from './operation-types';

type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync' | 'bot-queue';

// 'bot-queue' resta in QUEUE_NAMES per drain di job legacy ancora in volo al momento del deploy.
// Dopo che il drain pre-deploy è stato eseguito, può essere rimosso in una migrazione successiva.
const QUEUE_NAMES: readonly QueueName[] = ['writes', 'agent-sync', 'enrichment', 'shared-sync', 'bot-queue'] as const;

// I 6 task type ERP-write (submit-order, send-to-verona, edit-order, delete-order, batch-*)
// non sono più nel routing BullMQ: vanno via Conductor (POST /api/agent-queue/submit).
// QUEUE_ROUTING è ora un Partial: getQueueForOperation ritorna undefined per i task Conductor,
// e operation-queue.ts solleva un errore esplicito redirigendo verso il Conductor.
const QUEUE_ROUTING: Partial<Record<OperationType, QueueName>> = {
  'create-customer': 'writes',
  'update-customer': 'writes',
  'read-vat-status': 'writes',
  'refresh-customer': 'writes',
  'download-ddt-pdf': 'writes',
  'download-invoice-pdf': 'writes',
  'sync-customers': 'agent-sync',
  'sync-orders': 'agent-sync',
  'sync-ddt': 'agent-sync',
  'sync-invoices': 'agent-sync',
  'sync-order-articles': 'enrichment',
  'sync-order-states': 'enrichment',
  'sync-tracking': 'enrichment',
  'sync-customer-addresses': 'enrichment',
  'sync-products': 'shared-sync',
  'sync-prices': 'shared-sync',
  'catalog-ingestion':          'enrichment',
  'catalog-product-enrichment': 'enrichment',
  'web-product-enrichment':     'enrichment',
  'recognition-feedback':       'enrichment',
  're-extract-pictograms':      'enrichment',
};

const CONDUCTOR_OPERATIONS: readonly OperationType[] = [
  'submit-order',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
] as const;

function isConductorOperation(type: OperationType): boolean {
  return CONDUCTOR_OPERATIONS.includes(type);
}

function getQueueForOperation(type: OperationType): QueueName | undefined {
  return QUEUE_ROUTING[type];
}

export {
  getQueueForOperation,
  isConductorOperation,
  CONDUCTOR_OPERATIONS,
  QUEUE_ROUTING,
  QUEUE_NAMES,
  type QueueName,
};
