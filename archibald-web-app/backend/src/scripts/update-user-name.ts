#!/usr/bin/env tsx

import { UserDatabase } from "../user-db";
import { logger } from "../logger";

async function updateUserName() {
  logger.info("=== UPDATE USER NAME ===");

  const userDb = UserDatabase.getInstance();

  try {
    const user = userDb.getUserByUsername("ikiA0930");

    if (!user) {
      logger.error("User ikiA0930 not found");
      process.exit(1);
    }

    // Update user's fullName in the database
    userDb.db
      .prepare("UPDATE users SET fullName = ? WHERE username = ?")
      .run("Francesco Formicola", "ikiA0930");

    logger.info("✅ User updated successfully", {
      username: "ikiA0930",
      oldName: user.fullName,
      newName: "Francesco Formicola",
    });

    const updatedUser = userDb.getUserByUsername("ikiA0930");
    logger.info("Verified update:", updatedUser);
  } catch (error) {
    logger.error("❌ UPDATE FAILED", { error });
    process.exit(1);
  } finally {
    userDb.close();
  }
}

updateUserName();
