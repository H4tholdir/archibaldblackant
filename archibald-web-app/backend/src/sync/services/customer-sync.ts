import type { DbPool } from '../../db/pool';
import { copyFile } from 'node:fs/promises';
import { logger } from '../../logger';

type ParsedCustomer = {
  erpId: string;
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
  previousOrderCount1?: number;
  previousSales1?: number;
  previousOrderCount2?: number;
  previousSales2?: number;
  externalAccountNumber?: string;
  ourAccountNumber?: string;
  accountNum?: string;
};

type DeletedProfileInfo = {
  profile: string;
  accountNum: string;
  name: string;
  affectedAgentIds: string[];
};

type RestoredProfileInfo = {
  profile: string;
  accountNum: string;
  name: string;
  affectedAgentIds: string[];
};

type CustomerSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>;
  cleanupFile: (filePath: string) => Promise<void>;
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>;
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>;
};

type CustomerSyncResult = {
  success: boolean;
  customersProcessed: number;
  newCustomers: number;
  updatedCustomers: number;
  deletedCustomers: number;
  restoredCustomers: number;
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
    await copyFile(pdfPath, '/app/data/debug-clienti.pdf').catch(() => {});

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF');
    const parsedCustomers = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedCustomers.length} clienti`);

    let newCustomers = 0;
    let updatedCustomers = 0;
    let restoredCustomers = 0;
    const restored: Array<{ profile: string; accountNum: string; name: string }> = [];
    const newWithAccountNum: Array<{ profile: string; accountNum: string; name: string }> = [];

    const now = Date.now();
    for (const customer of parsedCustomers) {
      const hash = computeSimpleHash(customer);

      const { rows: [existing] } = await pool.query<{ hash: string; deleted_at: Date | null }>(
        'SELECT hash, deleted_at FROM agents.customers WHERE erp_id = $1 AND user_id = $2',
        [customer.erpId, userId],
      );

      const customerParams = [
        customer.erpId, userId, customer.accountNum ?? null, customer.name,
        customer.vatNumber ?? null, customer.fiscalCode ?? null, customer.sdi ?? null, customer.pec ?? null,
        customer.phone ?? null, customer.mobile ?? null, customer.email ?? null, customer.url ?? null, customer.attentionTo ?? null,
        customer.street ?? null, customer.logisticsAddress ?? null, customer.postalCode ?? null, customer.city ?? null,
        customer.customerType ?? null, customer.type ?? null, customer.deliveryTerms ?? null, customer.description ?? null,
        customer.lastOrderDate ?? null, customer.actualOrderCount ?? 0,
        customer.previousOrderCount1 ?? 0, customer.previousSales1 ?? 0,
        customer.previousOrderCount2 ?? 0, customer.previousSales2 ?? 0,
        customer.externalAccountNumber ?? null, customer.ourAccountNumber ?? null,
        hash, now,
      ];

      if (!existing) {
        await pool.query(
          `INSERT INTO agents.customers (
            erp_id, user_id, account_num, name,
            vat_number, fiscal_code, sdi, pec,
            phone, mobile, email, url, attention_to,
            street, logistics_address, postal_code, city,
            customer_type, type, delivery_terms, description,
            last_order_date, actual_order_count,
            previous_order_count_1, previous_sales_1,
            previous_order_count_2, previous_sales_2,
            external_account_number, our_account_number,
            hash, last_sync
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
          customerParams,
        );
        newCustomers++;
        if (customer.accountNum) {
          newWithAccountNum.push({ profile: customer.erpId, accountNum: customer.accountNum, name: customer.name });
        }
      } else if (existing.deleted_at !== null) {
        // Customer was soft-deleted but reappeared in ERP — restore it
        await pool.query(
          `UPDATE agents.customers SET
            deleted_at=NULL, account_num=$3, name=$4, vat_number=$5, fiscal_code=$6, sdi=$7, pec=$8,
            phone=$9, mobile=$10, email=COALESCE($11, email), url=$12, attention_to=$13,
            street=$14, logistics_address=$15, postal_code=$16, city=$17,
            customer_type=$18, type=$19, delivery_terms=$20, description=$21,
            last_order_date=$22, actual_order_count=$23,
            previous_order_count_1=$24, previous_sales_1=$25,
            previous_order_count_2=$26, previous_sales_2=$27,
            external_account_number=$28, our_account_number=$29,
            hash=$30, last_sync=$31, updated_at=NOW(), addresses_synced_at=NULL
          WHERE erp_id=$1 AND user_id=$2`,
          customerParams,
        );
        restored.push({ profile: customer.erpId, accountNum: customer.accountNum ?? '', name: customer.name });
        restoredCustomers++;
      } else if (existing.hash !== hash) {
        await pool.query(
          `UPDATE agents.customers SET
            account_num=$3, name=$4, vat_number=$5, fiscal_code=$6, sdi=$7, pec=$8,
            phone=$9, mobile=$10, email=COALESCE($11, email), url=$12, attention_to=$13,
            street=$14, logistics_address=$15, postal_code=$16, city=$17,
            customer_type=$18, type=$19, delivery_terms=$20, description=$21,
            last_order_date=$22, actual_order_count=$23,
            previous_order_count_1=$24, previous_sales_1=$25,
            previous_order_count_2=$26, previous_sales_2=$27,
            external_account_number=$28, our_account_number=$29,
            hash=$30, last_sync=$31, updated_at=NOW(), addresses_synced_at=NULL
          WHERE erp_id=$1 AND user_id=$2`,
          customerParams,
        );
        updatedCustomers++;
      }
    }

    onProgress(80, 'Pulizia clienti rimossi');

    const parsedIds = parsedCustomers.map((c) => c.erpId);
    let deletedCustomers = 0;
    if (parsedIds.length > 0) {
      const placeholders = parsedIds.map((_, i) => `$${i + 2}`).join(', ');
      const { rows: toDelete } = await pool.query<{ erp_id: string; account_num: string | null; name: string }>(
        `SELECT erp_id, account_num, name FROM agents.customers
         WHERE user_id = $1 AND erp_id NOT IN (${placeholders}) AND deleted_at IS NULL
           AND account_num IS NOT NULL`,
        [userId, ...parsedIds],
      );
      if (toDelete.length > 0) {
        // Before deleting TEMP profiles, migrate any pending orders that reference them
        // to the corresponding real profile (matched by VAT number).
        const tempProfiles = toDelete.filter(r => r.erp_id.startsWith('TEMP-'));
        for (const { erp_id: tempProfile } of tempProfiles) {
          const { rows: [tempRow] } = await pool.query<{ vat_number: string | null }>(
            `SELECT vat_number FROM agents.customers WHERE erp_id = $1 AND user_id = $2`,
            [tempProfile, userId],
          );
          if (tempRow?.vat_number) {
            const { rows: [realRow] } = await pool.query<{ erp_id: string }>(
              `SELECT erp_id FROM agents.customers
               WHERE user_id = $1 AND vat_number = $2 AND erp_id NOT LIKE 'TEMP-%' LIMIT 1`,
              [userId, tempRow.vat_number],
            );
            if (realRow) {
              await pool.query(
                `UPDATE agents.pending_orders SET customer_id = $1 WHERE customer_id = $2 AND user_id = $3`,
                [realRow.erp_id, tempProfile, userId],
              );
            }
          }
        }

        if (deps.onDeletedCustomers) {
          const accountNums = toDelete
            .map((r) => r.account_num)
            .filter((id): id is string => id !== null);

          if (accountNums.length > 0) {
              const { rows: orderUsers } = await pool.query<{ user_id: string; customer_account_num: string }>(
              `SELECT DISTINCT o.user_id, o.customer_account_num
               FROM agents.order_records o
               WHERE o.customer_account_num = ANY($1::text[])`,
              [accountNums],
            );

            if (orderUsers.length > 0) {
              const profilesWithOrders = toDelete.filter((r) =>
                r.account_num !== null && orderUsers.some((ou) => ou.customer_account_num === r.account_num),
              );
              if (profilesWithOrders.length > 0) {
                try {
                  await deps.onDeletedCustomers(
                    profilesWithOrders.map((r) => ({
                      profile: r.erp_id,
                      accountNum: r.account_num!,
                      name: r.name,
                      affectedAgentIds: orderUsers
                        .filter((ou) => ou.customer_account_num === r.account_num)
                        .map((ou) => ou.user_id),
                    })),
                  );
                } catch (err) {
                  logger.error('onDeletedCustomers callback failed', { err });
                }
              }
            }
          }
        }

        const deleteIds = toDelete.map((r) => r.erp_id);
        const delPlaceholders = deleteIds.map((_, i) => `$${i + 2}`).join(', ');
        const { rowCount } = await pool.query(
          `UPDATE agents.customers SET deleted_at = NOW()
           WHERE user_id = $1 AND erp_id IN (${delPlaceholders}) AND deleted_at IS NULL`,
          [userId, ...deleteIds],
        );
        deletedCustomers = rowCount ?? 0;
      }
    }

    if (deps.onRestoredCustomers) {
      // Combine soft-delete restores with hard-delete restores (customers that had no DB row
      // but reappeared in ERP and have existing orders — i.e. previously orphaned customers).
      let allRestored = [...restored];
      if (newWithAccountNum.length > 0) {
        const newIds = newWithAccountNum.map((c) => c.accountNum);
        const { rows: hasOrders } = await pool.query<{ customer_account_num: string }>(
          `SELECT DISTINCT customer_account_num FROM agents.order_records WHERE customer_account_num = ANY($1::text[])`,
          [newIds],
        );
        const hasOrdersSet = new Set(hasOrders.map((r) => r.customer_account_num));
        allRestored = [...allRestored, ...newWithAccountNum.filter((c) => hasOrdersSet.has(c.accountNum))];
      }

      const restoredIds = allRestored.map((r) => r.accountNum).filter(Boolean);
      if (restoredIds.length > 0) {
        const { rows: orderUsers } = await pool.query<{ user_id: string; customer_account_num: string }>(
          `SELECT DISTINCT o.user_id, o.customer_account_num
           FROM agents.order_records o
           WHERE o.customer_account_num = ANY($1::text[])`,
          [restoredIds],
        );
        const restoredWithAgents: RestoredProfileInfo[] = allRestored
          .filter((r) => r.accountNum)
          .map((r) => ({
            ...r,
            affectedAgentIds: [...new Set([
              userId,
              ...orderUsers.filter((ou) => ou.customer_account_num === r.accountNum).map((ou) => ou.user_id),
            ])],
          }));
        try {
          await deps.onRestoredCustomers(restoredWithAgents);
        } catch (err) {
          logger.error('onRestoredCustomers callback failed', { err });
        }
      }
    }

    onProgress(100, 'Sincronizzazione clienti completata');

    return {
      success: true,
      customersProcessed: parsedCustomers.length,
      newCustomers,
      updatedCustomers,
      deletedCustomers,
      restoredCustomers,
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
        restoredCustomers: 0,
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
      restoredCustomers: 0,
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
    customer.erpId, customer.accountNum, customer.name, customer.vatNumber,
    customer.fiscalCode, customer.phone, customer.email,
    customer.street, customer.postalCode, customer.city,
  ].map((v) => String(v ?? '')).join('|');
  return require('crypto').createHash('sha256').update(data).digest('hex');
}

export { syncCustomers, SyncStoppedError, type CustomerSyncDeps, type CustomerSyncResult, type ParsedCustomer, type DeletedProfileInfo, type RestoredProfileInfo };
