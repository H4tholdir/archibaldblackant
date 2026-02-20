import crypto from 'crypto';
import type { DbPool } from '../pool';

type UserRole = 'agent' | 'admin';

type User = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  whitelisted: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  lastOrderSyncAt: number | null;
  lastCustomerSyncAt: number | null;
  monthlyTarget: number;
  yearlyTarget: number;
  currency: string;
  targetUpdatedAt: string | null;
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  hideCommissions: boolean;
};

type EncryptedPassword = {
  ciphertext: string;
  iv: string;
  authTag: string;
  version: number;
};

type UserRow = {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  whitelisted: boolean;
  created_at: number;
  last_login_at: number | null;
  last_order_sync_at: number | null;
  last_customer_sync_at: number | null;
  monthly_target: number;
  yearly_target: number;
  currency: string;
  target_updated_at: string | null;
  commission_rate: number;
  bonus_amount: number;
  bonus_interval: number;
  extra_budget_interval: number;
  extra_budget_reward: number;
  monthly_advance: number;
  hide_commissions: boolean;
};

type EncryptedPasswordRow = {
  encrypted_password: string | null;
  encryption_iv: string | null;
  encryption_auth_tag: string | null;
  encryption_version: number;
};

type PrivacySettingsRow = {
  privacy_mode_enabled: boolean;
};

type PrivacySettings = {
  enabled: boolean;
};

type UserTargetRow = {
  monthly_target: number;
  yearly_target: number;
  currency: string;
  target_updated_at: string | null;
  commission_rate: number;
  bonus_amount: number;
  bonus_interval: number;
  extra_budget_interval: number;
  extra_budget_reward: number;
  monthly_advance: number;
  hide_commissions: boolean;
};

type UserTarget = {
  monthlyTarget: number;
  yearlyTarget: number;
  currency: string;
  targetUpdatedAt: string | null;
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  hideCommissions: boolean;
};

const USER_COLUMNS = `
  id, username, full_name, role, whitelisted, created_at,
  last_login_at, last_order_sync_at, last_customer_sync_at,
  monthly_target, yearly_target, currency, target_updated_at,
  commission_rate, bonus_amount, bonus_interval,
  extra_budget_interval, extra_budget_reward, monthly_advance,
  hide_commissions
`;

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    whitelisted: row.whitelisted,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastOrderSyncAt: row.last_order_sync_at,
    lastCustomerSyncAt: row.last_customer_sync_at,
    monthlyTarget: row.monthly_target,
    yearlyTarget: row.yearly_target,
    currency: row.currency,
    targetUpdatedAt: row.target_updated_at,
    commissionRate: row.commission_rate,
    bonusAmount: row.bonus_amount,
    bonusInterval: row.bonus_interval,
    extraBudgetInterval: row.extra_budget_interval,
    extraBudgetReward: row.extra_budget_reward,
    monthlyAdvance: row.monthly_advance,
    hideCommissions: row.hide_commissions,
  };
}

async function createUser(
  pool: DbPool,
  username: string,
  fullName: string,
  role: UserRole = 'agent',
): Promise<User> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  const result = await pool.query<UserRow>(
    `INSERT INTO agents.users (id, username, full_name, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [id, username, fullName, role, createdAt],
  );

  return mapRowToUser(result.rows[0]);
}

async function getUserById(pool: DbPool, id: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM agents.users WHERE id = $1`,
    [id],
  );

  return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
}

async function getUserByUsername(pool: DbPool, username: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM agents.users WHERE username = $1`,
    [username],
  );

  return result.rows.length > 0 ? mapRowToUser(result.rows[0]) : null;
}

async function getAllUsers(pool: DbPool): Promise<User[]> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM agents.users ORDER BY username`,
  );

  return result.rows.map(mapRowToUser);
}

async function getWhitelistedUsers(pool: DbPool): Promise<User[]> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM agents.users WHERE whitelisted = TRUE ORDER BY username`,
  );

  return result.rows.map(mapRowToUser);
}

async function updateWhitelist(pool: DbPool, id: string, whitelisted: boolean): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET whitelisted = $2 WHERE id = $1`,
    [id, whitelisted],
  );
}

async function updateLastLogin(pool: DbPool, id: string): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET last_login_at = $2 WHERE id = $1`,
    [id, Date.now()],
  );
}

async function updateRole(pool: DbPool, id: string, role: UserRole): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET role = $2 WHERE id = $1`,
    [id, role],
  );
}

async function deleteUser(pool: DbPool, id: string): Promise<void> {
  await pool.query(
    `DELETE FROM agents.users WHERE id = $1`,
    [id],
  );
}

async function getUserTarget(pool: DbPool, userId: string): Promise<UserTarget | null> {
  const result = await pool.query<UserTargetRow>(
    `SELECT monthly_target, yearly_target, currency, target_updated_at,
            commission_rate, bonus_amount, bonus_interval,
            extra_budget_interval, extra_budget_reward, monthly_advance,
            hide_commissions
     FROM agents.users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    monthlyTarget: row.monthly_target,
    yearlyTarget: row.yearly_target,
    currency: row.currency,
    targetUpdatedAt: row.target_updated_at,
    commissionRate: row.commission_rate,
    bonusAmount: row.bonus_amount,
    bonusInterval: row.bonus_interval,
    extraBudgetInterval: row.extra_budget_interval,
    extraBudgetReward: row.extra_budget_reward,
    monthlyAdvance: row.monthly_advance,
    hideCommissions: row.hide_commissions,
  };
}

async function updateUserTarget(
  pool: DbPool,
  userId: string,
  yearlyTarget: number,
  currency: string,
  commissionRate: number,
  bonusAmount: number,
  bonusInterval: number,
  extraBudgetInterval: number,
  extraBudgetReward: number,
  monthlyAdvance: number,
  hideCommissions: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE agents.users
     SET yearly_target = $2,
         monthly_target = $2 / 12,
         currency = $3,
         commission_rate = $4,
         bonus_amount = $5,
         bonus_interval = $6,
         extra_budget_interval = $7,
         extra_budget_reward = $8,
         monthly_advance = $9,
         hide_commissions = $10,
         target_updated_at = NOW()
     WHERE id = $1`,
    [userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions],
  );
}

async function updateLastOrderSync(pool: DbPool, userId: string, timestamp: number): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET last_order_sync_at = $2 WHERE id = $1`,
    [userId, timestamp],
  );
}

async function updateLastCustomerSync(pool: DbPool, userId: string, timestamp: number): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET last_customer_sync_at = $2 WHERE id = $1`,
    [userId, timestamp],
  );
}

async function getPrivacySettings(pool: DbPool, userId: string): Promise<PrivacySettings> {
  const result = await pool.query<PrivacySettingsRow>(
    `SELECT privacy_mode_enabled FROM agents.user_privacy_settings WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return { enabled: false };

  return { enabled: result.rows[0].privacy_mode_enabled };
}

async function setPrivacySettings(pool: DbPool, userId: string, enabled: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO agents.user_privacy_settings (user_id, privacy_mode_enabled, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET privacy_mode_enabled = $2, updated_at = NOW()`,
    [userId, enabled],
  );
}

async function saveEncryptedPassword(
  pool: DbPool,
  userId: string,
  encrypted: EncryptedPassword,
): Promise<void> {
  await pool.query(
    `UPDATE agents.users
     SET encrypted_password = $2,
         encryption_iv = $3,
         encryption_auth_tag = $4,
         encryption_version = $5,
         password_updated_at = NOW()
     WHERE id = $1`,
    [userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.version],
  );
}

async function getEncryptedPassword(
  pool: DbPool,
  userId: string,
): Promise<EncryptedPassword | null> {
  const result = await pool.query<EncryptedPasswordRow>(
    `SELECT encrypted_password, encryption_iv, encryption_auth_tag, encryption_version
     FROM agents.users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  if (!row.encrypted_password || !row.encryption_iv || !row.encryption_auth_tag) return null;

  return {
    ciphertext: row.encrypted_password,
    iv: row.encryption_iv,
    authTag: row.encryption_auth_tag,
    version: row.encryption_version,
  };
}

async function clearEncryptedPassword(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.users
     SET encrypted_password = NULL,
         encryption_iv = NULL,
         encryption_auth_tag = NULL,
         password_updated_at = NULL
     WHERE id = $1`,
    [userId],
  );
}

export {
  createUser,
  getUserById,
  getUserByUsername,
  getAllUsers,
  getWhitelistedUsers,
  updateWhitelist,
  updateLastLogin,
  deleteUser,
  getUserTarget,
  updateUserTarget,
  getPrivacySettings,
  setPrivacySettings,
  saveEncryptedPassword,
  getEncryptedPassword,
  type User,
  type UserRole,
  type UserTarget,
  type PrivacySettings,
};
