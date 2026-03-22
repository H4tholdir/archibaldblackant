import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PendingOrderItem } from "../types/pending-order";
import type { SubClient } from "../types/sub-client";
import type { Customer } from "../types/customer";

export type PDFOrderData = {
  id: string;
  customerId: string;
  customerName: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  createdAt: string;
  subClientCodice?: string;
  subClientData?: SubClient;
  customerData?: Customer;
  noShipping?: boolean;
};
import { calculateShippingCosts } from "../utils/order-calculations";
import { FRESIS_LOGO_BASE64 } from "../assets/fresis-logo-base64";

// Komet logo as base64 (to be embedded in PDF)
const KOMET_LOGO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAtEAAADZCAMAAADR25xxAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAALWUExURQAAAFWqqmefz0+Tx0yRxkSLwkKJwjuHwTqKwjJ/vSx4uC17uix6uUyZskWFvzCAvi9/vC59vS59vCt3uix4tyt2tydsszR7uUiNwixytTKDvDGCvjGDvyp0uClztylxtiZrsk9vjzeIwjKFwShwtihvsziJwjOGwiZrsylvtChvtCdttDeJwyx0tDqKwzSIwTWIwit1tTN3tiVqsiVqsT6LxCVpsjWFwCtxtEGMxTOHvjmNw0KVx0mYyU2fyVWkzF+pz2Kw1Giv0Wu111yv01as0lGq0USOxXe72n6+24O/3InE34zG4IbC3nC42UadyEiOxk2RxlifxXi11ZDH4ZTJ4ZjL4pvN5GS01Uyp0UOlzj+fyTuXxDCAuliVyZTF3aPO4qbS5arU56LR5Z/O5Uenz0Giy1uXyGukzYzA2q3W6LHY6bTb6jeNvypys0uPx7fd7Lre7D6bxzmRwjWKvVSTyF+Yy3KozYy71r7g7cHi7TyZxmedzH2x0p3K38Xk71GSyIW31Mjm8DmQwD2Qxcro8mCjyDqUw83q82Oay9Ls9HitzzOGvLrY5nGw0ZzE2zeOvydtsTaLvi17tyhwsc/n77LR4zaMvjeNvjKDuiRpsbTW5S99t3+51iVqsJS/2DWJvKvO4TeNvTSGui9+uUWHvTp+uZ3S5Nzs8ePv8+vz9+fx9djp8M7j7cHc6CNnry97s+72+PH3+ff6+/n7+/v8/P39/P39/fX5+tTn78ff6lSRwqPJ3kaXwt/t8v7+/P38/TKCuP7+/muqy1KZwkqSvkKNuz2KujuGt0CDu0uKv/z+/TB/tS99tC16six4sSx4sDGAty15sSt1rzWAtDd3tyVssv/+/TxCRztARjtBRjpARjpARzpBRztCRTtARTxBRjpCRjpCRzxBRztARDtCRjpBRjpARTxARTtBRTxARztESDpBRTtBRzhCSz0/RDtCRwAAAHITRzwAAADydFJOU/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AkDR/aQAAAAlwSFlzAAAOwwAADsMBx2+oZAAATw1JREFUeF7tvT9vG1nW7X2/weUTEZ0wccrYgAOBGFgNqAVFVmB7DCgwIAGj6HUyDViPCDMxRbCEthOlNA3Q5kxJQ8iRrqZ1ZUgMDAUEgWJP3sALdDDADPob3LXW3kVWFUlLtuUHPa1a/Fd16lTVIfmrxX1OnTr8X7/myvV7Uk50rt+XcqJz/b6UE53r96Wc6Fy/L+VE5/p96X+K6DvlcrkYlEqFElXEXMeX5Mp1nfraRHfKxUJQwq2Ip1ucKODJuKZuF+94zly5rkNfkehSMQiKhXKJN0BcBtDlUqEAnAl10ZGGYZdKvaKvkyvXF+orER2Uy8Q5uFUo4E6sQTEmCrRpgzqF9W3efd1cub5AX4NoBMnlcgF38nwLz7dKxJqCT+uFt4xu8+ZbyJXrc3XdRN8plgPcSuVbUKFMphl2CGcIbCvwiE16zDVM2qDO4+pcX6TrJbpcvgWU7e6iSyOEVvAhj5ZLG9MpyaN1z4PqXJ+vayQaoTNuDvJEdGZ5swUcmJyYNG065tmexfTtYuDbzJXrE3VtRCt4puDPaazjcNpjaeNaOFNRsRRpYmLSUm7UuT5L10Q03JnnUGjTqBMifk5KME9qh2SaWI+hBtb+OuYZ6uXVxFyfoWshGhjfucO7K2vT4Fl3V7K9o1Aae7Qij4RN93o9336uXFfWNRAdLAR3KDyXk1BPJKDl0c6ycNZTfF5ccpb5XOrlTOf6HH0x0QFJBsrGc2cMdcwyZAkMSAxu0uxMi2c/z5KuHBLo0u1elDOd65P0hUQHiDWSwqwH1OUCCN5aWF+oVO5W7pq+XVx8WFlf2Npi+7RgnvJou7l6MGrcfV+5cl1BX0Q0ce4sGMtJgXOCvLS0vBJreUkS13/4tkKu6wFNOiP4sjzaJlz5+fFcV9aXEO383rmzMMEawcfC2jlRvg9V71erRvTSypJBfZdULy5WFtfX1zfq9SAoFSKP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";

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
    const ML = 10;
    const CW = 190; // content width

    const isFresis = !!order.subClientCodice;

    const fmtN = (n: number, dec = 2): string =>
      n.toLocaleString("it-IT", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });

    const lineSubtotal = (item: PendingOrderItem): number =>
      item.price * item.quantity * (1 - (item.discount || 0) / 100);

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
      if (isFresis) {
        doc.addImage(FRESIS_LOGO_BASE64, "JPEG", ML, 10, 42, 17);
      } else {
        doc.addImage(KOMET_LOGO_BASE64, "PNG", ML, 10, 42, 17);
      }
    } catch {
      /* ignore */
    }

    // Blocco azienda (sotto il logo)
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    if (isFresis) {
      doc.text("FRESIS SOCIETA' COOPERATIVA", ML, 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Via S. Vito, 43", ML, 34.5);
      doc.text("80056 ERCOLANO (NA) - Italia", ML, 39);
      doc.text("Banca FIDEURAM S.p.a. - Filiale 01 Milano", ML, 43.5);
      doc.text("IBAN: IT89U0329601601000064395512", ML, 48);
      doc.text("P.Iva 08246131216", ML, 52.5);
    } else {
      doc.text("Komet Italia S.r.l.", ML, 30);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("Agente Formicola Biagio", ML, 34.5);
      doc.setFont("helvetica", "normal");
      doc.text("Via Gianbattista Morgagni, 36", ML, 39);
      doc.text("37135 Verona (VR) Italy", ML, 43.5);
    }

    // SPETT.LE (lato destro dell'header)
    const spettX = ML + 93;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    doc.text("SPETT.LE", spettX, 13);

    const recipientName = isFresis && order.subClientData
      ? order.subClientData.ragioneSociale
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

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text("Luogo di Consegna", spettX, 56);

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
      order.id,
      new Date(order.createdAt).toLocaleDateString("it-IT"),
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

    cell(ML, gy, 95, 7, undefined, "0001 - COME CONVENUTO");
    cell(
      ML + 95, gy, 95, 7, undefined,
      isFresis ? "Banca FIDEURAM S.p.a. - Filiale 01 Milano" : "",
    );
    gy += 7;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 3: TABELLA ARTICOLI
    // ══════════════════════════════════════════════════════════════════════
    const tableBody = order.items.map((item) => [
      item.articleCode,
      item.productName ?? item.articleCode,
      "PZ",
      String(item.quantity),
      item.discount && item.discount > 0 ? fmtN(item.discount) : "",
      fmtN(item.price, 3),
      fmtN(lineSubtotal(item)),
      String(item.vat ?? 0),
    ]);

    autoTable(doc, {
      startY: gy,
      head: [["Codice", "Descrizione", "U. M.", "Q.tà", "Sconti", "Prezzo Unitario", "Prezzo Totale", "Iva"]],
      body: tableBody,
      margin: { left: ML, right: ML },
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterTable: number = (doc as any).lastAutoTable?.finalY ?? gy + 20;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 4: TRASPORTO
    // ══════════════════════════════════════════════════════════════════════
    let ty = afterTable;

    // T1: TRASPORTO/CAUSALE/ASPETTO (label + valore nella stessa cella)
    const tW = [70, 65, 55] as const; // 70+65+55 = 190 ✓
    cell(ML,                    ty, tW[0], 9, "TRASPORTO A CURA DEL",      "Mittente");
    cell(ML + tW[0],            ty, tW[1], 9, "CAUSALE DEL TRASPORTO",     "Vendita");
    cell(ML + tW[0] + tW[1],    ty, tW[2], 9, "ASPETTO ESTERIORE DEI BENI","BUSTE");
    ty += 9;

    // T2: PORTO/PESO/VOLUME/COLLI  (38×5 = 190 ✓)
    const portLabels = ["PORTO", "PESO LORDO", "PESO NETTO", "VOLUME", "COLLI"] as const;
    const portVals   = ["Franco", "", "", "", "1"] as const;
    for (let i = 0; i < 5; i++) {
      cell(ML + i * 38, ty, 38, 9, portLabels[i], portVals[i]);
    }
    ty += 9;

    // T3: VETTORE  (80+55+55 = 190 ✓)
    const vetW = [80, 55, 55] as const;
    cell(ML,                    ty, vetW[0], 9, "DESCRIZIONE VETTORE");
    cell(ML + vetW[0],          ty, vetW[1], 9, "DATA E ORA DEL RITIRO");
    cell(ML + vetW[0] + vetW[1],ty, vetW[2], 9, "FIRMA VETTORE");
    ty += 9;

    // T4: ANNOTAZIONI / DATE E FIRME  (50+50+50+40 = 190 ✓)
    const annW = [50, 50, 50, 40] as const;
    const annL = ["Annotazioni","DATA E ORA DEL TRASPORTO","FIRMA DEL CONDUCENTE","FIRMA DEL DESTINATARIO"] as const;
    let ax = ML;
    for (let i = 0; i < 4; i++) { cell(ax, ty, annW[i], 9, annL[i]); ax += annW[i]; }
    ty += 9;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 5: TOTALI
    // ══════════════════════════════════════════════════════════════════════

    // Calcoli
    const totalMerce = order.items.reduce((s, it) => s + lineSubtotal(it), 0);
    const globalDiscAmt =
      order.discountPercent && order.discountPercent > 0
        ? (totalMerce * order.discountPercent) / 100
        : 0;
    const totalNetto = totalMerce - globalDiscAmt;

    const shipping = order.noShipping
      ? { cost: 0, tax: 0, total: 0 }
      : calculateShippingCosts(totalNetto);

    // Breakdown IVA per aliquota
    const vatMap = new Map<number, { imp: number; tax: number }>();
    for (const item of order.items) {
      const sub = lineSubtotal(item) * (1 - (order.discountPercent ?? 0) / 100);
      const rate = item.vat ?? 0;
      const prev = vatMap.get(rate) ?? { imp: 0, tax: 0 };
      vatMap.set(rate, { imp: prev.imp + sub, tax: prev.tax + sub * (rate / 100) });
    }
    if (shipping.cost > 0) {
      const r = 22;
      const prev = vatMap.get(r) ?? { imp: 0, tax: 0 };
      vatMap.set(r, { imp: prev.imp + shipping.cost, tax: prev.tax + shipping.tax });
    }

    const totImp = [...vatMap.values()].reduce((s, v) => s + v.imp, 0);
    const totIva = [...vatMap.values()].reduce((s, v) => s + v.tax, 0);
    const totFattura = totImp + totIva;

    // S1: TOTALE MERCE … SPESE VARIE  (29+22+27+28+30+27+27 = 190 ✓)
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
    let sx = ML;
    for (let i = 0; i < s1Cols.length; i++) {
      cell(sx, ty, s1Cols[i].w, 9, s1Cols[i].l, s1Vals[i], { vAlign: "right" });
      sx += s1Cols[i].w;
    }
    ty += 9;

    // S2: IVA etichette  (15+38+32+35 = 120) + SPESE ART.15/ACCONTO (35+35 = 70)
    const ivaLW = [15, 38, 32, 35] as const;
    const ivaLL = ["IVA", "IMPONIBILE", "IMPOSTA", "AGENDA CODICI"] as const;
    const ivaRW = [35, 35] as const;
    const ivaRL = ["SPESE ART. 15", "ACCONTO"] as const;

    sx = ML;
    for (let i = 0; i < 4; i++) { cell(sx, ty, ivaLW[i], 4, ivaLL[i]); sx += ivaLW[i]; }
    for (let i = 0; i < 2; i++) { cell(sx, ty, ivaRW[i], 4, ivaRL[i]); sx += ivaRW[i]; }
    ty += 4;

    // S3: righe valori IVA per aliquota
    const vatRates = [...vatMap.entries()].sort((a, b) => a[0] - b[0]);
    for (const [rate, { imp, tax }] of vatRates) {
      const vals = [String(rate), fmtN(imp), fmtN(tax), "", "", ""];
      const allW = [...ivaLW, ...ivaRW];
      sx = ML;
      for (let i = 0; i < 6; i++) {
        cell(sx, ty, allW[i], 7, undefined, vals[i],
          { vAlign: i === 1 || i === 2 ? "right" : "left" });
        sx += allW[i];
      }
      ty += 7;
    }

    // S4: ABBUONO / OMAGGIO
    const ivaLeftTot = ivaLW.reduce((s, w) => s + w, 0); // 120
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.rect(ML, ty, ivaLeftTot, 5);
    cell(ML + ivaLeftTot,             ty, ivaRW[0], 5, "ABBUONO");
    cell(ML + ivaLeftTot + ivaRW[0],  ty, ivaRW[1], 5, "OMAGGIO");
    ty += 5;

    // S5: TOTALE IMPONIBILE … NETTO A PAGARE (140mm) + SCADENZE header (50mm)
    const sumCols: Array<{ l: string; w: number }> = [
      { l: "TOTALE IMPONIBILE", w: 40 },
      { l: "TOTALE IVA",        w: 33 },
      { l: "TOTALE ESENTE",     w: 33 },
      { l: "NETTO A PAGARE",    w: 34 },
    ]; // 40+33+33+34 = 140
    const rightW = CW - 140; // 50

    sx = ML;
    for (const c of sumCols) { cell(sx, ty, c.w, 4, c.l); sx += c.w; }
    cell(ML + 140, ty, rightW, 4, "SCADENZE");
    ty += 4;

    const sumVals = [fmtN(totImp), fmtN(totIva), "", fmtN(totFattura)];
    sx = ML;
    for (let i = 0; i < sumCols.length; i++) {
      cell(sx, ty, sumCols[i].w, 7, undefined, sumVals[i], { vAlign: "right" });
      sx += sumCols[i].w;
    }
    cell(ML + 140, ty, rightW, 7, "TOTALE FATTURA");
    ty += 7;

    // S6: SCADENZE vuote (140mm) + valore TOTALE FATTURA grande (50mm)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.rect(ML, ty, 140, 12);
    cell(ML + 140, ty, rightW, 12, undefined, fmtN(totFattura), {
      vBold: true, vSize: 13, vAlign: "right",
    });
    ty += 12;

    // ══════════════════════════════════════════════════════════════════════
    // SEZIONE 6: FOOTER — note legali
    // ══════════════════════════════════════════════════════════════════════
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
