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
import { upsertSubclients, getSubclientByCustomerProfile, getAllSubclients, mapRowToSubclient } from "../db/repositories/subclients";
import type { Subclient } from "../db/repositories/subclients";
import { getKtEligibleOrders } from "../db/repositories/orders";
import { getOrderArticles } from "../db/repositories/orders";
import { matchSubclients } from "./subclient-matcher";
import { generateArcaDataFromOrder } from "./generate-arca-data-from-order";
import { getNextDocNumber } from "./ft-counter";
import { logger } from "../logger";

export type VbsExportRecord = {
  invoiceNumber: string;
  arcaData: ArcaData;
};

export function invoiceNumberToKey(invoiceNumber: string): string | null {
  const m = invoiceNumber.match(/^(\w+)\s+(\d+)\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}|${m[1]}|${m[2]}`;
}

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

function sanitizeVbsComment(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function padNumerodoc(numerodoc: string): string {
  const trimmed = numerodoc.trim();
  return trimmed.padStart(6, " ");
}

function formatVfpLiteral(
  fieldName: string,
  value: string | number | boolean | null,
): string {
  if (BOOLEAN_FIELDS.has(fieldName)) {
    return value ? ".T." : ".F.";
  }
  if (DATETIME_FIELDS.has(fieldName)) {
    return "{}";
  }
  if (DATE_FIELDS.has(fieldName)) {
    if (value === null || value === undefined || !value || String(value) === "null") {
      return "{}";
    }
    const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
      return `{^${parts[1]}-${parts[2]}-${parts[3]}}`;
    }
    const s = String(value);
    return `{^${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}}`;
  }
  if (NUMERIC_FIELDS.has(fieldName)) {
    return String(value ?? 0);
  }
  const strVal = String(value ?? "")
    .replace(/[\r\n]/g, " ")
    .replace(/]/g, "")
    .replace(/"/g, '""');
  return `[${strVal}]`;
}

function buildExecScriptDoctes(
  testata: ArcaData["testata"],
): string[] {
  const lines: string[] = [];
  lines.push('Set prgFile = fso.CreateTextFile(scriptDir & "\\temp_ins.prg", True)');
  lines.push('prgFile.WriteLine "IF USED([_ins])"');
  lines.push('prgFile.WriteLine "  USE IN SELECT([_ins])"');
  lines.push('prgFile.WriteLine "ENDIF"');
  lines.push('prgFile.WriteLine "USE doctes IN 0 SHARED AGAIN ALIAS _ins"');
  lines.push('prgFile.WriteLine "=CURSORSETPROP([Buffering], 3, [_ins])"');
  lines.push('prgFile.WriteLine "SELECT _ins"');
  lines.push('prgFile.WriteLine "APPEND BLANK"');
  lines.push('prgFile.WriteLine "REPLACE ID WITH " & CStr(doctesNextId)');
  const DOCTES_DEFAULTS: Record<string, string | number> = {
    CODCNT: "001", CODCAUMAG: "99", MAGPARTENZ: "00001", MAGARRIVO: "00001",
    PAG: "0001", LISTINO: "1", TIPOMODULO: "F", CODBANCA: "1",
    CB_NAZIONE: "IT", TIPOFATT: "N",
  };
  const DOCTES_NUMERIC_DEFAULTS: Record<string, number> = { EUROCAMBIO: 1 };
  for (const f of DOCTES_FIELDS) {
    let raw = testata[f as keyof typeof testata];
    if (f in DOCTES_DEFAULTS && (!raw || String(raw).trim() === "")) {
      raw = DOCTES_DEFAULTS[f] as typeof raw;
    }
    if (f in DOCTES_NUMERIC_DEFAULTS && (raw === 0 || raw === null || raw === undefined)) {
      raw = DOCTES_NUMERIC_DEFAULTS[f] as typeof raw;
    }
    if (f === "NUMERODOC") {
      const padded = padNumerodoc(String(raw)).replace(/]/g, "").replace(/"/g, '""');
      lines.push(`prgFile.WriteLine "REPLACE NUMERODOC WITH [${padded}]"`);
    } else {
      const vfpVal = formatVfpLiteral(f, raw as string | number | boolean | null);
      lines.push(`prgFile.WriteLine "REPLACE ${f} WITH ${vfpVal}"`);
    }
  }
  lines.push('prgFile.WriteLine "=TABLEUPDATE(.T., .F., [_ins])"');
  lines.push('prgFile.WriteLine "USE IN SELECT([_ins])"');
  lines.push("prgFile.Close");
  lines.push('conn.Execute "EXECSCRIPT(FILETOSTR([" & scriptDir & "\\temp_ins.prg]))"');
  lines.push('fso.DeleteFile scriptDir & "\\temp_ins.prg", True');
  return lines;
}

function buildExecScriptDocrig(
  riga: ArcaData["righe"][number],
): string[] {
  const lines: string[] = [];
  lines.push('Set prgFile = fso.CreateTextFile(scriptDir & "\\temp_ins.prg", True)');
  lines.push('prgFile.WriteLine "IF USED([_ins])"');
  lines.push('prgFile.WriteLine "  USE IN SELECT([_ins])"');
  lines.push('prgFile.WriteLine "ENDIF"');
  lines.push('prgFile.WriteLine "USE docrig IN 0 SHARED AGAIN ALIAS _ins"');
  lines.push('prgFile.WriteLine "=CURSORSETPROP([Buffering], 3, [_ins])"');
  lines.push('prgFile.WriteLine "SELECT _ins"');
  lines.push('prgFile.WriteLine "APPEND BLANK"');
  lines.push('prgFile.WriteLine "REPLACE ID WITH " & CStr(docrigNextId)');
  lines.push('prgFile.WriteLine "REPLACE ID_TESTA WITH " & CStr(doctesNextId)');
  const DOCRIG_DEFAULTS: Record<string, string | number> = {
    CONTOSCARI: "01", CODCAUMAG: "99", MAGPARTENZ: "00001", MAGARRIVO: "00001",
    GRUPPO: "00001",
  };
  const DOCRIG_NUMERIC_DEFAULTS: Record<string, (r: typeof riga) => number> = {
    FATT: () => 1, EUROCAMBIO: () => 1,
    QUANTITARE: (r) => r.QUANTITA, PREZZOTOTM: (r) => r.PREZZOTOT,
  };
  for (const f of DOCRIG_FIELDS) {
    if (f === "ID_TESTA") continue;
    let raw = riga[f as keyof typeof riga];
    if (f in DOCRIG_DEFAULTS && (!raw || String(raw).trim() === "")) {
      raw = DOCRIG_DEFAULTS[f] as typeof raw;
    }
    if (f in DOCRIG_NUMERIC_DEFAULTS && (raw === 0 || raw === null || raw === undefined)) {
      raw = DOCRIG_NUMERIC_DEFAULTS[f](riga) as typeof raw;
    }
    if (f === "NUMERODOC") {
      const padded = padNumerodoc(String(raw)).replace(/]/g, "").replace(/"/g, '""');
      lines.push(`prgFile.WriteLine "REPLACE NUMERODOC WITH [${padded}]"`);
    } else {
      const vfpVal = formatVfpLiteral(f, raw as string | number | boolean | null);
      lines.push(`prgFile.WriteLine "REPLACE ${f} WITH ${vfpVal}"`);
    }
  }
  lines.push('prgFile.WriteLine "=TABLEUPDATE(.T., .F., [_ins])"');
  lines.push('prgFile.WriteLine "USE IN SELECT([_ins])"');
  lines.push("prgFile.Close");
  lines.push('conn.Execute "EXECSCRIPT(FILETOSTR([" & scriptDir & "\\temp_ins.prg]))"');
  lines.push('fso.DeleteFile scriptDir & "\\temp_ins.prg", True');
  return lines;
}


function computeScadenzaDate(datadoc: string): string {
  const parts = datadoc.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return datadoc;
  const d = new Date(parseInt(parts[1], 10), parseInt(parts[2], 10) - 1, parseInt(parts[3], 10));
  d.setDate(d.getDate() + 30);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildExecScriptScadenza(
  testata: ArcaData["testata"],
): string[] {
  const lines: string[] = [];
  const datadoc = testata.DATADOC ?? "";
  const datascad = computeScadenzaDate(datadoc);
  const numerodoc = padNumerodoc(String(testata.NUMERODOC)).replace(/]/g, "").replace(/"/g, '""');
  const numfatt = String(testata.NUMERODOC).trim().padStart(10, " ").replace(/]/g, "").replace(/"/g, '""');
  const partnum = numfatt;
  const protocollo = String(testata.NUMERODOC).trim().padStart(8, " ").replace(/]/g, "").replace(/"/g, '""');
  const codcf = String(testata.CODICECF ?? "").replace(/]/g, "").replace(/"/g, '""');
  const codpag = String(testata.PAG || "0001").replace(/]/g, "").replace(/"/g, '""');
  const tipomod = String(testata.TIPODOC || "FT").replace(/]/g, "").replace(/"/g, '""');
  const totDoc = testata.TOTDOC ?? 0;
  const totNetto = testata.TOTNETTO ?? 0;
  const esercizio = testata.ESERCIZIO ?? "";

  lines.push('Set prgFile = fso.CreateTextFile(scriptDir & "\\temp_ins.prg", True)');
  lines.push('prgFile.WriteLine "IF USED([_ins])"');
  lines.push('prgFile.WriteLine "  USE IN SELECT([_ins])"');
  lines.push('prgFile.WriteLine "ENDIF"');
  lines.push('prgFile.WriteLine "USE SCADENZE IN 0 SHARED AGAIN ALIAS _ins"');
  lines.push('prgFile.WriteLine "=CURSORSETPROP([Buffering], 3, [_ins])"');
  lines.push('prgFile.WriteLine "SELECT _ins"');
  lines.push('prgFile.WriteLine "APPEND BLANK"');
  lines.push('prgFile.WriteLine "REPLACE ID WITH " & CStr(scadNextId)');
  lines.push('prgFile.WriteLine "REPLACE ID_DOC WITH " & CStr(doctesNextId)');
  lines.push('prgFile.WriteLine "REPLACE ID_PNOTA WITH 0"');
  lines.push('prgFile.WriteLine "REPLACE ID_SCAORIG WITH 0"');
  lines.push('prgFile.WriteLine "REPLACE TRANSIT WITH .T."');
  lines.push(`prgFile.WriteLine "REPLACE CODPAG WITH [${codpag}]"`);
  lines.push(`prgFile.WriteLine "REPLACE DATAFATT WITH {^${datadoc}}"`);
  lines.push(`prgFile.WriteLine "REPLACE NUMFATT WITH [${numfatt}]"`);
  lines.push(`prgFile.WriteLine "REPLACE DATASCAD WITH {^${datascad}}"`);
  lines.push(`prgFile.WriteLine "REPLACE CODBANCA WITH [1]"`);
  lines.push(`prgFile.WriteLine "REPLACE CODCF WITH [${codcf}]"`);
  lines.push(`prgFile.WriteLine "REPLACE TIPO WITH [A]"`);
  lines.push(`prgFile.WriteLine "REPLACE TIPOMOD WITH [${tipomod}]"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPEFF WITH ${totDoc}"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPEFFVAL WITH ${totDoc}"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPTOTFATT WITH ${totDoc}"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPTOTFATV WITH ${totDoc}"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPONIBILE WITH ${totNetto}"`);
  lines.push(`prgFile.WriteLine "REPLACE IMPORTOPAG WITH 0"`);
  lines.push(`prgFile.WriteLine "REPLACE NUMEFF WITH 1"`);
  lines.push(`prgFile.WriteLine "REPLACE TOTEFF WITH 1"`);
  lines.push(`prgFile.WriteLine "REPLACE CODCAMBIO WITH [EUR]"`);
  lines.push(`prgFile.WriteLine "REPLACE VALCAMBIO WITH 1"`);
  lines.push(`prgFile.WriteLine "REPLACE EUROCAMBIO WITH 1"`);
  lines.push(`prgFile.WriteLine "REPLACE CB_NAZIONE WITH [IT]"`);
  lines.push(`prgFile.WriteLine "REPLACE PARTANNO WITH ${esercizio}"`);
  lines.push(`prgFile.WriteLine "REPLACE PARTNUM WITH [${partnum}]"`);
  lines.push(`prgFile.WriteLine "REPLACE PROTOCOLLO WITH [${protocollo}]"`);
  lines.push(`prgFile.WriteLine "REPLACE DATAVALUTA WITH {^${datascad}}"`);
  lines.push('prgFile.WriteLine "=TABLEUPDATE(.T., .F., [_ins])"');
  lines.push('prgFile.WriteLine "USE IN SELECT([_ins])"');
  lines.push("prgFile.Close");
  lines.push('conn.Execute "EXECSCRIPT(FILETOSTR([" & scriptDir & "\\temp_ins.prg]))"');
  lines.push('fso.DeleteFile scriptDir & "\\temp_ins.prg", True');
  return lines;
}

function escapeVfpString(value: string | null): string {
  if (!value) return '';
  return value.replace(/[\r\n]/g, ' ').replace(/]/g, '').replace(/"/g, '""');
}

const ANAGRAFE_CODICE_MAX_LEN = 6;

function buildExecScriptAnagrafe(sc: Subclient): string[] {
  const lines: string[] = [];
  const truncatedCodice = sc.codice.slice(0, ANAGRAFE_CODICE_MAX_LEN);
  const codiceEscaped = escapeVfpString(truncatedCodice);
  lines.push('Set prgFile = fso.CreateTextFile(scriptDir & "\\temp_ins.prg", True)');
  lines.push('prgFile.WriteLine "IF USED([_ins])"');
  lines.push('prgFile.WriteLine "  USE IN SELECT([_ins])"');
  lines.push('prgFile.WriteLine "ENDIF"');
  lines.push('prgFile.WriteLine "USE ANAGRAFE IN 0 SHARED AGAIN ALIAS _ins"');
  lines.push('prgFile.WriteLine "=CURSORSETPROP([Buffering], 3, [_ins])"');
  lines.push('prgFile.WriteLine "SELECT _ins"');
  const codNaz = escapeVfpString(sc.codNazione || 'IT');
  lines.push(`prgFile.WriteLine "COD_NAZIONE = [${codNaz}]"`);
  lines.push(`prgFile.WriteLine "LOCATE FOR ALLTRIM(CODICE) == [${codiceEscaped}]"`);
  lines.push('prgFile.WriteLine "IF !FOUND()"');
  lines.push('prgFile.WriteLine "  APPEND BLANK"');
  lines.push('prgFile.WriteLine "ENDIF"');

  const fields: Array<[string, string | null]> = [
    ['CODICE', truncatedCodice],
    ['DESCRIZION', sc.ragioneSociale],
    ['SUPRAGSOC', sc.supplRagioneSociale],
    ['INDIRIZZO', sc.indirizzo],
    ['CAP', sc.cap],
    ['LOCALITA', sc.localita],
    ['PROV', sc.prov],
    ['TELEFONO', sc.telefono],
    ['TELEFONO2', sc.telefono2],
    ['TELEFONO3', sc.telefono3],
    ['FAX', sc.fax],
    ['EMAIL', sc.email],
    ['PARTIVA', sc.partitaIva],
    ['CODFISCALE', sc.codFiscale],
    ['ZONA', sc.zona],
    ['AGENTE', sc.agente],
    ['AGENTE2', sc.agente2],
    ['SETTORE', sc.settore],
    ['CLASSE', sc.classe],
    ['PAG', sc.pag],
    ['LISTINO', sc.listino],
    ['BANCA', sc.banca],
    ['VALUTA', sc.valuta],
    ['CODNAZIONE', sc.codNazione],
    ['ALIIVA', sc.aliiva],
    ['CONTOSCAR', sc.contoscar],
    ['TIPOFATT', sc.tipofatt],
    ['PERSDACONT', sc.persDaContattare],
    ['URL', sc.url],
    ['CB_NAZIONE', sc.cbNazione],
    ['CB_BIC', sc.cbBic],
    ['CB_CIN_UE', sc.cbCinUe],
    ['CB_CIN_IT', sc.cbCinIt],
    ['ABICAB', sc.abicab],
    ['CONTOCORR', sc.contocorr],
  ];

  for (const [field, value] of fields) {
    const escaped = escapeVfpString(value);
    lines.push(`prgFile.WriteLine "REPLACE ${field} WITH [${escaped}]"`);
  }

  lines.push('prgFile.WriteLine "=TABLEUPDATE(.T., .F., [_ins])"');
  lines.push('prgFile.WriteLine "USE IN SELECT([_ins])"');
  lines.push('prgFile.Close');
  lines.push('conn.Execute "EXECSCRIPT(FILETOSTR([" & scriptDir & "\\temp_ins.prg]))"');
  lines.push('fso.DeleteFile scriptDir & "\\temp_ins.prg", True');
  return lines;
}

export type AnagrafeExportRecord = {
  subclient: Subclient;
};

function generateSyncVbs(records: VbsExportRecord[], anagrafeRecords?: AnagrafeExportRecord[]): string {
  const lines: string[] = [];

  lines.push("On Error Resume Next");
  lines.push("");
  lines.push("Dim fso, logFile, conn, rs, prgFile, errCount, okCount");
  lines.push("Dim doctesNextId, docrigNextId, scadNextId");
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
  lines.push('Set rs = conn.Execute("SELECT MAX(ID) FROM SCADENZE")');
  lines.push("scadNextId = 0");
  lines.push("If Not rs.EOF Then");
  lines.push("  If Not IsNull(rs.Fields(0).Value) Then scadNextId = rs.Fields(0).Value");
  lines.push("End If");
  lines.push("rs.Close");
  lines.push("");

  for (const record of records) {
    const { arcaData, invoiceNumber } = record;
    const { testata, righe } = arcaData;

    lines.push(`' --- ${sanitizeVbsComment(invoiceNumber)} ---`);
    lines.push("Err.Clear");
    lines.push("doctesNextId = doctesNextId + 1");
    for (const l of buildExecScriptDoctes(testata)) {
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
      for (const l of buildExecScriptDocrig(riga)) {
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

    lines.push("  ' Insert scadenza (payment schedule)");
    lines.push("  scadNextId = scadNextId + 1");
    for (const l of buildExecScriptScadenza(testata)) {
      lines.push("  " + l);
    }
    lines.push("  If Err.Number <> 0 Then");
    lines.push(
      `    logFile.WriteLine "ERROR scadenza ${sanitizeVbsComment(invoiceNumber)}: " & Err.Description`,
    );
    lines.push("    errCount = errCount + 1");
    lines.push("    Err.Clear");
    lines.push("  End If");
    lines.push("");
    lines.push("  okCount = okCount + 1");
    lines.push("End If");
    lines.push("");
  }

  // ANAGRAFE export for new/modified subclients
  if (anagrafeRecords && anagrafeRecords.length > 0) {
    lines.push("' --- ANAGRAFE Export ---");
    for (const { subclient } of anagrafeRecords) {
      lines.push(`' --- ANAGRAFE ${sanitizeVbsComment(subclient.codice)} ---`);
      lines.push("Err.Clear");
      for (const l of buildExecScriptAnagrafe(subclient)) {
        lines.push(l);
      }
      lines.push("If Err.Number <> 0 Then");
      lines.push(
        `  logFile.WriteLine "ERROR anagrafe ${sanitizeVbsComment(subclient.codice)}: " & Err.Description`,
      );
      lines.push("  errCount = errCount + 1");
      lines.push("  Err.Clear");
      lines.push("Else");
      lines.push("  okCount = okCount + 1");
      lines.push("End If");
      lines.push("");
    }
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
  lines.push("");
  lines.push("    fso.DeleteFile syncScript, True");
  lines.push("  End If");
  lines.push("");
  lines.push("  WScript.Sleep 5000");
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

export function generateVbsScript(records: VbsExportRecord[], anagrafeRecords?: AnagrafeExportRecord[]): VbsResult {
  if (records.length === 0 && (!anagrafeRecords || anagrafeRecords.length === 0)) {
    return { vbs: "", bat: "", watcher: "", watcherSetup: "" };
  }

  return {
    vbs: generateSyncVbs(records, anagrafeRecords),
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
  subclients: Subclient[];
  errors: string[];
  stats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  maxNumerodocByKey: Map<string, number>;
  arcaDocMap: Map<string, FresisHistoryRow>;
  arcaDocKeys: Set<string>;
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

    // 1. Parse ANAGRAFE -> Map<codice, name> + full Subclient records
    const clientNameMap = new Map<string, string>();
    const subclients: Subclient[] = [];
    if (anagrafeBuf) {
      const anagrafePath = path.join(tmpDir, "ANAGRAFE.DBF");
      fs.writeFileSync(anagrafePath, anagrafeBuf);
      const anagrafeFile = await DBFFile.open(anagrafePath, {
        encoding: "latin1",
      });
      const anagrafeRows = await anagrafeFile.readRecords();
      for (const row of anagrafeRows) {
        const r = row as Record<string, unknown>;
        const codice = normalizeSubClientCode(trimStr(r.CODICE));
        const name = trimStr(r.DESCRIZION);
        if (codice && name) {
          clientNameMap.set(codice, name);
          subclients.push({
            codice,
            ragioneSociale: name,
            supplRagioneSociale: trimStr(r.SUPRAGSOC) || null,
            indirizzo: trimStr(r.INDIRIZZO) || null,
            cap: trimStr(r.CAP) || null,
            localita: trimStr(r.LOCALITA) || null,
            prov: trimStr(r.PROV) || null,
            telefono: trimStr(r.TELEFONO) || null,
            fax: trimStr(r.FAX) || null,
            email: trimStr(r.EMAIL) || null,
            partitaIva: trimStr(r.PARTIVA) || null,
            codFiscale: trimStr(r.CODFISCALE) || null,
            zona: trimStr(r.ZONA) || null,
            persDaContattare: trimStr(r.PERSDACONT) || null,
            emailAmministraz: trimStr(r.EMAILAMM) || null,
            agente: trimStr(r.AGENTE) || null,
            agente2: trimStr(r.AGENTE2) || null,
            settore: trimStr(r.SETTORE) || null,
            classe: trimStr(r.CLASSE) || null,
            pag: trimStr(r.PAG) || null,
            listino: trimStr(r.LISTINO) || null,
            banca: trimStr(r.BANCA) || null,
            valuta: trimStr(r.VALUTA) || null,
            codNazione: trimStr(r.CODNAZIONE) || 'IT',
            aliiva: trimStr(r.ALIIVA) || null,
            contoscar: trimStr(r.CONTOSCAR) || null,
            tipofatt: trimStr(r.TIPOFATT) || null,
            telefono2: trimStr(r.TELEFONO2) || null,
            telefono3: trimStr(r.TELEFONO3) || null,
            url: trimStr(r.URL) || null,
            cbNazione: trimStr(r.CB_NAZIONE) || null,
            cbBic: trimStr(r.CB_BIC) || null,
            cbCinUe: trimStr(r.CB_CIN_UE) || null,
            cbCinIt: trimStr(r.CB_CIN_IT) || null,
            abicab: trimStr(r.ABICAB) || null,
            contocorr: trimStr(r.CONTOCORR) || null,
            matchedCustomerProfileId: null,
            matchConfidence: null,
            arcaSyncedAt: null,
            customerMatchCount: 0,
            subClientMatchCount: 0,
          });
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
    const arcaDocMap = new Map<string, FresisHistoryRow>();
    const arcaDocKeys = new Set<string>();
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

      const docMapKey = `${esercizio}|${tipodoc}|${numerodoc}|${codicecf}`;
      arcaDocMap.set(docMapKey, records[records.length - 1]!);
      arcaDocKeys.add(`${esercizio}|${tipodoc}|${numerodoc}`);
    }

    return {
      records,
      subclients,
      errors,
      stats: {
        totalDocuments: records.length,
        totalRows: drRows.length,
        totalClients: clientNameMap.size,
        skippedOtherTypes,
      },
      maxNumerodocByKey,
      arcaDocMap,
      arcaDocKeys,
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}

export type SyncResult = {
  imported: number;
  skipped: number;
  exported: number;
  updated: number;
  softDeleted: number;
  renumbered: number;
  ktRecovered: number;
  deletionWarnings: Array<{
    invoiceNumber: string;
    hasTracking: boolean;
    hasDdt: boolean;
    hasDelivery: boolean;
  }>;
  ktNeedingMatch: Array<{ orderId: string; customerName: string }>;
  ktMissingArticles: string[];
  errors: string[];
  ftExportRecords: VbsExportRecord[];
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

  // 2. Load existing record IDs and invoice_numbers from DB
  const { rows: existingRows } = await pool.query<{ id: string; invoice_number: string | null }>(
    "SELECT id, invoice_number FROM agents.fresis_history WHERE user_id = $1",
    [userId],
  );
  const existingIds = new Set(existingRows.map((r) => r.id));
  const existingInvoiceNumbers = new Set(
    existingRows.filter((r) => r.invoice_number).map((r) => r.invoice_number!),
  );

  // 3. Classify records: update by ID, skip legacy invoice-number-only matches, insert new ones
  const newRecords: FresisHistoryRow[] = [];
  let updated = 0;

  for (const record of parsed.records) {
    if (existingIds.has(record.id)) {
      await pool.query(
        `UPDATE agents.fresis_history SET
           target_total_with_vat  = $1,
           discount_percent       = $2,
           items                  = $3,
           shipping_cost          = $4,
           shipping_tax           = $5,
           invoice_amount         = $6,
           invoice_date           = $7,
           notes                  = $8,
           archibald_order_number = $9,
           arca_data              = $10,
           updated_at             = NOW()
         WHERE id = $11 AND user_id = $12`,
        [
          record.target_total_with_vat,
          record.discount_percent,
          record.items,
          record.shipping_cost,
          record.shipping_tax,
          record.invoice_amount,
          record.invoice_date,
          record.notes,
          record.archibald_order_number,
          record.arca_data,
          record.id,
          userId,
        ],
      );
      updated++;
    } else if (existingInvoiceNumbers.has(record.invoice_number)) {
      // Legacy record matched by invoice_number only (4-arg deterministicId) — skip
    } else {
      newRecords.push(record);
    }
  }

  const skipped = parsed.records.length - newRecords.length - updated;

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

  // 5. Upsert subclients from ANAGRAFE
  if (parsed.subclients.length > 0) {
    const SUBCLIENT_BATCH = 500;
    for (let i = 0; i < parsed.subclients.length; i += SUBCLIENT_BATCH) {
      const batch = parsed.subclients.slice(i, i + SUBCLIENT_BATCH);
      await upsertSubclients(pool, batch);
    }
    logger.info(`Arca sync: upserted ${parsed.subclients.length} subclients for user ${userId}`);

    // Auto-match subclients to Archibald customers
    const matchResult = await matchSubclients(pool, userId);
    if (matchResult.matched > 0) {
      logger.info(`Arca sync: auto-matched ${matchResult.matched} subclients (${matchResult.unmatched} unmatched)`);
    }
  }

  // 6. Update ft_counter with max NUMERODOC per ESERCIZIO+TIPODOC (FT and KT have separate counters)
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    await pool.query(
      `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (esercizio, user_id, tipodoc)
       DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)`,
      [esercizio, userId, tipodoc, maxNum],
    );
  }

  // FASE 2b — Recovery KT "synced but absent from Arca" — DEFERRED
  // Requires migration 030 adding kt_arca_numerodoc TEXT to agents.order_records.
  const ktRecovered = 0;

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

  // 8. Filter PWA records not yet in Arca -> generate VBS
  const exportRecords: VbsExportRecord[] = [];
  for (const pwaRow of pwaRows) {
    const arcaData: ArcaData = typeof pwaRow.arca_data === "string"
      ? JSON.parse(pwaRow.arca_data)
      : pwaRow.arca_data as ArcaData;
    const key = `${arcaData.testata.ESERCIZIO}|${arcaData.testata.TIPODOC}|${arcaData.testata.NUMERODOC.trim()}`;
    if (!parsed.arcaDocKeys.has(key)) {
      exportRecords.push({
        invoiceNumber: pwaRow.invoice_number,
        arcaData,
      });
    }
  }

  // 9. KT status: calcola cosa manca (export avviene tutto in finalize)
  const ktNeedingMatch: Array<{ orderId: string; customerName: string }> = [];
  const ktMissingArticles: string[] = [];

  const ktOrders = await getKtEligibleOrders(pool, userId);
  if (ktOrders.length > 0) {
    const allSubclients = await getAllSubclients(pool);
    const subByProfile = new Map<string, Subclient>();
    for (const sc of allSubclients) {
      if (sc.matchedCustomerProfileId) {
        subByProfile.set(sc.matchedCustomerProfileId, sc);
      }
    }

    for (const order of ktOrders) {
      if (!order.articlesSyncedAt) {
        ktMissingArticles.push(order.id);
      } else if (!order.customerProfileId || !subByProfile.get(order.customerProfileId)) {
        ktNeedingMatch.push({ orderId: order.id, customerName: order.customerName });
      }
      // ordini pronti vengono esportati in finalize, non qui
    }
  }

  // FASE 4 — Soft delete: records source='arca_import' absent from current Arca DBF
  const { rows: arcaImportRows } = await pool.query<{
    id: string;
    invoice_number: string | null;
    ddt_number: string | null;
    tracking_number: string | null;
    delivery_completed_date: string | null;
  }>(
    `SELECT id, invoice_number, ddt_number, tracking_number, delivery_completed_date
     FROM agents.fresis_history
     WHERE user_id = $1 AND source = 'arca_import'
       AND (current_state IS NULL OR current_state != 'cancellato_in_arca')`,
    [userId],
  );

  let softDeleted = 0;
  const deletionWarnings: SyncResult["deletionWarnings"] = [];

  for (const row of arcaImportRows) {
    if (!row.invoice_number) continue;
    const key = invoiceNumberToKey(row.invoice_number);
    if (!key || parsed.arcaDocKeys.has(key)) continue;

    // Record no longer present in Arca → soft delete
    await pool.query(
      `UPDATE agents.fresis_history
       SET current_state = 'cancellato_in_arca', state_updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [row.id, userId],
    );
    softDeleted++;

    if (row.ddt_number || row.tracking_number || row.delivery_completed_date) {
      deletionWarnings.push({
        invoiceNumber: row.invoice_number,
        hasTracking: !!row.tracking_number,
        hasDdt: !!row.ddt_number,
        hasDelivery: !!row.delivery_completed_date,
      });
    }
  }

  // FASE 5 — Renumber source='app' records conflicting with Arca numbering
  const { rows: pwaSourceRows } = await pool.query<{
    id: string;
    invoice_number: string | null;
    arca_data: string | null;
  }>(
    `SELECT id, invoice_number, arca_data
     FROM agents.fresis_history
     WHERE user_id = $1 AND source = 'app' AND arca_data IS NOT NULL`,
    [userId],
  );

  let renumbered = 0;

  for (const row of pwaSourceRows) {
    if (!row.invoice_number || !row.arca_data) continue;
    const key = invoiceNumberToKey(row.invoice_number);
    if (!key || !parsed.arcaDocKeys.has(key)) continue;

    // Number occupied by an Arca doc → renumber
    let arcaData: ArcaData;
    try {
      arcaData = JSON.parse(row.arca_data);
    } catch {
      errors.push(`Renumbering skipped for ${row.invoice_number}: malformed arca_data`);
      continue;
    }

    const esercizio = arcaData.testata.ESERCIZIO;
    const tipodoc = arcaData.testata.TIPODOC as 'FT' | 'KT';

    if (tipodoc !== 'FT' && tipodoc !== 'KT') {
      errors.push(`Renumbering skipped for ${row.invoice_number}: unexpected TIPODOC '${arcaData.testata.TIPODOC}'`);
      continue;
    }

    const newNum = await getNextDocNumber(pool, userId, esercizio, tipodoc);

    const newInvoiceNumber = `${tipodoc} ${newNum}/${esercizio}`;
    arcaData.testata.NUMERODOC = String(newNum);
    for (const riga of arcaData.righe) {
      riga.NUMERODOC = String(newNum);
    }

    await pool.query(
      `UPDATE agents.fresis_history SET
         invoice_number         = $1,
         archibald_order_number = $1,
         arca_data              = $2,
         updated_at             = NOW()
       WHERE id = $3 AND user_id = $4`,
      [newInvoiceNumber, JSON.stringify(arcaData), row.id, userId],
    );
    renumbered++;
  }

  return {
    imported,
    skipped,
    exported: exportRecords.length,
    updated,
    softDeleted,
    renumbered,
    ktRecovered,          // from FASE 2b placeholder above
    deletionWarnings,
    ktNeedingMatch,
    ktMissingArticles,
    errors,
    ftExportRecords: exportRecords,
    parseStats: parsed.stats,
  };
}

export type KtSyncStatus = {
  total: number;
  articlesReady: number;
  articlesPending: number;
  matched: number;
  unmatched: Array<{ orderId: string; customerName: string; customerProfileId: string | null }>;
  readyToExport: number;
};

export async function getKtSyncStatus(pool: DbPool, userId: string): Promise<KtSyncStatus> {
  const ktOrders = await getKtEligibleOrders(pool, userId);
  const allSubclients = await getAllSubclients(pool);
  const subByProfile = new Map<string, Subclient>();
  for (const sc of allSubclients) {
    if (sc.matchedCustomerProfileId) {
      subByProfile.set(sc.matchedCustomerProfileId, sc);
    }
  }

  let articlesReady = 0;
  let articlesPending = 0;
  let matched = 0;
  let readyToExport = 0;
  const unmatched: KtSyncStatus['unmatched'] = [];

  for (const order of ktOrders) {
    if (order.articlesSyncedAt) { articlesReady++; } else { articlesPending++; }
    const hasMatch = order.customerProfileId ? subByProfile.has(order.customerProfileId) : false;
    if (hasMatch) {
      matched++;
      if (order.articlesSyncedAt) readyToExport++;
    } else {
      unmatched.push({ orderId: order.id, customerName: order.customerName, customerProfileId: order.customerProfileId });
    }
  }

  return { total: ktOrders.length, articlesReady, articlesPending, matched, unmatched, readyToExport };
}

export type KtExportResult = {
  ktExported: number;
  vbsScript: VbsResult | null;
};

export async function generateKtExportVbs(
  pool: DbPool,
  userId: string,
  ftExportRecords: VbsExportRecord[],
): Promise<KtExportResult> {
  const ktOrders = await getKtEligibleOrders(pool, userId);
  const allSubclients = await getAllSubclients(pool);
  const subByProfile = new Map<string, Subclient>();
  for (const sc of allSubclients) {
    if (sc.matchedCustomerProfileId) {
      subByProfile.set(sc.matchedCustomerProfileId, sc);
    }
  }

  const exportRecords: VbsExportRecord[] = [...ftExportRecords];
  const currentYear = new Date().getFullYear().toString();
  let ktExported = 0;

  for (const order of ktOrders) {
    if (!order.articlesSyncedAt) continue;
    const subclient = order.customerProfileId ? subByProfile.get(order.customerProfileId) : undefined;
    if (!subclient) continue;

    const articles = await getOrderArticles(pool, order.id, userId);
    if (articles.length === 0) continue;

    const esercizio = order.creationDate?.slice(0, 4) || currentYear;

    const orderParam = {
      id: order.id,
      creationDate: order.creationDate,
      customerName: order.customerName,
      discountPercent: order.discountPercent,
      notes: order.notes,
    };

    const toArticleForKt = (a: typeof articles[number]) => ({
      articleCode: a.articleCode,
      articleDescription: a.articleDescription ?? '',
      quantity: a.quantity,
      unitPrice: a.unitPrice ?? 0,
      discountPercent: a.discountPercent ?? 0,
      vatPercent: a.vatPercent ?? 22,
      lineAmount: a.lineAmount ?? 0,
      unit: 'PZ',
    });

    // Split articles: non-warehouse -> KT, warehouse portion -> FT companion
    const nonWarehouseArticles = articles
      .filter(a => (a.warehouseQuantity ?? 0) < a.quantity)
      .map(a => ({ ...a, quantity: a.quantity - (a.warehouseQuantity ?? 0) }));

    const warehouseArticles = articles
      .filter(a => (a.warehouseQuantity ?? 0) > 0)
      .map(a => ({ ...a, quantity: a.warehouseQuantity! }));

    // Generate KT only if there are non-warehouse articles
    if (nonWarehouseArticles.length > 0) {
      const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT');
      const arcaData = generateArcaDataFromOrder(
        orderParam,
        nonWarehouseArticles.map(toArticleForKt),
        subclient,
        docNumber,
        esercizio,
        'KT',
      );
      exportRecords.push({ invoiceNumber: `KT ${docNumber}/${esercizio}`, arcaData });
      ktExported++;
    }

    // Generate FT companion for warehouse articles (if any)
    if (warehouseArticles.length > 0) {
      const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT');
      const arcaDataFt = generateArcaDataFromOrder(
        orderParam,
        warehouseArticles.map(toArticleForKt),
        subclient,
        ftNum,
        esercizio,
        'FT',
      );
      exportRecords.push({ invoiceNumber: `FT ${ftNum}/${esercizio}`, arcaData: arcaDataFt });

      // Persist FT companion in fresis_history for idempotency
      const ftCompanionId = deterministicId(userId, esercizio, 'FT', String(ftNum), subclient.codice);
      await pool.query(
        `INSERT INTO agents.fresis_history
           (id, user_id, source, invoice_number, sub_client_codice, sub_client_name,
            customer_id, target_total_with_vat, discount_percent, items, arca_data,
            created_at, updated_at)
         VALUES ($1, $2, 'app', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          ftCompanionId,
          userId,
          `FT ${ftNum}/${esercizio}`,
          subclient.codice,
          subclient.ragioneSociale,
          order.customerProfileId ?? '',
          arcaDataFt.testata.TOTDOC ?? 0,
          order.discountPercent ?? 0,
          JSON.stringify([]),
          JSON.stringify(arcaDataFt),
        ],
      );

      // Save link on order_records
      await pool.query(
        `UPDATE agents.order_records
         SET warehouse_companion_ft_id = $1
         WHERE id = $2 AND user_id = $3`,
        [ftCompanionId, order.id, userId],
      );
    }

    // Update arca_kt_synced_at ONLY if KT was generated (not for fully-warehouse orders)
    if (nonWarehouseArticles.length > 0) {
      await pool.query(
        `UPDATE agents.order_records SET arca_kt_synced_at = NOW() WHERE id = $1 AND user_id = $2`,
        [order.id, userId],
      );
    }
  }

  // ANAGRAFE export (spostato da performArcaSync)
  const anagrafeExportRecords: AnagrafeExportRecord[] = [];
  const { rows: exportableSubclients } = await pool.query<{
    codice: string;
    ragione_sociale: string;
    suppl_ragione_sociale: string | null;
    indirizzo: string | null;
    cap: string | null;
    localita: string | null;
    prov: string | null;
    telefono: string | null;
    fax: string | null;
    email: string | null;
    partita_iva: string | null;
    cod_fiscale: string | null;
    zona: string | null;
    pers_da_contattare: string | null;
    email_amministraz: string | null;
    agente: string | null;
    agente2: string | null;
    settore: string | null;
    classe: string | null;
    pag: string | null;
    listino: string | null;
    banca: string | null;
    valuta: string | null;
    cod_nazione: string | null;
    aliiva: string | null;
    contoscar: string | null;
    tipofatt: string | null;
    telefono2: string | null;
    telefono3: string | null;
    url: string | null;
    cb_nazione: string | null;
    cb_bic: string | null;
    cb_cin_ue: string | null;
    cb_cin_it: string | null;
    abicab: string | null;
    contocorr: string | null;
    matched_customer_profile_id: string | null;
    match_confidence: string | null;
    arca_synced_at: string | null;
    customer_match_count: number;
    sub_client_match_count: number;
  }>(
    `SELECT * FROM shared.sub_clients
     WHERE arca_synced_at IS NULL OR updated_at > arca_synced_at`,
  );

  const seenTruncatedCodici = new Set<string>();
  for (const row of exportableSubclients) {
    const sc = mapRowToSubclient(row);
    const truncated = sc.codice.slice(0, ANAGRAFE_CODICE_MAX_LEN);
    if (seenTruncatedCodici.has(truncated)) continue;
    seenTruncatedCodici.add(truncated);
    anagrafeExportRecords.push({ subclient: sc });
  }

  if (anagrafeExportRecords.length > 0) {
    const codici = anagrafeExportRecords.map((r) => r.subclient.codice);
    const placeholders = codici.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `UPDATE shared.sub_clients SET arca_synced_at = NOW() WHERE codice IN (${placeholders})`,
      codici,
    );
    logger.info(`Arca sync: ${anagrafeExportRecords.length} subclients to export to ANAGRAFE`);
  }

  let vbsScript: VbsResult | null = null;
  if (exportRecords.length > 0 || anagrafeExportRecords.length > 0) {
    vbsScript = generateVbsScript(exportRecords, anagrafeExportRecords);
    logger.info(`Arca sync finalize-kt: ${exportRecords.length} docs + ${anagrafeExportRecords.length} anagrafe exported for user ${userId}`);
  }

  return { ktExported, vbsScript };
}
