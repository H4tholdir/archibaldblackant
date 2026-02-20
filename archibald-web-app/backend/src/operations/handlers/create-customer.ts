import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { checkBotResult, saveBotResult, clearBotResult } from '../bot-result-store';

type CreateCustomerData = {
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

type CreateCustomerBot = {
  createCustomer: (customerData: CreateCustomerData) => Promise<string>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleCreateCustomer(
  pool: DbPool,
  bot: CreateCustomerBot,
  data: CreateCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ customerProfile: string }> {
  const tempProfile = `TEMP-${Date.now()}`;

  onProgress(5, 'Salvataggio cliente locale');

  await pool.query(
    `INSERT INTO agents.customers (
      customer_profile, user_id, name, vat_number, pec, sdi,
      street, postal_code, phone, mobile, email, url,
      delivery_terms, hash, last_sync, bot_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (customer_profile, user_id) DO UPDATE SET
      name = EXCLUDED.name, bot_status = EXCLUDED.bot_status, last_sync = EXCLUDED.last_sync`,
    [
      tempProfile, userId, data.name,
      data.vatNumber ?? null, data.pec ?? null, data.sdi ?? null,
      data.street ?? null, data.postalCode ?? null,
      data.phone ?? null, data.mobile ?? null,
      data.email ?? null, data.url ?? null,
      data.deliveryMode ?? null, '', Date.now(), 'pending',
    ],
  );

  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Creazione cliente su Archibald');

  let realProfile: string;
  const savedResult = await checkBotResult(pool, userId, 'create-customer', data.name);

  if (savedResult) {
    realProfile = savedResult.customerProfile as string;
  } else {
    realProfile = await bot.createCustomer(data);
    await saveBotResult(pool, userId, 'create-customer', data.name, { customerProfile: realProfile });
  }

  onProgress(80, 'Aggiornamento profilo cliente');

  await pool.query(
    `UPDATE agents.customers
     SET customer_profile = $1, bot_status = $2, updated_at = NOW()
     WHERE customer_profile = $3 AND user_id = $4`,
    [realProfile, 'placed', tempProfile, userId],
  );

  await clearBotResult(pool, userId, 'create-customer', data.name);

  onProgress(100, 'Cliente creato');

  return { customerProfile: realProfile };
}

function createCreateCustomerHandler(pool: DbPool, createBot: (userId: string) => CreateCustomerBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as CreateCustomerData;
    const result = await handleCreateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleCreateCustomer, createCreateCustomerHandler, type CreateCustomerData, type CreateCustomerBot };
