import type { OperationType } from './operation-types';

const CONDUCTOR_OPERATIONS: readonly OperationType[] = [
  // 6 originali (ordini)
  'submit-order',
  'send-to-verona',
  'batch-send-to-verona',
  'edit-order',
  'delete-order',
  'batch-delete-orders',
  // 7 estese (clienti, download, sync articoli)
  'update-customer',
  'read-vat-status',
  'bg-validate-vat',
  'refresh-customer',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'cache-invoice-pdf',
  'sync-order-articles',
  // Task 13: sync indirizzi (dry-run mode, priority=500)
  'sync-customer-addresses',
  // Task 14: sync ordini e clienti (dry-run mode, priority=500)
  'sync-orders',
  'sync-customers',
  // Task 15: sync DDT e fatture (dry-run mode, priority=500)
  'sync-ddt',
  'sync-invoices',
  // Task 16: sync prodotti e prezzi condivisi (dry-run mode, round-robin agente)
  'sync-products',
  'sync-prices',
  // Task 17: sync senza browser (DB/API-only, P=500)
  'sync-order-states',
  'sync-tracking',
  // Future: image recognition feedback (stub)
  'recognition-feedback',
] as const;

function isConductorOperation(type: OperationType): boolean {
  return CONDUCTOR_OPERATIONS.includes(type);
}

export {
  isConductorOperation,
  CONDUCTOR_OPERATIONS,
};
