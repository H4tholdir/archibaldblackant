import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot } from '../../types';
import { logger } from '../../logger';

type CreateCustomerData = {
  erpId?: string;
  name: string;
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  lineDiscount?: string;
  fiscalCode?: string;
  sector?: string;
  attentionTo?: string;
  notes?: string;
  county?: string;
  state?: string;
  country?: string;
  addresses?: { tipo: string; nome?: string; via?: string; cap?: string; citta?: string; contea?: string; stato?: string; idRegione?: string; contra?: string }[];
};


type CreateCustomerBot = {
  createCustomer: (customerData: CreateCustomerData) => Promise<string>;
  buildCustomerSnapshot: (erpId: string) => Promise<CustomerSnapshot>;
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
): Promise<{ erpId: string }> {
  const tempProfile = data.erpId ?? `TEMP-${Date.now()}`;

  onProgress(5, 'Salvataggio cliente locale');

  await pool.query(
    `INSERT INTO agents.customers (
      erp_id, user_id, name, vat_number, fiscal_code, pec, sdi,
      street, postal_code, phone, mobile, email, url, attention_to,
      delivery_terms, payment_terms, sector, notes, county, state, country,
      price_group, line_discount,
      hash, last_sync, bot_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (erp_id, user_id) DO UPDATE SET
      name = EXCLUDED.name, bot_status = EXCLUDED.bot_status, last_sync = EXCLUDED.last_sync`,
    [
      tempProfile, userId, data.name,
      data.vatNumber ?? null, data.fiscalCode ?? null,
      data.pec ?? null, data.sdi ?? null,
      data.street ?? null, data.postalCode ?? null,
      data.phone ?? null, data.mobile ?? null,
      data.email ?? null, data.url ?? null,
      data.attentionTo ?? null,
      data.deliveryMode ?? null, data.paymentTerms ?? null,
      data.sector ?? null, data.notes ?? null,
      data.county ?? null, data.state ?? null, data.country ?? null,
      'DETTAGLIO (consigliato)', 'N/A',
      '', Date.now(), 'pending',
    ],
  );

  bot.setProgressCallback(async (category) => {
    onProgress(50, category);
  });

  onProgress(10, 'Creazione cliente su Archibald');
  const realProfile = await bot.createCustomer(data);

  onProgress(75, 'Lettura snapshot cliente');

  // Read back all fields from ERP for the immediate optimistic snapshot
  let snapshot: CustomerSnapshot = null;
  try {
    snapshot = await bot.buildCustomerSnapshot(realProfile);
  } catch (err) {
    logger.warn('handleCreateCustomer: could not build snapshot', { error: String(err) });
  }

  onProgress(85, 'Aggiornamento profilo cliente');

  // Update with ERP-authoritative values from snapshot (what was actually committed)
  await pool.query(
    `UPDATE agents.customers SET
      erp_id = $1,
      bot_status = $2,
      name_alias = $3,
      city = $4,
      county = $5,
      state = $6,
      country = $7,
      price_group = $8,
      line_discount = $9,
      postal_code = COALESCE($10, postal_code),
      fiscal_code = COALESCE($11, fiscal_code),
      sector = COALESCE($12, sector),
      payment_terms = COALESCE($13, payment_terms),
      attention_to = COALESCE($14, attention_to),
      notes = COALESCE($15, notes),
      updated_at = NOW()
     WHERE erp_id = $16 AND user_id = $17`,
    [
      realProfile,
      'snapshot',
      snapshot?.nameAlias ?? null,
      snapshot?.city ?? null,
      snapshot?.county ?? null,
      snapshot?.state ?? null,
      snapshot?.country ?? null,
      snapshot?.priceGroup ?? 'DETTAGLIO (consigliato)',
      snapshot?.lineDiscount ?? 'N/A',
      snapshot?.postalCode ?? null,
      snapshot?.fiscalCode ?? null,
      snapshot?.sector ?? null,
      snapshot?.paymentTerms ?? null,
      snapshot?.attentionTo ?? null,
      snapshot?.notes ?? null,
      tempProfile,
      userId,
    ],
  );

  onProgress(100, 'Cliente creato');

  return { erpId: realProfile };
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
