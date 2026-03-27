import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot } from '../../types';
import { updateVatValidatedAt } from '../../db/repositories/customers';
import type { AddressEntry } from '../../types';
import { upsertAddressesForCustomer } from '../../db/repositories/customer-addresses';
import { logger } from '../../logger';

type UpdateCustomerData = {
  customerProfile: string;
  originalName?: string;
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
  fiscalCode?: string | null;
  sector?: string | null;
  attentionTo?: string | null;
  notes?: string | null;
  vatWasValidated?: boolean;
  addresses?: AddressEntry[];
};

type UpdateCustomerBot = {
  updateCustomer: (customerProfile: string, customerData: UpdateCustomerData, originalName: string) => Promise<void>;
  buildCustomerSnapshot: (customerProfile: string) => Promise<CustomerSnapshot>;
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

  let originalName = data.originalName;

  if (!originalName) {
    const { rows: [existing] } = await pool.query<{ name: string; archibald_name: string | null }>(
      `SELECT name, archibald_name FROM agents.customers
       WHERE customer_profile = $1 AND user_id = $2`,
      [data.customerProfile, userId],
    );
    originalName = existing?.archibald_name ?? existing?.name ?? data.name;
  }

  onProgress(10, 'Aggiornamento locale');

  await pool.query(
    `UPDATE agents.customers SET
      name = $1, vat_number = $2, pec = $3, sdi = $4,
      street = $5, postal_code = $6, phone = $7, mobile = $8,
      email = $9, url = $10, delivery_terms = $11,
      sector = COALESCE($12, sector),
      fiscal_code = COALESCE($13, fiscal_code),
      attention_to = COALESCE($14, attention_to),
      notes = COALESCE($15, notes),
      bot_status = 'pending', archibald_name = $16, last_sync = $17, updated_at = NOW()
    WHERE customer_profile = $18 AND user_id = $19`,
    [
      data.name, data.vatNumber ?? null, data.pec ?? null, data.sdi ?? null,
      data.street ?? null, data.postalCode ?? null, data.phone ?? null, data.mobile ?? null,
      data.email ?? null, data.url ?? null, data.deliveryMode ?? null,
      data.sector ?? null, data.fiscalCode ?? null,
      data.attentionTo ?? null, data.notes ?? null,
      originalName, Date.now(),
      data.customerProfile, userId,
    ],
  );

  const BOT_PROGRESS_LABELS: Record<string, { progress: number; label: string }> = {
    'customer.navigation':  { progress: 25, label: 'Navigazione al form cliente' },
    'customer.search':      { progress: 35, label: 'Ricerca cliente' },
    'customer.edit_loaded': { progress: 45, label: 'Form cliente caricato' },
    'customer.field':       { progress: 60, label: 'Compilazione campi' },
    'customer.save':        { progress: 70, label: 'Salvataggio su Archibald' },
    'customer.complete':    { progress: 75, label: 'Cliente aggiornato su Archibald' },
  };

  bot.setProgressCallback(async (category) => {
    const milestone = BOT_PROGRESS_LABELS[category];
    if (milestone) onProgress(milestone.progress, milestone.label);
  });

  onProgress(20, 'Aggiornamento su Archibald');
  await bot.updateCustomer(data.customerProfile, data, originalName);

  const addressesForUpsert = (data.addresses ?? []).map((a) => ({
    tipo: a.tipo, nome: a.nome ?? null, via: a.via ?? null,
    cap: a.cap ?? null, citta: a.citta ?? null, contea: a.contea ?? null,
    stato: a.stato ?? null, idRegione: a.idRegione ?? null, contra: a.contra ?? null,
  }));
  await upsertAddressesForCustomer(pool, userId, data.customerProfile, addressesForUpsert);

  if (data.vatWasValidated) {
    await updateVatValidatedAt(pool, userId, data.customerProfile);
  }

  onProgress(78, 'Lettura snapshot da Archibald');

  let snapshot: CustomerSnapshot = null;
  try {
    snapshot = await bot.buildCustomerSnapshot(data.customerProfile);
  } catch (err) {
    logger.warn('handleUpdateCustomer: snapshot fallito, procedo senza', { error: String(err) });
  }

  onProgress(88, 'Aggiornamento stato');

  await pool.query(
    `UPDATE agents.customers SET
      bot_status = 'snapshot',
      archibald_name = $1,
      name_alias   = COALESCE($2, name_alias),
      city         = COALESCE($3, city),
      county       = COALESCE($4, county),
      state        = COALESCE($5, state),
      country      = COALESCE($6, country),
      price_group  = COALESCE($7, price_group),
      line_discount= COALESCE($8, line_discount),
      postal_code  = COALESCE($9, postal_code),
      fiscal_code  = COALESCE($10, fiscal_code),
      sector       = COALESCE($11, sector),
      payment_terms= COALESCE($12, payment_terms),
      attention_to = COALESCE($13, attention_to),
      notes        = COALESCE($14, notes),
      vat_validated_at = CASE
        WHEN $15 = 'Sì' THEN COALESCE(vat_validated_at, NOW())
        ELSE vat_validated_at
      END,
      updated_at = NOW()
     WHERE customer_profile = $16 AND user_id = $17`,
    [
      data.name,
      snapshot?.nameAlias ?? null,
      snapshot?.city ?? null,
      snapshot?.county ?? null,
      snapshot?.state ?? null,
      snapshot?.country ?? null,
      snapshot?.priceGroup ?? null,
      snapshot?.lineDiscount ?? null,
      snapshot?.postalCode ?? null,
      snapshot?.fiscalCode ?? null,
      snapshot?.sector ?? null,
      snapshot?.paymentTerms ?? null,
      snapshot?.attentionTo ?? null,
      snapshot?.notes ?? null,
      snapshot?.vatValidated ?? null,
      data.customerProfile, userId,
    ],
  );

  onProgress(100, 'Aggiornamento completato');
  return { success: true };
}

function createUpdateCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => UpdateCustomerBot,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as UpdateCustomerData;
    const result = await handleUpdateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleUpdateCustomer,
  createUpdateCustomerHandler,
  type UpdateCustomerData,
  type UpdateCustomerBot,
};
