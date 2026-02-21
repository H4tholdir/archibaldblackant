import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

type UpdateCustomerData = {
  customerProfile: string;
  name: string;
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  lineDiscount?: string;
  deliveryStreet?: string;
  deliveryPostalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  deliveryPostalCodeCity?: string;
  deliveryPostalCodeCountry?: string;
};

type UpdateCustomerBot = {
  ensureReadyWithContext: (context: unknown) => Promise<void>;
  updateCustomer: (customerProfile: string, customerData: UpdateCustomerData, originalName: string) => Promise<void>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleUpdateCustomer(
  pool: DbPool,
  bot: UpdateCustomerBot,
  data: UpdateCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean }> {
  onProgress(5, 'Recupero dati cliente');

  const { rows: [existing] } = await pool.query<{ name: string; archibald_name: string | null }>(
    `SELECT name, archibald_name FROM agents.customers
     WHERE customer_profile = $1 AND user_id = $2`,
    [data.customerProfile, userId],
  );

  const originalName = existing?.archibald_name ?? existing?.name ?? data.name;

  onProgress(10, 'Aggiornamento locale');

  await pool.query(
    `UPDATE agents.customers SET
      name = $1, vat_number = $2, pec = $3, sdi = $4,
      street = $5, postal_code = $6, phone = $7, mobile = $8,
      email = $9, url = $10, delivery_terms = $11,
      bot_status = 'pending', archibald_name = $12, last_sync = $13, updated_at = NOW()
    WHERE customer_profile = $14 AND user_id = $15`,
    [
      data.name, data.vatNumber ?? null, data.pec ?? null, data.sdi ?? null,
      data.street ?? null, data.postalCode ?? null, data.phone ?? null, data.mobile ?? null,
      data.email ?? null, data.url ?? null, data.deliveryMode ?? null,
      originalName, Date.now(),
      data.customerProfile, userId,
    ],
  );

  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(20, 'Aggiornamento su Archibald');
  await bot.updateCustomer(data.customerProfile, data, originalName);

  onProgress(80, 'Aggiornamento stato');

  await pool.query(
    `UPDATE agents.customers SET bot_status = $1, archibald_name = $2, updated_at = NOW()
     WHERE customer_profile = $3 AND user_id = $4`,
    ['placed', data.name, data.customerProfile, userId],
  );

  onProgress(100, 'Aggiornamento completato');

  return { success: true };
}

function createUpdateCustomerHandler(pool: DbPool, createBot: (userId: string) => UpdateCustomerBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const typedData = data as unknown as UpdateCustomerData;
    const result = await handleUpdateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleUpdateCustomer, createUpdateCustomerHandler, type UpdateCustomerData, type UpdateCustomerBot };
