import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { logger } from "./logger";

export type UserRole = 'agent' | 'admin';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  whitelisted: boolean;
  createdAt: number;
  lastLoginAt: number | null;
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

    logger.info("User database schema initialized");
  }

  /**
   * Create a new user
   */
  createUser(username: string, fullName: string, role: UserRole = 'agent'): User {
    const user: User = {
      id: uuidv4(),
      username,
      fullName,
      role,
      whitelisted: true,
      createdAt: Date.now(),
      lastLoginAt: null,
    };

    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, fullName, role, whitelisted, createdAt, lastLoginAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        user.id,
        user.username,
        user.fullName,
        user.role,
        user.whitelisted ? 1 : 0,
        user.createdAt,
        user.lastLoginAt
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
      role: (row.role || 'agent') as UserRole,
      whitelisted: row.whitelisted === 1,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
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
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info("UserDatabase closed");
  }
}
