import type { DbPool } from '../../db/pool';

type ParsedCustomer = {
  customerProfile: string;
  name: string;
  vatNumber?: string;
  fiscalCode?: string;
  sdi?: string;
  pec?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  attentionTo?: string;
  street?: string;
  logisticsAddress?: string;
  postalCode?: string;
  city?: string;
  customerType?: string;
  type?: string;
  deliveryTerms?: string;
  description?: string;
  lastOrderDate?: string;
  actualOrderCount?: number;
  actualSales?: number;
  previousOrderCount1?: number;
  previousSales1?: number;
  previousOrderCount2?: number;
  previousSales2?: number;
  externalAccountNumber?: string;
  ourAccountNumber?: string;
  internalId?: string;
};

type CustomerSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type CustomerSyncResult = {
  success: boolean;
  customersProcessed: number;
  newCustomers: number;
  updatedCustomers: number;
  deletedCustomers: number;
  duration: number;
  error?: string;
};

class SyncStoppedError extends Error {
  constructor(stage: string) {
    super(`Sync stop requested during ${stage}`);
    this.name = 'SyncStoppedError';
  }
}

async function syncCustomers(
  deps: CustomerSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<CustomerSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF clienti');
    pdfPath = await downloadPdf(userId);

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF');
    const parsedCustomers = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedCustomers.length} clienti`);

    let newCustomers = 0;
    let updatedCustomers = 0;

    const now = Date.now();
    let loopIndex = 0;
    for (const customer of parsedCustomers) {
      if (loopIndex > 0 && loopIndex % 10 === 0 && shouldStop()) {
        throw new SyncStoppedError('db-loop');
      }
      loopIndex++;

      const hash = computeSimpleHash(customer);

      const { rows: [existing] } = await pool.query<{ hash: string }>(
        'SELECT hash FROM agents.customers WHERE customer_profile = $1 AND user_id = $2',
        [customer.customerProfile, userId],
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO agents.customers (
            customer_profile, user_id, internal_id, name,
            vat_number, fiscal_code, sdi, pec,
            phone, mobile, email, url, attention_to,
            street, logistics_address, postal_code, city,
            customer_type, type, delivery_terms, description,
            last_order_date, actual_order_count, actual_sales,
            previous_order_count_1, previous_sales_1,
            previous_order_count_2, previous_sales_2,
            external_account_number, our_account_number,
            hash, last_sync
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
          [
            customer.customerProfile, userId, customer.internalId ?? null, customer.name,
            customer.vatNumber ?? null, customer.fiscalCode ?? null, customer.sdi ?? null, customer.pec ?? null,
            customer.phone ?? null, customer.mobile ?? null, customer.email ?? null, customer.url ?? null, customer.attentionTo ?? null,
            customer.street ?? null, customer.logisticsAddress ?? null, customer.postalCode ?? null, customer.city ?? null,
            customer.customerType ?? null, customer.type ?? null, customer.deliveryTerms ?? null, customer.description ?? null,
            customer.lastOrderDate ?? null, customer.actualOrderCount ?? 0, customer.actualSales ?? 0,
            customer.previousOrderCount1 ?? 0, customer.previousSales1 ?? 0,
            customer.previousOrderCount2 ?? 0, customer.previousSales2 ?? 0,
            customer.externalAccountNumber ?? null, customer.ourAccountNumber ?? null,
            hash, now,
          ],
        );
        newCustomers++;
      } else if (existing.hash !== hash) {
        await pool.query(
          `UPDATE agents.customers SET
            internal_id=$3, name=$4, vat_number=$5, fiscal_code=$6, sdi=$7, pec=$8,
            phone=$9, mobile=$10, email=$11, url=$12, attention_to=$13,
            street=$14, logistics_address=$15, postal_code=$16, city=$17,
            customer_type=$18, type=$19, delivery_terms=$20, description=$21,
            last_order_date=$22, actual_order_count=$23, actual_sales=$24,
            previous_order_count_1=$25, previous_sales_1=$26,
            previous_order_count_2=$27, previous_sales_2=$28,
            external_account_number=$29, our_account_number=$30,
            hash=$31, last_sync=$32, updated_at=NOW()
          WHERE customer_profile=$1 AND user_id=$2`,
          [
            customer.customerProfile, userId, customer.internalId ?? null, customer.name,
            customer.vatNumber ?? null, customer.fiscalCode ?? null, customer.sdi ?? null, customer.pec ?? null,
            customer.phone ?? null, customer.mobile ?? null, customer.email ?? null, customer.url ?? null, customer.attentionTo ?? null,
            customer.street ?? null, customer.logisticsAddress ?? null, customer.postalCode ?? null, customer.city ?? null,
            customer.customerType ?? null, customer.type ?? null, customer.deliveryTerms ?? null, customer.description ?? null,
            customer.lastOrderDate ?? null, customer.actualOrderCount ?? 0, customer.actualSales ?? 0,
            customer.previousOrderCount1 ?? 0, customer.previousSales1 ?? 0,
            customer.previousOrderCount2 ?? 0, customer.previousSales2 ?? 0,
            customer.externalAccountNumber ?? null, customer.ourAccountNumber ?? null,
            hash, now,
          ],
        );
        updatedCustomers++;
      }
    }

    onProgress(80, 'Pulizia clienti rimossi');

    const parsedIds = parsedCustomers.map((c) => c.customerProfile);
    let deletedCustomers = 0;
    if (parsedIds.length > 0) {
      const placeholders = parsedIds.map((_, i) => `$${i + 2}`).join(', ');
      const { rows: toDelete } = await pool.query<{ customer_profile: string }>(
        `SELECT customer_profile FROM agents.customers WHERE user_id = $1 AND customer_profile NOT IN (${placeholders})`,
        [userId, ...parsedIds],
      );
      if (toDelete.length > 0) {
        const deleteIds = toDelete.map((r) => r.customer_profile);
        const delPlaceholders = deleteIds.map((_, i) => `$${i + 2}`).join(', ');
        const { rowCount } = await pool.query(
          `DELETE FROM agents.customers WHERE user_id = $1 AND customer_profile IN (${delPlaceholders})`,
          [userId, ...deleteIds],
        );
        deletedCustomers = rowCount ?? 0;
      }
    }

    onProgress(100, 'Sincronizzazione clienti completata');

    return {
      success: true,
      customersProcessed: parsedCustomers.length,
      newCustomers,
      updatedCustomers,
      deletedCustomers,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof SyncStoppedError) {
      return {
        success: false,
        customersProcessed: 0,
        newCustomers: 0,
        updatedCustomers: 0,
        deletedCustomers: 0,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
    return {
      success: false,
      customersProcessed: 0,
      newCustomers: 0,
      updatedCustomers: 0,
      deletedCustomers: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) {
      await cleanupFile(pdfPath);
    }
  }
}

function computeSimpleHash(customer: ParsedCustomer): string {
  const data = [
    customer.customerProfile, customer.name, customer.vatNumber,
    customer.fiscalCode, customer.phone, customer.email,
    customer.street, customer.postalCode, customer.city,
  ].map((v) => String(v ?? '')).join('|');
  return require('crypto').createHash('sha256').update(data).digest('hex');
}

export { syncCustomers, SyncStoppedError, type CustomerSyncDeps, type CustomerSyncResult, type ParsedCustomer };
