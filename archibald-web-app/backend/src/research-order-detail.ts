/**
 * Research script for Task 4: Analyze order detail page structure
 *
 * Purpose: Investigate if order detail page contains direct references to:
 * - Invoice number (for matching orders to invoices)
 * - DDT number (for matching orders to delivery documents)
 *
 * Usage: node -r esbuild-register src/research-order-detail.ts
 */

import { BrowserPool } from './browser-pool.js';

const ARCHIBALD_BASE_URL = 'https://4.231.124.90/Archibald';
const ORDERS_PAGE = `${ARCHIBALD_BASE_URL}/SALESTABLE_ListView/`;

async function researchOrderDetail() {
  const pool = BrowserPool.getInstance();

  try {
    console.log('🔍 Task 4: Researching order detail page structure...\n');

    // Get user ID from environment (email address)
    const userId = process.env.ARCHIBALD_USERNAME;

    if (!userId) {
      throw new Error('ARCHIBALD_USERNAME must be set');
    }

    const context = await pool.acquireContext(userId);
    const page = await context.newPage();

    // Navigate to orders page
    console.log('📄 Navigating to orders page...');
    await page.goto(ORDERS_PAGE, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for DevExpress table
    const tableSelector = 'table[id$="_DXMainTable"].dxgvTable_XafTheme';
    await page.waitForSelector(tableSelector, { timeout: 30000 });
    console.log('✅ Orders table loaded\n');

    // Find first clickable order link in table
    console.log('🔗 Looking for order link to click...');
    const orderLink = await page.$(`${tableSelector} tbody tr td a`);

    if (!orderLink) {
      throw new Error('No order links found in table');
    }

    // Get order number from link text
    const orderNumber = await orderLink.evaluate(el => el.textContent?.trim());
    console.log(`📦 Found order: ${orderNumber}`);
    console.log('🖱️  Clicking order link...\n');

    // Click order link to open detail page
    await orderLink.click();

    // Wait for detail page to load
    await page.waitForTimeout(3000); // Wait for navigation

    console.log('📸 Taking screenshot of order detail page...');
    await page.screenshot({
      path: '.planning/phases/11-order-management/screenshots/11-01-order-detail-page.png',
      fullPage: true,
    });
    console.log('✅ Screenshot saved\n');

    // Extract all visible text content and structure
    console.log('📊 Analyzing page structure...');
    const pageAnalysis = await page.evaluate(() => {
      const result: any = {
        url: window.location.href,
        title: document.title,
        headers: [] as string[],
        labels: [] as string[],
        values: [] as string[],
        tables: [] as any[],
        forms: [] as any[],
      };

      // Extract all headers (h1-h6)
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        result.headers.push(h.textContent?.trim() || '');
      });

      // Extract all labels (looking for invoice/DDT references)
      document.querySelectorAll('label, .label, .field-label, td.label, span.label').forEach(label => {
        const text = label.textContent?.trim() || '';
        if (text && text.length > 0 && text.length < 100) {
          result.labels.push(text);
        }
      });

      // Look for invoice/DDT specific patterns in all text
      const bodyText = document.body.textContent || '';
      const invoiceMatches = bodyText.match(/fattura|invoice|CFT\/\d+|CF1\/\d+/gi) || [];
      const ddtMatches = bodyText.match(/DDT\/\d+|documento.*trasporto/gi) || [];

      result.containsInvoiceReferences = invoiceMatches.length > 0;
      result.invoiceReferences = Array.from(new Set(invoiceMatches));
      result.containsDDTReferences = ddtMatches.length > 0;
      result.ddtReferences = Array.from(new Set(ddtMatches));

      // Extract tables
      document.querySelectorAll('table').forEach((table, index) => {
        const headers = Array.from(table.querySelectorAll('thead th, th')).map(
          th => th.textContent?.trim() || ''
        );
        const rows = Array.from(table.querySelectorAll('tbody tr, tr')).slice(0, 5).map(tr => {
          return Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
        });

        if (headers.length > 0 || rows.length > 0) {
          result.tables.push({
            index,
            headers,
            sampleRows: rows,
            id: table.id || null,
            className: table.className || null,
          });
        }
      });

      // Extract form fields
      document.querySelectorAll('input, select, textarea').forEach((field: any) => {
        if (field.type !== 'hidden') {
          result.forms.push({
            name: field.name || null,
            id: field.id || null,
            type: field.type || field.tagName.toLowerCase(),
            label: field.labels?.[0]?.textContent?.trim() || null,
          });
        }
      });

      return result;
    });

    console.log('\n=== Order Detail Page Analysis ===');
    console.log(`URL: ${pageAnalysis.url}`);
    console.log(`Title: ${pageAnalysis.title}`);
    console.log(`\nInvoice References Found: ${pageAnalysis.containsInvoiceReferences ? 'YES' : 'NO'}`);
    if (pageAnalysis.invoiceReferences.length > 0) {
      console.log('  - ' + pageAnalysis.invoiceReferences.join('\n  - '));
    }
    console.log(`\nDDT References Found: ${pageAnalysis.containsDDTReferences ? 'YES' : 'NO'}`);
    if (pageAnalysis.ddtReferences.length > 0) {
      console.log('  - ' + pageAnalysis.ddtReferences.join('\n  - '));
    }
    console.log(`\nTables Found: ${pageAnalysis.tables.length}`);
    console.log(`Form Fields Found: ${pageAnalysis.forms.length}`);
    console.log(`Headers Found: ${pageAnalysis.headers.length}`);
    console.log(`Labels Found: ${pageAnalysis.labels.length}\n`);

    // Save analysis to JSON
    console.log('💾 Saving analysis to JSON...');
    const fs = await import('fs/promises');
    await fs.writeFile(
      '.planning/phases/11-order-management/11-01-order-detail-analysis.json',
      JSON.stringify(pageAnalysis, null, 2)
    );
    console.log('✅ Analysis saved to 11-01-order-detail-analysis.json\n');

    // Key findings summary
    console.log('=== KEY FINDINGS ===');
    if (pageAnalysis.containsInvoiceReferences && pageAnalysis.containsDDTReferences) {
      console.log('✅ EXCELLENT: Both invoice AND DDT references found on order detail page!');
      console.log('   → Can use this page to link orders ↔ invoices ↔ DDTs directly');
    } else if (pageAnalysis.containsInvoiceReferences) {
      console.log('✅ GOOD: Invoice references found on order detail page');
      console.log('   → Can match orders to invoices via this page');
      console.log('⚠️  DDT references not found - will need to match DDT by order number');
    } else if (pageAnalysis.containsDDTReferences) {
      console.log('✅ GOOD: DDT references found on order detail page');
      console.log('   → Can match orders to DDTs via this page');
      console.log('⚠️  Invoice references not found - will need complex matching strategy');
    } else {
      console.log('⚠️  No direct invoice or DDT references found');
      console.log('   → Will need to match by customer ID + date range + amount');
    }

    console.log('\n✅ Task 4 complete: Order detail page research finished');

    // Release context
    await pool.releaseContext(userId, context, true);

  } catch (error) {
    console.error('❌ Error during research:', error);
    throw error;
  } finally {
    await pool.shutdown();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  researchOrderDetail().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
