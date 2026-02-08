import { DBFFile } from "dbffile";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";
import crypto from "crypto";

interface ArcaClientData {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale?: string;
  indirizzo?: string;
  cap?: string;
  localita?: string;
  prov?: string;
  telefono?: string;
  fax?: string;
  email?: string;
  partitaIva?: string;
  codFiscale?: string;
  zona?: string;
  persDaContattare?: string;
  emailAmministraz?: string;
}

interface ArcaItem {
  productId: string;
  productName: string;
  articleCode: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
  unit: string;
  rowNumber: number;
  discount: number;
  vat: number;
}

interface FresisHistoryRow {
  id: string;
  user_id: string;
  original_pending_order_id: string | null;
  sub_client_codice: string;
  sub_client_name: string;
  sub_client_data: string | null;
  customer_id: string;
  customer_name: string;
  items: string;
  discount_percent: number | null;
  target_total_with_vat: number | null;
  shipping_cost: number | null;
  shipping_tax: number | null;
  merged_into_order_id: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  archibald_order_id: string | null;
  archibald_order_number: string | null;
  current_state: string;
  state_updated_at: string | null;
  ddt_number: string | null;
  ddt_delivery_date: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_courier: string | null;
  delivery_completed_date: string | null;
  invoice_number: string;
  invoice_date: string | null;
  invoice_amount: string | null;
  source: string;
}

interface ParseResult {
  records: FresisHistoryRow[];
  errors: string[];
  stats: {
    totalInvoices: number;
    totalRows: number;
    totalClients: number;
    skippedNonInvoice: number;
  };
}

function createTempDir(): string {
  const tmpDir = path.join(
    os.tmpdir(),
    `archibald-arca-import-${Date.now()}`,
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function trimStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function deterministicId(...parts: string[]): string {
  const hash = crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function parseCascadeDiscount(sconti: string): number {
  const s = sconti.trim();
  if (!s) return 0;
  const parts = s.split("+").map((p) => parseFloat(p.trim()));
  if (parts.some(isNaN)) return 0;
  let factor = 1;
  for (const pct of parts) {
    factor *= 1 - pct / 100;
  }
  return Math.round((1 - factor) * 10000) / 100;
}

function formatDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    return d.toISOString();
  }
  return null;
}

export async function parseArcaExport(
  uploadedFiles: Array<{ originalName: string; buffer: Buffer }>,
  userId: string,
): Promise<ParseResult> {
  const tmpDir = createTempDir();
  const errors: string[] = [];

  try {
    // Write ALL files preserving original names so dbffile finds .DBT companions
    let dtPath: string | null = null;
    let drPath: string | null = null;
    let cfPath: string | null = null;

    for (const file of uploadedFiles) {
      const filePath = path.join(tmpDir, file.originalName);
      fs.writeFileSync(filePath, file.buffer);

      const nameUpper = file.originalName.toUpperCase();
      if (nameUpper.endsWith("DT.DBF")) dtPath = filePath;
      else if (nameUpper.endsWith("DR.DBF")) drPath = filePath;
      else if (nameUpper.endsWith("CF.DBF")) cfPath = filePath;
    }

    if (!dtPath || !drPath || !cfPath) {
      throw new Error("File DT, DR o CF mancanti");
    }

    // 1. Parse CF → client map
    const cfFile = await DBFFile.open(cfPath, { encoding: "latin1" });
    const cfRows = await cfFile.readRecords();
    const clientMap = new Map<string, ArcaClientData>();

    for (const row of cfRows) {
      const codice = trimStr((row as any).CODICE);
      if (!codice) continue;

      clientMap.set(codice, {
        codice,
        ragioneSociale: trimStr((row as any).DESCRIZION),
        supplRagioneSociale: trimStr((row as any).SUPRAGSOC) || undefined,
        indirizzo: trimStr((row as any).INDIRIZZO) || undefined,
        cap: trimStr((row as any).CAP) || undefined,
        localita: trimStr((row as any).LOCALITA) || undefined,
        prov: trimStr((row as any).PROV) || undefined,
        telefono: trimStr((row as any).TELEFONO) || undefined,
        fax: trimStr((row as any).FAX) || undefined,
        email: trimStr((row as any).EMAIL) || undefined,
        partitaIva: trimStr((row as any).PARTIVA) || undefined,
        codFiscale: trimStr((row as any).CODFISCALE) || undefined,
        zona: trimStr((row as any).ZONA) || undefined,
        persDaContattare: trimStr((row as any).PERSDACONT) || undefined,
        emailAmministraz: trimStr((row as any).EMAILAMM) || undefined,
      });
    }

    // 2. Parse DR → rows grouped by ID_TESTA
    const drFile = await DBFFile.open(drPath, { encoding: "latin1" });
    const drRows = await drFile.readRecords();
    const rowsByTesta = new Map<number, ArcaItem[]>();

    for (const row of drRows) {
      const idTesta = (row as any).ID_TESTA as number;
      if (!idTesta) continue;

      const articleCode = trimStr((row as any).CODICEARTI);
      const description = trimStr((row as any).DESCRIZION);
      const quantity = ((row as any).QUANTITA as number) || 0;
      const priceUnit = ((row as any).PREZZOUN as number) || 0;
      const priceTotal = ((row as any).PREZZOTOT as number) || 0;
      const rowDiscount = parseCascadeDiscount(trimStr((row as any).SCONTI));
      const vatCode = trimStr((row as any).ALIIVA);
      const vat = parseFloat(vatCode) || 0;

      const item: ArcaItem = {
        productId: articleCode,
        productName: articleCode,
        articleCode,
        description,
        quantity,
        price: priceUnit,
        total: priceTotal,
        unit: trimStr((row as any).UNMISURA),
        rowNumber: ((row as any).NUMERORIGA as number) || 0,
        discount: rowDiscount,
        vat,
      };

      if (!rowsByTesta.has(idTesta)) {
        rowsByTesta.set(idTesta, []);
      }
      rowsByTesta.get(idTesta)!.push(item);
    }

    // 3. Parse DT → invoices
    const dtFile = await DBFFile.open(dtPath, { encoding: "latin1" });
    const dtRows = await dtFile.readRecords();

    const records: FresisHistoryRow[] = [];
    let skippedNonInvoice = 0;

    const now = new Date().toISOString();

    for (const row of dtRows) {
      const tipodoc = trimStr((row as any).TIPODOC);
      if (tipodoc !== "FT") {
        skippedNonInvoice++;
        continue;
      }

      const dtId = (row as any).ID as number;
      const codicecf = trimStr((row as any).CODICECF);
      const numerodoc = trimStr((row as any).NUMERODOC);
      const datadoc = (row as any).DATADOC;
      const totdoc = ((row as any).TOTDOC as number) || 0;
      const totmerce = ((row as any).TOTMERCE as number) || 0;
      const totsconto = ((row as any).TOTSCONTO as number) || 0;
      const spesetr = ((row as any).SPESETR as number) || 0;
      const speseim = ((row as any).SPESEIM as number) || 0;
      const speseva = ((row as any).SPESEVA as number) || 0;
      const totiva = ((row as any).TOTIVA as number) || 0;

      const docDiscountPercent =
        totmerce > 0
          ? Math.round((totsconto / totmerce) * 10000) / 100
          : 0;
      const totalShipping = spesetr + speseim + speseva;

      const client = clientMap.get(codicecf);
      if (!client) {
        errors.push(
          `Fattura ${numerodoc}: cliente ${codicecf} non trovato in CF`,
        );
      }

      const items = rowsByTesta.get(dtId) || [];
      if (items.length === 0) {
        errors.push(
          `Fattura ${numerodoc}: nessuna riga trovata in DR (ID_TESTA=${dtId})`,
        );
      }

      const invoiceDate = formatDate(datadoc);
      const clientName = client?.ragioneSociale || codicecf;

      records.push({
        id: deterministicId(userId, numerodoc, codicecf),
        user_id: userId,
        original_pending_order_id: null,
        sub_client_codice: codicecf,
        sub_client_name: clientName,
        sub_client_data: client ? JSON.stringify(client) : null,
        customer_id: "fresis-import",
        customer_name: clientName,
        items: JSON.stringify(
          items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            articleCode: item.articleCode,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            vat: item.vat,
            discount: item.discount || undefined,
          })),
        ),
        discount_percent: docDiscountPercent || null,
        target_total_with_vat: totdoc,
        shipping_cost: totalShipping || null,
        shipping_tax: totiva || null,
        merged_into_order_id: null,
        merged_at: null,
        created_at: invoiceDate || now,
        updated_at: now,
        notes: null,
        archibald_order_id: null,
        archibald_order_number: null,
        current_state: "importato_arca",
        state_updated_at: now,
        ddt_number: null,
        ddt_delivery_date: null,
        tracking_number: null,
        tracking_url: null,
        tracking_courier: null,
        delivery_completed_date: null,
        invoice_number: numerodoc,
        invoice_date: invoiceDate,
        invoice_amount: totdoc.toFixed(2),
        source: "arca_import",
      });
    }

    return {
      records,
      errors,
      stats: {
        totalInvoices: records.length,
        totalRows: drRows.length,
        totalClients: clientMap.size,
        skippedNonInvoice,
      },
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}
