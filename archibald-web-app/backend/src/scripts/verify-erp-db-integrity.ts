/**
 * verify-erp-db-integrity.ts
 *
 * Compares ERP ListView records (orders, customers, DDT, invoices) against the DB
 * for a given agent user, and emits a structured integrity report.
 *
 * Usage:
 *   npx tsx src/scripts/verify-erp-db-integrity.ts <userId> [--type=orders|customers|ddt|invoices|all] [--out=path.json]
 *
 * Examples:
 *   npx tsx src/scripts/verify-erp-db-integrity.ts iki-1 --type=orders
 *   npx tsx src/scripts/verify-erp-db-integrity.ts iki-1 --type=all --out=/tmp/integrity.json
 *
 * The script:
 * 1. Connects to PostgreSQL via the standard pool.
 * 2. Acquires a Puppeteer browser via the project browser-pool, logs in as the agent.
 * 3. Scrapes the ERP ListView using the same scraper configs as the production sync.
 * 4. Compares the scraped rows to the DB rows by ERP id (always present, unique per record).
 * 5. Emits a JSON report listing missing/extra/mismatched records and a textual summary.
 *
 * IMPORTANT: read-only — never modifies ERP or DB data.
 */
import { writeFile } from 'node:fs/promises';
import { createPool } from '../db/pool';
import { createBrowserPool } from '../bot/browser-pool';
import { config } from '../config';
import { scrapeListView, type ScrapeProgress } from '../sync/scraper/list-view-scraper';
import { ordersConfig } from '../sync/scraper/configs/orders';
import { customersConfig } from '../sync/scraper/configs/customers';
import { ddtConfig } from '../sync/scraper/configs/ddt';
import { invoicesConfig } from '../sync/scraper/configs/invoices';
import type { ScraperConfig, ScrapedRow } from '../sync/scraper/types';
import type { DbPool } from '../db/pool';
import type { Page } from 'puppeteer';

type SyncType = 'orders' | 'customers' | 'ddt' | 'invoices';
type Verdict = 'OK' | 'WARN' | 'CRITICAL';

type FieldMismatch = {
  id: string;
  field: string;
  erp_value: string;
  db_value: string;
};

type MissingInDb = {
  erp_id: string;
  order_number?: string;
  customer_name?: string;
  key_field?: string;
};

type ExtraInDb = {
  db_id: string;
  order_number?: string;
  reason?: string;
};

type IntegrityReport = {
  timestamp: string;
  syncType: SyncType;
  userId: string;
  erp_count: number;
  db_count: number;
  missing_in_db: MissingInDb[];
  extra_in_db: ExtraInDb[];
  field_mismatches: FieldMismatch[];
  verdict: Verdict;
};

type IntegrityRunReport = {
  timestamp: string;
  userId: string;
  reports: IntegrityReport[];
  overall_verdict: Verdict;
};

type DbOrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  gross_amount: string | null;
  transfer_status: string | null;
};

type DbCustomerRow = {
  erp_id: string;
  name: string | null;
  account_num: string | null;
};

type DbDdtRow = {
  id: string;
  ddt_number: string | null;
  order_number: string | null;
};

type DbInvoiceRow = {
  id: string;
  invoice_number: string | null;
  order_number: string | null;
};

type CliArgs = {
  userId: string;
  type: SyncType | 'all';
  outPath?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const userId = positional[0];
  if (!userId) {
    throw new Error('Usage: verify-erp-db-integrity.ts <userId> [--type=orders|customers|ddt|invoices|all] [--out=path.json]');
  }

  const typeArg = argv.find((a) => a.startsWith('--type='))?.split('=')[1] ?? 'all';
  const outPath = argv.find((a) => a.startsWith('--out='))?.split('=')[1];

  const validTypes: ReadonlyArray<SyncType | 'all'> = ['orders', 'customers', 'ddt', 'invoices', 'all'];
  if (!validTypes.includes(typeArg as SyncType | 'all')) {
    throw new Error(`Invalid --type: ${typeArg}. Valid: ${validTypes.join(', ')}`);
  }

  return { userId, type: typeArg as SyncType | 'all', outPath };
}

async function scrapeFromErp(page: Page, scraperConfig: ScraperConfig, label: string): Promise<ScrapedRow[]> {
  const progressCb = (progress: ScrapeProgress): void => {
    process.stderr.write(`  [${label}] page ${progress.currentPage}: ${progress.totalRowsSoFar} rows\n`);
  };
  const { rows } = await scrapeListView(page, scraperConfig, progressCb, async () => false);
  return rows;
}

function deriveVerdict(report: Pick<IntegrityReport, 'missing_in_db' | 'extra_in_db' | 'field_mismatches'>): Verdict {
  if (report.missing_in_db.length > 0) return 'CRITICAL';
  if (report.extra_in_db.length > 0 || report.field_mismatches.length > 0) return 'WARN';
  return 'OK';
}

async function verifyOrders(pool: DbPool, page: Page, userId: string): Promise<IntegrityReport> {
  const erpRows = await scrapeFromErp(page, ordersConfig, 'orders');
  const { rows: dbRows } = await pool.query<DbOrderRow>(
    `SELECT id, order_number, customer_name, gross_amount, transfer_status
     FROM agents.order_records WHERE user_id = $1`,
    [userId],
  );

  const dbById = new Map(dbRows.map((r) => [r.id, r]));
  const erpById = new Map<string, ScrapedRow>();
  for (const row of erpRows) {
    const erpId = String(row.id ?? '');
    if (erpId) erpById.set(erpId, row);
  }

  const missing_in_db: MissingInDb[] = [];
  for (const [erpId, row] of erpById) {
    if (!dbById.has(erpId)) {
      missing_in_db.push({
        erp_id: erpId,
        order_number: row.orderNumber ? String(row.orderNumber) : undefined,
        customer_name: row.customerName ? String(row.customerName) : undefined,
        key_field: 'id',
      });
    }
  }

  const extra_in_db: ExtraInDb[] = [];
  for (const [dbId, row] of dbById) {
    if (!erpById.has(dbId)) {
      // Skip in-flight pending orders that may not yet appear in the ERP ListView.
      if (row.order_number?.startsWith('PENDING-')) continue;
      extra_in_db.push({
        db_id: dbId,
        order_number: row.order_number ?? undefined,
        reason: 'Not present in ERP ListView (possible soft-delete or stale)',
      });
    }
  }

  const field_mismatches: FieldMismatch[] = [];
  for (const [erpId, erpRow] of erpById) {
    const dbRow = dbById.get(erpId);
    if (!dbRow) continue;
    const erpOrderNum = erpRow.orderNumber != null ? String(erpRow.orderNumber) : '';
    const dbOrderNum = dbRow.order_number ?? '';
    if (erpOrderNum !== dbOrderNum) {
      field_mismatches.push({ id: erpId, field: 'order_number', erp_value: erpOrderNum, db_value: dbOrderNum });
    }
    const erpStatus = erpRow.transferStatus != null ? String(erpRow.transferStatus) : '';
    const dbStatus = dbRow.transfer_status ?? '';
    if (erpStatus !== dbStatus) {
      field_mismatches.push({ id: erpId, field: 'transfer_status', erp_value: erpStatus, db_value: dbStatus });
    }
  }

  const partial = { missing_in_db, extra_in_db, field_mismatches };
  return {
    timestamp: new Date().toISOString(),
    syncType: 'orders',
    userId,
    erp_count: erpRows.length,
    db_count: dbRows.length,
    ...partial,
    verdict: deriveVerdict(partial),
  };
}

async function verifyCustomers(pool: DbPool, page: Page, userId: string): Promise<IntegrityReport> {
  const erpRows = await scrapeFromErp(page, customersConfig, 'customers');
  const { rows: dbRows } = await pool.query<DbCustomerRow>(
    `SELECT erp_id, name, account_num FROM agents.customers
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  const dbById = new Map(dbRows.map((r) => [r.erp_id, r]));
  const erpById = new Map<string, ScrapedRow>();
  for (const row of erpRows) {
    const erpId = String(row.erpId ?? '');
    if (erpId) erpById.set(erpId, row);
  }

  const missing_in_db: MissingInDb[] = [];
  for (const [erpId, row] of erpById) {
    if (!dbById.has(erpId)) {
      missing_in_db.push({
        erp_id: erpId,
        customer_name: row.name ? String(row.name) : undefined,
        key_field: 'erp_id',
      });
    }
  }

  const extra_in_db: ExtraInDb[] = [];
  for (const [dbId, row] of dbById) {
    if (!erpById.has(dbId)) {
      // TEMP customers never appear in ERP — they're locally created drafts.
      if (dbId.startsWith('TEMP-')) continue;
      extra_in_db.push({
        db_id: dbId,
        order_number: row.account_num ?? undefined,
        reason: 'Not present in ERP ListView (possible soft-delete or stale)',
      });
    }
  }

  const partial = { missing_in_db, extra_in_db, field_mismatches: [] };
  return {
    timestamp: new Date().toISOString(),
    syncType: 'customers',
    userId,
    erp_count: erpRows.length,
    db_count: dbRows.length,
    ...partial,
    verdict: deriveVerdict(partial),
  };
}

async function verifyDdt(pool: DbPool, page: Page, userId: string): Promise<IntegrityReport> {
  const erpRows = await scrapeFromErp(page, ddtConfig, 'ddt');
  // DDT records are stored alongside order_records (they share the same row).
  // The presence indicator is `ddt_id IS NOT NULL` on the agent's order_records.
  const { rows: dbRows } = await pool.query<DbDdtRow>(
    `SELECT ddt_id AS id, ddt_number, order_number
     FROM agents.order_records
     WHERE user_id = $1 AND ddt_id IS NOT NULL AND ddt_id <> ''`,
    [userId],
  );

  const dbById = new Map(dbRows.map((r) => [r.id, r]));
  const erpById = new Map<string, ScrapedRow>();
  for (const row of erpRows) {
    const erpId = String(row.ddtId ?? '');
    if (erpId) erpById.set(erpId, row);
  }

  const missing_in_db: MissingInDb[] = [];
  for (const [erpId, row] of erpById) {
    if (!dbById.has(erpId)) {
      missing_in_db.push({
        erp_id: erpId,
        order_number: row.orderNumber ? String(row.orderNumber) : undefined,
        key_field: 'ddt_id',
      });
    }
  }

  const extra_in_db: ExtraInDb[] = [];
  for (const [dbId, row] of dbById) {
    if (!erpById.has(dbId)) {
      extra_in_db.push({
        db_id: dbId,
        order_number: row.order_number ?? undefined,
        reason: 'DDT not present in ERP ListView',
      });
    }
  }

  const partial = { missing_in_db, extra_in_db, field_mismatches: [] };
  return {
    timestamp: new Date().toISOString(),
    syncType: 'ddt',
    userId,
    erp_count: erpRows.length,
    db_count: dbRows.length,
    ...partial,
    verdict: deriveVerdict(partial),
  };
}

async function verifyInvoices(pool: DbPool, page: Page, userId: string): Promise<IntegrityReport> {
  const erpRows = await scrapeFromErp(page, invoicesConfig, 'invoices');
  // Invoice ID is not stored in DB — invoice_number is the lookup key.
  // For consistency with the report contract we expose invoice_number as `id`.
  const { rows: dbRows } = await pool.query<DbInvoiceRow>(
    `SELECT invoice_number AS id, invoice_number, order_number
     FROM agents.order_records
     WHERE user_id = $1 AND invoice_number IS NOT NULL AND invoice_number <> ''`,
    [userId],
  );

  const dbByInvoice = new Map(dbRows.map((r) => [r.id, r]));
  const erpByInvoice = new Map<string, ScrapedRow>();
  for (const row of erpRows) {
    const invNum = row.invoiceNumber != null ? String(row.invoiceNumber) : '';
    if (invNum) erpByInvoice.set(invNum, row);
  }

  const missing_in_db: MissingInDb[] = [];
  for (const [invNum, row] of erpByInvoice) {
    if (!dbByInvoice.has(invNum)) {
      missing_in_db.push({
        erp_id: invNum,
        order_number: row.orderNumber ? String(row.orderNumber) : undefined,
        key_field: 'invoice_number',
      });
    }
  }

  const extra_in_db: ExtraInDb[] = [];
  for (const [dbInv, row] of dbByInvoice) {
    if (!erpByInvoice.has(dbInv)) {
      extra_in_db.push({
        db_id: dbInv,
        order_number: row.order_number ?? undefined,
        reason: 'Invoice not present in ERP ListView',
      });
    }
  }

  const partial = { missing_in_db, extra_in_db, field_mismatches: [] };
  return {
    timestamp: new Date().toISOString(),
    syncType: 'invoices',
    userId,
    erp_count: erpRows.length,
    db_count: dbRows.length,
    ...partial,
    verdict: deriveVerdict(partial),
  };
}

function combineVerdicts(verdicts: ReadonlyArray<Verdict>): Verdict {
  if (verdicts.includes('CRITICAL')) return 'CRITICAL';
  if (verdicts.includes('WARN')) return 'WARN';
  return 'OK';
}

function printSummary(run: IntegrityRunReport): void {
  const lines: string[] = [];
  lines.push('=============================================================');
  lines.push(` ERP↔DB INTEGRITY REPORT  ${run.timestamp}`);
  lines.push(` user: ${run.userId}    overall: ${run.overall_verdict}`);
  lines.push('=============================================================');
  for (const r of run.reports) {
    lines.push('');
    lines.push(`[${r.syncType.toUpperCase()}]  verdict=${r.verdict}    erp=${r.erp_count}  db=${r.db_count}`);
    if (r.missing_in_db.length > 0) {
      lines.push(`  MISSING IN DB (CRITICAL): ${r.missing_in_db.length}`);
      for (const m of r.missing_in_db.slice(0, 10)) {
        const extra = m.order_number ? ` order=${m.order_number}` : '';
        const cust = m.customer_name ? ` cust="${m.customer_name}"` : '';
        lines.push(`    - erp_id=${m.erp_id}${extra}${cust}`);
      }
      if (r.missing_in_db.length > 10) lines.push(`    ... +${r.missing_in_db.length - 10} more`);
    }
    if (r.extra_in_db.length > 0) {
      lines.push(`  EXTRA IN DB: ${r.extra_in_db.length}`);
      for (const e of r.extra_in_db.slice(0, 10)) {
        const extra = e.order_number ? ` ref=${e.order_number}` : '';
        lines.push(`    - db_id=${e.db_id}${extra}  (${e.reason ?? 'no reason'})`);
      }
      if (r.extra_in_db.length > 10) lines.push(`    ... +${r.extra_in_db.length - 10} more`);
    }
    if (r.field_mismatches.length > 0) {
      lines.push(`  FIELD MISMATCHES: ${r.field_mismatches.length}`);
      for (const f of r.field_mismatches.slice(0, 10)) {
        lines.push(`    - id=${f.id} ${f.field}: erp="${f.erp_value}" db="${f.db_value}"`);
      }
      if (r.field_mismatches.length > 10) lines.push(`    ... +${r.field_mismatches.length - 10} more`);
    }
  }
  lines.push('');
  lines.push('=============================================================');
  // Use stderr so stdout can be cleanly piped to JSON consumers if needed.
  process.stderr.write(lines.join('\n') + '\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pool = createPool(config.database);
  const browserPool = createBrowserPool(
    {
      maxBrowsers: config.browserPool.maxBrowsers,
      maxContextsPerBrowser: config.browserPool.maxContextsPerBrowser,
      contextExpiryMs: config.browserPool.contextExpiryMs,
      serviceAccountContextExpiryMs: config.browserPool.serviceAccountContextExpiryMs,
      launchOptions: {
        headless: config.puppeteer.headless,
        slowMo: 0,
        protocolTimeout: config.puppeteer.protocolTimeout,
        args: [...config.puppeteer.args],
        defaultViewport: { width: 1280, height: 800 },
      },
      sessionValidationUrl: config.archibald.url,
      // The login function needs the project's password decryption flow; for now
      // this script must be run inside the prod container (or with env-provided creds)
      // where the bot can use the existing session cookie path.
      loginFn: async () => {
        throw new Error('verify-erp-db-integrity must run inside the backend container with shared session — use existing browser-pool wiring.');
      },
    },
    // Use puppeteer.launch directly — same pattern as main.ts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('puppeteer').launch,
  );

  const ctx = await browserPool.acquireContext(args.userId, { fromQueue: true });
  let success = false;
  try {
    const existingPages = await ctx.pages();
    const page = existingPages[0] ?? await ctx.newPage();

    const types: SyncType[] = args.type === 'all'
      ? ['orders', 'customers', 'ddt', 'invoices']
      : [args.type];

    const reports: IntegrityReport[] = [];
    for (const t of types) {
      process.stderr.write(`\n[verify] running ${t}...\n`);
      switch (t) {
        case 'orders': reports.push(await verifyOrders(pool, page, args.userId)); break;
        case 'customers': reports.push(await verifyCustomers(pool, page, args.userId)); break;
        case 'ddt': reports.push(await verifyDdt(pool, page, args.userId)); break;
        case 'invoices': reports.push(await verifyInvoices(pool, page, args.userId)); break;
      }
    }

    const run: IntegrityRunReport = {
      timestamp: new Date().toISOString(),
      userId: args.userId,
      reports,
      overall_verdict: combineVerdicts(reports.map((r) => r.verdict)),
    };

    printSummary(run);

    const json = JSON.stringify(run, null, 2);
    if (args.outPath) {
      await writeFile(args.outPath, json, 'utf8');
      process.stderr.write(`\n[verify] JSON report written to ${args.outPath}\n`);
    } else {
      process.stdout.write(json + '\n');
    }

    success = true;
    process.exitCode = run.overall_verdict === 'CRITICAL' ? 2 : run.overall_verdict === 'WARN' ? 1 : 0;
  } finally {
    await browserPool.releaseContext(args.userId, ctx, success).catch(() => {});
    await browserPool.shutdown().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`[verify] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(3);
});

export {
  verifyOrders,
  verifyCustomers,
  verifyDdt,
  verifyInvoices,
  deriveVerdict,
  combineVerdicts,
  type IntegrityReport,
  type IntegrityRunReport,
  type SyncType,
  type Verdict,
};
