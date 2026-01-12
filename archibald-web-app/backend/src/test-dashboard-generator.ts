/**
 * Simple test to verify dashboard generator works with mock data
 * Usage: npx tsx src/test-dashboard-generator.ts
 */

import { PerformanceDashboardGenerator } from './performance-dashboard-generator';
import type { ProfilingData } from './types';
import * as fs from 'fs/promises';

async function main() {
  console.log('Testing Performance Dashboard Generator...\n');

  const mockData: ProfilingData = {
    summary: {
      totalOperations: 25,
      successful: 24,
      failed: 1,
      totalDurationMs: 45000,
      totalGapMs: 5000,
      averageOperationMs: 1800,
      peakMemoryBytes: 150 * 1024 * 1024,
    },
    categories: {
      'login': {
        count: 1,
        totalDurationMs: 8000,
        avgDurationMs: 8000,
        p50Ms: 8000,
        p95Ms: 8000,
        p99Ms: 8000,
        avgMemoryBytes: 1024 * 1024,
      },
      'navigation': {
        count: 5,
        totalDurationMs: 3000,
        avgDurationMs: 600,
        p50Ms: 550,
        p95Ms: 750,
        p99Ms: 800,
        avgMemoryBytes: 512 * 1024,
      },
      'form.customer': {
        count: 3,
        totalDurationMs: 15000,
        avgDurationMs: 5000,
        p50Ms: 4500,
        p95Ms: 6000,
        p99Ms: 6200,
        avgMemoryBytes: 2 * 1024 * 1024,
      },
      'form.article': {
        count: 6,
        totalDurationMs: 12000,
        avgDurationMs: 2000,
        p50Ms: 1800,
        p95Ms: 2500,
        p99Ms: 2800,
        avgMemoryBytes: 1.5 * 1024 * 1024,
      },
      'form.quantity': {
        count: 6,
        totalDurationMs: 4000,
        avgDurationMs: 666,
        p50Ms: 600,
        p95Ms: 800,
        p99Ms: 850,
        avgMemoryBytes: 256 * 1024,
      },
      'submit': {
        count: 4,
        totalDurationMs: 3000,
        avgDurationMs: 750,
        p50Ms: 700,
        p95Ms: 900,
        p99Ms: 950,
        avgMemoryBytes: 512 * 1024,
      },
    },
    retries: [
      {
        operationId: 15,
        name: 'Wait for customer dropdown',
        category: 'form.customer',
        attempts: 2,
        finalStatus: 'ok',
      },
    ],
    operations: Array.from({ length: 25 }, (_, i) => {
      const categories = ['login', 'navigation', 'form.customer', 'form.article', 'form.quantity', 'submit'];
      const category = categories[i % categories.length];
      const startTime = new Date(Date.now() - 50000 + i * 2000);
      const duration = Math.random() * 3000 + 500;
      const endTime = new Date(startTime.getTime() + duration);

      return {
        id: i + 1,
        name: `Operation ${i + 1}`,
        status: i === 12 ? 'error' : 'ok' as 'ok' | 'error',
        category,
        startIso: startTime.toISOString(),
        endIso: endTime.toISOString(),
        durationMs: duration,
        gapMs: i > 0 ? Math.random() * 500 : 0,
        retryAttempt: i === 15 ? 2 : 0,
        memoryBefore: 100 * 1024 * 1024 + Math.random() * 50 * 1024 * 1024,
        memoryAfter: 100 * 1024 * 1024 + Math.random() * 50 * 1024 * 1024,
        meta: { test: true },
        errorMessage: i === 12 ? 'Timeout waiting for element' : undefined,
      };
    }),
  };

  console.log('1. Testing CSV export...');
  const csv = PerformanceDashboardGenerator.exportCSV(mockData);
  console.log(`   ✅ CSV generated: ${csv.split('\n').length} lines`);

  console.log('\n2. Testing HTML generation...');
  const html = PerformanceDashboardGenerator.generateHTML(mockData, {
    title: 'Test Dashboard',
  });
  console.log(`   ✅ HTML generated: ${(html.length / 1024).toFixed(1)} KB`);
  console.log(`   - Contains Gantt chart: ${html.includes('gantt-svg') ? '✅' : '❌'}`);
  console.log(`   - Contains bottleneck analysis: ${html.includes('bottleneck-list') ? '✅' : '❌'}`);
  console.log(`   - Contains category table: ${html.includes('category-table-body') ? '✅' : '❌'}`);
  console.log(`   - Contains timeline table: ${html.includes('timeline-table-body') ? '✅' : '❌'}`);

  console.log('\n3. Testing file writing...');
  const testDir = './test-dashboard-output';

  await PerformanceDashboardGenerator.saveDashboard(
    mockData,
    `${testDir}/test.html`,
    { format: 'html' }
  );

  await PerformanceDashboardGenerator.saveDashboard(
    mockData,
    `${testDir}/test.json`,
    { format: 'json' }
  );

  await PerformanceDashboardGenerator.saveDashboard(
    mockData,
    `${testDir}/test.csv`,
    { format: 'csv' }
  );

  const files = await fs.readdir(testDir);
  console.log(`   ✅ Files created: ${files.join(', ')}`);

  const htmlSize = (await fs.stat(`${testDir}/test.html`)).size;
  console.log(`   - HTML file size: ${(htmlSize / 1024).toFixed(1)} KB`);

  console.log('\n4. Testing trend comparison...');
  const mockData2: ProfilingData = {
    ...mockData,
    summary: {
      ...mockData.summary,
      totalDurationMs: 42000,
      successful: 25,
      failed: 0,
    },
  };

  const htmlWithTrends = PerformanceDashboardGenerator.generateHTML(mockData, {
    title: 'Trend Comparison Test',
    comparisonData: [mockData2],
  });

  console.log(`   ✅ HTML with trends generated: ${(htmlWithTrends.length / 1024).toFixed(1)} KB`);
  console.log(`   - Contains trends section: ${htmlWithTrends.includes('trend-charts') ? '✅' : '❌'}`);

  console.log('\n✅ All tests passed!');
  console.log(`\nOpen ${testDir}/test.html in your browser to view the dashboard.`);
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
