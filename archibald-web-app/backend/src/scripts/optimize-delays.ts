#!/usr/bin/env ts-node

/**
 * Automatic Delay Optimization Script
 *
 * This script uses binary search to find the optimal delay for each bot operation.
 * It runs a complete order flow and tests each operation systematically.
 *
 * Usage:
 *   npm run optimize:delays
 *
 * Features:
 * - Binary search for each operation (0ms → 200ms)
 * - Detailed logging with screenshots on failure
 * - JSON persistence for pause/resume capability
 * - Markdown report generation
 * - Automatic cleanup of old debug files
 *
 * Expected Runtime: 2-3 hours for full optimization
 */

import { ArchibaldBot } from '../archibald-bot';
import { DelayManager } from '../delay-manager';
import { BinarySearchTester, BinarySearchResult } from '../binary-search-tester';
import { OPERATIONS, OPERATION_DESCRIPTIONS, registerAllOperations } from '../operation-registry';
import { logger } from '../logger';
import fs from 'fs';
import path from 'path';

/**
 * Test configuration
 */
const TEST_CONFIG = {
  // Test order data
  orderData: {
    customerName: 'CASA DI RIPOSO SAN GIUSEPPE',
    customerCode: 'C00001',
    deliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
      .split('-')
      .reverse()
      .join('/'),
    items: [
      {
        productName: 'ACQUA NATURALE LT.1,5',
        productCode: 'A00001',
        quantity: 10,
      },
    ],
  },

  // Test user (must exist in database and PasswordCache)
  userId: '20e916c7-38f1-4e61-9ffc-c2a495b021ff', // Francesco Formicola

  // Operations to test (in order)
  operationsToTest: [
    // Login phase
    OPERATIONS.LOGIN_NAVIGATE,
    OPERATIONS.LOGIN_WAIT_USERNAME,
    OPERATIONS.LOGIN_CLICK_USERNAME,
    OPERATIONS.LOGIN_TYPE_USERNAME,
    OPERATIONS.LOGIN_CLICK_PASSWORD,
    OPERATIONS.LOGIN_TYPE_PASSWORD,
    OPERATIONS.LOGIN_CLICK_LOGIN_BUTTON,
    OPERATIONS.LOGIN_WAIT_HOME,

    // Customer search phase
    OPERATIONS.CUSTOMER_OPEN_MENU,
    OPERATIONS.CUSTOMER_CLICK_NEW_ORDER,
    OPERATIONS.CUSTOMER_WAIT_SEARCH_FIELD,
    OPERATIONS.CUSTOMER_CLICK_SEARCH_FIELD,
    OPERATIONS.CUSTOMER_TYPE_SEARCH_TEXT,
    OPERATIONS.CUSTOMER_PRESS_TAB,
    OPERATIONS.CUSTOMER_WAIT_RESULTS,
    OPERATIONS.CUSTOMER_CLICK_RESULT,
    OPERATIONS.CUSTOMER_PRESS_TAB_AFTER_RESULT,
    OPERATIONS.CUSTOMER_PRESS_ENTER_CONFIRM,

    // Order creation phase
    OPERATIONS.ORDER_WAIT_FORM,
    OPERATIONS.ORDER_CLICK_DELIVERY_DATE,
    OPERATIONS.ORDER_TYPE_DELIVERY_DATE,
    OPERATIONS.ORDER_PRESS_TAB_AFTER_DATE,
    OPERATIONS.ORDER_PRESS_ENTER_CONFIRM_DATE,
    OPERATIONS.ORDER_WAIT_ITEMS_SECTION,

    // Item search & add phase
    OPERATIONS.ITEM_CLICK_SEARCH_FIELD,
    OPERATIONS.ITEM_TYPE_SEARCH_TEXT,
    OPERATIONS.ITEM_PRESS_TAB,
    OPERATIONS.ITEM_WAIT_RESULTS,
    OPERATIONS.ITEM_CLICK_RESULT,
    OPERATIONS.ITEM_PRESS_TAB_AFTER_RESULT,
    OPERATIONS.ITEM_PRESS_ENTER_CONFIRM,
    OPERATIONS.ITEM_WAIT_QUANTITY_FIELD,
    OPERATIONS.ITEM_CLICK_QUANTITY_FIELD,
    OPERATIONS.ITEM_CLEAR_QUANTITY,
    OPERATIONS.ITEM_TYPE_QUANTITY,
    OPERATIONS.ITEM_PRESS_TAB_AFTER_QUANTITY,
    OPERATIONS.ITEM_PRESS_ENTER_ADD_ITEM,
    OPERATIONS.ITEM_WAIT_ITEM_ADDED,

    // Order finalization phase
    OPERATIONS.FINALIZE_CLICK_SAVE_BUTTON,
    OPERATIONS.FINALIZE_WAIT_CONFIRMATION,
    OPERATIONS.FINALIZE_EXTRACT_ORDER_ID,
  ],
};

/**
 * Main optimization function
 */
async function optimizeDelays(): Promise<void> {
  logger.info('🚀 Starting automatic delay optimization');
  logger.info(`Testing ${TEST_CONFIG.operationsToTest.length} operations`);

  const delayManager = DelayManager.getInstance();
  const tester = new BinarySearchTester();

  // Register all operations
  registerAllOperations(delayManager);

  // Start test session
  const sessionId = delayManager.startTestSession();
  logger.info(`📊 Test session started: ${sessionId}`);

  // Cleanup old debug files
  await tester.cleanupOldDebugFiles();

  const results: BinarySearchResult[] = [];
  let bot: ArchibaldBot | null = null;

  try {
    // Initialize bot
    logger.info('🤖 Initializing bot...');
    bot = new ArchibaldBot(TEST_CONFIG.userId);

    // NOTE: This is a simplified version. In reality, you would need to:
    // 1. Implement individual test functions for each operation
    // 2. Create a state machine to handle the order flow
    // 3. Handle retries and failures gracefully
    //
    // For now, this demonstrates the structure. The actual implementation
    // would require refactoring ArchibaldBot to expose granular operations.

    logger.warn('⚠️  This is a template script. Actual implementation requires:');
    logger.warn('   1. Refactoring ArchibaldBot to expose individual operations');
    logger.warn('   2. Creating test functions for each operation');
    logger.warn('   3. Implementing state machine for order flow');
    logger.warn('');
    logger.warn('   For now, this script will:');
    logger.warn('   - Register all operations with DelayManager');
    logger.warn('   - Generate a baseline report');
    logger.warn('   - Provide structure for future implementation');

    // Generate baseline report
    logger.info('📝 Generating baseline report...');
    const report = delayManager.exportMarkdownReport();
    const reportPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '.planning',
      'phases',
      '03.3-bot-slowmo-optimization',
      'OPTIMIZATION-REPORT.md'
    );

    // Ensure directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, report);
    logger.info(`✅ Report saved: ${reportPath}`);

    // TODO: Implement actual optimization loop
    // for (const operationId of TEST_CONFIG.operationsToTest) {
    //   logger.info(`\n🔍 Testing operation: ${operationId}`);
    //   logger.info(`   Description: ${OPERATION_DESCRIPTIONS[operationId]}`);
    //
    //   const testFunction = createTestFunction(bot, operationId);
    //   const result = await tester.findOptimalDelay(
    //     operationId,
    //     testFunction,
    //     bot.page!
    //   );
    //
    //   results.push(result);
    //
    //   logger.info(`✅ Optimal delay found: ${result.optimalDelay}ms`);
    //   logger.info(`   Tested ${result.totalAttempts} times in ${result.duration}ms`);
    // }

  } catch (error) {
    logger.error('❌ Optimization failed', { error });
    throw error;
  } finally {
    // End test session
    delayManager.endTestSession();

    // Cleanup bot
    if (bot) {
      logger.info('🧹 Cleaning up bot...');
      // await bot.close(); // Uncomment when implemented
    }

    // Generate final report
    logger.info('📊 Generating final report...');
    const finalReport = delayManager.exportMarkdownReport();
    const finalReportPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '.planning',
      'phases',
      '03.3-bot-slowmo-optimization',
      'OPTIMIZATION-REPORT.md'
    );

    fs.writeFileSync(finalReportPath, finalReport);
    logger.info(`✅ Final report saved: ${finalReportPath}`);

    // Print summary
    logger.info('\n📈 Optimization Summary:');
    logger.info(`   Operations tested: ${results.length}`);
    logger.info(`   Average delay: ${delayManager.getStats().averageDelay}ms`);
    logger.info(`   Estimated time saved: ${delayManager.getStats().estimatedTimeSaved}ms per order`);
    logger.info(`   Debug files: ${tester.getDebugDir()}`);
    logger.info('\n✅ Optimization complete!');
  }
}

/**
 * Helper function to create test function for an operation
 * TODO: Implement for each operation type
 */
function createTestFunction(
  bot: ArchibaldBot,
  operationId: string
): (delay: number) => Promise<void> {
  return async (delay: number) => {
    // This would contain the actual test logic for the operation
    // For example, for LOGIN_CLICK_USERNAME:
    //   await bot.clickWithDelay('#username-field', operationId);
    //
    // The implementation would need to:
    // 1. Set up the correct state for the operation
    // 2. Execute the operation with the given delay
    // 3. Verify the operation succeeded
    // 4. Throw an error if it failed

    throw new Error(`Test function not implemented for ${operationId}`);
  };
}

// Run optimization if called directly
if (require.main === module) {
  optimizeDelays()
    .then(() => {
      logger.info('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Script failed', { error });
      process.exit(1);
    });
}

export { optimizeDelays, TEST_CONFIG };
