import type { DbPool, TxClient } from './pool';


type SyncType = 'customers' | 'products' | 'prices' | 'orders' | 'ddt' | 'invoices';

const VALID_SYNC_TYPES = new Set<SyncType>([
  'customers', 'products', 'prices', 'orders', 'ddt', 'invoices',
]);

function isValidSyncType(type: string): type is SyncType {
  return VALID_SYNC_TYPES.has(type as SyncType);
}

async function clearCustomers(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.customers CASCADE');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'customers'`,
  );
}

async function clearProducts(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE shared.product_changes CASCADE');
  await tx.query('TRUNCATE TABLE shared.product_images CASCADE');
  await tx.query('TRUNCATE TABLE shared.products CASCADE');
  await tx.query('TRUNCATE TABLE shared.sync_sessions CASCADE');
  await tx.query(
    `DELETE FROM shared.sync_metadata WHERE sync_type = 'products'`,
  );
}

async function clearPrices(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE shared.prices CASCADE');
  await tx.query(
    `DELETE FROM shared.sync_metadata WHERE sync_type = 'prices'`,
  );
}

async function clearOrders(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.order_articles CASCADE');
  await tx.query('TRUNCATE TABLE agents.order_state_history CASCADE');
  await tx.query('TRUNCATE TABLE agents.widget_order_exclusions CASCADE');
  await tx.query('TRUNCATE TABLE agents.order_records CASCADE');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'orders'`,
  );
}

async function clearDdt(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.order_ddts');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'ddt'`,
  );
}

async function clearInvoices(tx: TxClient): Promise<void> {
  await tx.query('TRUNCATE TABLE agents.order_invoices');
  await tx.query(
    `DELETE FROM agents.agent_sync_state WHERE sync_type = 'invoices'`,
  );
}

const CLEAR_HANDLERS: Record<SyncType, (tx: TxClient) => Promise<void>> = {
  customers: clearCustomers,
  products: clearProducts,
  prices: clearPrices,
  orders: clearOrders,
  ddt: clearDdt,
  invoices: clearInvoices,
};

async function clearSyncData(
  pool: DbPool,
  syncType: string,
): Promise<{ message: string }> {
  if (!isValidSyncType(syncType)) {
    throw new Error(`Invalid sync type: ${syncType}`);
  }

  await pool.withTransaction(async (tx) => {
    await CLEAR_HANDLERS[syncType](tx);
  });

  return {
    message: `Database ${syncType} cancellato con successo. Esegui una sync per ricrearlo.`,
  };
}

export { clearSyncData, isValidSyncType, VALID_SYNC_TYPES };
export type { SyncType };
