import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Utility: Set user role to admin
 *
 * Usage:
 *   ts-node src/migrations/set-user-admin.ts <username>
 *
 * Example:
 *   ts-node src/migrations/set-user-admin.ts admin
 */
export function setUserAdmin(username: string, dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/users.db");
  const db = new Database(finalPath);

  try {
    logger.info("Setting user as admin", { username, dbPath: finalPath });

    // Check if user exists
    const user = db
      .prepare("SELECT id, username, fullName, role FROM users WHERE username = ?")
      .get(username);

    if (!user) {
      throw new Error(`User not found: ${username}`);
    }

    logger.info("User found", user);

    // Update role to admin
    const result = db
      .prepare("UPDATE users SET role = ? WHERE username = ?")
      .run("admin", username);

    if (result.changes === 0) {
      throw new Error(`Failed to update user: ${username}`);
    }

    logger.info("User role updated to admin", { username });

    // Verify update
    const updatedUser = db
      .prepare("SELECT id, username, fullName, role FROM users WHERE username = ?")
      .get(username);

    logger.info("Verification", updatedUser);

    console.log(`✅ User '${username}' is now an admin`);
  } catch (error) {
    logger.error("Failed to set user as admin", { error, username });
    throw error;
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Usage: ts-node src/migrations/set-user-admin.ts <username>");
    process.exit(1);
  }

  setUserAdmin(username);
}
