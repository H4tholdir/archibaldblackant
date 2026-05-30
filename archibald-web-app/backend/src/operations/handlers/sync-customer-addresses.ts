import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { AltAddress } from '../../db/repositories/customer-addresses';
import { upsertAddressesForCustomer, setAddressesSyncedAt } from '../../db/repositories/customer-addresses';
import type { DryRunLogger } from '../../conductor/dry-run';
import { logger } from '../../logger';
import { PreemptedSignal, isPreemptedSignal } from '../../conductor/preempted-signal';
import { mapErpBlockedStatus } from './sync-customers';
import { normalizeVatStatus } from './vat-status-normalizer';
import { updateVatValidatedAt } from '../../db/repositories/customers';

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
  readBlockedStatus: () => Promise<string | null>;
  readVatStatusFromView: () => Promise<{ vatValidated: string | null; lastChecked: string | null }>;
  readAltAddresses: () => Promise<{ addresses: AltAddress[]; reliable: boolean }>;
  close: () => Promise<void>;
};

type SyncCustomerAddressesResult = {
  addressesCount: number;
  errorsCount: number;
};

type DryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncCustomerAddresses(
  pool: DbPool,
  bot: SyncCustomerAddressesBot,
  data: SyncCustomerAddressesData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: DryRunOpts = {},
  shouldStop?: () => Promise<boolean>,
): Promise<SyncCustomerAddressesResult> {
  const { dryRun = false, dryRunLogger } = opts;

  // Reset mode: manual trigger with no customer data
  if (!data.erpId && !data.customerName && !data.customers) {
    onProgress(50, 'Reset sync indirizzi');
    if (!dryRun) {
      await pool.query(
        'UPDATE agents.customers SET addresses_synced_at = NULL WHERE user_id = $1',
        [userId],
      );
    } else {
      dryRunLogger?.recordUpsert('reset', 'update', { addresses_synced_at: null, user_id: userId });
    }
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
        if (shouldStop && await shouldStop()) {
          throw new PreemptedSignal();
        }
        const { erpId, customerName } = customers[i];
        onProgress(Math.floor((i / customers.length) * 90) + 5, `${customerName} (${i + 1}/${customers.length})`);
        try {
          await bot.navigateToCustomerByErpId(erpId);

          // Legge blocked_status nella stessa pagina VIEW mode (zero costo extra di navigazione)
          const blockedRaw = await bot.readBlockedStatus().catch(() => null);
          const blockedStatus = mapErpBlockedStatus(blockedRaw);
          if (!dryRun && blockedStatus !== undefined) {
            await pool.query(
              `UPDATE agents.customers SET blocked_status = $1, updated_at = NOW()
               WHERE erp_id = $2 AND user_id = $3`,
              [blockedStatus, erpId, userId],
            ).catch(err => logger.warn('[sync-customer-addresses] blocked_status update failed', { erpId, err }));
          }

          // Legge validazione IVA — stessa pagina VIEW mode, zero costo extra.
          // Aggiorna vat_validated_at solo se "Sì": la gestione completa dei casi
          // negativi rimane al job read-vat-status (che verifica anche via API esterna).
          const vatStatus = await bot.readVatStatusFromView().catch(() => ({ vatValidated: null, lastChecked: null }));
          if (!dryRun && vatStatus.vatValidated) {
            const normalized = normalizeVatStatus(vatStatus.vatValidated);
            if (normalized === 'validated') {
              await updateVatValidatedAt(pool, userId, erpId).catch(err =>
                logger.warn('[sync-customer-addresses] vat_validated_at update failed', { erpId, err }),
              );
            }
          }

          const { addresses, reliable } = await bot.readAltAddresses();
          if (!reliable && addresses.length === 0) {
            logger.warn('[sync-customer-addresses] Skipping upsert — grid timed out and DOM snapshot returned 0 addresses', { erpId, customerName });
          } else {
            if (!dryRun) {
              await upsertAddressesForCustomer(pool, userId, erpId, addresses);
              await setAddressesSyncedAt(pool, userId, erpId);
            } else {
              dryRunLogger?.recordUpsert(erpId, 'update', { addresses, addressesCount: addresses.length });
            }
            addressesCount += addresses.length;
          }
        } catch (err) {
          if (isPreemptedSignal(err)) throw err;
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

    // Legge blocked_status nella stessa pagina VIEW mode (zero costo extra di navigazione)
    const blockedRaw = await bot.readBlockedStatus().catch(() => null);
    const blockedStatus = mapErpBlockedStatus(blockedRaw);
    if (!dryRun && blockedStatus !== undefined) {
      await pool.query(
        `UPDATE agents.customers SET blocked_status = $1, updated_at = NOW()
         WHERE erp_id = $2 AND user_id = $3`,
        [blockedStatus, data.erpId!, userId],
      ).catch(err => logger.warn('[sync-customer-addresses] blocked_status update failed', { erpId: data.erpId, err }));
    }

    const vatStatusSingle = await bot.readVatStatusFromView().catch(() => ({ vatValidated: null, lastChecked: null }));
    if (!dryRun && vatStatusSingle.vatValidated) {
      const normalizedSingle = normalizeVatStatus(vatStatusSingle.vatValidated);
      if (normalizedSingle === 'validated') {
        await updateVatValidatedAt(pool, userId, data.erpId!).catch(err =>
          logger.warn('[sync-customer-addresses] vat_validated_at update failed', { erpId: data.erpId, err }),
        );
      }
    }

    const { addresses, reliable } = await bot.readAltAddresses();
    onProgress(60, 'Salvataggio indirizzi');
    if (!reliable && addresses.length === 0) {
      logger.warn('[sync-customer-addresses] Skipping upsert — grid timed out and DOM snapshot returned 0 addresses', { erpId: data.erpId });
      onProgress(100, 'Indirizzi non aggiornati (grid ERP non disponibile)');
      return { addressesCount: 0, errorsCount: 0 };
    }
    if (!dryRun) {
      await upsertAddressesForCustomer(pool, userId, data.erpId!, addresses);
      await setAddressesSyncedAt(pool, userId, data.erpId!);
    } else {
      dryRunLogger?.recordUpsert(data.erpId!, 'update', { addresses, addressesCount: addresses.length });
    }
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
  type DryRunOpts,
};
