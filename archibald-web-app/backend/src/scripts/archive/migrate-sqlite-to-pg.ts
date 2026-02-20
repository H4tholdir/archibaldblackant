import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';

type MigrationStats = {
  table: string;
  sqliteCount: number;
  pgCount: number;
  duration: number;
};

const DATA_DIR = path.join(__dirname, '../../data');

const SQLITE_DATABASES = {
  orders: path.join(DATA_DIR, 'orders-new.db'),
  customers: path.join(DATA_DIR, 'customers.db'),
  users: path.join(DATA_DIR, 'users.db'),
  products: path.join(DATA_DIR, 'products.db'),
  prices: path.join(DATA_DIR, 'prices.db'),
};

function openSqlite(dbPath: string): Database.Database {
  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL');
  return db;
}

function boolToSql(val: unknown): boolean | null {
  if (val === null || val === undefined) return null;
  if (val === 1 || val === true || val === '1') return true;
  return false;
}

function timestampToIso(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (val > 1e12) return new Date(val).toISOString();
    return new Date(val * 1000).toISOString();
  }
  if (typeof val === 'string') return val;
  return null;
}

async function migrateTable<T extends Record<string, unknown>>(
  pool: Pool,
  sqliteDb: Database.Database,
  sqliteTable: string,
  pgTable: string,
  columns: string[],
  transform: (row: T) => unknown[],
): Promise<MigrationStats> {
  const start = Date.now();

  const rows = sqliteDb.prepare(`SELECT * FROM ${sqliteTable}`).all() as T[];
  const sqliteCount = rows.length;

  if (sqliteCount === 0) {
    console.log(`  ⏭️  ${pgTable}: 0 rows, skipping`);
    return { table: pgTable, sqliteCount: 0, pgCount: 0, duration: Date.now() - start };
  }

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO ${pgTable} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const values = transform(row);
        await client.query(insertSql, values);
        inserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (i % 2000 === 0 && i > 0) {
      console.log(`  📦 ${pgTable}: ${i}/${sqliteCount} rows migrated...`);
    }
  }

  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) as count FROM ${pgTable}`);
  const pgCount = parseInt(count, 10);

  const duration = Date.now() - start;
  console.log(`  ✅ ${pgTable}: ${sqliteCount} SQLite → ${pgCount} PG (${duration}ms)`);

  return { table: pgTable, sqliteCount, pgCount, duration };
}

async function migrateUsers(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.users);
  try {
    return await migrateTable(
      pool, db, 'users', 'agents.users',
      [
        'id', 'username', 'full_name', 'role', 'whitelisted', 'created_at',
        'last_login_at', 'last_order_sync_at', 'last_customer_sync_at',
        'monthly_target', 'yearly_target', 'currency', 'target_updated_at',
        'commission_rate', 'bonus_amount', 'bonus_interval',
        'extra_budget_interval', 'extra_budget_reward', 'monthly_advance',
        'hide_commissions', 'encrypted_password', 'encryption_iv',
        'encryption_auth_tag', 'encryption_version', 'password_updated_at',
      ],
      (row: any) => [
        row.id, row.username, row.fullName, row.role || 'agent',
        boolToSql(row.whitelisted), row.createdAt,
        row.lastLoginAt, row.lastOrderSyncAt || null, row.lastCustomerSyncAt || null,
        row.monthlyTarget || 0, row.yearlyTarget || 0, row.currency || 'EUR',
        row.targetUpdatedAt || null,
        row.commissionRate || 0.18, row.bonusAmount || 5000, row.bonusInterval || 75000,
        row.extraBudgetInterval || 50000, row.extraBudgetReward || 6000,
        row.monthlyAdvance || 3500, boolToSql(row.hideCommissions),
        row.encrypted_password || null, row.encryption_iv || null,
        row.encryption_auth_tag || null, row.encryption_version || null,
        row.password_updated_at || null,
      ],
    );
  } finally {
    db.close();
  }
}

async function migrateDevices(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.users);
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_devices'").get();
    if (!hasTable) {
      console.log('  ⏭️  agents.user_devices: table not found in SQLite, skipping');
      return { table: 'agents.user_devices', sqliteCount: 0, pgCount: 0, duration: 0 };
    }
    return await migrateTable(
      pool, db, 'user_devices', 'agents.user_devices',
      ['id', 'user_id', 'device_identifier', 'platform', 'device_name', 'last_seen', 'created_at'],
      (row: any) => [
        row.id, row.user_id, row.device_identifier, row.platform,
        row.device_name, row.last_seen, row.created_at,
      ],
    );
  } finally {
    db.close();
  }
}

async function migrateCustomers(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.customers);
  const users = openSqlite(SQLITE_DATABASES.users);
  try {
    const allUsers = users.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    const defaultUserId = allUsers[0]?.id || 'default-agent';

    return await migrateTable(
      pool, db, 'customers', 'agents.customers',
      [
        'customer_profile', 'user_id', 'internal_id', 'name', 'vat_number', 'fiscal_code',
        'sdi', 'pec', 'phone', 'mobile', 'email', 'url', 'attention_to',
        'street', 'logistics_address', 'postal_code', 'city',
        'customer_type', 'type', 'delivery_terms', 'description',
        'last_order_date', 'actual_order_count', 'actual_sales',
        'previous_order_count_1', 'previous_sales_1',
        'previous_order_count_2', 'previous_sales_2',
        'external_account_number', 'our_account_number',
        'hash', 'last_sync', 'bot_status', 'archibald_name', 'photo',
      ],
      (row: any) => [
        row.customerProfile, defaultUserId, row.internalId || null, row.name,
        row.vatNumber || null, row.fiscalCode || null, row.sdi || null, row.pec || null,
        row.phone || null, row.mobile || null, row.email || null, row.url || null,
        row.attentionTo || null, row.street || null, row.logisticsAddress || null,
        row.postalCode || null, row.city || null, row.customerType || null,
        row.type || null, row.deliveryTerms || null, row.description || null,
        row.lastOrderDate || null, row.actualOrderCount || 0, row.actualSales || 0,
        row.previousOrderCount1 || 0, row.previousSales1 || 0,
        row.previousOrderCount2 || 0, row.previousSales2 || 0,
        row.externalAccountNumber || null, row.ourAccountNumber || null,
        row.hash, row.lastSync, row.botStatus || 'placed',
        row.archibaldName || null, row.photo || null,
      ],
    );
  } finally {
    db.close();
    users.close();
  }
}

async function migrateOrders(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.orders);
  try {
    return await migrateTable(
      pool, db, 'orders', 'agents.order_records',
      [
        'id', 'user_id', 'order_number', 'customer_profile_id', 'customer_name',
        'delivery_name', 'delivery_address', 'creation_date', 'delivery_date',
        'remaining_sales_financial', 'customer_reference', 'sales_status',
        'order_type', 'document_status', 'sales_origin', 'transfer_status',
        'transfer_date', 'completion_date', 'discount_percent', 'gross_amount',
        'total_amount', 'is_quote', 'is_gift_order', 'hash', 'last_sync', 'created_at',
        'ddt_number', 'ddt_delivery_date', 'ddt_id', 'ddt_customer_account',
        'ddt_sales_name', 'ddt_delivery_name', 'delivery_terms', 'delivery_method',
        'delivery_city', 'attention_to', 'ddt_delivery_address', 'ddt_total',
        'ddt_customer_reference', 'ddt_description',
        'tracking_number', 'tracking_url', 'tracking_courier', 'delivery_completed_date',
        'invoice_number', 'invoice_date', 'invoice_amount', 'invoice_customer_account',
        'invoice_billing_name', 'invoice_quantity', 'invoice_remaining_amount',
        'invoice_tax_amount', 'invoice_line_discount', 'invoice_total_discount',
        'invoice_due_date', 'invoice_payment_terms_id', 'invoice_purchase_order',
        'invoice_closed', 'invoice_days_past_due', 'invoice_settled_amount',
        'invoice_last_payment_id', 'invoice_last_settlement_date', 'invoice_closed_date',
        'current_state', 'sent_to_milano_at', 'archibald_order_id',
        'total_vat_amount', 'total_with_vat', 'articles_synced_at',
      ],
      (row: any) => [
        row.id, row.user_id, row.order_number, row.customer_profile_id, row.customer_name,
        row.delivery_name, row.delivery_address, row.creation_date, row.delivery_date,
        row.remaining_sales_financial, row.customer_reference, row.sales_status,
        row.order_type, row.document_status, row.sales_origin, row.transfer_status,
        row.transfer_date, row.completion_date, row.discount_percent, row.gross_amount,
        row.total_amount, row.is_quote, row.is_gift_order, row.hash, row.last_sync,
        row.created_at || new Date().toISOString(),
        row.ddt_number, row.ddt_delivery_date, row.ddt_id, row.ddt_customer_account,
        row.ddt_sales_name, row.ddt_delivery_name, row.delivery_terms, row.delivery_method,
        row.delivery_city, row.attention_to, row.ddt_delivery_address, row.ddt_total,
        row.ddt_customer_reference, row.ddt_description,
        row.tracking_number, row.tracking_url, row.tracking_courier, row.delivery_completed_date,
        row.invoice_number, row.invoice_date, row.invoice_amount, row.invoice_customer_account,
        row.invoice_billing_name, row.invoice_quantity, row.invoice_remaining_amount,
        row.invoice_tax_amount, row.invoice_line_discount, row.invoice_total_discount,
        row.invoice_due_date, row.invoice_payment_terms_id, row.invoice_purchase_order,
        boolToSql(row.invoice_closed), row.invoice_days_past_due, row.invoice_settled_amount,
        row.invoice_last_payment_id, row.invoice_last_settlement_date, row.invoice_closed_date,
        row.current_state, row.sent_to_milano_at, row.archibald_order_id,
        row.total_vat_amount, row.total_with_vat, row.articles_synced_at,
      ],
    );
  } finally {
    db.close();
  }
}

async function migrateOrderArticles(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.orders);
  try {
    return await migrateTable(
      pool, db, 'order_articles', 'agents.order_articles',
      [
        'order_id', 'user_id', 'article_code', 'article_description', 'quantity',
        'unit_price', 'discount_percent', 'line_amount',
        'vat_percent', 'vat_amount', 'line_total_with_vat',
        'warehouse_quantity', 'warehouse_sources_json', 'created_at',
      ],
      (row: any) => {
        const orderRow = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(row.order_id) as any;
        return [
          row.order_id, orderRow?.user_id || 'unknown',
          row.article_code, row.article_description, row.quantity,
          row.unit_price, row.discount_percent, row.line_amount,
          row.vat_percent, row.vat_amount, row.line_total_with_vat,
          row.warehouse_quantity, row.warehouse_sources_json,
          row.created_at || new Date().toISOString(),
        ];
      },
    );
  } finally {
    db.close();
  }
}

async function migrateOrderStateHistory(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.orders);
  try {
    return await migrateTable(
      pool, db, 'order_state_history', 'agents.order_state_history',
      [
        'order_id', 'user_id', 'old_state', 'new_state', 'actor', 'notes',
        'confidence', 'source', 'timestamp', 'created_at',
      ],
      (row: any) => {
        const orderRow = db.prepare('SELECT user_id FROM orders WHERE order_number = ?').get(row.order_id) as any;
        return [
          row.order_id, orderRow?.user_id || 'unknown',
          row.old_state, row.new_state, row.actor, row.notes,
          row.confidence, row.source, row.timestamp, row.created_at,
        ];
      },
    );
  } finally {
    db.close();
  }
}

async function migrateProducts(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.products);
  try {
    return await migrateTable(
      pool, db, 'products', 'shared.products',
      [
        'id', 'name', 'description', 'group_code', 'search_name',
        'price_unit', 'product_group_id', 'product_group_description',
        'package_content', 'min_qty', 'multiple_qty', 'max_qty', 'price',
        'price_source', 'price_updated_at', 'vat', 'vat_source', 'vat_updated_at',
        'hash', 'last_sync',
      ],
      (row: any) => [
        row.id, row.name, row.description, row.groupCode, row.searchName,
        row.priceUnit, row.productGroupId, row.productGroupDescription,
        row.packageContent, row.minQty, row.multipleQty, row.maxQty, row.price,
        row.priceSource || null,
        row.priceUpdatedAt ? timestampToIso(row.priceUpdatedAt) : null,
        row.vat || null, row.vatSource || null,
        row.vatUpdatedAt ? timestampToIso(row.vatUpdatedAt) : null,
        row.hash, row.lastSync,
      ],
    );
  } finally {
    db.close();
  }
}

async function migratePrices(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.prices);
  try {
    return await migrateTable(
      pool, db, 'prices', 'shared.prices',
      [
        'product_id', 'product_name', 'unit_price', 'item_selection',
        'packaging_description', 'currency', 'price_valid_from', 'price_valid_to',
        'price_unit', 'account_description', 'account_code',
        'price_qty_from', 'price_qty_to', 'last_modified', 'data_area_id',
        'hash', 'last_sync',
      ],
      (row: any) => [
        row.productId, row.productName, row.unitPrice, row.itemSelection,
        row.packagingDescription, row.currency, row.priceValidFrom, row.priceValidTo,
        row.priceUnit, row.accountDescription, row.accountCode,
        row.priceQtyFrom, row.priceQtyTo, row.lastModified, row.dataAreaId,
        row.hash, row.lastSync,
      ],
    );
  } finally {
    db.close();
  }
}

async function migratePendingOrders(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.orders);
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_orders'").get();
    if (!hasTable) {
      console.log('  ⏭️  agents.pending_orders: table not found in SQLite, skipping');
      return { table: 'agents.pending_orders', sqliteCount: 0, pgCount: 0, duration: 0 };
    }
    return await migrateTable(
      pool, db, 'pending_orders', 'agents.pending_orders',
      [
        'id', 'user_id', 'customer_id', 'customer_name', 'items_json',
        'status', 'discount_percent', 'target_total_with_vat', 'retry_count',
        'error_message', 'created_at', 'updated_at', 'device_id',
        'origin_draft_id', 'synced_to_archibald',
        'shipping_cost', 'shipping_tax',
        'sub_client_codice', 'sub_client_name', 'sub_client_data_json',
      ],
      (row: any) => [
        row.id, row.user_id, row.customer_id, row.customer_name,
        row.items_json, row.status, row.discount_percent, row.target_total_with_vat,
        row.retry_count, row.error_message, row.created_at, row.updated_at,
        row.device_id, row.origin_draft_id, boolToSql(row.synced_to_archibald),
        row.shipping_cost || 0, row.shipping_tax || 0,
        row.sub_client_codice || null, row.sub_client_name || null,
        row.sub_client_data_json || null,
      ],
    );
  } finally {
    db.close();
  }
}

async function migrateFresisHistory(pool: Pool): Promise<MigrationStats> {
  const db = openSqlite(SQLITE_DATABASES.users);
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fresis_history'").get();
    if (!hasTable) {
      console.log('  ⏭️  agents.fresis_history: table not found in SQLite, skipping');
      return { table: 'agents.fresis_history', sqliteCount: 0, pgCount: 0, duration: 0 };
    }
    return await migrateTable(
      pool, db, 'fresis_history', 'agents.fresis_history',
      [
        'id', 'user_id', 'original_pending_order_id', 'sub_client_codice',
        'sub_client_name', 'sub_client_data', 'customer_id', 'customer_name',
        'items', 'discount_percent', 'target_total_with_vat',
        'shipping_cost', 'shipping_tax', 'merged_into_order_id', 'merged_at',
        'created_at', 'updated_at', 'notes',
        'archibald_order_id', 'archibald_order_number', 'current_state',
        'state_updated_at', 'ddt_number', 'ddt_delivery_date',
        'tracking_number', 'tracking_url', 'tracking_courier',
        'delivery_completed_date', 'invoice_number', 'invoice_date',
        'invoice_amount', 'source', 'revenue',
        'invoice_closed', 'invoice_remaining_amount', 'invoice_due_date',
        'arca_data', 'parent_customer_name',
      ],
      (row: any) => [
        row.id, row.user_id, row.original_pending_order_id, row.sub_client_codice,
        row.sub_client_name,
        row.sub_client_data ? JSON.parse(row.sub_client_data) : null,
        row.customer_id, row.customer_name,
        row.items ? JSON.parse(row.items) : '[]',
        row.discount_percent, row.target_total_with_vat,
        row.shipping_cost, row.shipping_tax, row.merged_into_order_id, row.merged_at,
        row.created_at, row.updated_at, row.notes,
        row.archibald_order_id, row.archibald_order_number, row.current_state,
        row.state_updated_at, row.ddt_number, row.ddt_delivery_date,
        row.tracking_number, row.tracking_url, row.tracking_courier,
        row.delivery_completed_date, row.invoice_number, row.invoice_date,
        row.invoice_amount, row.source || 'app', row.revenue,
        boolToSql(row.invoice_closed), row.invoice_remaining_amount, row.invoice_due_date,
        row.arca_data ? JSON.parse(row.arca_data) : null,
        row.parent_customer_name,
      ],
    );
  } finally {
    db.close();
  }
}

async function migrateWarehouse(pool: Pool): Promise<{ boxes: MigrationStats; items: MigrationStats }> {
  const db = openSqlite(SQLITE_DATABASES.users);
  try {
    const hasBoxes = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='warehouse_boxes'").get();
    const hasItems = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='warehouse_items'").get();

    const boxes: MigrationStats = hasBoxes
      ? await migrateTable(
          pool, db, 'warehouse_boxes', 'agents.warehouse_boxes',
          ['user_id', 'name', 'description', 'color', 'created_at', 'updated_at'],
          (row: any) => [
            row.user_id, row.name, row.description || null, row.color || null,
            row.created_at, row.updated_at,
          ],
        )
      : { table: 'agents.warehouse_boxes', sqliteCount: 0, pgCount: 0, duration: 0 };

    const items: MigrationStats = hasItems
      ? await migrateTable(
          pool, db, 'warehouse_items', 'agents.warehouse_items',
          [
            'user_id', 'article_code', 'description', 'quantity', 'box_name',
            'reserved_for_order', 'sold_in_order', 'uploaded_at', 'device_id',
            'customer_name', 'sub_client_name', 'order_date', 'order_number',
          ],
          (row: any) => [
            row.user_id, row.article_code, row.description, row.quantity, row.box_name,
            row.reserved_for_order, row.sold_in_order, row.uploaded_at, row.device_id,
            row.customer_name, row.sub_client_name, row.order_date, row.order_number,
          ],
        )
      : { table: 'agents.warehouse_items', sqliteCount: 0, pgCount: 0, duration: 0 };

    return { boxes, items };
  } finally {
    db.close();
  }
}

async function main() {
  const pgHost = process.env.PG_HOST || 'localhost';
  const pgPort = parseInt(process.env.PG_PORT || '5432', 10);
  const pgDatabase = process.env.PG_DATABASE || 'archibald';
  const pgUser = process.env.PG_USER || 'archibald';
  const pgPassword = process.env.PG_PASSWORD || '';

  console.log(`\n🚀 SQLite → PostgreSQL Migration`);
  console.log(`   PG: ${pgUser}@${pgHost}:${pgPort}/${pgDatabase}`);
  console.log(`   Data dir: ${DATA_DIR}\n`);

  const pool = new Pool({
    host: pgHost,
    port: pgPort,
    database: pgDatabase,
    user: pgUser,
    password: pgPassword,
    max: 10,
  });

  const allStats: MigrationStats[] = [];

  try {
    console.log('📋 Phase 1: Users & Devices');
    allStats.push(await migrateUsers(pool));
    allStats.push(await migrateDevices(pool));

    console.log('\n📋 Phase 2: Customers');
    allStats.push(await migrateCustomers(pool));

    console.log('\n📋 Phase 3: Orders & Related');
    allStats.push(await migrateOrders(pool));
    allStats.push(await migrateOrderArticles(pool));
    allStats.push(await migrateOrderStateHistory(pool));
    allStats.push(await migratePendingOrders(pool));

    console.log('\n📋 Phase 4: Products & Prices');
    allStats.push(await migrateProducts(pool));
    allStats.push(await migratePrices(pool));

    console.log('\n📋 Phase 5: Fresis & Warehouse');
    allStats.push(await migrateFresisHistory(pool));
    const wh = await migrateWarehouse(pool);
    allStats.push(wh.boxes);
    allStats.push(wh.items);

    console.log('\n\n📊 Migration Summary:');
    console.log('─'.repeat(60));
    console.log(
      `${'Table'.padEnd(35)} ${'SQLite'.padStart(8)} ${'PG'.padStart(8)} ${'Time'.padStart(8)}`,
    );
    console.log('─'.repeat(60));

    let totalSqlite = 0;
    let totalPg = 0;

    for (const stat of allStats) {
      totalSqlite += stat.sqliteCount;
      totalPg += stat.pgCount;
      console.log(
        `${stat.table.padEnd(35)} ${String(stat.sqliteCount).padStart(8)} ${String(stat.pgCount).padStart(8)} ${(stat.duration + 'ms').padStart(8)}`,
      );
    }

    console.log('─'.repeat(60));
    console.log(
      `${'TOTAL'.padEnd(35)} ${String(totalSqlite).padStart(8)} ${String(totalPg).padStart(8)}`,
    );

    if (totalSqlite === totalPg) {
      console.log('\n✅ All rows migrated successfully!');
    } else {
      console.log(`\n⚠️  Row count mismatch: ${totalSqlite} SQLite → ${totalPg} PG (delta: ${totalPg - totalSqlite})`);
      console.log('   This may be due to ON CONFLICT DO NOTHING on duplicates.');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
