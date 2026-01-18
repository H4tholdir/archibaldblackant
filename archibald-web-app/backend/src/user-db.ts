import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { logger } from "./logger";

export type UserRole = "agent" | "admin";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  whitelisted: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  lastOrderSyncAt?: number | null;
  lastCustomerSyncAt?: number | null;
  monthlyTarget: number;
  yearlyTarget: number;
  currency: string;
  targetUpdatedAt: string | null;
  // Commission configuration
  commissionRate: number;
  bonusAmount: number;
  bonusInterval: number;
  extraBudgetInterval: number;
  extraBudgetReward: number;
  monthlyAdvance: number;
  hideCommissions: boolean;
}

/**
 * User Database Manager
 * Manages user accounts and whitelist for multi-user authentication
 */
export class UserDatabase {
  private db: Database.Database;
  private static instance: UserDatabase;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/users.db");
    this.db = new Database(finalPath);
    this.initSchema();
    logger.info("UserDatabase initialized", { path: finalPath });
  }

  static getInstance(): UserDatabase {
    if (!UserDatabase.instance) {
      UserDatabase.instance = new UserDatabase();
    }
    return UserDatabase.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        fullName TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        whitelisted INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL,
        lastLoginAt INTEGER,
        CONSTRAINT unique_username UNIQUE (username),
        CONSTRAINT valid_role CHECK (role IN ('agent', 'admin'))
      );

      CREATE INDEX IF NOT EXISTS idx_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_whitelisted ON users(whitelisted);
      CREATE INDEX IF NOT EXISTS idx_role ON users(role);
    `);

    // Schema versioning and migration
    const currentVersion = this.db.pragma("user_version", { simple: true }) as number;
    if (currentVersion < 2) {
      // Migrate to version 2: add target fields
      this.db.exec(`
        ALTER TABLE users ADD COLUMN monthlyTarget REAL DEFAULT 0;
        ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'EUR';
        ALTER TABLE users ADD COLUMN targetUpdatedAt TEXT;
        PRAGMA user_version = 2;
      `);
      logger.info("[UserDatabase] Migrated to schema v2 (target fields)");
    }

    if (currentVersion < 3) {
      // Migrate to version 3: add commission configuration fields
      this.db.exec(`
        ALTER TABLE users ADD COLUMN yearlyTarget REAL DEFAULT 0;
        ALTER TABLE users ADD COLUMN commissionRate REAL DEFAULT 0.18;
        ALTER TABLE users ADD COLUMN bonusAmount REAL DEFAULT 5000;
        ALTER TABLE users ADD COLUMN bonusInterval REAL DEFAULT 75000;
        ALTER TABLE users ADD COLUMN extraBudgetInterval REAL DEFAULT 50000;
        ALTER TABLE users ADD COLUMN extraBudgetReward REAL DEFAULT 6000;
        ALTER TABLE users ADD COLUMN monthlyAdvance REAL DEFAULT 3500;
        ALTER TABLE users ADD COLUMN hideCommissions INTEGER DEFAULT 0;
        PRAGMA user_version = 3;
      `);
      logger.info("[UserDatabase] Migrated to schema v3 (commission fields)");
    }

    logger.info("User database schema initialized");
  }

  /**
   * Create a new user
   */
  createUser(
    username: string,
    fullName: string,
    role: UserRole = "agent",
  ): User {
    const user: User = {
      id: uuidv4(),
      username,
      fullName,
      role,
      whitelisted: true,
      createdAt: Date.now(),
      lastLoginAt: null,
      monthlyTarget: 0,
      yearlyTarget: 0,
      currency: "EUR",
      targetUpdatedAt: null,
      commissionRate: 0.18,
      bonusAmount: 5000,
      bonusInterval: 75000,
      extraBudgetInterval: 50000,
      extraBudgetReward: 6000,
      monthlyAdvance: 3500,
      hideCommissions: false,
    };

    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (
          id, username, fullName, role, whitelisted, createdAt, lastLoginAt,
          monthlyTarget, yearlyTarget, currency, targetUpdatedAt,
          commissionRate, bonusAmount, bonusInterval,
          extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        user.id,
        user.username,
        user.fullName,
        user.role,
        user.whitelisted ? 1 : 0,
        user.createdAt,
        user.lastLoginAt,
        user.monthlyTarget,
        user.yearlyTarget,
        user.currency,
        user.targetUpdatedAt,
        user.commissionRate,
        user.bonusAmount,
        user.bonusInterval,
        user.extraBudgetInterval,
        user.extraBudgetReward,
        user.monthlyAdvance,
        user.hideCommissions ? 1 : 0,
      );

      logger.info("User created", {
        userId: user.id,
        username: user.username,
      });

      return user;
    } catch (error) {
      logger.error("Error creating user", {
        username,
        error,
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  getUserById(id: string): User | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `);

      const row = stmt.get(id) as any;

      if (!row) {
        return null;
      }

      return this.rowToUser(row);
    } catch (error) {
      logger.error("Error getting user by ID", { id, error });
      throw error;
    }
  }

  /**
   * Get user by username
   */
  getUserByUsername(username: string): User | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users WHERE username = ?
      `);

      const row = stmt.get(username) as any;

      if (!row) {
        return null;
      }

      return this.rowToUser(row);
    } catch (error) {
      logger.error("Error getting user by username", { username, error });
      throw error;
    }
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users ORDER BY createdAt DESC
      `);

      const rows = stmt.all() as any[];

      return rows.map((row) => this.rowToUser(row));
    } catch (error) {
      logger.error("Error getting all users", { error });
      throw error;
    }
  }

  /**
   * Get only whitelisted users
   */
  getWhitelistedUsers(): User[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM users WHERE whitelisted = 1 ORDER BY username
      `);

      const rows = stmt.all() as any[];

      return rows.map((row) => this.rowToUser(row));
    } catch (error) {
      logger.error("Error getting whitelisted users", { error });
      throw error;
    }
  }

  /**
   * Update user's whitelist status
   */
  updateWhitelist(id: string, whitelisted: boolean): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE users SET whitelisted = ? WHERE id = ?
      `);

      const result = stmt.run(whitelisted ? 1 : 0, id);

      if (result.changes === 0) {
        throw new Error(`User not found: ${id}`);
      }

      logger.info("User whitelist updated", {
        userId: id,
        whitelisted,
      });
    } catch (error) {
      logger.error("Error updating user whitelist", { id, whitelisted, error });
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   */
  updateLastLogin(id: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE users SET lastLoginAt = ? WHERE id = ?
      `);

      const result = stmt.run(Date.now(), id);

      if (result.changes === 0) {
        throw new Error(`User not found: ${id}`);
      }

      logger.debug("User lastLoginAt updated", { userId: id });
    } catch (error) {
      logger.error("Error updating user lastLoginAt", { id, error });
      throw error;
    }
  }

  /**
   * Delete user
   */
  deleteUser(id: string): void {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM users WHERE id = ?
      `);

      const result = stmt.run(id);

      if (result.changes === 0) {
        throw new Error(`User not found: ${id}`);
      }

      logger.info("User deleted", { userId: id });
    } catch (error) {
      logger.error("Error deleting user", { id, error });
      throw error;
    }
  }

  /**
   * Convert database row to User object
   */
  private rowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: (row.role || "agent") as UserRole,
      whitelisted: row.whitelisted === 1,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      lastOrderSyncAt: row.lastOrderSyncAt || null,
      lastCustomerSyncAt: row.lastCustomerSyncAt || null,
      monthlyTarget: row.monthlyTarget || 0,
      yearlyTarget: row.yearlyTarget || 0,
      currency: row.currency || "EUR",
      targetUpdatedAt: row.targetUpdatedAt || null,
      commissionRate: row.commissionRate || 0.18,
      bonusAmount: row.bonusAmount || 5000,
      bonusInterval: row.bonusInterval || 75000,
      extraBudgetInterval: row.extraBudgetInterval || 50000,
      extraBudgetReward: row.extraBudgetReward || 6000,
      monthlyAdvance: row.monthlyAdvance || 3500,
      hideCommissions: row.hideCommissions === 1,
    };
  }

  /**
   * Update user's role
   */
  updateRole(id: string, role: UserRole): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE users SET role = ? WHERE id = ?
      `);

      const result = stmt.run(role, id);

      if (result.changes === 0) {
        throw new Error(`User not found: ${id}`);
      }

      logger.info("User role updated", {
        userId: id,
        role,
      });
    } catch (error) {
      logger.error("Error updating user role", { id, role, error });
      throw error;
    }
  }

  /**
   * Update last order sync timestamp for user
   */
  updateLastOrderSync(userId: string, timestamp: number): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET lastOrderSyncAt = ?
        WHERE id = ?
      `);

      stmt.run(timestamp, userId);

      logger.info("User lastOrderSyncAt updated", {
        userId,
        timestamp: new Date(timestamp).toISOString(),
      });
    } catch (error) {
      logger.error("Error updating lastOrderSyncAt", { userId, error });
      throw error;
    }
  }

  /**
   * Update user's lastCustomerSyncAt timestamp
   */
  updateLastCustomerSync(userId: string, timestamp: number): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE users
        SET lastCustomerSyncAt = ?
        WHERE id = ?
      `);

      stmt.run(timestamp, userId);

      logger.info("User lastCustomerSyncAt updated", {
        userId,
        timestamp: new Date(timestamp).toISOString(),
      });
    } catch (error) {
      logger.error("Error updating lastCustomerSyncAt", { userId, error });
      throw error;
    }
  }

  /**
   * Get user's target and commission config
   */
  getUserTarget(userId: string): {
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
  } | null {
    const user = this.getUserById(userId);
    if (!user) return null;
    return {
      monthlyTarget: user.monthlyTarget,
      yearlyTarget: user.yearlyTarget,
      currency: user.currency,
      targetUpdatedAt: user.targetUpdatedAt,
      commissionRate: user.commissionRate,
      bonusAmount: user.bonusAmount,
      bonusInterval: user.bonusInterval,
      extraBudgetInterval: user.extraBudgetInterval,
      extraBudgetReward: user.extraBudgetReward,
      monthlyAdvance: user.monthlyAdvance,
      hideCommissions: user.hideCommissions,
    };
  }

  /**
   * Update user's target and commission config
   */
  updateUserTarget(
    userId: string,
    yearlyTarget: number,
    currency: string,
    commissionRate: number,
    bonusAmount: number,
    bonusInterval: number,
    extraBudgetInterval: number,
    extraBudgetReward: number,
    monthlyAdvance: number,
    hideCommissions: boolean
  ): boolean {
    const monthlyTarget = Math.round(yearlyTarget / 12);
    const stmt = this.db.prepare(`
      UPDATE users
      SET
        monthlyTarget = ?,
        yearlyTarget = ?,
        currency = ?,
        targetUpdatedAt = ?,
        commissionRate = ?,
        bonusAmount = ?,
        bonusInterval = ?,
        extraBudgetInterval = ?,
        extraBudgetReward = ?,
        monthlyAdvance = ?,
        hideCommissions = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    const result = stmt.run(
      monthlyTarget,
      yearlyTarget,
      currency,
      now,
      commissionRate,
      bonusAmount,
      bonusInterval,
      extraBudgetInterval,
      extraBudgetReward,
      monthlyAdvance,
      hideCommissions ? 1 : 0,
      userId
    );
    return result.changes > 0;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info("UserDatabase closed");
  }
}
