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
import type { DbPool } from "../db/pool";
import * as fresisHistoryRepo from "../db/repositories/fresis-history";
import type { FresisHistoryInput } from "../db/repositories/fresis-history";
import { logger } from "../logger";

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
  "ESERCIZIO", "ESANNO", "TIPODOC", "NUMERODOC", "DATADOC",
  "CODICECF", "CODCNT", "MAGPARTENZ", "MAGARRIVO", "NUMRIGHEPR",
  "AGENTE", "AGENTE2", "VALUTA", "PAG", "SCONTI", "SCONTIF",
  "SCONTOCASS", "SCONTOCASF", "PROVV", "PROVV2", "CAMBIO",
  "DATADOCFOR", "NUMERODOCF", "TIPOMODULO", "LISTINO", "ZONA",
  "SETTORE", "DESTDIV", "DATACONSEG", "TRDATA", "TRORA",
  "PESOLORDO", "PESONETTO", "VOLUME", "VETTORE1", "V1DATA", "V1ORA",
  "VETTORE2", "V2DATA", "V2ORA", "TRCAUSALE", "COLLI", "SPEDIZIONE",
  "PORTO", "NOTE", "SPESETR", "SPESETRIVA", "SPESETRCP", "SPESETRPER",
  "SPESEIM", "SPESEIMIVA", "SPESEIMCP", "SPESEVA", "SPESEVAIVA",
  "SPESEVACP", "ACCONTO", "ABBUONO", "TOTIMP", "TOTDOC", "SPESE",
  "SPESEBOLLI", "SPESEINCAS", "SPESEINEFF", "SPESEINDOC", "SPESEINIVA",
  "SPESEINCP", "SPESEESENZ", "CODCAUMAG", "CODBANCA", "PERCPROVV",
  "IMPPROVV", "TOTPROVV", "PERCPROVV2", "IMPPROVV2", "TOTPROVV2",
  "TOTIVA", "ASPBENI", "SCORPORO", "TOTMERCE", "TOTSCONTO", "TOTNETTO",
  "TOTESEN", "IMPCOND", "RITCOND", "TIPOFATT", "TRIANGOLAZ", "NOMODIFICA",
  "NOEVASIONE", "COMMESSA", "EUROCAMBIO", "EXPORT_I", "CB_BIC",
  "CB_NAZIONE", "CB_CIN_UE", "CB_CIN_IT", "ABICAB", "CONTOCORR",
  "CARICATORE", "COMMITTENT", "PROPRMERCE", "LUOGOCAR", "LUOGOSCAR",
  "SDTALTRO", "TIMESTAMP", "USERNAME",
] as const;

const DOCRIG_FIELDS = [
  "ID_TESTA", "ESERCIZIO", "TIPODOC", "NUMERODOC", "DATADOC",
  "CODICECF", "MAGPARTENZ", "MAGARRIVO", "AGENTE", "AGENTE2",
  "VALUTA", "CAMBIO", "CODICEARTI", "NUMERORIGA", "ESPLDISTIN",
  "UNMISURA", "QUANTITA", "QUANTITARE", "SCONTI", "PREZZOUN",
  "PREZZOTOT", "ALIIVA", "CONTOSCARI", "OMIVA", "OMMERCE",
  "PROVV", "PROVV2", "DATACONSEG", "DESCRIZION", "TIPORIGAD",
  "RESTOSCORP", "RESTOSCUNI", "CODCAUMAG", "ZONA", "SETTORE",
  "GRUPPO", "CLASSE", "RIFFROMT", "RIFFROMR", "PREZZOTOTM",
  "NOTE", "COMMESSA", "TIMESTAMP", "USERNAME", "FATT", "LOTTO",
  "MATRICOLA", "EUROCAMBIO", "U_PESON", "U_PESOL", "U_COLLI",
  "U_GIA", "U_MAGP", "U_MAGA",
] as const;

const DATE_FIELDS = new Set([
  "DATADOC", "DATADOCFOR", "DATACONSEG", "TRDATA", "V1DATA", "V2DATA",
]);

const DATETIME_FIELDS = new Set(["TIMESTAMP"]);

const NUMERIC_FIELDS = new Set([
  // doctes
  "NUMRIGHEPR", "SCONTIF", "SCONTOCASF", "CAMBIO", "PESOLORDO", "PESONETTO",
  "VOLUME", "SPESETR", "SPESEIM", "SPESEVA", "ACCONTO", "ABBUONO", "TOTIMP",
  "TOTDOC", "SPESEBOLLI", "SPESEINCAS", "SPESEINEFF", "SPESEINDOC", "SPESEESENZ",
  "PERCPROVV", "IMPPROVV", "TOTPROVV", "PERCPROVV2", "IMPPROVV2", "TOTPROVV2",
  "TOTIVA", "TOTMERCE", "TOTSCONTO", "TOTNETTO", "TOTESEN", "IMPCOND", "RITCOND",
  "EUROCAMBIO",
  // docrig
  "NUMERORIGA", "QUANTITA", "QUANTITARE", "PREZZOUN", "PREZZOTOT",
  "RESTOSCORP", "RESTOSCUNI", "RIFFROMT", "RIFFROMR", "PREZZOTOTM", "FATT",
  "U_PESON", "U_PESOL", "U_COLLI", "U_GIA",
  // special
  "ID_TESTA",
]);

const BOOLEAN_FIELDS = new Set([
  "SCORPORO", "TRIANGOLAZ", "NOMODIFICA", "NOEVASIONE", "EXPORT_I",
  "OMIVA", "OMMERCE",
]);

function escapeVbsString(value: string): string {
  return value.replace(/[\r\n]/g, " ").replace(/"/g, '""');
}

function sanitizeVbsComment(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function formatVbsAssignment(
  rsVar: string,
  fieldName: string,
  value: string | number | boolean | null,
): string {
  if (BOOLEAN_FIELDS.has(fieldName)) {
    return `${rsVar}("${fieldName}") = ${value ? "True" : "False"}`;
  }
  if (DATETIME_FIELDS.has(fieldName)) {
    return `${rsVar}("${fieldName}") = Empty`;
  }
  if (DATE_FIELDS.has(fieldName)) {
    if (value === null || value === undefined || !value || String(value) === "null") {
      return `${rsVar}("${fieldName}") = Empty`;
    }
    return `${rsVar}("${fieldName}") = CDate("${String(value)}")`;
  }
  if (NUMERIC_FIELDS.has(fieldName)) {
    return `${rsVar}("${fieldName}") = ${value ?? 0}`;
  }
  const strVal = escapeVbsString(String(value ?? ""));
  return `${rsVar}("${fieldName}") = "${strVal}"`;
}

function padNumerodoc(numerodoc: string): string {
  const trimmed = numerodoc.trim();
  return trimmed.padStart(6, " ");
}

function buildRecordsetDoctes(
  testata: ArcaData["testata"],
): string[] {
  const lines: string[] = [];
  lines.push('Set rsTes = CreateObject("ADODB.Recordset")');
  lines.push('rsTes.Open "SELECT * FROM doctes WHERE .F.", conn, 3, 3');
  lines.push("rsTes.AddNew");
  lines.push('rsTes("ID") = doctesNextId');
  for (const f of DOCTES_FIELDS) {
    const raw = testata[f as keyof typeof testata];
    if (f === "NUMERODOC") {
      lines.push(`rsTes("NUMERODOC") = "${escapeVbsString(padNumerodoc(String(raw)))}"`);
    } else {
      lines.push(formatVbsAssignment("rsTes", f, raw as string | number | boolean | null));
    }
  }
  lines.push("rsTes.Update");
  lines.push("rsTes.Close");
  return lines;
}

function buildRecordsetDocrig(
  riga: ArcaData["righe"][number],
): string[] {
  const lines: string[] = [];
  lines.push('Set rsRig = CreateObject("ADODB.Recordset")');
  lines.push('rsRig.Open "SELECT * FROM docrig WHERE .F.", conn, 3, 3');
  lines.push("rsRig.AddNew");
  lines.push('rsRig("ID") = docrigNextId');
  for (const f of DOCRIG_FIELDS) {
    if (f === "ID_TESTA") {
      lines.push('rsRig("ID_TESTA") = doctesNextId');
      continue;
    }
    const raw = riga[f as keyof typeof riga];
    if (f === "NUMERODOC") {
      lines.push(`rsRig("NUMERODOC") = "${escapeVbsString(padNumerodoc(String(raw)))}"`);
    } else {
      lines.push(formatVbsAssignment("rsRig", f, raw as string | number | boolean | null));
    }
  }
  lines.push("rsRig.Update");
  lines.push("rsRig.Close");
  return lines;
}


function generateSyncVbs(records: VbsExportRecord[]): string {
  const lines: string[] = [];

  lines.push("On Error Resume Next");
  lines.push("");
  lines.push("Dim fso, logFile, conn, rs, rsTes, rsRig, errCount, okCount");
  lines.push("Dim doctesNextId, docrigNextId");
  lines.push('Set fso = CreateObject("Scripting.FileSystemObject")');
  lines.push("");
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
  lines.push("' Get current max IDs");
  lines.push('Set rs = conn.Execute("SELECT MAX(ID) FROM doctes")');
  lines.push("doctesNextId = 0");
  lines.push("If Not rs.EOF Then");
  lines.push("  If Not IsNull(rs.Fields(0).Value) Then doctesNextId = rs.Fields(0).Value");
  lines.push("End If");
  lines.push("rs.Close");
  lines.push('Set rs = conn.Execute("SELECT MAX(ID) FROM docrig")');
  lines.push("docrigNextId = 0");
  lines.push("If Not rs.EOF Then");
  lines.push("  If Not IsNull(rs.Fields(0).Value) Then docrigNextId = rs.Fields(0).Value");
  lines.push("End If");
  lines.push("rs.Close");
  lines.push("");

  for (const record of records) {
    const { arcaData, invoiceNumber } = record;
    const { testata, righe } = arcaData;

    lines.push(`' --- ${sanitizeVbsComment(invoiceNumber)} ---`);
    lines.push("Err.Clear");
    lines.push("doctesNextId = doctesNextId + 1");
    for (const l of buildRecordsetDoctes(testata)) {
      lines.push(l);
    }
    lines.push("");
    lines.push("If Err.Number <> 0 Then");
    lines.push(
      `  logFile.WriteLine "ERROR doctes ${sanitizeVbsComment(invoiceNumber)}: " & Err.Description`,
    );
    lines.push("  errCount = errCount + 1");
    lines.push("  Err.Clear");
    lines.push("Else");

    for (const riga of righe) {
      lines.push("  docrigNextId = docrigNextId + 1");
      for (const l of buildRecordsetDocrig(riga)) {
        lines.push("  " + l);
      }
      lines.push("  If Err.Number <> 0 Then");
      lines.push(
        `    logFile.WriteLine "ERROR docrig ${sanitizeVbsComment(invoiceNumber)} riga ${riga.NUMERORIGA}: " & Err.Description`,
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
  // Creates a tiny boot wrapper in Startup that launches the real watcher
  // from the COOP16 folder (%~dp0). This ensures WScript.ScriptFullName
  // in arca_watcher.vbs resolves to the COOP16 directory, not Startup.
  const lines = [
    "@echo off",
    'set STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    'set COOP16=%~dp0',
    'del /F /Q "%STARTUP%\\arca_watcher.vbs" 2>nul',
    'echo Dim sh > "%STARTUP%\\arca_watcher_boot.vbs"',
    'echo Set sh = CreateObject("WScript.Shell") >> "%STARTUP%\\arca_watcher_boot.vbs"',
    'echo sh.Run "C:\\Windows\\SysWOW64\\wscript.exe ""%COOP16%arca_watcher.vbs""", 0, False >> "%STARTUP%\\arca_watcher_boot.vbs"',
    "if %ERRORLEVEL% equ 0 (",
    '  echo Watcher installato correttamente nella cartella Startup.',
    '  echo Il watcher si avviera automaticamente al prossimo accesso.',
    ") else (",
    '  echo ERRORE: impossibile installare il watcher nella Startup.',
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

export type SyncResult = {
  imported: number;
  skipped: number;
  exported: number;
  errors: string[];
  vbsScript: VbsResult | null;
  parseStats: NativeParseResult["stats"];
};

function mapToFresisHistoryInput(row: FresisHistoryRow): FresisHistoryInput {
  return {
    id: row.id,
    originalPendingOrderId: row.original_pending_order_id,
    subClientCodice: row.sub_client_codice,
    subClientName: row.sub_client_name,
    subClientData: row.sub_client_data ? JSON.parse(row.sub_client_data) : null,
    customerId: row.customer_id,
    customerName: row.customer_name,
    items: JSON.parse(row.items),
    discountPercent: row.discount_percent,
    targetTotalWithVat: row.target_total_with_vat,
    shippingCost: row.shipping_cost,
    shippingTax: row.shipping_tax,
    revenue: row.revenue,
    mergedIntoOrderId: row.merged_into_order_id,
    mergedAt: row.merged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes,
    archibaldOrderId: row.archibald_order_id,
    archibaldOrderNumber: row.archibald_order_number,
    state: row.current_state,
    stateUpdatedAt: row.state_updated_at,
    ddtNumber: row.ddt_number,
    ddtDeliveryDate: row.ddt_delivery_date,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    trackingCourier: row.tracking_courier,
    deliveryCompletedDate: row.delivery_completed_date,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: row.invoice_amount,
    invoiceClosed: null,
    invoiceRemainingAmount: null,
    invoiceDueDate: null,
    arcaData: row.arca_data != null ? (typeof row.arca_data === 'string' ? row.arca_data : JSON.stringify(row.arca_data)) : null,
    parentCustomerName: null,
    source: row.source,
  };
}

export async function performArcaSync(
  pool: DbPool,
  userId: string,
  doctesBuf: Buffer,
  docrigBuf: Buffer,
  anagrafeBuf: Buffer | null,
): Promise<SyncResult> {
  const errors: string[] = [];

  // 1. Parse DBF files
  const parsed = await parseNativeArcaFiles(
    doctesBuf,
    docrigBuf,
    anagrafeBuf,
    userId,
    new Map(),
    new Map(),
  );
  errors.push(...parsed.errors);

  // 2. Load existing record IDs from DB
  const { rows: existingRows } = await pool.query<{ id: string }>(
    "SELECT id FROM agents.fresis_history WHERE user_id = $1",
    [userId],
  );
  const existingIds = new Set(existingRows.map((r) => r.id));

  // 3. Filter new records vs existing
  const newRecords = parsed.records.filter((r) => !existingIds.has(r.id));
  const skipped = parsed.records.length - newRecords.length;

  // 4. Upsert new records in batches
  let imported = 0;
  if (newRecords.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);
      const inputs = batch.map(mapToFresisHistoryInput);
      const result = await fresisHistoryRepo.upsertRecords(pool, userId, inputs);
      imported += result.inserted + result.updated;
    }
    logger.info(`Arca sync: imported ${imported} new records for user ${userId}`);
  }

  // 5. Update ft_counter with max NUMERODOC per ESERCIZIO (FT only)
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT") continue;
    await pool.query(
      `INSERT INTO agents.ft_counter (esercizio, user_id, last_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (esercizio, user_id)
       DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $3)`,
      [esercizio, userId, maxNum],
    );
  }

  // 6. Find PWA export candidates (source='app', arca_data IS NOT NULL)
  const { rows: pwaRows } = await pool.query<{
    id: string;
    arca_data: string | Record<string, unknown>;
    invoice_number: string;
  }>(
    `SELECT id, arca_data, invoice_number
     FROM agents.fresis_history
     WHERE user_id = $1 AND source = 'app' AND arca_data IS NOT NULL`,
    [userId],
  );

  // 7. Build Arca document key set from parsed records
  const arcaDocKeys = new Set<string>();
  for (const record of parsed.records) {
    const arcaData: ArcaData = JSON.parse(record.arca_data!);
    const key = `${arcaData.testata.ESERCIZIO}|${arcaData.testata.TIPODOC}|${arcaData.testata.NUMERODOC.trim()}`;
    arcaDocKeys.add(key);
  }

  // 8. Filter PWA records not yet in Arca -> generate VBS
  const exportRecords: VbsExportRecord[] = [];
  for (const pwaRow of pwaRows) {
    const arcaData: ArcaData = typeof pwaRow.arca_data === "string"
      ? JSON.parse(pwaRow.arca_data)
      : pwaRow.arca_data as ArcaData;
    const key = `${arcaData.testata.ESERCIZIO}|${arcaData.testata.TIPODOC}|${arcaData.testata.NUMERODOC.trim()}`;
    if (!arcaDocKeys.has(key)) {
      exportRecords.push({
        invoiceNumber: pwaRow.invoice_number,
        arcaData,
      });
    }
  }

  let vbsScript: VbsResult | null = null;
  if (exportRecords.length > 0) {
    vbsScript = generateVbsScript(exportRecords);
    logger.info(`Arca sync: ${exportRecords.length} records to export for user ${userId}`);
  }

  return {
    imported,
    skipped,
    exported: exportRecords.length,
    errors,
    vbsScript,
    parseStats: parsed.stats,
  };
}
