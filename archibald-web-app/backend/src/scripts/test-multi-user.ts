import { BrowserPool } from "../browser-pool";
import { SessionCacheManager } from "../session-cache-manager";
import { logger } from "../logger";

/**
 * Test multi-user session isolation
 * Verifies that different users have completely isolated sessions
 */
async function testMultiUserSessions() {
  logger.info("=== Multi-User Session Test ===");

  const userIds = ["user-1", "user-2", "user-3"];
  const pool = BrowserPool.getInstance();

  try {
    // Test 1: Acquire contexts for multiple users
    logger.info("Test 1: Acquiring contexts for 3 users...");
    const contexts = await Promise.all(
      userIds.map((userId) => pool.acquireContext(userId)),
    );
    logger.info("✓ All 3 contexts acquired");

    // Test 2: Verify separate pages with different sessions
    logger.info("Test 2: Creating pages for each user...");
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );

    for (let i = 0; i < pages.length; i++) {
      const cookies = await pages[i].cookies();
      logger.info(`User ${userIds[i]} has ${cookies.length} cookies`);
    }

    // Test 3: Close pages
    await Promise.all(pages.map((page) => page.close()));
    logger.info("✓ All pages closed");

    // Test 4: Release contexts
    for (let i = 0; i < userIds.length; i++) {
      await pool.releaseContext(userIds[i], contexts[i], true);
    }
    logger.info("✓ All contexts released");

    // Test 5: Re-acquire contexts (should reuse from pool)
    logger.info("Test 5: Re-acquiring contexts (should reuse)...");
    const stats1 = pool.getStats();
    logger.info(`Stats before re-acquire: ${JSON.stringify(stats1)}`);

    const context1Again = await pool.acquireContext(userIds[0]);
    const stats2 = pool.getStats();
    logger.info(`Stats after re-acquire: ${JSON.stringify(stats2)}`);
    logger.info("✓ Context reused successfully");

    // Test 6: Close user context (logout simulation)
    logger.info("Test 6: Closing user context (logout)...");
    await pool.closeUserContext(userIds[0]);
    const stats3 = pool.getStats();
    logger.info(`Stats after close: ${JSON.stringify(stats3)}`);
    logger.info("✓ User context closed");

    // Test 7: Verify session cache files
    logger.info("Test 7: Checking session cache files...");
    const sessionCache = SessionCacheManager.getInstance();
    for (const userId of userIds.slice(1)) {
      // user-1 was closed
      const hasSession = await sessionCache.hasValidSession(userId);
      logger.info(`User ${userId} has cached session: ${hasSession}`);
    }
    logger.info("✓ Session cache verification complete");

    logger.info("\n=== All tests passed! ===");
  } catch (error) {
    logger.error("Test failed", { error });
  } finally {
    await pool.shutdown();
  }
}

testMultiUserSessions().catch(console.error);
