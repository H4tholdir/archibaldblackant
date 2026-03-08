import { DBFFile } from "dbffile";
import fs from "fs";
import path from "path";
import os from "os";
import type { ArcaData, ArcaRiga } from "../arca-data-types";
import type { FresisHistoryRow } from "../arca-import-service";
import {
  buildArcaTestata,
  buildArcaRiga,
  trimStr,
  numVal,
  deterministicId,
  normalizeSubClientCode,
  parseCascadeDiscount,
  calculateShippingTax,
  calculateItemRevenue,
  formatDate,
} from "../arca-import-service";

const FRESIS_CUSTOMER_PROFILE = "55.261";
const FRESIS_CUSTOMER_NAME = "Fresis Soc Cooperativa";
const FRESIS_DEFAULT_DISCOUNT = 63;

export type NativeParseResult = {
  records: FresisHistoryRow[];
  errors: string[];
  stats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  maxNumerodocByKey: Map<string, number>;
};

function createTempDir(): string {
  const tmpDir = path.join(
    os.tmpdir(),
    `archibald-native-parse-${Date.now()}`,
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

export async function parseNativeArcaFiles(
  doctesBuf: Buffer,
  docrigBuf: Buffer,
  anagrafeBuf: Buffer | null,
  userId: string,
  productLookup: Map<string, { listPrice: number }>,
  discountLookup: Map<string, number>,
): Promise<NativeParseResult> {
  const tmpDir = createTempDir();
  const errors: string[] = [];

  try {
    const doctesPath = path.join(tmpDir, "doctes.dbf");
    const docrigPath = path.join(tmpDir, "docrig.dbf");
    fs.writeFileSync(doctesPath, doctesBuf);
    fs.writeFileSync(docrigPath, docrigBuf);

    // Also copy .fpt memo files if they exist in the same buffer directory
    // (VFP9 memo fields need the .fpt file)
    // For native files, the .fpt is separate — we only have the .dbf buffers
    // dbffile handles VFP9 memo fields from .fpt automatically if present

    // 1. Parse ANAGRAFE -> Map<codice, name>
    const clientNameMap = new Map<string, string>();
    if (anagrafeBuf) {
      const anagrafePath = path.join(tmpDir, "ANAGRAFE.DBF");
      fs.writeFileSync(anagrafePath, anagrafeBuf);
      const anagrafeFile = await DBFFile.open(anagrafePath, {
        encoding: "latin1",
      });
      const anagrafeRows = await anagrafeFile.readRecords();
      for (const row of anagrafeRows) {
        const codice = normalizeSubClientCode(
          trimStr((row as Record<string, unknown>).CODICE),
        );
        const name = trimStr((row as Record<string, unknown>).DESCRIZION);
        if (codice && name) {
          clientNameMap.set(codice, name);
        }
      }
    }

    // 2. Parse docrig -> group by ID_TESTA
    const drFile = await DBFFile.open(docrigPath, { encoding: "latin1" });
    const drRows = await drFile.readRecords();
    const rawRowsByTesta = new Map<number, Array<Record<string, unknown>>>();

    for (const row of drRows) {
      const idTesta = numVal((row as Record<string, unknown>).ID_TESTA);
      if (!idTesta) continue;
      if (!rawRowsByTesta.has(idTesta)) {
        rawRowsByTesta.set(idTesta, []);
      }
      rawRowsByTesta.get(idTesta)!.push(row as Record<string, unknown>);
    }

    // 3. Parse doctes -> filter FT+KT -> build FresisHistoryRow
    const dtFile = await DBFFile.open(doctesPath, { encoding: "latin1" });
    const dtRows = await dtFile.readRecords();

    const records: FresisHistoryRow[] = [];
    let skippedOtherTypes = 0;
    const maxNumerodocByKey = new Map<string, number>();
    const now = new Date().toISOString();

    for (const dtRow of dtRows) {
      const row = dtRow as Record<string, unknown>;
      const tipodoc = trimStr(row.TIPODOC);

      if (tipodoc !== "FT" && tipodoc !== "KT") {
        skippedOtherTypes++;
        continue;
      }

      const dtId = numVal(row.ID);
      const esercizio = trimStr(row.ESERCIZIO);
      const codicecf = normalizeSubClientCode(trimStr(row.CODICECF));
      const numerodoc = trimStr(row.NUMERODOC);
      const spesetr = numVal(row.SPESETR);
      const speseim = numVal(row.SPESEIM);
      const speseva = numVal(row.SPESEVA);
      const spesetriva = trimStr(row.SPESETRIVA);
      const speseimiva = trimStr(row.SPESEIMIVA);
      const spesevaiva = trimStr(row.SPESEVAIVA);
      const totdoc = numVal(row.TOTDOC);
      const totmerce = numVal(row.TOTMERCE);
      const totsconto = numVal(row.TOTSCONTO);
      const scontif = numVal(row.SCONTIF);
      const datadoc = row.DATADOC;

      // Track max NUMERODOC per ESERCIZIO|TIPODOC
      const numDocInt = parseInt(numerodoc, 10);
      const trackingKey = `${esercizio}|${tipodoc}`;
      if (!isNaN(numDocInt)) {
        const currentMax = maxNumerodocByKey.get(trackingKey) ?? 0;
        if (numDocInt > currentMax) {
          maxNumerodocByKey.set(trackingKey, numDocInt);
        }
      }

      const docDiscountPercent =
        totmerce > 0
          ? Math.round((totsconto / totmerce) * 10000) / 100
          : 0;
      const totalShipping = spesetr + speseim + speseva;
      const shippingTax = calculateShippingTax(
        spesetr,
        spesetriva,
        speseim,
        speseimiva,
        speseva,
        spesevaiva,
      );

      const clientName = clientNameMap.get(codicecf) || codicecf;

      const rawDrRows = rawRowsByTesta.get(dtId) || [];
      if (rawDrRows.length === 0) {
        errors.push(
          `${tipodoc} ${numerodoc}/${esercizio}: nessuna riga in docrig (ID_TESTA=${dtId})`,
        );
      }

      const arcaRighe: ArcaRiga[] = [];
      const items: Array<{
        productId: string;
        productName: string;
        articleCode: string;
        description: string;
        quantity: number;
        price: number;
        total: number;
        unit: string;
        rowNumber: number;
        discount: number | undefined;
        vat: number;
        originalListPrice?: number;
      }> = [];

      const globalDiscountPct =
        scontif < 1 ? Math.round((1 - scontif) * 10000) / 100 : 0;

      let totalRevenue = 0;

      for (const drRow of rawDrRows) {
        const arcaRiga = buildArcaRiga(drRow);
        arcaRighe.push(arcaRiga);

        const articleCode = arcaRiga.CODICEARTI;
        const description = arcaRiga.DESCRIZION;
        const rowDiscount = parseCascadeDiscount(arcaRiga.SCONTI);
        const vatCode = arcaRiga.ALIIVA;
        const vat = parseFloat(vatCode) || 0;

        const productName = articleCode;
        const productId = articleCode;

        const listPrice =
          productLookup.get(articleCode)?.listPrice ?? arcaRiga.PREZZOUN;
        const fresisDiscount =
          discountLookup.get(articleCode) ?? FRESIS_DEFAULT_DISCOUNT;
        const itemRevenue = calculateItemRevenue(
          arcaRiga.PREZZOUN,
          arcaRiga.QUANTITA,
          rowDiscount,
          globalDiscountPct,
          listPrice,
          fresisDiscount,
        );
        totalRevenue += itemRevenue;

        items.push({
          productId,
          productName,
          articleCode,
          description,
          quantity: arcaRiga.QUANTITA,
          price: arcaRiga.PREZZOUN,
          total: arcaRiga.PREZZOTOT,
          unit: arcaRiga.UNMISURA,
          rowNumber: arcaRiga.NUMERORIGA,
          discount: rowDiscount || undefined,
          vat,
          originalListPrice: listPrice,
        });
      }

      const arcaTestata = buildArcaTestata(row);

      const arcaData: ArcaData = {
        testata: arcaTestata,
        righe: arcaRighe,
      };

      const invoiceDate = formatDate(datadoc);
      const invoiceNumber = `${tipodoc} ${numerodoc}/${esercizio}`;

      // Deterministic ID includes TIPODOC to distinguish FT/KT with same NUMERODOC
      const id = deterministicId(
        userId,
        esercizio,
        tipodoc,
        numerodoc,
        codicecf,
      );

      records.push({
        id,
        user_id: userId,
        original_pending_order_id: null,
        sub_client_codice: codicecf,
        sub_client_name: clientName,
        sub_client_data: null,
        customer_id: FRESIS_CUSTOMER_PROFILE,
        customer_name: FRESIS_CUSTOMER_NAME,
        items: JSON.stringify(items),
        discount_percent: docDiscountPercent || null,
        target_total_with_vat: totdoc,
        shipping_cost: totalShipping || null,
        shipping_tax: shippingTax || null,
        revenue: Math.round(totalRevenue * 100) / 100 || null,
        merged_into_order_id: null,
        merged_at: null,
        created_at: invoiceDate || now,
        updated_at: now,
        notes: trimStr(row.NOTE) || null,
        archibald_order_id: null,
        archibald_order_number: invoiceNumber,
        current_state: "importato_arca",
        state_updated_at: now,
        ddt_number: null,
        ddt_delivery_date: null,
        tracking_number: null,
        tracking_url: null,
        tracking_courier: null,
        delivery_completed_date: null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        invoice_amount: totdoc.toFixed(2),
        arca_data: JSON.stringify(arcaData),
        source: "arca_import",
      });
    }

    return {
      records,
      errors,
      stats: {
        totalDocuments: records.length,
        totalRows: drRows.length,
        totalClients: clientNameMap.size,
        skippedOtherTypes,
      },
      maxNumerodocByKey,
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}
