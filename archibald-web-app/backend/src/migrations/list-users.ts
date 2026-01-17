import Database from "better-sqlite3";
import path from "path";

/**
 * Utility: List all users with their roles
 *
 * Usage:
 *   ts-node src/migrations/list-users.ts
 */
export function listUsers(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/users.db");
  const db = new Database(finalPath);

  try {
    console.log("\n📋 User List\n");

    const users = db
      .prepare(
        `
        SELECT id, username, fullName, role, whitelisted,
               datetime(createdAt/1000, 'unixepoch') as createdAt,
               datetime(lastLoginAt/1000, 'unixepoch') as lastLoginAt
        FROM users
        ORDER BY createdAt DESC
      `,
      )
      .all();

    if (users.length === 0) {
      console.log("No users found.");
      return;
    }

    console.log(`Total users: ${users.length}\n`);

    users.forEach((user: any, index: number) => {
      console.log(`${index + 1}. ${user.username}`);
      console.log(`   Name: ${user.fullName}`);
      console.log(
        `   Role: ${user.role === "admin" ? "🔧 ADMIN" : "👤 Agent"}`,
      );
      console.log(`   Whitelisted: ${user.whitelisted ? "✅" : "❌"}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   Last Login: ${user.lastLoginAt || "Never"}`);
      console.log("");
    });

    // Summary
    const adminCount = users.filter((u: any) => u.role === "admin").length;
    const agentCount = users.filter((u: any) => u.role === "agent").length;

    console.log("📊 Summary:");
    console.log(`   Admins: ${adminCount}`);
    console.log(`   Agents: ${agentCount}`);
    console.log("");
  } catch (error) {
    console.error("❌ Failed to list users:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  listUsers();
}
