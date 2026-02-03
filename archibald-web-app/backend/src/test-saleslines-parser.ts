import { PDFParserSaleslinesService } from "./pdf-parser-saleslines-service";
import path from "path";

async function test() {
  const parser = PDFParserSaleslinesService.getInstance();
  const pdfPath = path.join(__dirname, "../../../Salesline-Ref (1).pdf");

  console.log("Testing parser with:", pdfPath);

  try {
    const articles = await parser.parseSaleslinesPDF(pdfPath);
    console.log("\n✅ Parsed articles:", articles.length);
    console.log("\nFirst 3 articles:");
    articles.slice(0, 3).forEach((a, idx) => {
      console.log(`\n${idx + 1}. ${a.articleCode}`);
      console.log(`   Description: ${a.description}`);
      console.log(
        `   Quantity: ${a.quantity}, Price: €${a.unitPrice}, Discount: ${a.discountPercent}%`,
      );
      console.log(`   Line Amount: €${a.lineAmount}`);
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

test();
