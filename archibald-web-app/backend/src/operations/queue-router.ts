import type { OperationType } from './operation-types';

type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync';

const QUEUE_NAMES: readonly QueueName[] = ['writes', 'agent-sync', 'enrichment', 'shared-sync'] as const;

// Tutte le 11 operazioni "attive" che richiedono il bot Puppeteer su ERP vanno via Conductor.
// Il Conductor garantisce serializzazione per agente (un solo bot scrittura per userId), atomicità,
// durabilità e trasparenza UI. QUEUE_ROUTING è Partial: getQueueForOperation ritorna undefined per
// i task Conductor, e operation-queue.ts solleva un errore esplicito redirigendo al Conductor.
//
// Restano in BullMQ solo:
// - sync periodiche di background (agent-sync, shared-sync, enrichment per sync-*)
// - catalog ingestion + AI image processing (catalog-*, recognition-*, re-extract-*) — non toccano il bot
const QUEUE_ROUTING: Partial<Record<OperationType, QueueName>> = {
  'sync-ddt': 'agent-sync',
  'sync-invoices': 'agent-sync',
  'sync-order-states': 'enrichment',
  'sync-tracking': 'enrichment',
  'sync-products': 'shared-sync',
  'sync-prices': 'shared-sync',
  'catalog-ingestion':          'enrichment',
  'catalog-product-enrichment': 'enrichment',
  'web-product-enrichment':     'enrichment',
  'recognition-feedback':       'enrichment',
  're-extract-pictograms':      'enrichment',
};

const CONDUCTOR_OPERATIONS: readonly OperationType[] = [
  // 6 originali (ordini)
  'submit-order',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
  // 7 estese (clienti, download, sync articoli)
  'create-customer',
  'update-customer',
  'read-vat-status',
  'refresh-customer',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  // Task 13: sync indirizzi (dry-run mode, priority=500)
  'sync-customer-addresses',
  // Task 14: sync ordini e clienti (dry-run mode, priority=500)
  'sync-orders',
  'sync-customers',
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
