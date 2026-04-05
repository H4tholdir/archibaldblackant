import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot, CustomerDiff, AddressEntry } from '../../types';
import { updateVatValidatedAt, updateAgentNotes } from '../../db/repositories/customers';
import { logger } from '../../logger';

type UpdateCustomerPayload = {
  erpId: string;
  diff: CustomerDiff;
  addresses?: AddressEntry[];
};

type UpdateCustomerBot = {
  navigateToEditCustomerById: (erpId: string) => Promise<void>;
  updateCustomerSurgical: (
    diff: CustomerDiff,
    addresses?: AddressEntry[],
  ) => Promise<NonNullable<CustomerSnapshot>>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

function buildCustomerDiff(
  original: Record<string, string | null>,
  edited: Record<string, string | null>,
): CustomerDiff {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(edited)) {
    if (edited[key] !== original[key]) {
      diff[key] = edited[key];
    }
  }
  return diff as CustomerDiff;
}

const BOT_PROGRESS_LABELS: Record<string, { progress: number; label: string }> = {
  'customer.navigation':  { progress: 15, label: 'Navigazione scheda cliente' },
  'customer.edit_loaded': { progress: 25, label: 'Form edit aperto' },
  'customer.field':       { progress: 50, label: 'Scrittura campi' },
  'customer.save':        { progress: 70, label: 'Salvataggio su Archibald' },
  'customer.complete':    { progress: 78, label: 'Salvataggio completato' },
};

async function handleUpdateCustomer(
  pool: DbPool,
  bot: UpdateCustomerBot,
  data: UpdateCustomerPayload,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ success: boolean }> {
  const { erpId, diff, addresses } = data;

  if (Object.keys(diff).length === 0 && !addresses?.length) {
    logger.info('handleUpdateCustomer: diff vuoto, skip', { erpId });
    onProgress(100, 'Nessuna modifica');
    return { success: true };
  }

  onProgress(5, 'Connessione bot');

  bot.setProgressCallback(async (category) => {
    const milestone = BOT_PROGRESS_LABELS[category];
    if (milestone) onProgress(milestone.progress, milestone.label);
  });

  await bot.navigateToEditCustomerById(erpId);

  // agentNotes è solo DB — non viene passato al bot ERP
  const { agentNotes, ...erpDiff } = diff;

  let snapshot: NonNullable<CustomerSnapshot> | null = null;
  try {
    snapshot = await bot.updateCustomerSurgical(erpDiff, addresses);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('buildCustomerSnapshot')) {
      // Il salvataggio ERP è riuscito ma il readback dello snapshot è fallito.
      // Aggiorniamo il DB con i valori del diff (quelli che sappiamo essere stati
      // applicati) invece di lanciare un errore che maschera il successo reale.
      logger.warn('handleUpdateCustomer: snapshot fallito dopo save, uso diff come fallback', { erpId, error: msg });
    } else {
      throw err;
    }
  }

  // Se snapshot è null (readback fallito) usiamo i valori del diff per i campi
  // editabili e null per quelli solo-snapshot (city, priceGroup, ecc.).
  // La COALESCE nella query preserva i valori esistenti del DB per i null.

  onProgress(78, 'Lettura snapshot da Archibald');

  await pool.query(
    `UPDATE agents.customers SET
       bot_status       = 'snapshot',
       archibald_name   = COALESCE($1,  archibald_name),
       name_alias       = COALESCE($2,  name_alias),
       city             = COALESCE($3,  city),
       county           = COALESCE($4,  county),
       state            = COALESCE($5,  state),
       country          = COALESCE($6,  country),
       price_group      = COALESCE($7,  price_group),
       line_discount    = COALESCE($8,  line_discount),
       postal_code      = COALESCE($9,  postal_code),
       fiscal_code      = COALESCE($10, fiscal_code),
       sector           = COALESCE($11, sector),
       payment_terms    = COALESCE($12, payment_terms),
       attention_to     = COALESCE($13, attention_to),
       notes            = COALESCE($14, notes),
       street           = COALESCE($17, street),
       vat_number       = COALESCE($18, vat_number),
       pec              = COALESCE($19, pec),
       sdi              = COALESCE($20, sdi),
       phone            = COALESCE($21, phone),
       mobile           = COALESCE($22, mobile),
       email            = COALESCE($23, email),
       url              = COALESCE($24, url),
       delivery_terms   = COALESCE($25, delivery_terms),
       updated_at       = NOW()
     WHERE erp_id = $15 AND user_id = $16`,
    [
      // Snapshot-only fields (non editabili via diff): null se snapshot non disponibile
      snapshot?.name ?? erpDiff.name ?? null,
      snapshot?.nameAlias ?? erpDiff.nameAlias ?? null,
      snapshot?.city ?? null,
      snapshot?.county ?? null,
      snapshot?.state ?? null,
      snapshot?.country ?? null,
      snapshot?.priceGroup ?? null,
      snapshot?.lineDiscount ?? null,
      snapshot?.postalCode ?? null,
      snapshot?.fiscalCode ?? erpDiff.fiscalCode ?? null,
      snapshot?.sector ?? erpDiff.sector ?? null,
      snapshot?.paymentTerms ?? erpDiff.paymentTerms ?? null,
      snapshot?.attentionTo ?? erpDiff.attentionTo ?? null,
      snapshot?.notes ?? erpDiff.notes ?? null,
      erpId, userId,
      snapshot?.street ?? erpDiff.street ?? null,
      snapshot?.vatNumber ?? erpDiff.vatNumber ?? null,
      snapshot?.pec ?? erpDiff.pec ?? null,
      snapshot?.sdi ?? erpDiff.sdi ?? null,
      snapshot?.phone ?? erpDiff.phone ?? null,
      snapshot?.mobile ?? erpDiff.mobile ?? null,
      snapshot?.email ?? erpDiff.email ?? null,
      snapshot?.url ?? erpDiff.url ?? null,
      snapshot?.deliveryMode ?? erpDiff.deliveryMode ?? null,
    ],
  );

  if (agentNotes !== undefined) {
    await updateAgentNotes(pool, userId, erpId, agentNotes ?? null);
  }

  if (diff.vatNumber !== undefined) {
    await updateVatValidatedAt(pool, userId, erpId);
  }

  onProgress(88, 'Aggiornamento stato');
  onProgress(100, 'Aggiornamento completato');
  return { success: true };
}

function createUpdateCustomerHandler(
  pool: DbPool,
  createBot: (userId: string) => UpdateCustomerBot,
): OperationHandler {
  return async (_context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as UpdateCustomerPayload;
    const result = await handleUpdateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export {
  handleUpdateCustomer,
  createUpdateCustomerHandler,
  buildCustomerDiff,
  type UpdateCustomerPayload,
  type UpdateCustomerBot,
};
