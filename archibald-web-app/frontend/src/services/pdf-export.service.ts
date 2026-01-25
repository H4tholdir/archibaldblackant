import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { PendingOrder } from "../db/schema";

// Extend jsPDF with autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable?: {
      finalY: number;
    };
  }
}

export class PDFExportService {
  private static instance: PDFExportService;

  private constructor() {}

  static getInstance(): PDFExportService {
    if (!PDFExportService.instance) {
      PDFExportService.instance = new PDFExportService();
    }
    return PDFExportService.instance;
  }

  /**
   * Generate PDF for a pending order
   */
  generateOrderPDF(order: PendingOrder): jsPDF {
    console.log("[PDFExportService] Generating PDF for order:", {
      customerId: order.customerId,
      customerName: order.customerName,
      itemsCount: order.items?.length || 0,
      discountPercent: order.discountPercent,
    });

    // Validate order data
    if (!order.items || order.items.length === 0) {
      throw new Error("Order has no items");
    }

    const doc = new jsPDF();

    // Add company header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PREVENTIVO", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Archibald Mobile", 105, 28, { align: "center" });
    doc.text("Inserimento Ordini", 105, 33, { align: "center" });

    // Order info section
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Informazioni Ordine", 14, 45);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Cliente: ${order.customerName}`, 14, 52);
    doc.text(`Codice Cliente: ${order.customerId}`, 14, 58);
    doc.text(
      `Data: ${new Date(order.createdAt).toLocaleDateString("it-IT")}`,
      14,
      64,
    );

    // Calculate totals
    const orderSubtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity - (item.discount || 0),
      0,
    );

    // Apply global discount if present
    const globalDiscountAmount = order.discountPercent
      ? (orderSubtotal * order.discountPercent) / 100
      : 0;
    const subtotalAfterGlobalDiscount = orderSubtotal - globalDiscountAmount;

    const orderVAT = order.items.reduce((sum, item) => {
      const itemSubtotal = item.price * item.quantity - (item.discount || 0);
      const itemAfterGlobalDiscount = order.discountPercent
        ? itemSubtotal * (1 - order.discountPercent / 100)
        : itemSubtotal;
      return sum + itemAfterGlobalDiscount * ((item.vat || 0) / 100);
    }, 0);
    const orderTotal = subtotalAfterGlobalDiscount + orderVAT;

    // Items table
    const tableData = order.items.map((item, index) => {
      try {
        // Validate item data
        if (typeof item.price !== "number" || isNaN(item.price)) {
          console.error(
            `[PDFExportService] Invalid price for item ${index}:`,
            item,
          );
          throw new Error(
            `Invalid price for item "${item.articleCode}": ${item.price}`,
          );
        }

        if (typeof item.quantity !== "number" || isNaN(item.quantity)) {
          console.error(
            `[PDFExportService] Invalid quantity for item ${index}:`,
            item,
          );
          throw new Error(
            `Invalid quantity for item "${item.articleCode}": ${item.quantity}`,
          );
        }

        const subtotal = item.price * item.quantity - (item.discount || 0);
        const subtotalAfterGlobal = order.discountPercent
          ? subtotal * (1 - order.discountPercent / 100)
          : subtotal;
        const vatAmount = subtotalAfterGlobal * ((item.vat || 0) / 100);
        const total = subtotalAfterGlobal + vatAmount;

        return [
          `${item.productName || item.articleCode}\nCod: ${item.articleCode}${item.description ? `\n${item.description}` : ""}`,
          item.quantity.toString(),
          `€${item.price.toFixed(2)}`,
          item.discount && item.discount > 0
            ? `-€${item.discount.toFixed(2)}`
            : "-",
          `€${subtotal.toFixed(2)}`,
          `${item.vat || 0}%\n€${vatAmount.toFixed(2)}`,
          `€${total.toFixed(2)}`,
        ];
      } catch (error) {
        console.error(
          `[PDFExportService] Error processing item ${index}:`,
          item,
          error,
        );
        throw error;
      }
    });

    doc.autoTable({
      startY: 75,
      head: [
        [
          "Articolo",
          "Qnt.",
          "Prezzo Unit.",
          "Sconto",
          "Subtotale",
          "IVA",
          "Totale",
        ],
      ],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [59, 130, 246], // Blue
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 60 }, // Articolo - wider for description
        1: { halign: "center", cellWidth: 20 }, // Quantity
        2: { halign: "right", cellWidth: 25 }, // Unit Price
        3: { halign: "right", cellWidth: 22 }, // Discount
        4: { halign: "right", cellWidth: 25 }, // Subtotal
        5: { halign: "right", cellWidth: 25 }, // VAT
        6: { halign: "right", cellWidth: 25 }, // Total
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      didParseCell: (data: any) => {
        // Make total column bold
        if (data.column.index === 6 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [30, 64, 175]; // Blue
        }
      },
    });

    // Get final Y position after table
    const finalY = doc.lastAutoTable?.finalY || 150;

    // Totals section
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Riepilogo", 14, finalY + 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let currentY = finalY + 23;
    doc.text(
      `Subtotale (senza IVA): €${orderSubtotal.toFixed(2)}`,
      14,
      currentY,
    );

    // Show global discount if present
    if (order.discountPercent && order.discountPercent > 0) {
      currentY += 7;
      doc.setTextColor(220, 38, 38); // Red color for discount
      doc.text(
        `Sconto globale (${order.discountPercent.toFixed(2)}%): -€${globalDiscountAmount.toFixed(2)}`,
        14,
        currentY,
      );
      doc.setTextColor(0, 0, 0); // Reset to black
      currentY += 7;
      doc.text(
        `Subtotale scontato: €${subtotalAfterGlobalDiscount.toFixed(2)}`,
        14,
        currentY,
      );
    }

    currentY += 7;
    doc.text(`IVA Totale: €${orderVAT.toFixed(2)}`, 14, currentY);

    currentY += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`TOTALE (con IVA): €${orderTotal.toFixed(2)}`, 14, currentY);

    // Footer
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(
      `Documento generato il ${new Date().toLocaleString("it-IT")}`,
      105,
      280,
      { align: "center" },
    );

    return doc;
  }

  /**
   * Download PDF for an order
   */
  downloadOrderPDF(order: PendingOrder): void {
    const doc = this.generateOrderPDF(order);
    const fileName = `preventivo_${order.customerName.replace(/[^a-z0-9]/gi, "_")}_${new Date(order.createdAt).toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  }

  /**
   * Print PDF for an order
   */
  printOrderPDF(order: PendingOrder): void {
    const doc = this.generateOrderPDF(order);
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);

    // Open in new window for printing
    const printWindow = window.open(pdfUrl);
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up URL after printing dialog closes
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
      };
    }
  }

  /**
   * Generate PDF for multiple orders (batch export)
   * Downloads each order as a separate PDF file
   */
  downloadMultipleOrdersPDF(orders: PendingOrder[]): void {
    orders.forEach((order) => {
      this.downloadOrderPDF(order);
    });
  }
}

export const pdfExportService = PDFExportService.getInstance();
