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

export type VbsExportRecord = {
  invoiceNumber: string;
  arcaData: ArcaData;
};

export type VbsResult = {
  vbs: string;
  bat: string;
  watcher: string;
  watcherSetup: string;
};

const DOCTES_FIELDS = [
  "ESERCIZIO",
  "ESANNO",
  "TIPODOC",
  "NUMERODOC",
  "DATADOC",
  "CODICECF",
  "CODCNT",
  "MAGPARTENZ",
  "MAGARRIVO",
  "AGENTE",
  "AGENTE2",
  "VALUTA",
  "PAG",
  "SCONTI",
  "SCONTIF",
  "LISTINO",
  "ZONA",
  "SETTORE",
  "DESTDIV",
  "NOTE",
  "SPESETR",
  "SPESETRIVA",
  "SPESEIM",
  "SPESEIMIVA",
  "SPESEVA",
  "SPESEVAIVA",
  "TOTIMP",
  "TOTDOC",
  "TOTIVA",
  "TOTMERCE",
  "TOTSCONTO",
  "TOTNETTO",
  "TIPOFATT",
  "EUROCAMBIO",
] as const;

const DOCRIG_FIELDS = [
  "ID_TESTA",
  "ESERCIZIO",
  "TIPODOC",
  "NUMERODOC",
  "DATADOC",
  "CODICECF",
  "AGENTE",
  "CODICEARTI",
  "NUMERORIGA",
  "UNMISURA",
  "QUANTITA",
  "SCONTI",
  "PREZZOUN",
  "PREZZOTOT",
  "ALIIVA",
  "DESCRIZION",
  "EUROCAMBIO",
] as const;

const DATE_FIELDS = new Set(["DATADOC"]);

const NUMERIC_FIELDS = new Set([
  "SCONTIF",
  "SPESETR",
  "SPESEIM",
  "SPESEVA",
  "TOTIMP",
  "TOTDOC",
  "TOTIVA",
  "TOTMERCE",
  "TOTSCONTO",
  "TOTNETTO",
  "EUROCAMBIO",
  "NUMERORIGA",
  "QUANTITA",
  "PREZZOUN",
  "PREZZOTOT",
  "ID_TESTA",
]);

function escapeVbsString(value: string): string {
  return value.replace(/'/g, "''");
}

function formatVbsValue(
  fieldName: string,
  value: string | number | boolean | null,
): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (DATE_FIELDS.has(fieldName)) {
    const dateStr = String(value);
    if (!dateStr || dateStr === "null") return "NULL";
    return `{d '${dateStr}'}`;
  }
  if (NUMERIC_FIELDS.has(fieldName)) {
    return String(value);
  }
  return `'${escapeVbsString(String(value))}'`;
}

function padNumerodoc(numerodoc: string): string {
  const trimmed = numerodoc.trim();
  return trimmed.padStart(6, " ");
}

function buildInsertDoctes(
  testata: ArcaData["testata"],
): string {
  const fields = DOCTES_FIELDS.join(", ");
  const values = DOCTES_FIELDS.map((f) => {
    const raw = testata[f as keyof typeof testata];
    if (f === "NUMERODOC") {
      return `'${escapeVbsString(padNumerodoc(String(raw)))}'`;
    }
    return formatVbsValue(f, raw as string | number | boolean | null);
  }).join(", ");
  return `conn.Execute "INSERT INTO doctes (${fields}) VALUES (${values})"`;
}

function buildSelectMaxId(testata: ArcaData["testata"]): string {
  const esercizio = escapeVbsString(testata.ESERCIZIO);
  const tipodoc = escapeVbsString(testata.TIPODOC);
  const numerodoc = escapeVbsString(padNumerodoc(testata.NUMERODOC));
  return (
    `Set rs = conn.Execute("SELECT MAX(ID) FROM doctes ` +
    `WHERE ESERCIZIO='${esercizio}' AND TIPODOC='${tipodoc}' AND NUMERODOC='${numerodoc}'")`
  );
}

function buildInsertDocrig(
  riga: ArcaData["righe"][number],
): string {
  const fields = DOCRIG_FIELDS.join(", ");
  const values = DOCRIG_FIELDS.map((f) => {
    if (f === "ID_TESTA") return "idTesta";
    const raw = riga[f as keyof typeof riga];
    if (f === "NUMERODOC") {
      return `'${escapeVbsString(padNumerodoc(String(raw)))}'`;
    }
    return formatVbsValue(f, raw as string | number | boolean | null);
  }).join(", ");
  return `conn.Execute "INSERT INTO docrig (${fields}) VALUES (${values})"`;
}

function generateSyncVbs(records: VbsExportRecord[]): string {
  const lines: string[] = [];

  lines.push("On Error Resume Next");
  lines.push("");
  lines.push("Dim fso, logFile, conn, rs, idTesta, errCount, okCount");
  lines.push('Set fso = CreateObject("Scripting.FileSystemObject")');
  lines.push("");
  lines.push("' Determine script directory");
  lines.push(
    "Dim scriptDir : scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)",
  );
  lines.push(
    'Dim logPath : logPath = scriptDir & "\\sync_log.txt"',
  );
  lines.push("Set logFile = fso.OpenTextFile(logPath, 8, True)");
  lines.push(
    'logFile.WriteLine "=== Sync started: " & Now() & " ==="',
  );
  lines.push("");
  lines.push("errCount = 0");
  lines.push("okCount = 0");
  lines.push("");
  lines.push("' Connect to VFP via OLE DB");
  lines.push('Set conn = CreateObject("ADODB.Connection")');
  lines.push(
    'conn.Open "Provider=vfpoledb.1;Data Source=" & scriptDir & "\\"',
  );
  lines.push("");
  lines.push("If Err.Number <> 0 Then");
  lines.push(
    '  logFile.WriteLine "ERROR connecting: " & Err.Description',
  );
  lines.push("  logFile.Close");
  lines.push("  WScript.Quit 1");
  lines.push("End If");
  lines.push("");

  for (const record of records) {
    const { arcaData, invoiceNumber } = record;
    const { testata, righe } = arcaData;

    lines.push(`' --- ${escapeVbsString(invoiceNumber)} ---`);
    lines.push("Err.Clear");
    lines.push(buildInsertDoctes(testata));
    lines.push("");
    lines.push("If Err.Number <> 0 Then");
    lines.push(
      `  logFile.WriteLine "ERROR doctes ${escapeVbsString(invoiceNumber)}: " & Err.Description`,
    );
    lines.push("  errCount = errCount + 1");
    lines.push("  Err.Clear");
    lines.push("Else");
    lines.push("  ' Get generated ID");
    lines.push(`  ${buildSelectMaxId(testata)}`);
    lines.push("  idTesta = rs.Fields(0).Value");
    lines.push("  rs.Close");
    lines.push("");

    for (const riga of righe) {
      lines.push(`  ${buildInsertDocrig(riga)}`);
      lines.push("  If Err.Number <> 0 Then");
      lines.push(
        `    logFile.WriteLine "ERROR docrig ${escapeVbsString(invoiceNumber)} riga ${riga.NUMERORIGA}: " & Err.Description`,
      );
      lines.push("    errCount = errCount + 1");
      lines.push("    Err.Clear");
      lines.push("  End If");
      lines.push("");
    }

    lines.push("  okCount = okCount + 1");
    lines.push("End If");
    lines.push("");
  }

  lines.push("conn.Close");
  lines.push(
    'logFile.WriteLine "Completed: " & okCount & " OK, " & errCount & " errors"',
  );
  lines.push("logFile.Close");
  lines.push("");
  lines.push(
    'MsgBox "Sync completato: " & okCount & " documenti OK, " & errCount & " errori." & vbCrLf & "Dettagli in sync_log.txt", vbInformation, "Arca Sync"',
  );
  lines.push("");
  lines.push("' Self-delete after successful execution");
  lines.push("If errCount = 0 Then");
  lines.push("  fso.DeleteFile WScript.ScriptFullName, True");
  lines.push("End If");

  return lines.join("\r\n");
}

function generateBatWrapper(): string {
  const lines = [
    "@echo off",
    "echo Esecuzione sync Arca...",
    'C:\\Windows\\SysWOW64\\wscript.exe "%~dp0sync_arca.vbs"',
  ];
  return lines.join("\r\n");
}

function generateWatcherVbs(): string {
  const lines: string[] = [];

  lines.push("On Error Resume Next");
  lines.push("");
  lines.push("Dim fso, shell");
  lines.push('Set fso = CreateObject("Scripting.FileSystemObject")');
  lines.push('Set shell = CreateObject("WScript.Shell")');
  lines.push("");
  lines.push(
    "Dim scriptDir : scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)",
  );
  lines.push(
    'Dim syncScript : syncScript = scriptDir & "\\sync_arca.vbs"',
  );
  lines.push(
    'Dim logPath : logPath = scriptDir & "\\watcher_log.txt"',
  );
  lines.push("");
  lines.push("Do While True");
  lines.push("  If fso.FileExists(syncScript) Then");
  lines.push(
    "    Dim logFile : Set logFile = fso.OpenTextFile(logPath, 8, True)",
  );
  lines.push(
    '    logFile.WriteLine "Found sync_arca.vbs at " & Now()',
  );
  lines.push("    logFile.Close");
  lines.push("");
  lines.push(
    '    shell.Run "C:\\Windows\\SysWOW64\\wscript.exe """ & syncScript & """", 0, True',
  );
  lines.push("");
  lines.push(
    "    Set logFile = fso.OpenTextFile(logPath, 8, True)",
  );
  lines.push(
    '    logFile.WriteLine "Execution completed at " & Now()',
  );
  lines.push("    logFile.Close");
  lines.push("  End If");
  lines.push("");
  lines.push("  WScript.Sleep 10000");
  lines.push("Loop");

  return lines.join("\r\n");
}

function generateWatcherSetupBat(): string {
  const lines = [
    "@echo off",
    'set STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    'copy /Y "%~dp0arca_watcher.vbs" "%STARTUP%\\arca_watcher.vbs"',
    "if %ERRORLEVEL% equ 0 (",
    '  echo Watcher installato correttamente nella cartella Startup.',
    '  echo Il watcher si avviera automaticamente al prossimo accesso.',
    ") else (",
    '  echo ERRORE: impossibile copiare il watcher nella cartella Startup.',
    ")",
    "pause",
  ];
  return lines.join("\r\n");
}

export function generateVbsScript(records: VbsExportRecord[]): VbsResult {
  if (records.length === 0) {
    return { vbs: "", bat: "", watcher: "", watcherSetup: "" };
  }

  return {
    vbs: generateSyncVbs(records),
    bat: generateBatWrapper(),
    watcher: generateWatcherVbs(),
    watcherSetup: generateWatcherSetupBat(),
  };
}

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
