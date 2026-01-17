/**
 * Test C-1: Product + Price Concurrent Writes
 *
 * Tests concurrent writes to the same products.db database
 * from ProductSyncService and PriceSyncService
 *
 * Expected behavior: Both complete OR timeout with SQLite lock contention
 */

import fetch from 'node-fetch';

interface SyncResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface TestResult {
  test: string;
  productSync: {
    started: number;
    completed?: number;
    duration?: number;
    success: boolean;
    error?: string;
  };
  priceSync: {
    started: number;
    completed?: number;
    duration?: number;
    success: boolean;
    error?: string;
  };
  concurrentDuration: number;
  outcome: 'SUCCESS' | 'TIMEOUT' | 'ERROR' | 'MIXED';
}

const BASE_URL = 'http://localhost:3000';
const JWT_TOKEN = process.env.JWT_TOKEN || '';

async function triggerSync(type: 'products' | 'prices'): Promise<{ started: number; response: SyncResponse }> {
  const started = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/sync/manual/${type}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json() as SyncResponse;
    return { started, response: data };
  } catch (error: any) {
    return {
      started,
      response: {
        success: false,
        error: error.message
      }
    };
  }
}

async function checkSyncStatus(): Promise<any> {
  try {
    const response = await fetch(`${BASE_URL}/api/sync/status`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function waitForSyncCompletion(timeout: number = 300000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await checkSyncStatus();

    if (status?.data) {
      const productsStatus = status.data.products?.status || 'idle';
      const pricesStatus = status.data.prices?.status || 'idle';

      if (productsStatus !== 'syncing' && pricesStatus !== 'syncing') {
        console.log('✅ Both syncs completed');
        return;
      }

      console.log(`⏳ Waiting... Products: ${productsStatus}, Prices: ${pricesStatus}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.warn('⚠️ Timeout waiting for sync completion');
}

async function runTest(testNumber: number): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST RUN #${testNumber} - Product + Price Concurrent Writes`);
  console.log(`${'='.repeat(60)}\n`);

  const testStartTime = Date.now();

  // Trigger both syncs with minimal delay (<100ms)
  console.log('🚀 Triggering Product Sync...');
  const productResult = await triggerSync('products');

  console.log('🚀 Triggering Price Sync (immediate)...');
  const priceResult = await triggerSync('prices');

  const triggerDelay = priceResult.started - productResult.started;
  console.log(`⏱️  Trigger delay: ${triggerDelay}ms`);

  // Wait for both to complete
  console.log('\n⏳ Waiting for both syncs to complete (max 5 min)...\n');
  await waitForSyncCompletion();

  const testEndTime = Date.now();
  const concurrentDuration = testEndTime - testStartTime;

  // Determine outcome
  let outcome: TestResult['outcome'] = 'SUCCESS';
  if (!productResult.response.success || !priceResult.response.success) {
    if (productResult.response.success !== priceResult.response.success) {
      outcome = 'MIXED';
    } else {
      outcome = 'ERROR';
    }
  }

  const result: TestResult = {
    test: `C-1 Run #${testNumber}`,
    productSync: {
      started: productResult.started,
      completed: testEndTime,
      duration: testEndTime - productResult.started,
      success: productResult.response.success,
      error: productResult.response.error
    },
    priceSync: {
      started: priceResult.started,
      completed: testEndTime,
      duration: testEndTime - priceResult.started,
      success: priceResult.response.success,
      error: priceResult.response.error
    },
    concurrentDuration,
    outcome
  };

  console.log('\n📊 Test Results:');
  console.log(`   Product Sync: ${result.productSync.success ? '✅ SUCCESS' : '❌ FAILED'} (${result.productSync.duration}ms)`);
  console.log(`   Price Sync: ${result.priceSync.success ? '✅ SUCCESS' : '❌ FAILED'} (${result.priceSync.duration}ms)`);
  console.log(`   Total Duration: ${concurrentDuration}ms`);
  console.log(`   Outcome: ${outcome}`);

  return result;
}

async function main() {
  if (!JWT_TOKEN) {
    console.error('❌ JWT_TOKEN environment variable required');
    console.error('   Usage: JWT_TOKEN="your-token" ts-node test-c1-concurrent-writes.ts');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test C-1: Product + Price Concurrent Write Testing       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Objective: Empirically validate SQLite behavior when');
  console.log('           ProductSyncService and PriceSyncService write');
  console.log('           concurrently to the same products.db database');
  console.log('');
  console.log('Expected: Both complete (WAL mode handles concurrent writes)');
  console.log('          OR timeout with lock contention errors');
  console.log('');

  const results: TestResult[] = [];

  // Run test 3 times for consistency
  for (let i = 1; i <= 3; i++) {
    const result = await runTest(i);
    results.push(result);

    if (i < 3) {
      console.log('\n⏸️  Waiting 30s before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY - 3 Test Runs');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.outcome === 'SUCCESS').length;
  const timeoutCount = results.filter(r => r.outcome === 'TIMEOUT').length;
  const errorCount = results.filter(r => r.outcome === 'ERROR').length;
  const mixedCount = results.filter(r => r.outcome === 'MIXED').length;

  console.log(`\n✅ Success: ${successCount}/3`);
  console.log(`⏱️  Timeout: ${timeoutCount}/3`);
  console.log(`❌ Error: ${errorCount}/3`);
  console.log(`⚠️  Mixed: ${mixedCount}/3`);

  const avgDuration = results.reduce((sum, r) => sum + r.concurrentDuration, 0) / results.length;
  console.log(`\n⏱️  Average Duration: ${Math.round(avgDuration)}ms`);

  // Behavior classification
  console.log('\n📋 BEHAVIOR CLASSIFICATION:');
  if (successCount === 3) {
    console.log('   ✅ STABLE: Both syncs complete consistently');
    console.log('   Recommendation: LOW priority fix (WAL mode handles concurrency)');
  } else if (timeoutCount > 0) {
    console.log('   ⚠️  UNSTABLE: Lock contention causing timeouts');
    console.log('   Recommendation: HIGH priority fix (global lock or coordination needed)');
  } else if (errorCount > 0 || mixedCount > 0) {
    console.log('   ❌ CRITICAL: Data corruption or inconsistent behavior');
    console.log('   Recommendation: CRITICAL priority fix (immediate investigation required)');
  }

  // Save results to JSON
  const fs = require('fs');
  const resultsPath = '.planning/phases/15-individual-sync-testing/c1-test-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
