#!/usr/bin/env tsx

import { createPool } from "../db/pool";
import { getUserByUsername, createUser, getAllUsers } from "../db/repositories/users";
import { config } from "../config";
import { logger } from "../logger";

async function seedUsers() {
  logger.info("=== SEED USERS ===");

  const pool = createPool(config.database);

  const testUsers = [{ username: "ikiA0930", fullName: "Francesco Formicola" }];

  try {
    for (const testUser of testUsers) {
      const existing = await getUserByUsername(pool, testUser.username);

      if (existing) {
        logger.info(`User ${testUser.username} already exists, skipping`, {
          userId: existing.id,
        });
        continue;
      }

      const user = await createUser(pool, testUser.username, testUser.fullName);
      logger.info(`Created user: ${user.username}`, {
        userId: user.id,
        whitelisted: user.whitelisted,
      });
    }

    const allUsersList = await getAllUsers(pool);
    logger.info(`\n=== CURRENT USERS (${allUsersList.length} total) ===`);
    allUsersList.forEach((user) => {
      logger.info(`- ${user.username} (${user.fullName})`, {
        id: user.id,
        whitelisted: user.whitelisted,
        createdAt: new Date(user.createdAt).toISOString(),
      });
    });

    logger.info("\nSEED COMPLETED SUCCESSFULLY");
  } catch (error) {
    logger.error("SEED FAILED", { error });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedUsers();
