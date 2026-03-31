import type { OperationType } from './operation-types';

type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync' | 'bot-queue';

const QUEUE_NAMES: readonly QueueName[] = ['writes', 'agent-sync', 'enrichment', 'shared-sync', 'bot-queue'] as const;

const QUEUE_ROUTING: Record<OperationType, QueueName> = {
  'submit-order': 'bot-queue',
  'create-customer': 'writes',
  'update-customer': 'writes',
  'read-vat-status': 'writes',
  'send-to-verona': 'writes',
  'batch-send-to-verona': 'writes',
  'edit-order': 'writes',
  'delete-order': 'writes',
  'batch-delete-orders': 'writes',
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
};

function getQueueForOperation(type: OperationType): QueueName {
  return QUEUE_ROUTING[type];
}

export { getQueueForOperation, QUEUE_ROUTING, QUEUE_NAMES, type QueueName };
