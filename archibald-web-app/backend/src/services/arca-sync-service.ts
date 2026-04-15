import { DBFFile } from "dbffile";
import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
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

const MATCH_PRIORITY: Record<string, number> = { vat: 3, manual: 3, 'multi-field': 2, name_cap: 1, phone: 1 };

export function buildSubByProfile(subclients: Subclient[]): Map<string, Subclient> {
  const map = new Map<string, Subclient>();
  for (const sc of subclients) {
    if (!sc.matchedCustomerProfileId) continue;
    const existing = map.get(sc.matchedCustomerProfileId);
    const newPriority = MATCH_PRIORITY[sc.matchConfidence ?? ''] ?? 0;
    const existingPriority = existing ? (MATCH_PRIORITY[existing.matchConfidence ?? ''] ?? 0) : -1;
    if (newPriority > existingPriority) {
      map.set(sc.matchedCustomerProfileId, sc);
    }
  }
  return map;
}

// PostgreSQL jsonb serializes objects with keys sorted alphabetically and no spaces.
// This replicates that normalization so md5(JSON.stringify(sortKeysDeep(x)))
// matches md5(arca_data::text) computed server-side.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function arcaDataHash(arcaDataJson: string | null | undefined): string | null {
  if (!arcaDataJson) return null;
  try {
    return createHash("md5")
      .update(JSON.stringify(sortKeysDeep(JSON.parse(arcaDataJson) as unknown)))
      .digest("hex");
  } catch {
    return null;
  }
}

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
    const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
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
  lines.push('mainPrg.WriteLine "nCurDTId = nDTId"');
  lines.push('mainPrg.WriteLine "nDTId = nDTId + 1"');
  lines.push('mainPrg.WriteLine "SELECT _dt"');
  lines.push('mainPrg.WriteLine "APPEND BLANK"');
  lines.push('mainPrg.WriteLine "REPLACE ID WITH nCurDTId"');
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
      lines.push(`mainPrg.WriteLine "REPLACE NUMERODOC WITH [${padded}]"`);
    } else if (f === "TOTSCONTO" && (!raw || raw === 0)) {
      // Skip: leave as VFP null from APPEND BLANK. Explicit 0 would display as "0"
      // in ArcaPro's form; null displays as blank (ArcaPro uses SET NULL ON).
    } else {
      const vfpVal = formatVfpLiteral(f, raw as string | number | boolean | null);
      lines.push(`mainPrg.WriteLine "REPLACE ${f} WITH ${vfpVal}"`);
    }
  }
  lines.push('mainPrg.WriteLine "=TABLEUPDATE(.T., .F., [_dt])"');
  return lines;
}

function buildExecScriptDocrig(
  riga: ArcaData["righe"][number],
): string[] {
  const lines: string[] = [];
  lines.push('mainPrg.WriteLine "SELECT _dr"');
  lines.push('mainPrg.WriteLine "APPEND BLANK"');
  lines.push('mainPrg.WriteLine "REPLACE ID WITH nDRId"');
  lines.push('mainPrg.WriteLine "nDRId = nDRId + 1"');
  lines.push('mainPrg.WriteLine "REPLACE ID_TESTA WITH nCurDTId"');
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
      lines.push(`mainPrg.WriteLine "REPLACE NUMERODOC WITH [${padded}]"`);
    } else {
      const vfpVal = formatVfpLiteral(f, raw as string | number | boolean | null);
      lines.push(`mainPrg.WriteLine "REPLACE ${f} WITH ${vfpVal}"`);
    }
  }
  lines.push('mainPrg.WriteLine "=TABLEUPDATE(.T., .F., [_dr])"');
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

  lines.push('mainPrg.WriteLine "SELECT _sc"');
  lines.push('mainPrg.WriteLine "APPEND BLANK"');
  lines.push('mainPrg.WriteLine "REPLACE ID WITH nSCId"');
  lines.push('mainPrg.WriteLine "nSCId = nSCId + 1"');
  lines.push('mainPrg.WriteLine "REPLACE ID_DOC WITH nCurDTId"');
  lines.push('mainPrg.WriteLine "REPLACE ID_PNOTA WITH 0"');
  lines.push('mainPrg.WriteLine "REPLACE ID_SCAORIG WITH 0"');
  lines.push('mainPrg.WriteLine "REPLACE TRANSIT WITH .T."');
  lines.push(`mainPrg.WriteLine "REPLACE CODPAG WITH [${codpag}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE DATAFATT WITH {^${datadoc}}"`);
  lines.push(`mainPrg.WriteLine "REPLACE NUMFATT WITH [${numfatt}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE DATASCAD WITH {^${datascad}}"`);
  lines.push(`mainPrg.WriteLine "REPLACE CODBANCA WITH [1]"`);
  lines.push(`mainPrg.WriteLine "REPLACE CODCF WITH [${codcf}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE TIPO WITH [A]"`);
  lines.push(`mainPrg.WriteLine "REPLACE TIPOMOD WITH [${tipomod}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPEFF WITH ${totDoc}"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPEFFVAL WITH ${totDoc}"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPTOTFATT WITH ${totDoc}"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPTOTFATV WITH ${totDoc}"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPONIBILE WITH ${totNetto}"`);
  lines.push(`mainPrg.WriteLine "REPLACE IMPORTOPAG WITH 0"`);
  lines.push(`mainPrg.WriteLine "REPLACE NUMEFF WITH 1"`);
  lines.push(`mainPrg.WriteLine "REPLACE TOTEFF WITH 1"`);
  lines.push(`mainPrg.WriteLine "REPLACE CODCAMBIO WITH [EUR]"`);
  lines.push(`mainPrg.WriteLine "REPLACE VALCAMBIO WITH 1"`);
  lines.push(`mainPrg.WriteLine "REPLACE EUROCAMBIO WITH 1"`);
  lines.push(`mainPrg.WriteLine "REPLACE CB_NAZIONE WITH [IT]"`);
  lines.push(`mainPrg.WriteLine "REPLACE PARTANNO WITH ${esercizio}"`);
  lines.push(`mainPrg.WriteLine "REPLACE PARTNUM WITH [${partnum}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE PROTOCOLLO WITH [${protocollo}]"`);
  lines.push(`mainPrg.WriteLine "REPLACE DATAVALUTA WITH {^${datascad}}"`);
  lines.push('mainPrg.WriteLine "=TABLEUPDATE(.T., .F., [_sc])"');
  return lines;
}

function escapeVfpString(value: string | null): string {
  if (!value) return '';
  return value
    .replace(/[\r\n]/g, ' ')
    .replace(/]/g, '')
    .replace(/"/g, '""')
    .replace(/&/g, '] + CHR(38) + ['); // & inside VFP [...] triggers macro substitution
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
  lines.push(`prgFile.WriteLine "LOCATE FOR ALLTRIM(CODICE) == [${codiceEscaped}]"`);
  lines.push('prgFile.WriteLine "IF !FOUND()"');
  lines.push('prgFile.WriteLine "  APPEND BLANK"');
  // Only REPLACE CODICE for new records — updating it on existing records triggers
  // VFP CANDIDATE index uniqueness violation (NUMERO_P) during TABLEUPDATE.
  lines.push(`prgFile.WriteLine "  REPLACE CODICE WITH [${codiceEscaped}]"`);
  lines.push('prgFile.WriteLine "ENDIF"');

  const fields: Array<[string, string | null]> = [
    // CODICE is handled above in the IF !FOUND() block
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
    ['PAG', sc.pag || '0001'],
    ['LISTINO', sc.listino],
    ['BANCA', sc.banca],
    ['VALUTA', sc.valuta || 'EUR'],
    ['CODNAZIONE', sc.codNazione],
    ['ALIIVA', sc.aliiva],
    ['CONTOSCAR', sc.contoscar],
    ['TIPOFATT', sc.tipofatt],
    ['PERSDACONT', sc.persDaContattare],
    ['URL', sc.url],
    ['CB_NAZIONE', sc.cbNazione || 'IT'],
    ['CB_BIC', sc.cbBic],
    ['CB_CIN_UE', sc.cbCinUe],
    ['CB_CIN_IT', sc.cbCinIt],
    ['ABICAB', sc.abicab],
    ['CONTOCORR', sc.contocorr],
    ['CONTRPART', '04010101002'],
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
  lines.push("Dim fso, logFile, conn, rs, errCount, okCount");
  lines.push("Dim docAlreadyExists");
  lines.push("Dim mainPrg, doneFile, batchCount");
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
  lines.push("");

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

  // === Single batch PRG: 1 EXECSCRIPT, ID calcolati in VFP al momento dell'esecuzione ===
  lines.push("batchCount = 0");
  lines.push('Set mainPrg = fso.CreateTextFile(scriptDir & "\\temp_sync.prg", True)');
  lines.push('mainPrg.WriteLine "IF USED([_dt])"');
  lines.push('mainPrg.WriteLine "  USE IN SELECT([_dt])"');
  lines.push('mainPrg.WriteLine "ENDIF"');
  lines.push('mainPrg.WriteLine "IF USED([_dr])"');
  lines.push('mainPrg.WriteLine "  USE IN SELECT([_dr])"');
  lines.push('mainPrg.WriteLine "ENDIF"');
  lines.push('mainPrg.WriteLine "IF USED([_sc])"');
  lines.push('mainPrg.WriteLine "  USE IN SELECT([_sc])"');
  lines.push('mainPrg.WriteLine "ENDIF"');
  lines.push('mainPrg.WriteLine "USE doctes IN 0 SHARED AGAIN ALIAS _dt"');
  lines.push('mainPrg.WriteLine "=CURSORSETPROP([Buffering], 3, [_dt])"');
  lines.push('mainPrg.WriteLine "USE docrig IN 0 SHARED AGAIN ALIAS _dr"');
  lines.push('mainPrg.WriteLine "=CURSORSETPROP([Buffering], 3, [_dr])"');
  lines.push('mainPrg.WriteLine "USE SCADENZE IN 0 SHARED AGAIN ALIAS _sc"');
  lines.push('mainPrg.WriteLine "=CURSORSETPROP([Buffering], 3, [_sc])"');
  // Use IDs >= 100,000,000 to avoid collisions with ArcaPro's sequential IDs (1..N).
  // Two VFP runtimes (OLE DB + awext.FXP) don't share the lock manager, so FLOCK
  // cannot prevent ArcaPro from inserting between our MAX(ID) read and TABLEUPDATE.
  // Partitioning the ID space is the only reliable solution.
  //
  // CALCULATE NOOPTIMIZE instead of SELECT MAX(ID) INTO ARRAY: avoids traversing
  // the CDX CANDIDATE index for the aggregate scan. If the CDX B-tree has phantom
  // entries from a previously interrupted VBS run, SELECT MAX() triggers VFP error
  // 1884 "Uniqueness of index ID is violated". NOOPTIMIZE forces a sequential heap
  // scan which is immune to CDX corruption and still returns the correct MAX value.
  lines.push('mainPrg.WriteLine "LOCAL nDTId, nDRId, nSCId, nCurDTId, nMaxDT, nMaxDR, nMaxSC"');
  // SET DELETED OFF so that CALCULATE MAX(ID) includes soft-deleted records in its
  // sequential heap scan. The default VFP OLE DB setting is SET DELETED ON, which hides
  // soft-deleted rows. Soft-deleted rows still have live CDX entries; inserting at an ID
  // that matches a soft-deleted row triggers error 1884 "Uniqueness of index ID is
  // violated" during TABLEUPDATE. Using the max across ALL rows (including deleted) gives
  // a safe starting ID that avoids every existing CDX entry.
  lines.push('mainPrg.WriteLine "SET DELETED OFF"');
  lines.push('mainPrg.WriteLine "nMaxDT = 0"');
  lines.push('mainPrg.WriteLine "SELECT _dt"');
  lines.push('mainPrg.WriteLine "CALCULATE MAX(ID) TO nMaxDT NOOPTIMIZE"');
  lines.push('mainPrg.WriteLine "nDTId = IIF(ISNULL(nMaxDT) .OR. nMaxDT < 100000000, 100000000, nMaxDT + 1)"');
  lines.push('mainPrg.WriteLine "nMaxDR = 0"');
  lines.push('mainPrg.WriteLine "SELECT _dr"');
  lines.push('mainPrg.WriteLine "CALCULATE MAX(ID) TO nMaxDR NOOPTIMIZE"');
  lines.push('mainPrg.WriteLine "nDRId = IIF(ISNULL(nMaxDR) .OR. nMaxDR < 100000000, 100000000, nMaxDR + 1)"');
  lines.push('mainPrg.WriteLine "nMaxSC = 0"');
  lines.push('mainPrg.WriteLine "SELECT _sc"');
  lines.push('mainPrg.WriteLine "CALCULATE MAX(ID) TO nMaxSC NOOPTIMIZE"');
  lines.push('mainPrg.WriteLine "nSCId = IIF(ISNULL(nMaxSC) .OR. nMaxSC < 100000000, 100000000, nMaxSC + 1)"');
  lines.push('mainPrg.WriteLine "SET DELETED ON"');
  lines.push("");

  for (const record of records) {
    const { arcaData, invoiceNumber } = record;
    const { testata, righe } = arcaData;

    const numerodocTrimmed = String(testata.NUMERODOC).trim().replace(/'/g, "''");
    const tipodocTrimmed = String(testata.TIPODOC || "FT").trim().replace(/'/g, "''");
    const esercizioTrimmed = String(testata.ESERCIZIO || "").trim().replace(/'/g, "''");

    lines.push(`' --- ${sanitizeVbsComment(invoiceNumber)} ---`);
    lines.push("Err.Clear");
    // Idempotency: skip if ANY document with same NUMERODOC+ESERCIZIO exists in Arca.
    // Use ALLTRIM() to handle any leading/trailing space padding — NUMERODOC is 8-char
    // in the DBF but padNumerodoc produces 6-char values; VFP OLE DB SET EXACT ON would
    // make '   326' != '   326  ' without ALLTRIM.
    // NOTE: TIPODOC is intentionally excluded — FT and KT share CODCNT="001" in the
    // NUMERO_P candidate index, so FT N and KT N cannot coexist. Checking only
    // NUMERODOC+ESERCIZIO prevents the TABLEUPDATE uniqueness violation.
    lines.push(`Set rs = conn.Execute("SELECT COUNT(*) FROM doctes WHERE ALLTRIM(NUMERODOC) = '${numerodocTrimmed}' AND ALLTRIM(ESERCIZIO) = '${esercizioTrimmed}'")`);
    lines.push("docAlreadyExists = (Err.Number = 0 And Not rs.EOF And rs.Fields(0).Value > 0)");
    lines.push("If Err.Number = 0 Then rs.Close");
    lines.push("Err.Clear");
    lines.push("If docAlreadyExists Then");
    lines.push(`  logFile.WriteLine "SKIP ${sanitizeVbsComment(invoiceNumber)}: NUMERODOC already taken in Arca (NUMERO_P conflict)"`);
    lines.push("  okCount = okCount + 1");
    lines.push("Else");
    for (const l of buildExecScriptDoctes(testata)) {
      lines.push("  " + l);
    }
    for (const riga of righe) {
      for (const l of buildExecScriptDocrig(riga)) {
        lines.push("  " + l);
      }
    }
    for (const l of buildExecScriptScadenza(testata)) {
      lines.push("  " + l);
    }
    lines.push("  batchCount = batchCount + 1");
    lines.push("End If");
    lines.push("");
  }

  // === Chiudi PRG ed esegui 1 EXECSCRIPT ===
  lines.push('mainPrg.WriteLine "USE IN SELECT([_dt])"');
  lines.push('mainPrg.WriteLine "USE IN SELECT([_dr])"');
  lines.push('mainPrg.WriteLine "USE IN SELECT([_sc])"');
  lines.push("mainPrg.Close");
  lines.push("");
  // Reconnect before EXECSCRIPT: the idempotency SELECT queries above leave VFP
  // cursors open on DOCTES inside the OLE DB session. When the PRG then executes
  // "USE doctes IN 0 SHARED AGAIN", two cursors share the same CDX file. On
  // TABLEUPDATE the CDX page is written through one cursor while the other holds
  // a cached (now stale) copy — this corrupts the B-tree and causes the next run
  // to fail with "Uniqueness of index ID is violated". Closing and reopening the
  // connection drops all session-level VFP work areas before EXECSCRIPT runs.
  lines.push("conn.Close");
  lines.push("Err.Clear");
  lines.push('Set conn = CreateObject("ADODB.Connection")');
  lines.push('conn.Open "Provider=vfpoledb.1;Data Source=" & scriptDir & "\\"');
  lines.push("");
  lines.push("If batchCount > 0 Then");
  lines.push("  Err.Clear");
  lines.push('  conn.Execute "EXECSCRIPT(FILETOSTR([" & scriptDir & "\\temp_sync.prg]))"');
  lines.push("  If Err.Number <> 0 Then");
  lines.push('    logFile.WriteLine "ERROR batch sync: " & Err.Description');
  lines.push("    errCount = errCount + 1 : Err.Clear");
  lines.push("  Else");
  lines.push("    okCount = okCount + batchCount");
  lines.push("  End If");
  lines.push("End If");
  lines.push('fso.DeleteFile scriptDir & "\\temp_sync.prg", True');
  lines.push("");

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
  lines.push("' Segnala al browser che ArcaPro ha terminato l'elaborazione");
  lines.push('Set doneFile = fso.CreateTextFile(scriptDir & "\\arca_done.txt", True)');
  lines.push('doneFile.WriteLine "done"');
  lines.push("doneFile.Close");
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
  maxDateByKey: Map<string, string>;        // "esercizio|tipodoc" → max DATADOC (YYYY-MM-DD)
  arcaDocMap: Map<string, FresisHistoryRow>;
  arcaDocKeys: Set<string>;
  arcaClientMap: Map<string, string>;  // 3-part key → codicecf
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
    const maxDateByKey = new Map<string, string>();
    const arcaDocMap = new Map<string, FresisHistoryRow>();
    const arcaDocKeys = new Set<string>();
    const arcaClientMap = new Map<string, string>();  // 3-part key → codicecf
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

      const datadocIso = formatDate(datadoc)?.slice(0, 10) ?? '';
      if (datadocIso) {
        const currentMaxDate = maxDateByKey.get(trackingKey) ?? '';
        if (datadocIso > currentMaxDate) {
          maxDateByKey.set(trackingKey, datadocIso);
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
      const threePartKey = `${esercizio}|${tipodoc}|${numerodoc}`;
      arcaDocKeys.add(threePartKey);
      arcaClientMap.set(threePartKey, codicecf);
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
      maxDateByKey,
      arcaDocMap,
      arcaDocKeys,
      arcaClientMap,
    };
  } finally {
    cleanupTempDir(tmpDir);
  }
}

export type SyncResult = {
  imported: number;
  skipped: number;
  unchanged: number;
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
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

  // 2. Load existing records with arca_data hash for change detection.
  //    md5(arca_data::text) produces the same hash as arcaDataHash() in Node.js because
  //    PostgreSQL jsonb serializes keys alphabetically — same normalization as sortKeysDeep.
  type ExistingRecord = {
    id: string;
    invoice_number: string | null;
    source: string;
    sub_client_codice: string | null;
    arca_hash: string | null;
  };
  const { rows: existingRows } = await pool.query<ExistingRecord>(
    `SELECT id, invoice_number, source, sub_client_codice, md5(arca_data::text) as arca_hash
     FROM agents.fresis_history WHERE user_id = $1`,
    [userId],
  );
  const existingById = new Map<string, ExistingRecord>();
  const existingByInvoiceNumber = new Map<string, ExistingRecord>();
  for (const row of existingRows) {
    existingById.set(row.id, row);
    if (row.invoice_number) {
      existingByInvoiceNumber.set(row.invoice_number, row);
    }
  }

  // 3. Classify records: update by ID (only if arca_data changed), update arca_data for
  //    invoice-only matches (ArcaPro is source of truth), insert truly new records.
  const newRecords: FresisHistoryRow[] = [];
  let updated = 0;
  let unchanged = 0;

  for (const record of parsed.records) {
    const incomingHash = arcaDataHash(record.arca_data);

    if (existingById.has(record.id)) {
      const existing = existingById.get(record.id)!;

      if (incomingHash !== existing.arca_hash) {
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
      } else {
        unchanged++;
      }
    } else if (existingByInvoiceNumber.has(record.invoice_number)) {
      const existing = existingByInvoiceNumber.get(record.invoice_number)!;
      // Invoice-number match (ID mismatch): ArcaPro is source of truth.
      // Guard: only update if the client code also matches — same invoice number with a
      // different client means two genuinely distinct documents. FASE 5 will renumber
      // the conflict instead.
      if (existing.sub_client_codice === record.sub_client_codice) {
        if (incomingHash !== existing.arca_hash) {
          await pool.query(
            `UPDATE agents.fresis_history SET
               arca_data             = $1,
               target_total_with_vat = $2,
               discount_percent      = $3,
               items                 = $4,
               updated_at            = NOW()
             WHERE id = $5 AND user_id = $6`,
            [record.arca_data, record.target_total_with_vat, record.discount_percent, record.items, existing.id, userId],
          );
          updated++;
        } else {
          unchanged++;
        }
      }
      // else: different client → different document; skip, FASE 5 handles renumbering
    } else {
      newRecords.push(record);
    }
  }

  const skipped = parsed.records.length - newRecords.length - updated - unchanged;

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
    const maxDate = parsed.maxDateByKey.get(key) ?? null;
    await pool.query(
      `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (esercizio, user_id, tipodoc)
       DO UPDATE SET
         last_number = GREATEST(agents.ft_counter.last_number, $4),
         last_date   = GREATEST(agents.ft_counter.last_date, $5)`,
      [esercizio, userId, tipodoc, maxNum, maxDate],
    );
  }

  // Ensure BOTH FT and KT counters >= global max(FT, KT): both share CODCNT="001" in the
  // NUMERO_P candidate index, so any number used by one type blocks the other.
  const globalMaxByEsercizio = new Map<string, number>();
  const globalMaxDateByEsercizio = new Map<string, string>();
  for (const [key, maxNum] of parsed.maxNumerodocByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const cur = globalMaxByEsercizio.get(esercizio) ?? 0;
    if (maxNum > cur) globalMaxByEsercizio.set(esercizio, maxNum);
  }
  for (const [key, maxDate] of parsed.maxDateByKey) {
    const [esercizio, tipodoc] = key.split("|");
    if (tipodoc !== "FT" && tipodoc !== "KT") continue;
    const cur = globalMaxDateByEsercizio.get(esercizio) ?? '';
    if (maxDate > cur) globalMaxDateByEsercizio.set(esercizio, maxDate);
  }
  for (const [esercizio, globalMax] of globalMaxByEsercizio) {
    const globalMaxDate = globalMaxDateByEsercizio.get(esercizio) ?? null;
    for (const tipodoc of ["FT", "KT"] as const) {
      await pool.query(
        `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (esercizio, user_id, tipodoc)
         DO UPDATE SET
           last_number = GREATEST(agents.ft_counter.last_number, $4),
           last_date   = GREATEST(agents.ft_counter.last_date, $5)`,
        [esercizio, userId, tipodoc, globalMax, globalMaxDate],
      );
    }
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

  // Build a set of all NUMERODOC values already used in Arca (any TIPODOC) per esercizio.
  // FT and KT share CODCNT="001" in the NUMERO_P candidate index, so a KT with number N
  // makes FT N a uniqueness violation — detect and renumber before the VBS is generated.
  const takenNumerodocByEsanno = new Map<string, Set<number>>();
  for (const docKey of parsed.arcaDocKeys) {
    const parts = docKey.split("|");
    const esercizio = parts[0];
    const numInt = parseInt(parts[2], 10);
    if (!isNaN(numInt)) {
      let s = takenNumerodocByEsanno.get(esercizio);
      if (!s) { s = new Set(); takenNumerodocByEsanno.set(esercizio, s); }
      s.add(numInt);
    }
  }

  // 8. Filter PWA records not yet in Arca -> generate VBS, renumbering cross-type conflicts inline
  let renumbered = 0;
  const exportRecords: VbsExportRecord[] = [];
  for (const pwaRow of pwaRows) {
    const arcaData: ArcaData = typeof pwaRow.arca_data === "string"
      ? JSON.parse(pwaRow.arca_data)
      : pwaRow.arca_data as ArcaData;
    const esercizio = String(arcaData.testata.ESERCIZIO || "").trim();
    const tipodoc = String(arcaData.testata.TIPODOC || "FT").trim();
    const numerodocTrimmed = String(arcaData.testata.NUMERODOC || "").trim();
    const key = `${esercizio}|${tipodoc}|${numerodocTrimmed}`;
    if (parsed.arcaDocKeys.has(key)) continue; // Already in Arca under same type

    const numInt = parseInt(numerodocTrimmed, 10);
    const takenSet = takenNumerodocByEsanno.get(esercizio);
    if (!isNaN(numInt) && takenSet?.has(numInt)) {
      // NUMERO_P conflict: this NUMERODOC is occupied by a different doc type (e.g. FT 326 vs KT 326)
      const tipodocForCounter = (tipodoc === "KT" ? "KT" : "FT") as "FT" | "KT";
      const renumberDate = (arcaData.testata.DATADOC as string | null) ?? todayIsoDate();
      const newNum = await getNextDocNumber(pool, userId, esercizio, tipodocForCounter, renumberDate);
      arcaData.testata.NUMERODOC = String(newNum);
      for (const riga of arcaData.righe) riga.NUMERODOC = String(newNum);
      const newInvoiceNumber = `${tipodoc} ${newNum}/${esercizio}`;
      await pool.query(
        `UPDATE agents.fresis_history SET
           invoice_number         = $1,
           archibald_order_number = $1,
           arca_data              = $2,
           updated_at             = NOW()
         WHERE id = $3 AND user_id = $4`,
        [newInvoiceNumber, arcaData, pwaRow.id, userId],
      );
      takenSet.add(newNum);
      renumbered++;
      exportRecords.push({ invoiceNumber: newInvoiceNumber, arcaData });
    } else {
      exportRecords.push({ invoiceNumber: pwaRow.invoice_number, arcaData });
    }
  }

  // 9. Backfill customer_account_num per ordini KT dove manca ma esiste già il match subclient
  await pool.query(
    `UPDATE agents.order_records o
     SET customer_account_num = sc.matched_customer_profile_id
     FROM shared.sub_clients sc
     JOIN agents.customers c
       ON c.erp_id = sc.matched_customer_profile_id AND c.user_id = $1
     WHERE o.user_id = $1
       AND (o.customer_account_num IS NULL OR o.customer_account_num = '')
       AND lower(o.customer_name) = lower(c.name)
       AND sc.matched_customer_profile_id IS NOT NULL`,
    [userId],
  );

  // 10. KT status: calcola cosa manca (export avviene tutto in finalize)
  const ktNeedingMatch: Array<{ orderId: string; customerName: string }> = [];
  const ktMissingArticles: string[] = [];

  const ktOrders = await getKtEligibleOrders(pool, userId);
  if (ktOrders.length > 0) {
    const allSubclients = await getAllSubclients(pool);
    const subByProfile = buildSubByProfile(allSubclients);

    for (const order of ktOrders) {
      if (!order.articlesSyncedAt) {
        ktMissingArticles.push(order.id);
      } else if (!order.customerAccountNum || !subByProfile.get(order.customerAccountNum)) {
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

  // FASE 5 — Renumber source='app' records conflicting with Arca numbering (same TIPODOC, different client)
  const { rows: pwaSourceRows } = await pool.query<{
    id: string;
    invoice_number: string | null;
    arca_data: string | Record<string, unknown> | null;
    sub_client_codice: string | null;
  }>(
    `SELECT id, invoice_number, arca_data, sub_client_codice
     FROM agents.fresis_history
     WHERE user_id = $1 AND source = 'app' AND arca_data IS NOT NULL`,
    [userId],
  );

  for (const row of pwaSourceRows) {
    if (!row.invoice_number || !row.arca_data) continue;
    const key = invoiceNumberToKey(row.invoice_number);
    if (!key || !parsed.arcaDocKeys.has(key)) continue;

    // If the Arca document has the same client code, this is the same document
    // (PWA submitted it to Arca via the bot) — skip renumbering
    const arcaCodicecf = parsed.arcaClientMap.get(key);
    if (arcaCodicecf && arcaCodicecf === row.sub_client_codice) continue;

    // Number occupied by a DIFFERENT Arca doc → renumber
    // pg returns jsonb columns as objects, not strings — handle both
    let arcaData: ArcaData;
    try {
      arcaData = typeof row.arca_data === 'string'
        ? JSON.parse(row.arca_data)
        : row.arca_data as unknown as ArcaData;
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

    const renumberDate = (arcaData.testata.DATADOC as string | null) ?? todayIsoDate();
    const newNum = await getNextDocNumber(pool, userId, esercizio, tipodoc, renumberDate);

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
    unchanged,
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
  unmatched: Array<{ orderId: string; customerName: string; erpId: string | null }>;
  readyToExport: number;
};

export async function getKtSyncStatus(pool: DbPool, userId: string): Promise<KtSyncStatus> {
  const ktOrders = await getKtEligibleOrders(pool, userId);
  const allSubclients = await getAllSubclients(pool);
  const subByProfile = buildSubByProfile(allSubclients);

  let articlesReady = 0;
  let articlesPending = 0;
  let matched = 0;
  let readyToExport = 0;
  const unmatched: KtSyncStatus['unmatched'] = [];

  for (const order of ktOrders) {
    const hasMatch = order.customerAccountNum ? subByProfile.has(order.customerAccountNum) : false;
    if (hasMatch) {
      matched++;
      if (order.articlesSyncedAt) { articlesReady++; readyToExport++; }
      else { articlesPending++; }
    } else {
      unmatched.push({ orderId: order.id, customerName: order.customerName, erpId: order.customerAccountNum });
    }
  }

  return { total: ktOrders.length, articlesReady, articlesPending, matched, unmatched, readyToExport };
}

export type KtExportResult = {
  ktExported: number;
  warehouseOnlyExported: number;
  vbsScript: VbsResult | null;
  exportedOrderIds: string[];
};

type SplittableArticle = { quantity: number; warehouseQuantity: number | null };

export function splitArticlesByWarehouse<T extends SplittableArticle>(
  articles: T[],
): { nonWarehouse: T[]; warehouse: T[] } {
  const nonWarehouse = articles
    .filter(a => (a.warehouseQuantity ?? 0) < a.quantity)
    .map(a => ({ ...a, quantity: a.quantity - (a.warehouseQuantity ?? 0) })) as T[];

  const warehouse = articles
    .filter(a => (a.warehouseQuantity ?? 0) > 0)
    .map(a => ({ ...a, quantity: a.warehouseQuantity! })) as T[];

  return { nonWarehouse, warehouse };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function generateKtExportVbs(
  pool: DbPool,
  userId: string,
  ftExportRecords: VbsExportRecord[],
): Promise<KtExportResult> {
  logger.info(`generateKtExportVbs: start — ftExportRecords=${ftExportRecords.length}`);
  const ktOrders = await getKtEligibleOrders(pool, userId);
  logger.info(`generateKtExportVbs: ktOrders=${ktOrders.length}`);
  const allSubclients = await getAllSubclients(pool);
  logger.info(`generateKtExportVbs: allSubclients=${allSubclients.length}`);
  const subByProfile = buildSubByProfile(allSubclients);

  // Fallback: alcuni ordini hanno customer_account_num nel formato ACCOUNTNUM (1002xxx)
  // invece del formato erp_id (55.xxx). Risolviamo tramite agents.customers.
  const { rows: customerRows } = await pool.query<{ account_num: string; erp_id: string }>(
    `SELECT account_num, erp_id FROM agents.customers
     WHERE user_id = $1 AND account_num IS NOT NULL AND account_num != '' AND erp_id IS NOT NULL AND erp_id != ''`,
    [userId],
  );
  const accountNumToErpId = new Map<string, string>();
  for (const c of customerRows) {
    accountNumToErpId.set(c.account_num, c.erp_id);
  }

  const exportRecords: VbsExportRecord[] = [...ftExportRecords];
  const currentYear = new Date().getFullYear().toString();
  let ktExported = 0;
  let warehouseOnlyExported = 0;
  const exportedOrderIds: string[] = [];

  // Align FT and KT counters to global max(FT, KT) before assigning numbers.
  // generateKtExportVbs can run between syncs; without this, the KT counter may lag
  // behind the FT counter and produce numbers that already exist as FT (NUMERO_P conflict).
  // Note: last_date is NOT updated here — it is loaded in effectiveLastDateByEsercizio below
  // (MAX across both FT+KT), which is the authoritative source for docDate computation.
  const uniqueEsercizi = new Set(
    ktOrders.map((o) => o.creationDate?.slice(0, 4) || currentYear),
  );
  for (const esercizio of uniqueEsercizi) {
    const { rows: counterRows } = await pool.query<{ max_last: number }>(
      `SELECT COALESCE(MAX(last_number), 0) AS max_last
       FROM agents.ft_counter
       WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
      [userId, esercizio],
    );
    const globalMax = counterRows[0]?.max_last ?? 0;
    if (globalMax > 0) {
      for (const tipodoc of ["FT", "KT"] as const) {
        await pool.query(
          `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (esercizio, user_id, tipodoc)
           DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)`,
          [esercizio, userId, tipodoc, globalMax],
        );
      }
    }
  }

  // Sort KT per data ASC prima dell'assegnazione numeri
  ktOrders.sort((a, b) => (a.creationDate ?? '').localeCompare(b.creationDate ?? ''));

  // Carica effectiveLastDate per esercizio: max(last_date) da FT e KT counter
  const effectiveLastDateByEsercizio = new Map<string, string>();
  for (const esercizio of uniqueEsercizi) {
    const { rows } = await pool.query<{ max_date: string }>(
      `SELECT COALESCE(MAX(last_date)::text, '') AS max_date
       FROM agents.ft_counter
       WHERE user_id = $1 AND esercizio = $2 AND tipodoc IN ('FT', 'KT')`,
      [userId, esercizio],
    );
    effectiveLastDateByEsercizio.set(esercizio, rows[0]?.max_date ?? '');
  }
  // Estende effectiveLastDate con le date degli FT nel batch corrente
  for (const ft of ftExportRecords) {
    const ftDate = (ft.arcaData.testata.DATADOC as string | undefined) ?? '';
    const esercizio = String(ft.arcaData.testata.ESERCIZIO || '').trim() || currentYear;
    const cur = effectiveLastDateByEsercizio.get(esercizio) ?? '';
    if (ftDate > cur) effectiveLastDateByEsercizio.set(esercizio, ftDate);
  }

  for (const order of ktOrders) {
    if (!order.articlesSyncedAt) continue;
    const erpId = order.customerAccountNum
      ? (subByProfile.has(order.customerAccountNum)
          ? order.customerAccountNum
          : accountNumToErpId.get(order.customerAccountNum))
      : undefined;
    const subclient = erpId ? subByProfile.get(erpId) : undefined;
    if (!subclient) continue;

    const articles = await getOrderArticles(pool, order.id, userId);
    if (articles.length === 0) continue;

    const esercizio = order.creationDate?.slice(0, 4) || currentYear;
    const effectiveLastDate = effectiveLastDateByEsercizio.get(esercizio) ?? '';
    const rawDate = order.creationDate?.slice(0, 10) ?? todayIso();
    const docDate = rawDate > effectiveLastDate ? rawDate : effectiveLastDate; // YYYY-MM-DD lexicographic = chronological
    effectiveLastDateByEsercizio.set(esercizio, docDate);

    const orderParam = {
      id: order.id,
      creationDate: docDate,
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
    const { nonWarehouse: nonWarehouseArticles, warehouse: warehouseArticles } =
      splitArticlesByWarehouse(articles);

    // Generate KT only if there are non-warehouse articles
    if (nonWarehouseArticles.length > 0) {
      const docNumber = await getNextDocNumber(pool, userId, esercizio, 'KT', docDate);
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
    } else if (warehouseArticles.length > 0) {
      // All articles are warehouse-sourced: no KT generated, only FT companion
      warehouseOnlyExported++;
    }

    // Generate FT companion for warehouse articles (if any)
    if (warehouseArticles.length > 0) {
      const ftNum = await getNextDocNumber(pool, userId, esercizio, 'FT', docDate);
      const arcaDataFt = generateArcaDataFromOrder(
        orderParam,
        warehouseArticles.map(toArticleForKt),
        subclient,
        ftNum,
        esercizio,
        'FT',
      );
      exportRecords.push({ invoiceNumber: `FT ${ftNum}/${esercizio}`, arcaData: arcaDataFt });

      // Gap 3: ID based on order.id (not ftNum) so it's stable across re-runs
      const ftCompanionId = deterministicId(userId, esercizio, 'FT_COMPANION', order.id, subclient.codice);
      await pool.query(
        `INSERT INTO agents.fresis_history
           (id, user_id, source, invoice_number, sub_client_codice, sub_client_name,
            customer_id, customer_name, target_total_with_vat, discount_percent, items, arca_data,
            created_at, updated_at)
         VALUES ($1, $2, 'app', $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          ftCompanionId,
          userId,
          `FT ${ftNum}/${esercizio}`,
          subclient.codice,
          subclient.ragioneSociale,
          order.customerAccountNum ?? '',
          order.customerName,
          arcaDataFt.testata.TOTDOC ?? 0,
          order.discountPercent ?? 0,
          JSON.stringify(warehouseArticles.map(toArticleForKt)), // Gap 1: items populate con articoli magazzino
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

    exportedOrderIds.push(order.id);
  }

  // ANAGRAFE export (spostato da performArcaSync)
  logger.info(`generateKtExportVbs: starting ANAGRAFE export query`);
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

  logger.info(`generateKtExportVbs: ANAGRAFE query returned ${exportableSubclients.length} rows`);
  const seenTruncatedCodici = new Set<string>();
  for (const row of exportableSubclients) {
    const sc = mapRowToSubclient(row);
    const truncated = sc.codice.slice(0, ANAGRAFE_CODICE_MAX_LEN);
    if (seenTruncatedCodici.has(truncated)) continue;
    seenTruncatedCodici.add(truncated);
    anagrafeExportRecords.push({ subclient: sc });
  }
  logger.info(`generateKtExportVbs: anagrafeExportRecords=${anagrafeExportRecords.length}`);

  if (anagrafeExportRecords.length > 0) {
    const codici = anagrafeExportRecords.map((r) => r.subclient.codice);
    logger.info(`generateKtExportVbs: running UPDATE arca_synced_at for ${codici.length} subclients`);
    await pool.query(
      `UPDATE shared.sub_clients SET arca_synced_at = NOW() WHERE codice = ANY($1::text[])`,
      [codici],
    );
    logger.info(`Arca sync: ${anagrafeExportRecords.length} subclients to export to ANAGRAFE`);
  }

  exportRecords.sort((a, b) =>
    ((a.arcaData.testata.DATADOC as string | undefined) ?? '').localeCompare(
      (b.arcaData.testata.DATADOC as string | undefined) ?? '',
    ),
  );

  let vbsScript: VbsResult | null = null;
  if (exportRecords.length > 0 || anagrafeExportRecords.length > 0) {
    logger.info(`generateKtExportVbs: calling generateVbsScript with ${exportRecords.length} docs + ${anagrafeExportRecords.length} anagrafe`);
    vbsScript = generateVbsScript(exportRecords, anagrafeExportRecords);
    logger.info(`Arca sync finalize-kt: ${exportRecords.length} docs + ${anagrafeExportRecords.length} anagrafe exported for user ${userId}`);
  }

  return { ktExported, warehouseOnlyExported, vbsScript, exportedOrderIds };
}

export async function suggestNextCodice(pool: DbPool): Promise<string> {
  const { rows } = await pool.query<{ max_codice: string | null }>(
    `SELECT MAX(codice) AS max_codice FROM shared.sub_clients WHERE codice ~ '^C[0-9]{5}$'`,
  );
  const max = rows[0]?.max_codice;
  if (!max) return 'C00001';
  if (max === 'C99999') throw new Error('Codici C esauriti: tutti i codici C00001-C99999 sono in uso');
  const next = parseInt(max.slice(1), 10) + 1;
  return 'C' + String(next).padStart(5, '0');
}

export async function importCustomerAsSubclient(
  pool: DbPool,
  userId: string,
  erpId: string,
  codice: string,
): Promise<void> {
  if (!/^C[0-9]{5}$/.test(codice)) {
    throw new Error('Formato codice non valido: deve essere C seguito da 5 cifre');
  }

  const { rows } = await pool.query<{
    name: string; vat_number: string | null; fiscal_code: string | null;
    phone: string | null; mobile: string | null; email: string | null;
    pec: string | null; url: string | null; street: string | null;
    postal_code: string | null; city: string | null; attention_to: string | null;
  }>(
    `SELECT name, vat_number, fiscal_code, phone, mobile, email, pec, url,
            street, postal_code, city, attention_to
     FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );

  if (rows.length === 0) throw new Error('Cliente non trovato');
  const c = rows[0];

  try {
    await pool.query(
      `INSERT INTO shared.sub_clients
         (codice, ragione_sociale, partita_iva, cod_fiscale,
          telefono, telefono2, email, email_amministraz, url,
          indirizzo, cap, localita, pers_da_contattare,
          cod_nazione, cb_nazione,
          matched_customer_profile_id, arca_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL)`,
      [
        codice,
        c.name.slice(0, 40),
        c.vat_number,
        c.fiscal_code,
        c.phone,
        c.mobile,
        c.email,
        c.pec,
        c.url,
        c.street,
        c.postal_code,
        c.city,
        c.attention_to,
        'I',  // cod_nazione — ArcaPro uses 'I', not 'IT'
        'I',  // cb_nazione
        erpId,
      ],
    );
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw new Error('Codice già in uso');
    }
    throw err;
  }
}
