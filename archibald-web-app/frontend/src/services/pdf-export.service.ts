import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PendingOrderItem } from "../types/pending-order";
import type { SubClient } from "../types/sub-client";
import type { Customer } from "../types/customer";

export type PDFOrderData = {
  id: string;
  documentNumber?: string;
  documentDate?: string;
  customerId: string;
  customerName: string;
  subClientName?: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  createdAt: string;
  subClientCodice?: string;
  subClientData?: SubClient;
  customerData?: Customer;
  noShipping?: boolean;
  isKtOrder?: boolean;
  shippingCost?: number;
  shippingTax?: number;
  paymentConditions?: string;
  transportCause?: string;
  aspectOfGoods?: string;
  portType?: string;
  packages?: string;
  grossWeight?: number;
  netWeight?: number;
  volume?: number;
  unitsOfMeasure?: Record<string, string>;
};
import { calculateShippingCosts } from "../utils/order-calculations";
import { arcaLineAmount, arcaVatGroups, arcaDocumentTotals, round2 } from "../utils/arca-math";
import { FRESIS_LOGO_BASE64 } from "../assets/fresis-logo-base64";

// Komet logo as base64 (to be embedded in PDF)
const KOMET_LOGO_BASE64 =
  "data:image/jpeg;base64,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"

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
  generateOrderPDF(order: PDFOrderData): jsPDF {
    if (!order.items || order.items.length === 0) {
      throw new Error("Order has no items");
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const PAGE_W = 210;
    const PAGE_H = 297;
    const ML = 10;
    const CW = 190; // content width

    const isFresis = !!order.subClientCodice;
    const isFresisBranding = isFresis && !order.isKtOrder;

    const fmtN = (n: number, dec = 2): string =>
      n.toLocaleString("it-IT", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

    const lineSubtotal = (item: PendingOrderItem): number =>
      item.total ?? arcaLineAmount(item.quantity, item.price, item.discount ?? 0);

    // Helper: cella bordata con etichetta piccola (top) e valore (bottom)
    const cell = (
      x: number,
      y: number,
      w: number,
      h: number,
      label?: string,
      value?: string,
      opts?: { vSize?: number; vBold?: boolean; vAlign?: "left" | "right" | "center" },
    ) => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(x, y, w, h);
      if (label) {
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(60, 60, 60);
        doc.text(label, x + 1, y + 3);
      }
      if (value !== undefined && value !== "") {
        doc.setFontSize(opts?.vSize ?? 8);
        doc.setFont("helvetica", opts?.vBold ? "bold" : "normal");
        doc.setTextColor(0, 0, 0);
        const vx =
          opts?.vAlign === "right"
            ? x + w - 1
            : opts?.vAlign === "center"
              ? x + w / 2
              : x + 1;
        doc.text(value, vx, y + h - 2, {
          align: opts?.vAlign ?? "left",
          maxWidth: w - 2,
        });
      }
    };

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 1: HEADER — logo + blocco azienda (sx) + SPETT.LE (dx)
    // ══════════════════════════════════════════════════════════════════════
    try {
      if (isFresisBranding) {
        doc.addImage(FRESIS_LOGO_BASE64, "JPEG", ML, 10, 42, 17);
      } else {
        doc.addImage(KOMET_LOGO_BASE64, "JPEG", ML, 10, 20, 20);
      }
    } catch {
      /* ignore */
    }

    // Blocco azienda (sotto il logo)
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    if (isFresisBranding) {
      doc.text("FRESIS SOCIETA' COOPERATIVA", ML, 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Via S. Vito, 43", ML, 34.5);
      doc.text("80056 ERCOLANO (NA) - Italia", ML, 39);
      doc.text("Banca FIDEURAM S.p.a. - Filiale 01 Milano", ML, 43.5);
      doc.text("IBAN: IT89U0329601601000064395512", ML, 48);
      doc.text("P.Iva 08246131216", ML, 52.5);
    } else {
      doc.text("Komet Italia S.r.l.", ML, 34);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("Agente Formicola Biagio", ML, 38.5);
      doc.setFont("helvetica", "normal");
      doc.text("Via Gianbattista Morgagni, 36", ML, 43);
      doc.text("37135 Verona (VR) Italy", ML, 47.5);
    }

    // SPETT.LE (lato destro dell'header)
    const spettX = ML + 93;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    doc.text("SPETT.LE", spettX, 13);

    const recipientName = isFresis
      ? (order.subClientData?.ragioneSociale ?? order.subClientName ?? order.customerName)
      : order.customerName;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    const nameMaxW = PAGE_W - ML - spettX - 2;
    const nameLines = doc.splitTextToSize(recipientName.toUpperCase(), nameMaxW);
    doc.text(nameLines as string[], spettX, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let addrY = 20 + (nameLines as string[]).length * 5.5;

    if (isFresis && order.subClientData) {
      const sc = order.subClientData;
      if (sc.supplRagioneSociale) {
        doc.text(sc.supplRagioneSociale.toUpperCase(), spettX, addrY);
        addrY += 5;
      }
      if (sc.indirizzo) {
        doc.text(sc.indirizzo.toUpperCase(), spettX, addrY);
        addrY += 5;
      }
      const city = [sc.cap, sc.localita, sc.prov ? `(${sc.prov})` : ""]
        .filter(Boolean)
        .join(" ");
      if (city) doc.text(city.toUpperCase(), spettX, addrY);
    } else if (order.customerData) {
      const cd = order.customerData;
      if (cd.street) {
        doc.text(cd.street.toUpperCase(), spettX, addrY);
        addrY += 5;
      }
      const city = [cd.postalCode, cd.city].filter(Boolean).join(" ");
      if (city) doc.text(city.toUpperCase(), spettX, addrY);
    }

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 2: GRIGLIA INFO DOCUMENTO
    // ══════════════════════════════════════════════════════════════════════
    let gy = 60;

    // Riga A: TIPO DOCUMENTO | CONTRIBUTO CONAI
    const tdW = 45;
    cell(ML, gy, tdW, 4.5, "TIPO DOCUMENTO");
    cell(ML + tdW, gy, CW - tdW, 4.5);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(
      "CONTRIBUTO AMBIENTALE CONAI ASSOLTO OVE DOVUTO",
      ML + tdW + (CW - tdW) / 2,
      gy + 3.2,
      { align: "center" },
    );
    gy += 4.5;

    // Riga B: valore PREVENTIVO
    cell(ML, gy, tdW, 7.5, undefined, "PREVENTIVO", { vBold: true, vSize: 9.5 });
    cell(ML + tdW, gy, CW - tdW, 7.5);
    gy += 7.5;

    // Riga C/D: etichette e valori 8 campi cliente
    const f8: Array<{ l: string; w: number }> = [
      { l: "C. CLIENTE",     w: 18 },
      { l: "PARTITA IVA",    w: 28 },
      { l: "TELEFONO",       w: 25 },
      { l: "FAX",            w: 18 },
      { l: "CODICE FISCALE", w: 31 },
      { l: "N° DOCUM.",      w: 23 },
      { l: "DATA DOCUM.",    w: 27 },
      { l: "PAGINA",         w: 20 },
    ]; // 18+28+25+18+31+23+27+20 = 190 ✓

    const cCliente = isFresis
      ? (order.subClientData?.codice ?? order.subClientCodice ?? "")
      : order.customerId;
    const partitaIva = isFresis
      ? (order.subClientData?.partitaIva ?? "")
      : (order.customerData?.vatNumber ?? "");
    const telefono = isFresis
      ? (order.subClientData?.telefono ?? "")
      : (order.customerData?.phone ?? "");
    const faxVal = isFresis ? (order.subClientData?.fax ?? "") : "";
    const codiceFiscale = isFresis
      ? (order.subClientData?.codFiscale ?? "")
      : (order.customerData?.fiscalCode ?? "");

    const v8 = [
      cCliente,
      partitaIva,
      telefono,
      faxVal,
      codiceFiscale,
      order.documentNumber ?? order.id,
      (order.documentDate ? new Date(order.documentDate) : new Date(order.createdAt)).toLocaleDateString("it-IT"),
      "1",
    ];

    let fx = ML;
    for (const f of f8) { cell(fx, gy, f.w, 4, f.l); fx += f.w; }
    gy += 4;

    fx = ML;
    for (let i = 0; i < f8.length; i++) {
      const fitted = (doc.splitTextToSize(v8[i] ?? "", f8[i].w - 2)[0] as string) ?? "";
      cell(fx, gy, f8[i].w, 7, undefined, fitted);
      fx += f8[i].w;
    }
    gy += 7;

    // Riga E/F: CONDIZIONI DI PAGAMENTO | BANCA D'APPOGGIO
    cell(ML, gy, 95, 4, "CONDIZIONI DI PAGAMENTO");
    cell(ML + 95, gy, 95, 4, "BANCA D'APPOGGIO");
    gy += 4;

    cell(ML, gy, 95, 7, undefined, order.paymentConditions ?? "0001 - COME CONVENUTO");
    cell(
      ML + 95, gy, 95, 7, undefined,
      isFresisBranding ? "Banca FIDEURAM S.p.a. - Filiale 01 Milano" : "",
    );
    gy += 7;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 3: TABELLA ARTICOLI
    // ══════════════════════════════════════════════════════════════════════
    const tableBody = order.items.map((item) => [
      item.articleCode,
      (() => { const s = item.description ?? item.productName ?? ""; return s.startsWith(item.articleCode) ? s.slice(item.articleCode.length).trim() : (s !== item.articleCode ? s : ""); })(),
      order.unitsOfMeasure?.[item.articleCode] ?? "PZ",
      String(item.quantity),
      item.discount && item.discount > 0 ? fmtN(item.discount) : "",
      fmtN(item.price, 3),
      fmtN(lineSubtotal(item)),
      String(item.vat ?? 0),
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // CALCOLI TOTALI (prima dell'autoTable per determinare layout fisso)
    // ══════════════════════════════════════════════════════════════════════
    const scontif = 1 - (order.discountPercent ?? 0) / 100;
    const lines = order.items.map((item) => ({
      prezzotot: lineSubtotal(item),
      vatRate: item.vat ?? 0,
    }));

    // totNetto per soglia spedizione (senza spedizione)
    const { totNetto: totalNetto } = arcaDocumentTotals(lines, scontif);
    const totalMerce = round2(lines.reduce((s, l) => s + l.prezzotot, 0));
    const globalDiscAmt = totalMerce - totalNetto;

    const shipping = order.noShipping
      ? { cost: 0, tax: 0, total: 0 }
      : order.shippingCost !== undefined
        ? {
            cost: order.shippingCost,
            tax: order.shippingTax ?? 0,
            total: order.shippingCost + (order.shippingTax ?? 0),
          }
        : calculateShippingCosts(totalNetto);

    // Costruisce vatMap per le righe di display nel PDF (round per gruppo)
    const vatGroups = arcaVatGroups(lines, scontif);
    const vatMap = new Map<number, { imp: number; tax: number }>(
      vatGroups.map((g) => [g.vatRate, { imp: g.imponibile, tax: g.iva }]),
    );
    if (shipping.cost > 0) {
      const r = 22;
      const prev = vatMap.get(r) ?? { imp: 0, tax: 0 };
      // Usa round2(cost * r/100) anziché shipping.tax per garantire coerenza con arcaDocumentTotals
      const shippingIva = round2(shipping.cost * r / 100);
      vatMap.set(r, { imp: prev.imp + shipping.cost, tax: round2(prev.tax + shippingIva) });
    }
    const vatRates = [...vatMap.entries()].sort((a, b) => a[0] - b[0]);
    const nVatRows = Math.max(vatRates.length, 1);

    const totImp = [...vatMap.values()].reduce((s, v) => s + v.imp, 0);
    const totIva = [...vatMap.values()].reduce((s, v) => s + v.tax, 0);
    const totFattura = round2(totImp + totIva);

    // Layout fisso: sezioni 4+5+6 ancorate al fondo di ogni pagina
    // Ogni pagina ha identica struttura; i valori compaiono solo sull'ultima.
    const TRANSPORT_H = 36; // 4 righe × 9mm
    const TOTALS_H = 9 + 4 + 7 * nVatRows + 5 + 11 + 12; // S1+S2+S3+S4+S5+S6
    // Y_SECTIONS = punto Y dove inizia la sezione 4 su ogni pagina
    // Footer testo: a (Y_SECTIONS + TRANSPORT_H + TOTALS_H + 4) e (+8) → deve stare ≤ 287mm
    const Y_SECTIONS = 279 - TRANSPORT_H - TOTALS_H;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 3: TABELLA ARTICOLI
    // ══════════════════════════════════════════════════════════════════════
    autoTable(doc, {
      startY: gy,
      head: [["Codice", "Descrizione", "U. M.", "Q.tà", "Sconti", "Prezzo Unitario", "Prezzo Totale", "Iva"]],
      body: tableBody,
      margin: { left: ML, right: ML, bottom: PAGE_H - Y_SECTIONS, top: 15 },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          const companyName = isFresisBranding ? "FRESIS SOCIETA' COOPERATIVA" : "Komet Italia S.r.l.";
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(companyName, ML, 8);
          doc.setFont("helvetica", "normal");
          const docRef = (order.documentNumber ?? order.id) + " — " + recipientName;
          doc.text((doc.splitTextToSize(docRef, PAGE_W - ML * 2 - 50)[0] as string) ?? "", PAGE_W - ML, 8, { align: "right" });
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
          doc.line(ML, 11, PAGE_W - ML, 11);
          doc.setTextColor(0, 0, 0);
        }
      },
      tableWidth: CW,
      theme: "grid",
      headStyles: {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: [0, 0, 0] as [number, number, number],
        fontStyle: "italic",
        halign: "center",
        fontSize: 7.5,
        cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
        lineColor: [0, 0, 0] as [number, number, number],
        lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 25, halign: "left",   fontSize: 8 },
        1: { cellWidth: 65, halign: "left",   fontSize: 8 },
        2: { cellWidth: 12, halign: "center", fontSize: 8 },
        3: { cellWidth: 13, halign: "center", fontSize: 8 },
        4: { cellWidth: 15, halign: "right",  fontSize: 8 },
        5: { cellWidth: 22, halign: "right",  fontSize: 8 },
        6: { cellWidth: 22, halign: "right",  fontSize: 8 },
        7: { cellWidth: 16, halign: "center", fontSize: 8 },
      }, // 25+65+12+13+15+22+22+16 = 190 ✓
      styles: {
        cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
        lineColor: [0, 0, 0] as [number, number, number],
        lineWidth: 0.15,
        textColor: [0, 0, 0] as [number, number, number],
        fillColor: [255, 255, 255] as [number, number, number],
      },
    });

    const totalPages = doc.getNumberOfPages();

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONI 4+5+6 — ripetute su ogni pagina; valori solo sull'ultima
    // ══════════════════════════════════════════════════════════════════════
    const tW = [70, 65, 55] as const;
    const portLabels = ["PORTO", "PESO LORDO", "PESO NETTO", "VOLUME", "COLLI"] as const;
    const portVals = [
      order.portType ?? "Franco",
      order.grossWeight ? fmtN(order.grossWeight) : "",
      order.netWeight ? fmtN(order.netWeight) : "",
      order.volume ? fmtN(order.volume) : "",
      order.packages ?? "1",
    ];
    const vetW = [80, 55, 55] as const;
    const annW = [50, 50, 50, 40] as const;
    const annL = ["Annotazioni", "DATA E ORA DEL TRASPORTO", "FIRMA DEL CONDUCENTE", "FIRMA DEL DESTINATARIO"] as const;
    const s1Cols: Array<{ l: string; w: number }> = [
      { l: "TOTALE MERCE",    w: 29 },
      { l: "SC.% MERCE",      w: 22 },
      { l: "IMPORTO SCONTO",  w: 27 },
      { l: "TOTALE NETTO",    w: 28 },
      { l: "SPESE TRASPORTO", w: 30 },
      { l: "SPESE IMBALLO",   w: 27 },
      { l: "SPESE VARIE",     w: 27 },
    ];
    const s1Vals = [
      fmtN(totalMerce),
      order.discountPercent && order.discountPercent > 0 ? fmtN(order.discountPercent) : "",
      globalDiscAmt > 0 ? fmtN(globalDiscAmt) : "",
      fmtN(totalNetto),
      shipping.total > 0 ? fmtN(shipping.total) : "",
      "",
      "",
    ];
    const ivaLW = [15, 38, 32, 35] as const;
    const ivaLL = ["IVA", "IMPONIBILE", "IMPOSTA", "AGENDA CODICI"] as const;
    const ivaRW = [35, 35] as const;
    const ivaRL = ["SPESE ART. 15", "ACCONTO"] as const;
    const ivaLeftTot = ivaLW.reduce((s, w) => s + w, 0); // 120
    const allW = [...ivaLW, ...ivaRW] as number[];
    const sumCols: Array<{ l: string; w: number }> = [
      { l: "TOTALE IMPONIBILE", w: 40 },
      { l: "TOTALE IVA",        w: 33 },
      { l: "TOTALE ESENTE",     w: 33 },
      { l: "NETTO A PAGARE",    w: 34 },
    ]; // 40+33+33+34 = 140
    const rightW = CW - 140; // 50
    const sumVals = [fmtN(totImp), fmtN(totIva), "", fmtN(totFattura)];

    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      const isLast = page === totalPages;
      let ty = Y_SECTIONS;


      // ── Sezione 4: TRASPORTO ──────────────────────────────────────────
      cell(ML,                    ty, tW[0], 9, "TRASPORTO A CURA DEL",       isLast ? "Mittente" : "");
      cell(ML + tW[0],            ty, tW[1], 9, "CAUSALE DEL TRASPORTO",      isLast ? (order.transportCause ?? "Vendita") : "");
      cell(ML + tW[0] + tW[1],    ty, tW[2], 9, "ASPETTO ESTERIORE DEI BENI", isLast ? (order.aspectOfGoods ?? "BUSTE") : "");
      ty += 9;
      for (let i = 0; i < 5; i++) {
        cell(ML + i * 38, ty, 38, 9, portLabels[i], isLast ? portVals[i] : "");
      }
      ty += 9;
      cell(ML,                    ty, vetW[0], 9, "DESCRIZIONE VETTORE");
      cell(ML + vetW[0],          ty, vetW[1], 9, "DATA E ORA DEL RITIRO");
      cell(ML + vetW[0] + vetW[1],ty, vetW[2], 9, "FIRMA VETTORE");
      ty += 9;
      let ax = ML;
      for (let i = 0; i < 4; i++) { cell(ax, ty, annW[i], 9, annL[i]); ax += annW[i]; }
      ty += 9;

      // ── Sezione 5: TOTALI ─────────────────────────────────────────────
      let sx = ML;
      for (let i = 0; i < s1Cols.length; i++) {
        cell(sx, ty, s1Cols[i].w, 9, s1Cols[i].l, isLast ? s1Vals[i] : "", { vAlign: "right" });
        sx += s1Cols[i].w;
      }
      ty += 9;

      sx = ML;
      for (let i = 0; i < 4; i++) { cell(sx, ty, ivaLW[i], 4, ivaLL[i]); sx += ivaLW[i]; }
      for (let i = 0; i < 2; i++) { cell(sx, ty, ivaRW[i], 4, ivaRL[i]); sx += ivaRW[i]; }
      ty += 4;

      for (let r = 0; r < nVatRows; r++) {
        const entry = isLast ? vatRates[r] : undefined;
        const vals = entry
          ? [String(entry[0]), fmtN(entry[1].imp), fmtN(entry[1].tax), "", "", ""]
          : ["", "", "", "", "", ""];
        sx = ML;
        for (let i = 0; i < 6; i++) {
          cell(sx, ty, allW[i], 7, undefined, vals[i],
            { vAlign: i === 1 || i === 2 ? "right" : "left" });
          sx += allW[i];
        }
        ty += 7;
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(ML, ty, ivaLeftTot, 5);
      cell(ML + ivaLeftTot,             ty, ivaRW[0], 5, "ABBUONO");
      cell(ML + ivaLeftTot + ivaRW[0],  ty, ivaRW[1], 5, "OMAGGIO");
      ty += 5;

      sx = ML;
      for (const c of sumCols) { cell(sx, ty, c.w, 4, c.l); sx += c.w; }
      cell(ML + 140, ty, rightW, 4, "SCADENZE");
      ty += 4;

      sx = ML;
      for (let i = 0; i < sumCols.length; i++) {
        cell(sx, ty, sumCols[i].w, 7, undefined, isLast ? sumVals[i] : "", { vAlign: "right" });
        sx += sumCols[i].w;
      }
      cell(ML + 140, ty, rightW, 7, "TOTALE FATTURA");
      ty += 7;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(ML, ty, 140, 12);
      if (isLast) {
        cell(ML + 140, ty, rightW, 12, undefined, fmtN(totFattura), {
          vBold: true, vSize: 13, vAlign: "right",
        });
      } else {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.15);
        doc.rect(ML + 140, ty, rightW, 12);
        doc.setFontSize(6);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(80, 80, 80);
        const cx = ML + 140 + rightW / 2;
        doc.text("(continua alla", cx, ty + 5.5, { align: "center" });
        doc.text("pagina successiva)", cx, ty + 9.5, { align: "center" });
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      }
      ty += 12;

      // ── Sezione 6: FOOTER ─────────────────────────────────────────────
      const footerY = ty + 4;
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(
        "Informativa sul trattamento dei dati personali (ai sensi dell'art.13 GDPR (Regolamento Europeo UE 2016/679))",
        PAGE_W / 2, footerY, { align: "center" },
      );
      doc.text(
        "PreghiamoVi controllare esatta Vs ragione sociale. Decliniamo ogni e qualsiasi responsabilità come previsto dall'art.41 DPR 633 del 26/10/72",
        PAGE_W / 2, footerY + 4, { align: "center" },
      );
      doc.setTextColor(0, 0, 0);
    }

    // Aggiorna campo PAGINA su pagina 1 con "1/N" quando ci sono più pagine
    if (totalPages > 1) {
      doc.setPage(1);
      const paginaX = ML + 170; // x = 180mm (somma larghezze f8[0..6])
      const paginaValueY = 76;  // y riga valori (gy=72 after row B, +4 labels row C)
      doc.setFillColor(255, 255, 255);
      doc.rect(paginaX, paginaValueY, 20, 7, "F");
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.rect(paginaX, paginaValueY, 20, 7);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      const pTxt = (doc.splitTextToSize(`1/${totalPages}`, 18)[0] as string) ?? "";
      doc.text(pTxt, paginaX + 19, paginaValueY + 5, { align: "right" });
    }

    return doc;
  }


  /**
   * Download PDF for an order
   */
  getOrderPDFBlob(order: PDFOrderData): Blob {
    const doc = this.generateOrderPDF(order);
    return doc.output("blob");
  }

  getOrderPDFFileName(order: PDFOrderData): string {
    return `preventivo_${order.customerName.replace(/[^a-z0-9]/gi, "_")}_${new Date(order.createdAt).toISOString().split("T")[0]}.pdf`;
  }

  downloadOrderPDF(order: PDFOrderData): void {
    const doc = this.generateOrderPDF(order);
    const fileName = `preventivo_${order.customerName.replace(/[^a-z0-9]/gi, "_")}_${new Date(order.createdAt).toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  }

  /**
   * Print PDF for an order
   */
  printOrderPDF(order: PDFOrderData): void {
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
  downloadMultipleOrdersPDF(orders: PDFOrderData[]): void {
    orders.forEach((order) => {
      this.downloadOrderPDF(order);
    });
  }
}

export const pdfExportService = PDFExportService.getInstance();
