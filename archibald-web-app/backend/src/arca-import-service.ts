import { DBFFile } from "dbffile";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type Database from "better-sqlite3";
import { logger } from "./logger";
import type { ArcaData, ArcaTestata, ArcaRiga, ArcaDestinazione, ArcaClientData } from "./arca-data-types";

const FRESIS_CUSTOMER_PROFILE = "55.261";
const FRESIS_CUSTOMER_NAME = "Fresis Soc Cooperativa";
const FRESIS_DEFAULT_DISCOUNT = 63;

interface ArcaArticle {
  codice: string;
  descrizione: string;
  listino1: number;
  ivavend: string;
  gruppo: string;
}

export interface FresisHistoryRow {
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
  revenue: number | null;
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
  arca_data: string | null;
  source: string;
}

export interface ParseResult {
  records: FresisHistoryRow[];
  errors: string[];
  stats: {
    totalInvoices: number;
    totalRows: number;
    totalClients: number;
    totalArticles: number;
    skippedNonInvoice: number;
  };
  maxNumerodocByEsercizio: Map<string, number>;
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

export function trimStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function deterministicId(...parts: string[]): string {
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

export function parseCascadeDiscount(sconti: string): number {
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

export function normalizeSubClientCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return trimmed;
  const withoutC = trimmed.startsWith("C") ? trimmed.slice(1) : trimmed;
  if (withoutC.startsWith(".")) return `C${withoutC}`;
  if (/^\d+$/.test(withoutC)) return `C${withoutC.padStart(5, "0")}`;
  const match = withoutC.match(/^(\d+)([A-Z]+)$/);
  if (match) return `C${match[1].padStart(5 - match[2].length, "0")}${match[2]}`;
  return trimmed.startsWith("C") ? trimmed : `C${trimmed}`;
}

function formatDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    return d.toISOString();
  }
  return null;
}

function numVal(v: unknown): number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function boolVal(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "T" || v === "t" || v === "Y" || v === "y") return true;
  return false;
}

function buildArcaTestata(row: Record<string, unknown>): ArcaTestata {
  return {
    ID: numVal(row.ID),
    ESERCIZIO: trimStr(row.ESERCIZIO),
    ESANNO: trimStr(row.ESANNO),
    TIPODOC: trimStr(row.TIPODOC),
    NUMERODOC: trimStr(row.NUMERODOC),
    DATADOC: formatDate(row.DATADOC),
    CODICECF: trimStr(row.CODICECF),
    CODCNT: trimStr(row.CODCNT),
    MAGPARTENZ: trimStr(row.MAGPARTENZ),
    MAGARRIVO: trimStr(row.MAGARRIVO),
    NUMRIGHEPR: numVal(row.NUMRIGHEPR),
    AGENTE: trimStr(row.AGENTE),
    AGENTE2: trimStr(row.AGENTE2),
    VALUTA: trimStr(row.VALUTA),
    PAG: trimStr(row.PAG),
    SCONTI: trimStr(row.SCONTI),
    SCONTIF: numVal(row.SCONTIF),
    SCONTOCASS: trimStr(row.SCONTOCASS),
    SCONTOCASF: numVal(row.SCONTOCASF),
    PROVV: trimStr(row.PROVV),
    PROVV2: trimStr(row.PROVV2),
    CAMBIO: numVal(row.CAMBIO),
    DATADOCFOR: formatDate(row.DATADOCFOR),
    NUMERODOCF: trimStr(row.NUMERODOCF),
    TIPOMODULO: trimStr(row.TIPOMODULO),
    LISTINO: trimStr(row.LISTINO),
    ZONA: trimStr(row.ZONA),
    SETTORE: trimStr(row.SETTORE),
    DESTDIV: trimStr(row.DESTDIV),
    DATACONSEG: formatDate(row.DATACONSEG),
    TRDATA: formatDate(row.TRDATA),
    TRORA: trimStr(row.TRORA),
    PESOLORDO: numVal(row.PESOLORDO),
    PESONETTO: numVal(row.PESONETTO),
    VOLUME: numVal(row.VOLUME),
    VETTORE1: trimStr(row.VETTORE1),
    V1DATA: formatDate(row.V1DATA),
    V1ORA: trimStr(row.V1ORA),
    VETTORE2: trimStr(row.VETTORE2),
    V2DATA: formatDate(row.V2DATA),
    V2ORA: trimStr(row.V2ORA),
    TRCAUSALE: trimStr(row.TRCAUSALE),
    COLLI: trimStr(row.COLLI),
    SPEDIZIONE: trimStr(row.SPEDIZIONE),
    PORTO: trimStr(row.PORTO),
    NOTE: trimStr(row.NOTE),
    SPESETR: numVal(row.SPESETR),
    SPESETRIVA: trimStr(row.SPESETRIVA),
    SPESETRCP: trimStr(row.SPESETRCP),
    SPESETRPER: trimStr(row.SPESETRPER),
    SPESEIM: numVal(row.SPESEIM),
    SPESEIMIVA: trimStr(row.SPESEIMIVA),
    SPESEIMCP: trimStr(row.SPESEIMCP),
    SPESEVA: numVal(row.SPESEVA),
    SPESEVAIVA: trimStr(row.SPESEVAIVA),
    SPESEVACP: trimStr(row.SPESEVACP),
    ACCONTO: numVal(row.ACCONTO),
    ABBUONO: numVal(row.ABBUONO),
    TOTIMP: numVal(row.TOTIMP),
    TOTDOC: numVal(row.TOTDOC),
    SPESE: trimStr(row.SPESE),
    SPESEBOLLI: numVal(row.SPESEBOLLI),
    SPESEINCAS: numVal(row.SPESEINCAS),
    SPESEINEFF: numVal(row.SPESEINEFF),
    SPESEINDOC: numVal(row.SPESEINDOC),
    SPESEINIVA: trimStr(row.SPESEINIVA),
    SPESEINCP: trimStr(row.SPESEINCP),
    SPESEESENZ: numVal(row.SPESEESENZ),
    CODCAUMAG: trimStr(row.CODCAUMAG),
    CODBANCA: trimStr(row.CODBANCA),
    PERCPROVV: numVal(row.PERCPROVV),
    IMPPROVV: numVal(row.IMPPROVV),
    TOTPROVV: numVal(row.TOTPROVV),
    PERCPROVV2: numVal(row.PERCPROVV2),
    IMPPROVV2: numVal(row.IMPPROVV2),
    TOTPROVV2: numVal(row.TOTPROVV2),
    TOTIVA: numVal(row.TOTIVA),
    ASPBENI: trimStr(row.ASPBENI),
    SCORPORO: boolVal(row.SCORPORO),
    TOTMERCE: numVal(row.TOTMERCE),
    TOTSCONTO: numVal(row.TOTSCONTO),
    TOTNETTO: numVal(row.TOTNETTO),
    TOTESEN: numVal(row.TOTESEN),
    IMPCOND: numVal(row.IMPCOND),
    RITCOND: numVal(row.RITCOND),
    TIPOFATT: trimStr(row.TIPOFATT),
    TRIANGOLAZ: boolVal(row.TRIANGOLAZ),
    NOMODIFICA: boolVal(row.NOMODIFICA),
    NOEVASIONE: boolVal(row.NOEVASIONE),
    COMMESSA: trimStr(row.COMMESSA),
    EUROCAMBIO: numVal(row.EUROCAMBIO),
    EXPORT_I: boolVal(row.EXPORT_I),
    CB_BIC: trimStr(row.CB_BIC),
    CB_NAZIONE: trimStr(row.CB_NAZIONE),
    CB_CIN_UE: trimStr(row.CB_CIN_UE),
    CB_CIN_IT: trimStr(row.CB_CIN_IT),
    ABICAB: trimStr(row.ABICAB),
    CONTOCORR: trimStr(row.CONTOCORR),
    CARICATORE: trimStr(row.CARICATORE),
    COMMITTENT: trimStr(row.COMMITTENT),
    PROPRMERCE: trimStr(row.PROPRMERCE),
    LUOGOCAR: trimStr(row.LUOGOCAR),
    LUOGOSCAR: trimStr(row.LUOGOSCAR),
    SDTALTRO: trimStr(row.SDTALTRO),
    TIMESTAMP: formatDate(row.TIMESTAMP),
    USERNAME: trimStr(row.USERNAME),
  };
}

function buildArcaRiga(row: Record<string, unknown>): ArcaRiga {
  return {
    ID: numVal(row.ID),
    ID_TESTA: numVal(row.ID_TESTA),
    ESERCIZIO: trimStr(row.ESERCIZIO),
    TIPODOC: trimStr(row.TIPODOC),
    NUMERODOC: trimStr(row.NUMERODOC),
    DATADOC: formatDate(row.DATADOC),
    CODICECF: trimStr(row.CODICECF),
    MAGPARTENZ: trimStr(row.MAGPARTENZ),
    MAGARRIVO: trimStr(row.MAGARRIVO),
    AGENTE: trimStr(row.AGENTE),
    AGENTE2: trimStr(row.AGENTE2),
    VALUTA: trimStr(row.VALUTA),
    CAMBIO: numVal(row.CAMBIO),
    CODICEARTI: trimStr(row.CODICEARTI),
    NUMERORIGA: numVal(row.NUMERORIGA),
    ESPLDISTIN: trimStr(row.ESPLDISTIN),
    UNMISURA: trimStr(row.UNMISURA),
    QUANTITA: numVal(row.QUANTITA),
    QUANTITARE: numVal(row.QUANTITARE),
    SCONTI: trimStr(row.SCONTI),
    PREZZOUN: numVal(row.PREZZOUN),
    PREZZOTOT: numVal(row.PREZZOTOT),
    ALIIVA: trimStr(row.ALIIVA),
    CONTOSCARI: trimStr(row.CONTOSCARI),
    OMIVA: boolVal(row.OMIVA),
    OMMERCE: boolVal(row.OMMERCE),
    PROVV: trimStr(row.PROVV),
    PROVV2: trimStr(row.PROVV2),
    DATACONSEG: formatDate(row.DATACONSEG),
    DESCRIZION: trimStr(row.DESCRIZION),
    TIPORIGAD: trimStr(row.TIPORIGAD),
    RESTOSCORP: numVal(row.RESTOSCORP),
    RESTOSCUNI: numVal(row.RESTOSCUNI),
    CODCAUMAG: trimStr(row.CODCAUMAG),
    ZONA: trimStr(row.ZONA),
    SETTORE: trimStr(row.SETTORE),
    GRUPPO: trimStr(row.GRUPPO),
    CLASSE: trimStr(row.CLASSE),
    RIFFROMT: numVal(row.RIFFROMT),
    RIFFROMR: numVal(row.RIFFROMR),
    PREZZOTOTM: numVal(row.PREZZOTOTM),
    NOTE: trimStr(row.NOTE),
    COMMESSA: trimStr(row.COMMESSA),
    TIMESTAMP: formatDate(row.TIMESTAMP),
    USERNAME: trimStr(row.USERNAME),
    FATT: numVal(row.FATT),
    LOTTO: trimStr(row.LOTTO),
    MATRICOLA: trimStr(row.MATRICOLA),
    EUROCAMBIO: numVal(row.EUROCAMBIO),
    U_PESON: numVal(row.U_PESON),
    U_PESOL: numVal(row.U_PESOL),
    U_COLLI: numVal(row.U_COLLI),
    U_GIA: numVal(row.U_GIA),
    U_MAGP: trimStr(row.U_MAGP),
    U_MAGA: trimStr(row.U_MAGA),
  };
}

function buildArcaDestinazione(row: Record<string, unknown>): ArcaDestinazione {
  return {
    CODICECF: trimStr(row.CODICECF),
    CODICEDES: trimStr(row.CODICEDES),
    RAGIONESOC: trimStr(row.RAGIONESOC),
    SUPPRAGSOC: trimStr(row.SUPPRAGSOC),
    INDIRIZZO: trimStr(row.INDIRIZZO),
    CAP: trimStr(row.CAP),
    LOCALITA: trimStr(row.LOCALITA),
    PROVINCIA: trimStr(row.PROVINCIA),
    CODNAZIONE: trimStr(row.CODNAZIONE),
    AGENTE: trimStr(row.AGENTE),
    AGENTE2: trimStr(row.AGENTE2),
    SETTORE: trimStr(row.SETTORE),
    ZONA: trimStr(row.ZONA),
    VETTORE: trimStr(row.VETTORE),
    TELEFONO: trimStr(row.TELEFONO),
    FAX: trimStr(row.FAX),
    PERSONARIF: trimStr(row.PERSONARIF),
    TIMESTAMP: formatDate(row.TIMESTAMP),
    USERNAME: trimStr(row.USERNAME),
  };
}

export function calculateShippingTax(
  spesetr: number,
  spesetriva: string,
  speseim: number,
  speseimiva: string,
  speseva: number,
  spesevaiva: string,
): number {
  const trTax = spesetr * (parseFloat(spesetriva) || 0) / 100;
  const imTax = speseim * (parseFloat(speseimiva) || 0) / 100;
  const vaTax = speseva * (parseFloat(spesevaiva) || 0) / 100;
  return Math.round((trTax + imTax + vaTax) * 100) / 100;
}

type ProductLookup = Map<string, { productId: string; productName: string; listPrice: number }>;
type DiscountLookup = Map<string, number>;

function buildProductLookup(ordersDb: Database.Database | null): ProductLookup {
  const map: ProductLookup = new Map();
  if (!ordersDb) return map;
  try {
    const rows = ordersDb
      .prepare("SELECT id, name, article FROM products")
      .all() as Array<{ id: string; name: string; article: string }>;
    for (const row of rows) {
      map.set(row.name, { productId: row.id, productName: row.name, listPrice: 0 });
      if (row.article) {
        map.set(row.article, { productId: row.id, productName: row.name, listPrice: 0 });
      }
    }
  } catch {
    // products table may not exist
  }
  return map;
}

function buildDiscountLookup(usersDb: Database.Database | null, userId: string): DiscountLookup {
  const map: DiscountLookup = new Map();
  if (!usersDb) return map;
  try {
    const rows = usersDb
      .prepare("SELECT article_code, discount_percent FROM fresis_discounts WHERE user_id = ?")
      .all(userId) as Array<{ article_code: string; discount_percent: number }>;
    for (const row of rows) {
      map.set(row.article_code, row.discount_percent);
    }
  } catch {
    // fresis_discounts table may not exist
  }
  return map;
}

function calculateItemRevenue(
  priceUnit: number,
  quantity: number,
  rowDiscountPct: number,
  globalDiscountPct: number,
  listPrice: number,
  fresisDiscountPct: number,
): number {
  const prezzoCliente = priceUnit * quantity * (1 - rowDiscountPct / 100) * (1 - globalDiscountPct / 100);
  const costoFresis = listPrice * quantity * (1 - fresisDiscountPct / 100);
  return prezzoCliente - costoFresis;
}

export async function parseArcaExport(
  uploadedFiles: Array<{ originalName: string; buffer: Buffer }>,
  userId: string,
  ordersDb?: Database.Database | null,
  usersDb?: Database.Database | null,
): Promise<ParseResult> {
  const tmpDir = createTempDir();
  const errors: string[] = [];

  try {
    let dtPath: string | null = null;
    let drPath: string | null = null;
    let cfPath: string | null = null;
    let arPath: string | null = null;
    let ddPath: string | null = null;

    for (const file of uploadedFiles) {
      const filePath = path.join(tmpDir, file.originalName);
      fs.writeFileSync(filePath, file.buffer);

      const nameUpper = file.originalName.toUpperCase();
      if (nameUpper.endsWith("DT.DBF")) dtPath = filePath;
      else if (nameUpper.endsWith("DR.DBF")) drPath = filePath;
      else if (nameUpper.endsWith("CF.DBF")) cfPath = filePath;
      else if (nameUpper.endsWith("AR.DBF")) arPath = filePath;
      else if (nameUpper.endsWith("DD.DBF")) ddPath = filePath;
    }

    if (!dtPath || !drPath || !cfPath) {
      throw new Error("File DT, DR o CF mancanti");
    }

    // 1. Parse CF -> client map
    const cfFile = await DBFFile.open(cfPath, { encoding: "latin1" });
    const cfRows = await cfFile.readRecords();
    const clientMap = new Map<string, ArcaClientData>();

    for (const row of cfRows) {
      const codice = normalizeSubClientCode(trimStr((row as any).CODICE));
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

    // 2. Parse AR -> article map (B10: match articoli)
    const articleMap = new Map<string, ArcaArticle>();
    if (arPath) {
      const arFile = await DBFFile.open(arPath, { encoding: "latin1" });
      const arRows = await arFile.readRecords();
      for (const row of arRows) {
        const codice = trimStr((row as any).CODICE);
        if (!codice) continue;
        articleMap.set(codice, {
          codice,
          descrizione: trimStr((row as any).DESCRIZION),
          listino1: numVal((row as any).LISTINO1),
          ivavend: trimStr((row as any).IVAVEND),
          gruppo: trimStr((row as any).GRUPPO),
        });
      }
    }

    // 3. Parse DD -> destinazioni diverse map (B11)
    const destMap = new Map<string, ArcaDestinazione>();
    if (ddPath) {
      const ddFile = await DBFFile.open(ddPath, { encoding: "latin1" });
      const ddRows = await ddFile.readRecords();
      for (const row of ddRows) {
        const dest = buildArcaDestinazione(row as Record<string, unknown>);
        const key = `${dest.CODICECF}|${dest.CODICEDES}`;
        destMap.set(key, dest);
      }
    }

    // 4. Parse DR -> raw rows grouped by ID_TESTA
    const drFile = await DBFFile.open(drPath, { encoding: "latin1" });
    const drRows = await drFile.readRecords();
    const rawRowsByTesta = new Map<number, Array<Record<string, unknown>>>();

    for (const row of drRows) {
      const idTesta = numVal((row as any).ID_TESTA);
      if (!idTesta) continue;
      if (!rawRowsByTesta.has(idTesta)) {
        rawRowsByTesta.set(idTesta, []);
      }
      rawRowsByTesta.get(idTesta)!.push(row as Record<string, unknown>);
    }

    // 5. Build product/discount lookups for revenue (B8)
    const productLookup = buildProductLookup(ordersDb ?? null);
    const discountLookup = buildDiscountLookup(usersDb ?? null, userId);

    // 6. Parse DT -> invoices
    const dtFile = await DBFFile.open(dtPath, { encoding: "latin1" });
    const dtRows = await dtFile.readRecords();

    const records: FresisHistoryRow[] = [];
    let skippedNonInvoice = 0;
    const maxNumerodocByEsercizio = new Map<string, number>();

    const now = new Date().toISOString();

    for (const dtRow of dtRows) {
      const row = dtRow as Record<string, unknown>;
      const tipodoc = trimStr(row.TIPODOC);
      if (tipodoc !== "FT") {
        skippedNonInvoice++;
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
      const destdiv = trimStr(row.DESTDIV);

      // Track max NUMERODOC per ESERCIZIO for ft_counter init
      const numDocInt = parseInt(numerodoc, 10);
      if (!isNaN(numDocInt)) {
        const currentMax = maxNumerodocByEsercizio.get(esercizio) ?? 0;
        if (numDocInt > currentMax) {
          maxNumerodocByEsercizio.set(esercizio, numDocInt);
        }
      }

      const docDiscountPercent =
        totmerce > 0
          ? Math.round((totsconto / totmerce) * 10000) / 100
          : 0;
      const totalShipping = spesetr + speseim + speseva;
      // B4: shipping_tax = IVA sulle spese (non TOTIVA del documento)
      const shippingTax = calculateShippingTax(
        spesetr, spesetriva, speseim, speseimiva, speseva, spesevaiva,
      );

      const client = clientMap.get(codicecf);
      if (!client) {
        errors.push(
          `FT ${numerodoc}/${esercizio}: cliente ${codicecf} non trovato in CF`,
        );
      }

      const rawDrRows = rawRowsByTesta.get(dtId) || [];
      if (rawDrRows.length === 0) {
        errors.push(
          `FT ${numerodoc}/${esercizio}: nessuna riga in DR (ID_TESTA=${dtId})`,
        );
      }

      // Build complete ArcaRiga array and items array
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

      // Global discount as percentage for revenue calc
      const globalDiscountPct = scontif < 1 ? Math.round((1 - scontif) * 10000) / 100 : 0;

      let totalRevenue = 0;

      for (const drRow of rawDrRows) {
        const arcaRiga = buildArcaRiga(drRow);
        arcaRighe.push(arcaRiga);

        const articleCode = arcaRiga.CODICEARTI;
        const description = arcaRiga.DESCRIZION;
        const rowDiscount = parseCascadeDiscount(arcaRiga.SCONTI);
        const vatCode = arcaRiga.ALIIVA;
        const vat = parseFloat(vatCode) || 0;

        // B10: Match article from AR or products DB
        const arcaArticle = articleMap.get(articleCode);
        const pwaProduct = productLookup.get(articleCode);
        const productName = pwaProduct?.productName
          ?? arcaArticle?.descrizione
          ?? articleCode;
        const productId = pwaProduct?.productId ?? articleCode;

        // B8: Revenue calculation
        const listPrice = arcaArticle?.listino1 ?? arcaRiga.PREZZOUN;
        const fresisDiscount = discountLookup.get(articleCode) ?? FRESIS_DEFAULT_DISCOUNT;
        const itemRevenue = calculateItemRevenue(
          arcaRiga.PREZZOUN,
          arcaRiga.QUANTITA,
          rowDiscount,
          globalDiscountPct,
          listPrice,
          fresisDiscount,
        );
        totalRevenue += itemRevenue;

        // B9: Include total, unit, rowNumber in items
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

      // Build ArcaTestata
      const arcaTestata = buildArcaTestata(row);

      // B11: Lookup destinazione diversa
      let destinazioneDiversa: ArcaDestinazione | null = null;
      if (destdiv) {
        const key = `${codicecf}|${destdiv}`;
        destinazioneDiversa = destMap.get(key) ?? null;
      }

      const arcaData: ArcaData = {
        testata: arcaTestata,
        righe: arcaRighe,
        destinazione_diversa: destinazioneDiversa,
      };

      const invoiceDate = formatDate(datadoc);
      const clientName = client?.ragioneSociale || codicecf;
      // B5: invoice_number = "FT {NUMERODOC}/{ESERCIZIO}"
      const invoiceNumber = `FT ${numerodoc}/${esercizio}`;

      records.push({
        // B3: deterministicId includes ESERCIZIO
        id: deterministicId(userId, esercizio, numerodoc, codicecf),
        user_id: userId,
        original_pending_order_id: null,
        sub_client_codice: codicecf,
        sub_client_name: clientName,
        sub_client_data: client ? JSON.stringify(client) : null,
        // B1: customer_id = Fresis customer profile (not "fresis-import")
        customer_id: FRESIS_CUSTOMER_PROFILE,
        // B2: customer_name = "Fresis Soc Cooperativa" (not sub_client_name)
        customer_name: FRESIS_CUSTOMER_NAME,
        items: JSON.stringify(items),
        discount_percent: docDiscountPercent || null,
        target_total_with_vat: totdoc,
        shipping_cost: totalShipping || null,
        // B4: shipping_tax = IVA on spese only
        shipping_tax: shippingTax || null,
        // B8: revenue
        revenue: Math.round(totalRevenue * 100) / 100 || null,
        merged_into_order_id: null,
        merged_at: null,
        created_at: invoiceDate || now,
        updated_at: now,
        // B7: notes from Memo field (dbffile reads .DBT natively)
        notes: trimStr(row.NOTE) || null,
        archibald_order_id: null,
        // B6: archibald_order_number = "FT {NUMERODOC}/{ESERCIZIO}"
        archibald_order_number: invoiceNumber,
        current_state: "importato_arca",
        state_updated_at: now,
        ddt_number: null,
        ddt_delivery_date: null,
        tracking_number: null,
        tracking_url: null,
        tracking_courier: null,
        delivery_completed_date: null,
        // B5: invoice_number format
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
        totalInvoices: records.length,
        totalRows: drRows.length,
        totalClients: clientMap.size,
        totalArticles: articleMap.size,
        skippedNonInvoice,
      },
      maxNumerodocByEsercizio,
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}
