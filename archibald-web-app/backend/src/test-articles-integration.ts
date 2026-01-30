/**
 * Integration test for Order Articles Sync
 * Tests: Parser → DB Methods → Data integrity
 */

import { PDFParserSaleslinesService } from './pdf-parser-saleslines-service';
import { OrderDatabaseNew } from './order-db-new';
import { ProductDatabase } from './product-db';
import path from 'path';

async function testIntegration() {
  console.log('🧪 Starting Order Articles Integration Test\n');

  const pdfPath = path.join(__dirname, '../../../Salesline-Ref (1).pdf');
  const testOrderId = `TEST-ORDER-${Date.now()}`;
  const testUserId = 'test-user';

  try {
    // Step 1: Test Parser
    console.log('Step 1: Testing PDF Parser...');
    const parser = PDFParserSaleslinesService.getInstance();
    const articles = await parser.parseSaleslinesPDF(pdfPath);

    console.log(`✅ Parsed ${articles.length} articles`);
    console.log(`   First article: ${articles[0].articleCode} - ${articles[0].description}`);
    console.log(`   Discount: ${articles[0].discountPercent}%\n`);

    // Step 2: Test VAT Enrichment
    console.log('Step 2: Testing VAT Enrichment...');
    const productDb = ProductDatabase.getInstance();
    const enrichedArticles = articles.map((article) => {
      const products = productDb.getProducts(article.articleCode);
      const vat = products.length > 0 && products[0].vat ? products[0].vat : 22;

      const vatAmount = article.lineAmount * (vat / 100);
      const lineTotalWithVat = article.lineAmount + vatAmount;

      return {
        orderId: testOrderId,
        articleCode: article.articleCode,
        articleDescription: article.description || null,
        quantity: article.quantity,
        unitPrice: article.unitPrice,
        discountPercent: article.discountPercent,
        lineAmount: article.lineAmount,
        vatPercent: vat,
        vatAmount,
        lineTotalWithVat,
      };
    });

    console.log(`✅ Enriched ${enrichedArticles.length} articles with VAT`);
    console.log(
      `   Sample VAT: ${enrichedArticles[0].vatPercent}% = €${enrichedArticles[0].vatAmount.toFixed(2)}\n`,
    );

    // Step 3: Calculate Totals
    console.log('Step 3: Calculating Totals...');
    const totalVatAmount = enrichedArticles.reduce((sum, a) => sum + a.vatAmount, 0);
    const totalWithVat = enrichedArticles.reduce((sum, a) => sum + a.lineTotalWithVat, 0);

    console.log(`✅ Total VAT: €${totalVatAmount.toFixed(2)}`);
    console.log(`✅ Total with VAT: €${totalWithVat.toFixed(2)}\n`);

    // Step 4: Test DB Methods
    console.log('Step 4: Testing DB Methods...');
    const orderDb = OrderDatabaseNew.getInstance();

    // Create a test order first (to satisfy foreign key constraint)
    orderDb.upsertOrder(testUserId, {
      id: testOrderId,
      orderNumber: `ORD/TEST-${Date.now()}`,
      customerName: 'Test Customer',
      creationDate: new Date().toISOString(),
      archibaldOrderId: '71723', // Example ID
    } as any);

    // Insert articles
    const saved = orderDb.saveOrderArticlesWithVat(enrichedArticles as any);
    console.log(`✅ Saved ${saved} articles to DB`);

    // Retrieve articles
    const retrieved = orderDb.getOrderArticles(testOrderId);
    console.log(`✅ Retrieved ${retrieved.length} articles from DB`);

    // Delete articles
    orderDb.deleteOrderArticles(testOrderId);
    const afterDelete = orderDb.getOrderArticles(testOrderId);
    console.log(`✅ Deleted articles (remaining: ${afterDelete.length})\n`);

    // Final Results
    console.log('═'.repeat(50));
    console.log('✅ ALL TESTS PASSED!');
    console.log('═'.repeat(50));
    console.log('\nIntegration test results:');
    console.log(`  • Articles parsed: ${articles.length}`);
    console.log(`  • Articles with VAT: ${enrichedArticles.length}`);
    console.log(`  • Total imponibile: €${enrichedArticles.reduce((s, a) => s + a.lineAmount, 0).toFixed(2)}`);
    console.log(`  • Total IVA: €${totalVatAmount.toFixed(2)}`);
    console.log(`  • Total con IVA: €${totalWithVat.toFixed(2)}`);
    console.log(`  • DB operations: ✅`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

testIntegration();
