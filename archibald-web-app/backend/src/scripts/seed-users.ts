#!/usr/bin/env tsx

import { UserDatabase } from "../user-db";
import { logger } from "../logger";

/**
 * Seed initial test users for Phase 6 multi-user authentication
 *
 * Creates test user:
 * - ikiA0930 (whitelisted, admin) - Francesco Formicola - real Archibald credentials
 */
async function seedUsers() {
  logger.info("=== SEED USERS ===");

  const userDb = UserDatabase.getInstance();

  const testUsers = [
    { username: "ikiA0930", fullName: "Francesco Formicola" },
  ];

  try {
    for (const testUser of testUsers) {
      // Check if user already exists
      const existing = userDb.getUserByUsername(testUser.username);

      if (existing) {
        logger.info(`User ${testUser.username} already exists, skipping`, {
          userId: existing.id,
        });
        continue;
      }

      // Create new user
      const user = userDb.createUser(testUser.username, testUser.fullName);
      logger.info(`✅ Created user: ${user.username}`, {
        userId: user.id,
        whitelisted: user.whitelisted,
      });
    }

    // Display all users
    const allUsers = userDb.getAllUsers();
    logger.info(`\n=== CURRENT USERS (${allUsers.length} total) ===`);
    allUsers.forEach((user) => {
      logger.info(`- ${user.username} (${user.fullName})`, {
        id: user.id,
        whitelisted: user.whitelisted,
        createdAt: new Date(user.createdAt).toISOString(),
      });
    });

    logger.info("\n✅ SEED COMPLETED SUCCESSFULLY");
  } catch (error) {
    logger.error("❌ SEED FAILED", { error });
    process.exit(1);
  } finally {
    userDb.close();
  }
}

seedUsers();
