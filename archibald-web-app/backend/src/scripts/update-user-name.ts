#!/usr/bin/env tsx

import { createPool } from "../db/pool";
import { getUserByUsername } from "../db/repositories/users";
import { config } from "../config";
import { logger } from "../logger";

async function updateUserName() {
  logger.info("=== UPDATE USER NAME ===");

  const pool = createPool(config.database);

  try {
    const user = await getUserByUsername(pool, "ikiA0930");

    if (!user) {
      logger.error("User ikiA0930 not found");
      process.exit(1);
    }

    await pool.query(
      "UPDATE agents.users SET full_name = $1 WHERE username = $2",
      ["Francesco Formicola", "ikiA0930"],
    );

    logger.info("User updated successfully", {
      username: "ikiA0930",
      oldName: user.fullName,
      newName: "Francesco Formicola",
    });

    const updatedUser = await getUserByUsername(pool, "ikiA0930");
    logger.info("Verified update:", updatedUser);
  } catch (error) {
    logger.error("UPDATE FAILED", { error });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateUserName();
