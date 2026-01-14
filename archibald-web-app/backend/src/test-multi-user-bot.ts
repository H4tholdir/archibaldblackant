#!/usr/bin/env tsx
/**
 * Test script to verify multi-user bot functionality
 * Creates an order using multi-user BrowserContext from BrowserPool
 */
import { ArchibaldBot } from './archibald-bot';
import { logger } from './logger';
import { PasswordCache } from './password-cache';
import { UserDatabase } from './user-db';

async function testMultiUserBot() {
  logger.info('🧪 Starting multi-user bot test...');

  // Use an existing user from the database
  const userDb = UserDatabase.getInstance();
  const user = userDb.getUserByUsername('ikiA0930');
  if (!user) {
    throw new Error('User ikiA0930 not found in database');
  }

  const userId = user.id;
  const bot = new ArchibaldBot(userId);

  try {
    // Simulate API login: store password in PasswordCache
    PasswordCache.getInstance().set(userId, 'Qn3i4t66');
    logger.info('✅ Password stored in cache');

    // Initialize bot with multi-user mode
    await bot.initialize();
    logger.info('✅ Bot initialized (multi-user mode)');

    // Login - bot will use BrowserPool and per-user session cache
    await bot.login();
    logger.info('✅ Login successful');

    // Create order with correct format
    const orderData = {
      customerId: 'FRESIS',
      customerName: 'Fresis',
      items: [
        {
          articleCode: 'TD1272.314',
          description: 'TD1272.314',
          quantity: 1,
          price: 0,
        },
      ],
    };

    logger.info('📝 Creating order:', orderData);
    const result = await bot.createOrder(orderData);

    logger.info('✅ Order created successfully!', result);
    return result;
  } catch (error) {
    logger.error('❌ Multi-user bot test failed:', error);
    throw error;
  } finally {
    await bot.close();
    logger.info('🧹 Bot closed');
  }
}

// Run test
testMultiUserBot()
  .then((result) => {
    logger.info('🎉 Test completed successfully:', result);
    process.exit(0);
  })
  .catch((error) => {
    logger.error('💥 Test failed:', error);
    process.exit(1);
  });
