import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import { upsertAddressesForCustomer, setAddressesSyncedAt } from '../../db/repositories/customer-addresses';

type SyncCustomerAddressesData = {
  customerProfile: string;
  customerName: string;
};

type SyncCustomerAddressesBot = {
  initialize: () => Promise<void>;
  navigateToEditCustomerForm: (name: string) => Promise<void>;
  readAltAddresses: () => Promise<AltAddress[]>;
  close: () => Promise<void>;
};

type SyncCustomerAddressesResult = {
  addressesCount: number;
};

async function handleSyncCustomerAddresses(
  pool: DbPool,
  bot: SyncCustomerAddressesBot,
  data: SyncCustomerAddressesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<SyncCustomerAddressesResult> {
  onProgress(10, 'Navigazione al cliente');
  await bot.initialize();
  try {
    await bot.navigateToEditCustomerForm(data.customerName);
    const addresses = await bot.readAltAddresses();
    onProgress(60, 'Salvataggio indirizzi');
    await upsertAddressesForCustomer(pool, userId, data.customerProfile, addresses);
    await setAddressesSyncedAt(pool, userId, data.customerProfile);
    onProgress(100, 'Indirizzi sincronizzati');
    return { addressesCount: addresses.length };
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
  type SyncCustomerAddressesData,
  type SyncCustomerAddressesBot,
  type SyncCustomerAddressesResult,
};
