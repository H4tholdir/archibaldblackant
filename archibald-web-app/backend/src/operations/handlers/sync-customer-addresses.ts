import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import { upsertAddressesForCustomer, setAddressesSyncedAt } from '../../db/repositories/customer-addresses';
import { logger } from '../../logger';

// CDP/Puppeteer errors thrown when the browser page is closed externally (e.g. preempted by a write operation)
const BROWSER_CONNECTION_ERROR_RE = /protocol error|connection closed|target closed/i;

function isBrowserConnectionError(err: unknown): boolean {
  return err instanceof Error && BROWSER_CONNECTION_ERROR_RE.test(err.message);
}

type CustomerAddressEntry = {
  erpId: string;
  customerName: string;
};

type SyncCustomerAddressesData = {
  erpId?: string;
  customerName?: string;
  customers?: CustomerAddressEntry[];
};

type SyncCustomerAddressesBot = {
  initialize: () => Promise<void>;
  navigateToCustomerByErpId: (erpId: string) => Promise<void>;
  readAltAddresses: () => Promise<{ addresses: AltAddress[]; reliable: boolean }>;
  close: () => Promise<void>;
};

type SyncCustomerAddressesResult = {
  addressesCount: number;
  errorsCount: number;
};

async function handleSyncCustomerAddresses(
  pool: DbPool,
  bot: SyncCustomerAddressesBot,
  data: SyncCustomerAddressesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<SyncCustomerAddressesResult> {
  // Reset mode: manual trigger with no customer data
  if (!data.erpId && !data.customerName && !data.customers) {
    onProgress(50, 'Reset sync indirizzi');
    await pool.query(
      'UPDATE agents.customers SET addresses_synced_at = NULL WHERE user_id = $1',
      [userId],
    );
    onProgress(100, 'Reset completato — scheduler rieseguirà la sync');
    return { addressesCount: 0, errorsCount: 0 };
  }

  // Batch mode: process multiple customers sequentially in one bot session
  if (data.customers && data.customers.length > 0) {
    const { customers } = data;
    await bot.initialize();
    let addressesCount = 0;
    let errorsCount = 0;
    try {
      for (let i = 0; i < customers.length; i++) {
        const { erpId, customerName } = customers[i];
        onProgress(Math.floor((i / customers.length) * 90) + 5, `${customerName} (${i + 1}/${customers.length})`);
        try {
          await bot.navigateToCustomerByErpId(erpId);
          const { addresses, reliable } = await bot.readAltAddresses();
          if (!reliable && addresses.length === 0) {
            logger.warn('[sync-customer-addresses] Skipping upsert — grid timed out and DOM snapshot returned 0 addresses', { erpId, customerName });
          } else {
            await upsertAddressesForCustomer(pool, userId, erpId, addresses);
            await setAddressesSyncedAt(pool, userId, erpId);
            addressesCount += addresses.length;
          }
        } catch (err) {
          errorsCount++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.warn('[sync-customer-addresses] Failed to sync customer, skipping', {
            erpId,
            customerName,
            error: errorMessage,
          });
          // When the browser page is closed externally (e.g. preempted by a write operation),
          // reinitialize the bot so remaining customers in the batch can still be processed.
          if (isBrowserConnectionError(err)) {
            logger.warn('[sync-customer-addresses] Browser connection lost — reinitializing bot for remaining customers');
            try { await bot.close(); } catch {}
            try {
              await bot.initialize();
            } catch (reinitErr) {
              logger.warn('[sync-customer-addresses] Bot reinitialization failed, remaining customers will be skipped', {
                error: reinitErr instanceof Error ? reinitErr.message : String(reinitErr),
              });
            }
          }
        }
      }
    } finally {
      await bot.close();
    }
    onProgress(100, `${customers.length} clienti processati (${errorsCount} errori)`);
    return { addressesCount, errorsCount };
  }

  // Single customer mode (legacy or manual trigger)
  onProgress(10, 'Navigazione al cliente');
  await bot.initialize();
  try {
    await bot.navigateToCustomerByErpId(data.erpId!);
    const { addresses, reliable } = await bot.readAltAddresses();
    onProgress(60, 'Salvataggio indirizzi');
    if (!reliable && addresses.length === 0) {
      logger.warn('[sync-customer-addresses] Skipping upsert — grid timed out and DOM snapshot returned 0 addresses', { erpId: data.erpId });
      onProgress(100, 'Indirizzi non aggiornati (grid ERP non disponibile)');
      return { addressesCount: 0, errorsCount: 0 };
    }
    await upsertAddressesForCustomer(pool, userId, data.erpId!, addresses);
    await setAddressesSyncedAt(pool, userId, data.erpId!);
    onProgress(100, 'Indirizzi sincronizzati');
    return { addressesCount: addresses.length, errorsCount: 0 };
  } finally {
    await bot.close();
  }
}

function createSyncCustomerAddressesHandler(
  pool: DbPool,
  createBot: (userId: string) => SyncCustomerAddressesBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as SyncCustomerAddressesData;
    const result = await handleSyncCustomerAddresses(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleSyncCustomerAddresses,
  createSyncCustomerAddressesHandler,
  type CustomerAddressEntry,
  type SyncCustomerAddressesData,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesResult,
};
