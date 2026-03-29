import { describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseNativeArcaFiles,
  generateVbsScript,
  performArcaSync,
  generateKtExportVbs,
  getKtSyncStatus,
  invoiceNumberToKey,
  splitArticlesByWarehouse,
  arcaDataHash,
  suggestNextCodice,
  importCustomerAsSubclient,
} from "./arca-sync-service";
import type { VbsExportRecord, SyncResult, AnagrafeExportRecord } from "./arca-sync-service";
import { deterministicId } from "../arca-import-service";
import type { ArcaData } from "../arca-data-types";
import type { DbPool } from "../db/pool";

const COOP16_DIR = "/Users/hatholdir/Downloads/ArcaPro/Ditte/COOP16";
const COOP16_EXISTS = fs.existsSync(path.join(COOP16_DIR, "doctes.dbf"));
const TEST_USER_ID = "test-user-native";

describe("invoiceNumberToKey", () => {
  test('parses "FT 326/2026" correctly', () => {
    expect(invoiceNumberToKey("FT 326/2026")).toBe("2026|FT|326");
  });

  test('parses "KT 330/2026" correctly', () => {
    expect(invoiceNumberToKey("KT 330/2026")).toBe("2026|KT|330");
  });

  test("returns null for malformed strings", () => {
    expect(invoiceNumberToKey("invalid")).toBeNull();
    expect(invoiceNumberToKey("")).toBeNull();
  });

  test("returns numerodoc as-is without stripping zeros", () => {
    // NUMERODOC in ArcaPro DBF is numeric, padded with spaces (not zeros) — trimStr handles spaces.
    // If a leading-zero input somehow arrives, the key preserves it as-is.
    expect(invoiceNumberToKey("FT 0326/2026")).toBe("2026|FT|0326");
  });
});

describe("invoiceNumberToKey - renumber detection", () => {
  test("detects conflict when PWA number is in arcaDocKeys", () => {
    const arcaDocKeys = new Set(["2026|FT|326"]);
    const pwaInvoiceNumber = "FT 326/2026";
    const key = invoiceNumberToKey(pwaInvoiceNumber);
    expect(key).not.toBeNull();
    expect(arcaDocKeys.has(key!)).toBe(true); // conflict!
  });
});

describe("invoiceNumberToKey - soft delete usage", () => {
  test("correctly identifies a record as absent from Arca", () => {
    const arcaDocKeys = new Set(["2026|FT|327", "2026|KT|333"]);
    const key = invoiceNumberToKey("FT 326/2026");
    expect(key).not.toBeNull();
    expect(arcaDocKeys.has(key!)).toBe(false); // 326 is not in Arca
  });

  test("correctly identifies a record as present in Arca", () => {
    const arcaDocKeys = new Set(["2026|FT|327", "2026|KT|333"]);
    const key = invoiceNumberToKey("FT 327/2026");
    expect(arcaDocKeys.has(key!)).toBe(true);
  });
});

function readCoop16File(filename: string): Buffer {
  return fs.readFileSync(path.join(COOP16_DIR, filename));
}

(COOP16_EXISTS ? describe : describe.skip)("parseNativeArcaFiles", () => {
  test(
    "parses real doctes+docrig producing correct number of FT+KT records",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      // 15015 FT + 20 KT = 15035
      expect(result.stats.totalDocuments).toBe(15035);
      // totalRows = rows read from docrig (VFP9 may skip deleted records)
      expect(result.stats.totalRows).toBeGreaterThan(50000);
      // ANAGRAFE has 1899+ records but some lack CODICE or DESCRIZION
      expect(result.stats.totalClients).toBe(1872);
      expect(result.records).toHaveLength(15035);
      // dbffile skips VFP9 deleted records; active - FT/KT = other types
      expect(result.stats.skippedOtherTypes).toBe(23);
    },
    120000,
  );

  test(
    "KT documents get distinct IDs from FT with same NUMERODOC",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      const ftRecords = result.records.filter((r) =>
        r.invoice_number.startsWith("FT "),
      );
      const ktRecords = result.records.filter((r) =>
        r.invoice_number.startsWith("KT "),
      );

      expect(ktRecords.length).toBe(20);
      expect(ftRecords.length).toBe(15015);

      // Verify KT IDs are distinct from FT IDs
      const ftIds = new Set(ftRecords.map((r) => r.id));
      for (const kt of ktRecords) {
        expect(ftIds.has(kt.id)).toBe(false);
      }

      // Verify KT IDs use TIPODOC in the deterministic hash
      // by checking the ID differs from what we'd get without TIPODOC
      for (const kt of ktRecords) {
        const invoiceMatch = kt.invoice_number.match(
          /^KT (\d+)\/(.+)$/,
        );
        expect(invoiceMatch).not.toBeNull();
        if (invoiceMatch) {
          const [, numerodoc, esercizio] = invoiceMatch;
          const ftStyleId = deterministicId(
            TEST_USER_ID,
            esercizio,
            numerodoc,
            kt.sub_client_codice,
          );
          expect(kt.id).not.toBe(ftStyleId);
        }
      }
    },
    120000,
  );

  test(
    "client names resolved from ANAGRAFE when provided",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      // With ANAGRAFE, sub_client_name should be a real name, not a code
      const recordsWithNames = result.records.filter(
        (r) => r.sub_client_name && !r.sub_client_name.startsWith("C"),
      );
      // Most records should have a resolved name (some clients may have codes starting with non-C)
      expect(recordsWithNames.length).toBeGreaterThan(13000);

      // Without ANAGRAFE, sub_client_name falls back to code
      const resultNoAnagrafe = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      const sameRecord = resultNoAnagrafe.records[0];
      const withAnagrafe = result.records.find(
        (r) => r.id === sameRecord.id,
      );
      // The record without ANAGRAFE should use codice as name
      expect(sameRecord.sub_client_name).toBe(sameRecord.sub_client_codice);
      // The record with ANAGRAFE should have a resolved name
      expect(withAnagrafe).toBeDefined();
      if (withAnagrafe) {
        expect(withAnagrafe.sub_client_name).not.toBe(
          withAnagrafe.sub_client_codice,
        );
      }
    },
    120000,
  );

  test(
    "parses full ANAGRAFE fields into subclients",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      expect(result.subclients.length).toBe(1875);

      // Verify first subclient has all expected fields
      const first = result.subclients[0];
      expect(first.codice).toBeTruthy();
      expect(first.ragioneSociale).toBeTruthy();
      // ANAGRAFE-specific fields should be present (at least some populated)
      const hasAnagrafeFields = result.subclients.some(
        (s) => s.pag !== null || s.zona !== null || s.agente !== null,
      );
      expect(hasAnagrafeFields).toBe(true);
    },
    120000,
  );

  test(
    "returns empty subclients when no ANAGRAFE provided",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      expect(result.subclients).toEqual([]);
    },
    120000,
  );

  test(
    "maxNumerodocByKey tracks separate FT/KT counters",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const result = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      // Should have separate keys for FT and KT per esercizio
      // Verify FT keys exist for multiple esercizi
      const ftKeys = [...result.maxNumerodocByKey.keys()].filter((k) =>
        k.endsWith("|FT"),
      );
      const ktKeys = [...result.maxNumerodocByKey.keys()].filter((k) =>
        k.endsWith("|KT"),
      );

      expect(ftKeys.length).toBeGreaterThan(0);
      expect(ktKeys.length).toBeGreaterThan(0);

      // FT and KT for same esercizio should have separate counters
      const ktKey = ktKeys[0];
      const esercizio = ktKey.split("|")[0];
      const ftKeyForSameYear = `${esercizio}|FT`;

      expect(result.maxNumerodocByKey.has(ftKeyForSameYear)).toBe(true);

      const maxFt = result.maxNumerodocByKey.get(ftKeyForSameYear)!;
      const maxKt = result.maxNumerodocByKey.get(ktKey)!;

      // FT should have more documents than KT in same esercizio
      expect(maxFt).toBeGreaterThan(maxKt);
      expect(maxKt).toBeGreaterThan(0);
    },
    120000,
  );
});

function makeArcaData(overrides?: {
  testata?: Partial<ArcaData["testata"]>;
  righe?: Array<Partial<ArcaData["righe"][number]>>;
}): ArcaData {
  const defaultTestata: ArcaData["testata"] = {
    ID: 0,
    ESERCIZIO: "2026",
    ESANNO: "2026",
    TIPODOC: "FT",
    NUMERODOC: "     1",
    DATADOC: "2026-01-15",
    CODICECF: "C00100",
    CODCNT: "001",
    MAGPARTENZ: "01",
    MAGARRIVO: "",
    NUMRIGHEPR: 0,
    AGENTE: "AG01",
    AGENTE2: "",
    VALUTA: "EUR",
    PAG: "RB60",
    SCONTI: "",
    SCONTIF: 1,
    SCONTOCASS: "",
    SCONTOCASF: 1,
    PROVV: "",
    PROVV2: "",
    CAMBIO: 0,
    DATADOCFOR: null,
    NUMERODOCF: "",
    TIPOMODULO: "",
    LISTINO: "01",
    ZONA: "01",
    SETTORE: "01",
    DESTDIV: "",
    DATACONSEG: null,
    TRDATA: null,
    TRORA: "",
    PESOLORDO: 0,
    PESONETTO: 0,
    VOLUME: 0,
    VETTORE1: "",
    V1DATA: null,
    V1ORA: "",
    VETTORE2: "",
    V2DATA: null,
    V2ORA: "",
    TRCAUSALE: "",
    COLLI: "",
    SPEDIZIONE: "",
    PORTO: "",
    NOTE: "",
    SPESETR: 0,
    SPESETRIVA: "",
    SPESETRCP: "",
    SPESETRPER: "",
    SPESEIM: 0,
    SPESEIMIVA: "",
    SPESEIMCP: "",
    SPESEVA: 0,
    SPESEVAIVA: "",
    SPESEVACP: "",
    ACCONTO: 0,
    ABBUONO: 0,
    TOTIMP: 100,
    TOTDOC: 122,
    SPESE: "",
    SPESEBOLLI: 0,
    SPESEINCAS: 0,
    SPESEINEFF: 0,
    SPESEINDOC: 0,
    SPESEINIVA: "",
    SPESEINCP: "",
    SPESEESENZ: 0,
    CODCAUMAG: "",
    CODBANCA: "",
    PERCPROVV: 0,
    IMPPROVV: 0,
    TOTPROVV: 0,
    PERCPROVV2: 0,
    IMPPROVV2: 0,
    TOTPROVV2: 0,
    TOTIVA: 22,
    ASPBENI: "",
    SCORPORO: false,
    TOTMERCE: 100,
    TOTSCONTO: 0,
    TOTNETTO: 100,
    TOTESEN: 0,
    IMPCOND: 0,
    RITCOND: 0,
    TIPOFATT: "N",
    TRIANGOLAZ: false,
    NOMODIFICA: false,
    NOEVASIONE: false,
    COMMESSA: "",
    EUROCAMBIO: 1,
    EXPORT_I: false,
    CB_BIC: "",
    CB_NAZIONE: "",
    CB_CIN_UE: "",
    CB_CIN_IT: "",
    ABICAB: "",
    CONTOCORR: "",
    CARICATORE: "",
    COMMITTENT: "",
    PROPRMERCE: "",
    LUOGOCAR: "",
    LUOGOSCAR: "",
    SDTALTRO: "",
    TIMESTAMP: null,
    USERNAME: "",
  };

  const defaultRiga: ArcaData["righe"][number] = {
    ID: 0,
    ID_TESTA: 0,
    ESERCIZIO: "2026",
    TIPODOC: "FT",
    NUMERODOC: "     1",
    DATADOC: "2026-01-15",
    CODICECF: "C00100",
    MAGPARTENZ: "01",
    MAGARRIVO: "",
    AGENTE: "AG01",
    AGENTE2: "",
    VALUTA: "EUR",
    CAMBIO: 0,
    CODICEARTI: "ART001",
    NUMERORIGA: 1,
    ESPLDISTIN: "",
    UNMISURA: "PZ",
    QUANTITA: 10,
    QUANTITARE: 0,
    SCONTI: "",
    PREZZOUN: 10,
    PREZZOTOT: 100,
    ALIIVA: "22",
    CONTOSCARI: "",
    OMIVA: false,
    OMMERCE: false,
    PROVV: "",
    PROVV2: "",
    DATACONSEG: null,
    DESCRIZION: "Articolo test",
    TIPORIGAD: "",
    RESTOSCORP: 0,
    RESTOSCUNI: 0,
    CODCAUMAG: "",
    ZONA: "",
    SETTORE: "",
    GRUPPO: "",
    CLASSE: "",
    RIFFROMT: 0,
    RIFFROMR: 0,
    PREZZOTOTM: 0,
    NOTE: "",
    COMMESSA: "",
    TIMESTAMP: null,
    USERNAME: "",
    FATT: 0,
    LOTTO: "",
    MATRICOLA: "",
    EUROCAMBIO: 1,
    U_PESON: 0,
    U_PESOL: 0,
    U_COLLI: 0,
    U_GIA: 0,
    U_MAGP: "",
    U_MAGA: "",
  };

  return {
    testata: { ...defaultTestata, ...overrides?.testata },
    righe: overrides?.righe
      ? overrides.righe.map((r) => ({ ...defaultRiga, ...r }))
      : [defaultRiga],
  };
}

describe("generateVbsScript", () => {
  test("returns empty strings when no records", () => {
    const result = generateVbsScript([]);

    expect(result).toEqual({
      vbs: "",
      bat: "",
      watcher: "",
      watcherSetup: "",
    });
  });

  test("produces VBS with INSERT INTO doctes and docrig statements", () => {
    const arcaData = makeArcaData();
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("Provider=vfpoledb.1");
    expect(result.vbs).toContain("EXECSCRIPT(FILETOSTR(");
    expect(result.vbs).toContain("APPEND BLANK");
    expect(result.vbs).toContain("WScript.ScriptFullName");
    expect(result.vbs).toContain("REPLACE ESERCIZIO WITH");
    expect(result.vbs).toContain("REPLACE ID_TESTA WITH");
    expect(result.vbs).toContain("SELECT MAX(ID) FROM _dt INTO ARRAY aDTId");
    expect(result.vbs).toContain("nDTId = IIF(ISNULL(aDTId[1]) .OR. aDTId[1] < 100000000");
  });

  test("preserves single quotes in VFP bracket-delimited strings", () => {
    const arcaData = makeArcaData({
      testata: { NOTE: "L'ordine dell'azienda" },
      righe: [{ DESCRIZION: "Tubo d'acciaio" }],
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("[L'ordine dell'azienda]");
    expect(result.vbs).toContain("[Tubo d'acciaio]");
  });

  test("generates file watcher scripts", () => {
    const arcaData = makeArcaData();
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.watcher).toContain("sync_arca.vbs");
    expect(result.watcher).toContain("SysWOW64");
    expect(result.watcher).toContain("watcher_log.txt");
    expect(result.watcherSetup).toContain("Startup");
    expect(result.watcherSetup).toContain("arca_watcher.vbs");
  });

  test("sync script self-deletes after successful execution", () => {
    const arcaData = makeArcaData();
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("DeleteFile");
    expect(result.vbs).toContain("WScript.ScriptFullName");
  });

  test("BAT wrapper uses 32-bit wscript", () => {
    const arcaData = makeArcaData();
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.bat).toContain("SysWOW64");
    expect(result.bat).toContain("wscript.exe");
    expect(result.bat).toContain("sync_arca.vbs");
  });

  test("uses VFP strict date literal for DATADOC (locale-independent)", () => {
    const arcaData = makeArcaData({
      testata: { DATADOC: "2026-01-15" },
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("{^2026-01-15}");
  });

  test("batch optimization: usa esattamente 3 EXECSCRIPT per N documenti (doctes+docrig+scadenze)", () => {
    const arcaData1 = makeArcaData({
      testata: { NUMERODOC: "     1", CODICECF: "C00100" },
    });
    const arcaData2 = makeArcaData({
      testata: { NUMERODOC: "     2", CODICECF: "C00200" },
      righe: [
        { CODICEARTI: "ART001", NUMERORIGA: 1 },
        { CODICEARTI: "ART002", NUMERORIGA: 2 },
      ],
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData: arcaData1 },
      { invoiceNumber: "FT 2/2026", arcaData: arcaData2 },
    ];

    const result = generateVbsScript(records);

    const execCount = (
      result.vbs.match(/EXECSCRIPT\(FILETOSTR\(\[/g) || []
    ).length;

    // Single PRG: 1 EXECSCRIPT (temp_sync.prg), ID calcolati in VFP al momento dell'esecuzione
    expect(execCount).toBe(1);
  });

  test("scrive arca_done.txt alla fine dello script di sync", () => {
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData: makeArcaData() },
    ];
    const result = generateVbsScript(records);
    expect(result.vbs).toContain("arca_done.txt");
  });

  test("idempotency check per documento ancora presente nel VBS batch", () => {
    const arcaData1 = makeArcaData({ testata: { NUMERODOC: "     1", TIPODOC: "FT", ESERCIZIO: "2026" } });
    const arcaData2 = makeArcaData({ testata: { NUMERODOC: "     2", TIPODOC: "FT", ESERCIZIO: "2026" } });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData: arcaData1 },
      { invoiceNumber: "FT 2/2026", arcaData: arcaData2 },
    ];
    const result = generateVbsScript(records);
    // Un SELECT COUNT per documento per il controllo di duplicati
    const idempotencyChecks = (result.vbs.match(/SELECT COUNT\(\*\) FROM doctes/g) ?? []).length;
    expect(idempotencyChecks).toBe(2);
  });

  test("pads NUMERODOC to 6 chars right-aligned", () => {
    const arcaData = makeArcaData({
      testata: { NUMERODOC: "     1" },
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("[     1]");
  });

  test("escapes & in ANAGRAFE text fields via CHR(38) to prevent VFP macro substitution", () => {
    // In VFP, & inside [...] is the macro substitution operator:
    // [A&B DENTAL] tries to expand variable B → "Feature is not available"
    // Fix: replace & with ] + CHR(38) + [ so VFP concatenates instead of expanding.
    const subclient: AnagrafeExportRecord["subclient"] = {
      codice: "C00573",
      ragioneSociale: "A&B DENTAL    ENZO",
      supplRagioneSociale: "MARANDINO &C. sas",
      indirizzo: null, cap: null, localita: null, prov: null,
      telefono: null, fax: null, email: null,
      partitaIva: null, codFiscale: null, zona: null, persDaContattare: null,
      emailAmministraz: null, agente: null, agente2: null, settore: null,
      classe: null, pag: null, listino: null, banca: null, valuta: null,
      codNazione: null, aliiva: null, contoscar: null, tipofatt: null,
      telefono2: null, telefono3: null, url: null, cbNazione: null,
      cbBic: null, cbCinUe: null, cbCinIt: null, abicab: null, contocorr: null,
      matchedCustomerProfileId: null, matchConfidence: null, arcaSyncedAt: null,
      customerMatchCount: 0, subClientMatchCount: 0,
    };

    const result = generateVbsScript([], [{ subclient }]);

    expect(result.vbs).not.toContain("WITH [A&B");
    expect(result.vbs).not.toContain("WITH [MARANDINO &C");
    expect(result.vbs).toContain("[A] + CHR(38) + [B DENTAL");
    expect(result.vbs).toContain("[MARANDINO ] + CHR(38) + [C. sas]");
  });

  test("TIPOMOD in scadenza usa TIPODOC del documento, non FT fisso", () => {
    const arcaDataFt = makeArcaData({ testata: { TIPODOC: "FT" } });
    const arcaDataKt = makeArcaData({ testata: { TIPODOC: "KT" } });

    const resultFt = generateVbsScript([{ invoiceNumber: "FT 1/2026", arcaData: arcaDataFt }]);
    const resultKt = generateVbsScript([{ invoiceNumber: "KT 1/2026", arcaData: arcaDataKt }]);

    expect(resultFt.vbs).toContain("REPLACE TIPOMOD WITH [FT]");
    expect(resultKt.vbs).toContain("REPLACE TIPOMOD WITH [KT]");
    expect(resultKt.vbs).not.toContain("REPLACE TIPOMOD WITH [FT]");
  });

  test("ANAGRAFE section appears before FT/KT document records in VBS output", () => {
    const arcaData = makeArcaData();
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];
    const anagrafeRecord: AnagrafeExportRecord = {
      subclient: {
        codice: "C00042",
        ragioneSociale: "Nuovo Cliente Srl",
        supplRagioneSociale: null,
        indirizzo: null, cap: null, localita: null, prov: null,
        telefono: null, fax: null, email: null,
        partitaIva: null, codFiscale: null, zona: null, persDaContattare: null,
        emailAmministraz: null, agente: null, agente2: null, settore: null,
        classe: null, pag: null, listino: null, banca: null, valuta: null,
        codNazione: null, aliiva: null, contoscar: null, tipofatt: null,
        telefono2: null, telefono3: null, url: null, cbNazione: null,
        cbBic: null, cbCinUe: null, cbCinIt: null, abicab: null, contocorr: null,
        matchedCustomerProfileId: null, matchConfidence: null, arcaSyncedAt: null,
        customerMatchCount: 0, subClientMatchCount: 0,
      },
    };

    const result = generateVbsScript(records, [anagrafeRecord]);

    const anagrafePos = result.vbs.indexOf("' --- ANAGRAFE Export ---");
    const ftPos = result.vbs.indexOf("' --- FT 1/2026 ---");

    expect(anagrafePos).toBeGreaterThan(-1);
    expect(ftPos).toBeGreaterThan(-1);
    expect(anagrafePos).toBeLessThan(ftPos);
  });
});

type MockExistingRecord = {
  id: string;
  invoice_number?: string | null;
  source?: string;
  sub_client_codice?: string | null;
  arca_hash?: string | null;
};

function createMockPool(overrides?: {
  existingIds?: string[];
  existingInvoiceNumbers?: string[];
  existingSources?: string[];
  existingRecords?: MockExistingRecord[];
  pwaExportRows?: Array<{ id: string; arca_data: string; invoice_number: string }>;
  ftCounterCalls?: Array<unknown[]>;
  ktEligibleOrders?: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    customer_account_num: string | null;
    creation_date: string;
    discount_percent: string | null;
    order_description: string | null;
    articles_synced_at: string | null;
  }>;
  arcaImportRows?: Array<{
    id: string;
    invoice_number: string | null;
    ddt_number: string | null;
    tracking_number: string | null;
    delivery_completed_date: string | null;
  }>;
  pwaSourceRows?: Array<{
    id: string;
    invoice_number: string | null;
    arca_data: string | null;
    sub_client_codice: string | null;
  }>;
  subclientRows?: Array<{
    codice: string;
    ragione_sociale: string;
    suppl_ragione_sociale: string | null;
    matched_customer_profile_id: string | null;
    match_confidence: string | null;
    arca_synced_at: string | null;
    [key: string]: unknown;
  }>;
  orderArticlesRows?: Array<{
    id: number;
    order_id: string;
    user_id: string;
    article_code: string;
    article_description: string | null;
    quantity: number;
    unit_price: number | null;
    discount_percent: number | null;
    line_amount: number | null;
    vat_percent: number | null;
    vat_amount: number | null;
    line_total_with_vat: number | null;
    warehouse_quantity: number | null;
    warehouse_sources_json: string | null;
    created_at: string;
  }>;
}): DbPool {
  const existingIds = overrides?.existingIds ?? [];
  const existingInvoiceNumbers = overrides?.existingInvoiceNumbers ?? [];
  const existingSources = overrides?.existingSources ?? [];
  const existingRecords = overrides?.existingRecords;
  const pwaExportRows = overrides?.pwaExportRows ?? [];
  const ftCounterCalls = overrides?.ftCounterCalls ?? [];
  const ktEligibleOrders = overrides?.ktEligibleOrders ?? [];
  const arcaImportRows = overrides?.arcaImportRows ?? [];
  const pwaSourceRows = overrides?.pwaSourceRows ?? [];
  const subclientRows = overrides?.subclientRows ?? [];
  const orderArticlesRows = overrides?.orderArticlesRows ?? [];

  return {
    query: vi.fn().mockImplementation((text: string, params?: unknown[]) => {
      if (
        text.includes("FROM agents.fresis_history") &&
        text.includes("source = 'arca_import'") &&
        text.includes("cancellato_in_arca")
      ) {
        return { rows: arcaImportRows, rowCount: arcaImportRows.length };
      }
      if (text.includes("FROM agents.fresis_history WHERE user_id") && text.includes("arca_hash")) {
        const rows = existingRecords
          ? existingRecords.map(r => ({
              id: r.id,
              invoice_number: r.invoice_number ?? null,
              source: r.source ?? 'arca_import',
              sub_client_codice: r.sub_client_codice ?? null,
              arca_hash: r.arca_hash ?? null,
            }))
          : existingIds.map((id, i) => ({
              id,
              invoice_number: existingInvoiceNumbers[i] ?? null,
              source: existingSources[i] ?? 'arca_import',
              sub_client_codice: null,
              arca_hash: null,
            }));
        return { rows };
      }
      if (text.includes("INSERT INTO agents.fresis_history")) {
        // Simulate upsertRecords: count placeholders to determine record count
        const placeholderCount = (text.match(/\(\$\d+/g) || []).length;
        const recordCount = placeholderCount > 0 ? Math.floor((params?.length ?? 0) / 38) : 0;
        return {
          rows: Array.from({ length: recordCount }, () => ({ action: "inserted" })),
          rowCount: 1,
        };
      }
      if (text.includes("FROM agents.ft_counter") && text.includes("tipodoc IN")) {
        // Counter alignment SELECT: return 0 so no-op in unit tests
        return { rows: [{ max_last: 0 }], rowCount: 1 };
      }
      if (text.includes("INSERT INTO agents.ft_counter") && text.includes("RETURNING")) {
        ftCounterCalls.push(params ?? []);
        return { rows: [{ last_number: 100 }], rowCount: 1 };
      }
      if (text.includes("INSERT INTO agents.ft_counter")) {
        ftCounterCalls.push(params ?? []);
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("SELECT id, invoice_number, arca_data") && text.includes("source = 'app'")) {
        return { rows: pwaSourceRows, rowCount: pwaSourceRows.length };
      }
      if (text.includes("SELECT id, arca_data, invoice_number")) {
        return { rows: pwaExportRows };
      }
      if (text.includes("FROM shared.sub_clients")) {
        return { rows: subclientRows, rowCount: subclientRows.length };
      }
      if (text.includes("FROM agents.order_articles") && text.includes("order_id = $1")) {
        return { rows: orderArticlesRows, rowCount: orderArticlesRows.length };
      }
      if (text.includes("arca_kt_synced_at IS NULL")) {
        return { rows: ktEligibleOrders };
      }
      return { rows: [], rowCount: 0 };
    }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

(COOP16_EXISTS ? describe : describe.skip)("performArcaSync", () => {
  test(
    "imports new records and returns sync report",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const pool = createMockPool();

      const result = await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
      );

      expect(result.imported).toBe(15035);
      expect(result.skipped).toBe(0);
      expect(result.exported).toBe(0);
      expect(result.ftExportRecords).toHaveLength(0);
      expect(result.parseStats.totalDocuments).toBe(15035);

      // ft_counter should have been called for FT esercizi
      const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const ftCounterCalls = queryCalls.filter(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("ft_counter"),
      );
      expect(ftCounterCalls.length).toBeGreaterThan(0);
    },
    60000,
  );

  test(
    "aggiorna il contatore KT al global max(FT,KT) per prevenire conflitti NUMERO_P cross-type",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const pool = createMockPool();
      await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      // From real Mac DBF: FT 2026 max = 329, KT 2026 max = 326 → global max = 329.
      // The KT counter must be updated to 329 (not just to 326) so that future KT numbers
      // start from 330 and don't collide with existing FT numbers.
      const allInserts = (pool.query as ReturnType<typeof vi.fn>).mock.calls
        .filter(([sql]: [string]) =>
          typeof sql === "string" &&
          sql.includes("INSERT INTO agents.ft_counter") &&
          !sql.includes("RETURNING"),
        )
        .map(([, params]: [string, unknown[]]) => params);

      const ktGlobalMaxInserts = allInserts.filter(
        (p) => p[1] === TEST_USER_ID && p[2] === "KT" && p[0] === "2026",
      );
      expect(ktGlobalMaxInserts.length).toBeGreaterThan(0);

      // At least one KT insert must carry the global max (329 = FT max, > KT max 326)
      const maxValueForKt = Math.max(...ktGlobalMaxInserts.map((p) => p[3] as number));
      expect(maxValueForKt).toBeGreaterThanOrEqual(329);
    },
    120000,
  );

  test(
    "syncs ANAGRAFE records to sub_clients table",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const pool = createMockPool();

      await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
      );

      // Verify sub_clients upsert was called
      const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const subclientCalls = queryCalls.filter(
        ([sql]: [string]) => typeof sql === "string" && sql.includes("INSERT INTO shared.sub_clients"),
      );
      expect(subclientCalls.length).toBeGreaterThan(0);

      // Verify params include all ANAGRAFE fields (39 per subclient)
      const firstCall = subclientCalls[0];
      const params = firstCall[1] as unknown[];
      // Should have 39 params per subclient × batch size
      expect(params.length).toBeGreaterThan(0);
      expect(params.length % 39).toBe(0);
    },
    60000,
  );

  test(
    "updates already-existing records on second sync with Arca-owned fields",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      // First parse to get all IDs
      const parsed = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );
      const allIds = parsed.records.map((r) => r.id);
      const allInvoiceNumbers = parsed.records.map((r) => r.invoice_number);

      // Mock pool with all existing IDs + invoice_numbers
      const pool = createMockPool({ existingIds: allIds, existingInvoiceNumbers: allInvoiceNumbers });

      const result = await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        null,
      );

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(15035);
      expect(result.skipped).toBe(0);
      expect(result.exported).toBe(0);
      expect(result.ftExportRecords).toHaveLength(0);
    },
    60000,
  );

  test(
    "skips UPDATE when arca_data is unchanged since last sync (detects line-item changes too)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const parsed = await parseNativeArcaFiles(
        doctesBuf, docrigBuf, null, TEST_USER_ID, new Map(), new Map(),
      );
      const arcaRecord = parsed.records[0]!;

      // arca_hash matches what arcaDataHash() would produce for this record
      const pool = createMockPool({
        existingRecords: [{
          id: arcaRecord.id,
          invoice_number: arcaRecord.invoice_number,
          source: 'arca_import',
          arca_hash: arcaDataHash(arcaRecord.arca_data),
        }],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(1);
    },
    60000,
  );

  test.each([
    ["app", "pwa-app-id-does-not-match-arca"],
    ["arca_import", "arca-import-legacy-4arg-id"],
  ] as const)(
    "FASE 3: updates arca_data+total for source=%s record matched by invoice_number only (ArcaPro is source of truth)",
    async (source, existingId) => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const parsed = await parseNativeArcaFiles(
        doctesBuf, docrigBuf, null, TEST_USER_ID, new Map(), new Map(),
      );
      const arcaRecord = parsed.records[0]!;

      // sub_client_codice must match the Arca record so FASE 3 treats it as the same document
      const pool = createMockPool({
        existingRecords: [{
          id: existingId,
          invoice_number: arcaRecord.invoice_number,
          source,
          sub_client_codice: arcaRecord.sub_client_codice,
          arca_hash: null,  // null → hash mismatch → triggers UPDATE
        }],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      expect(result.updated).toBe(1);

      const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const arcaDataUpdateCalls = queryCalls.filter(
        ([sql]: [string]) =>
          typeof sql === 'string' &&
          sql.includes('UPDATE agents.fresis_history') &&
          sql.includes('arca_data') &&
          sql.includes('target_total_with_vat') &&
          sql.includes('items'),
      );
      expect(arcaDataUpdateCalls).toHaveLength(1);
      // params: [$1=arca_data, $2=target_total_with_vat, $3=discount_percent, $4=items, $5=id, $6=userId]
      expect(arcaDataUpdateCalls[0][1][4]).toBe(existingId);
    },
    60000,
  );

  test(
    "FASE 3: skips arca_data update when invoice_number matches but sub_client_codice differs (different document)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const parsed = await parseNativeArcaFiles(
        doctesBuf, docrigBuf, null, TEST_USER_ID, new Map(), new Map(),
      );
      const arcaRecord = parsed.records[0]!;

      // Same invoice_number but different client → genuinely different documents
      const differentClientId = "different-client-existing-id";
      const pool = createMockPool({
        existingRecords: [{
          id: differentClientId,
          invoice_number: arcaRecord.invoice_number,
          source: 'app',
          sub_client_codice: 'C99999_DIFFERENT',  // different from arcaRecord.sub_client_codice
          arca_hash: null,
        }],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      // FASE 3 must NOT update this record; FASE 5 will handle renumbering
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);

      const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const arcaDataUpdateCalls = queryCalls.filter(
        ([sql]: [string]) =>
          typeof sql === 'string' &&
          sql.includes('UPDATE agents.fresis_history') &&
          sql.includes('arca_data') &&
          sql.includes('target_total_with_vat'),
      );
      expect(arcaDataUpdateCalls).toHaveLength(0);
    },
    60000,
  );

  test(
    "generates VBS script for PWA records not in Arca files",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const pwaArcaData = makeArcaData({
        testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "99999" },
      });

      const pool = createMockPool({
        pwaExportRows: [
          {
            id: "pwa-record-1",
            arca_data: JSON.stringify(pwaArcaData),
            invoice_number: "FT 99999/2026",
          },
        ],
      });

      const result = await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        null,
      );

      expect(result.exported).toBe(1);
      expect(result.ftExportRecords).toHaveLength(1);
      expect(result.ftExportRecords[0].invoiceNumber).toBe("FT 99999/2026");
    },
    60000,
  );

  test(
    "does not export PWA records already present in Arca files",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      // Parse to get a real document key from Arca
      const parsed = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        null,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );

      // Use the first record's arca_data as a PWA record that already exists in Arca
      const firstRecord = parsed.records[0];
      const pool = createMockPool({
        pwaExportRows: [
          {
            id: "pwa-existing",
            arca_data: firstRecord.arca_data!,
            invoice_number: firstRecord.invoice_number,
          },
        ],
      });

      const result = await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        null,
      );

      expect(result.exported).toBe(0);
      expect(result.ftExportRecords).toHaveLength(0);
    },
    60000,
  );

  test(
    "KT order without articles yet appears in ktMissingArticles (not silently ignored)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const orderId = "kt-order-no-articles";
      const pool = createMockPool({
        ktEligibleOrders: [
          {
            id: orderId,
            order_number: "ORD-2026-001",
            customer_name: "Cliente Test",
            customer_account_num: "profile-123",
            creation_date: "2026-03-13T08:00:00Z",
            discount_percent: null,
            order_description: null,
            articles_synced_at: null,  // articoli non ancora sincronizzati
          },
        ],
      });

      const result = await performArcaSync(
        pool,
        TEST_USER_ID,
        doctesBuf,
        docrigBuf,
        null,
      );

      expect(result.ktMissingArticles).toContain(orderId);
    },
    60000,
  );

  test(
    "restituisce ftExportRecords invece di vbsScript",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const pwaArcaData = makeArcaData({
        testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "99999" },
      });
      const pool = createMockPool({
        pwaExportRows: [{
          id: "pwa-record-1",
          arca_data: JSON.stringify(pwaArcaData),
          invoice_number: "FT 99999/2026",
        }],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      expect((result as any).vbsScript).toBeUndefined();
      expect(result.ftExportRecords).toHaveLength(1);
      expect(result.ftExportRecords[0].invoiceNumber).toBe("FT 99999/2026");
    },
    60000,
  );

  test(
    "FASE 4: soft-deletes a source=arca_import record absent from Arca DBF",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      // "FT 99998/2026" is an invoice number that does not exist in the real COOP16 DBF
      const absentInvoiceNumber = "FT 99998/2026";
      const pool = createMockPool({
        arcaImportRows: [
          {
            id: "arca-import-absent-1",
            invoice_number: absentInvoiceNumber,
            ddt_number: null,
            tracking_number: null,
            delivery_completed_date: null,
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      expect(result.softDeleted).toBe(1);
      expect(result.deletionWarnings).toHaveLength(0);
    },
    60000,
  );

  test(
    "FASE 4: emits deletionWarning when soft-deleted record has ddt_number set",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");

      const absentInvoiceNumber = "FT 99997/2026";
      const pool = createMockPool({
        arcaImportRows: [
          {
            id: "arca-import-absent-2",
            invoice_number: absentInvoiceNumber,
            ddt_number: "DDT-001",
            tracking_number: null,
            delivery_completed_date: null,
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, null);

      expect(result.softDeleted).toBe(1);
      expect(result.deletionWarnings).toEqual([
        {
          invoiceNumber: absentInvoiceNumber,
          hasTracking: false,
          hasDdt: true,
          hasDelivery: false,
        },
      ]);
    },
    60000,
  );

  test(
    "FASE 5: renumbers a source=app record whose invoice_number conflicts with an Arca doc (different client)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const parsed = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );
      const [conflictKey] = [...parsed.arcaDocKeys];
      const [esercizio, tipodoc, numerodoc] = conflictKey.split("|");
      const conflictingInvoiceNumber = `${tipodoc} ${numerodoc}/${esercizio}`;

      const pwaArcaData = makeArcaData({
        testata: { ESERCIZIO: esercizio, TIPODOC: tipodoc as "FT" | "KT", NUMERODOC: numerodoc },
        righe: [{ NUMERODOC: numerodoc }],
      });

      const pool = createMockPool({
        pwaSourceRows: [
          {
            id: "pwa-source-conflict-1",
            invoice_number: conflictingInvoiceNumber,
            arca_data: JSON.stringify(pwaArcaData),
            sub_client_codice: "DIFFERENT_CLIENT",  // different from Arca → genuine conflict
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      expect(result.renumbered).toBe(1);
    },
    60000,
  );

  test(
    "FASE 5: skips renumbering when source=app record has the same client as the Arca doc (same document submitted by bot)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      const parsed = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );
      const [conflictKey] = [...parsed.arcaDocKeys];
      const [esercizio, tipodoc, numerodoc] = conflictKey.split("|");
      const conflictingInvoiceNumber = `${tipodoc} ${numerodoc}/${esercizio}`;

      // Use the same codicecf as the Arca document to simulate a legitimate match
      const arcaClientCode = parsed.arcaClientMap.get(conflictKey) ?? "SAME_CLIENT";

      const pwaArcaData = makeArcaData({
        testata: { ESERCIZIO: esercizio, TIPODOC: tipodoc as "FT" | "KT", NUMERODOC: numerodoc },
        righe: [{ NUMERODOC: numerodoc }],
      });

      const pool = createMockPool({
        pwaSourceRows: [
          {
            id: "pwa-source-same-client-1",
            invoice_number: conflictingInvoiceNumber,
            arca_data: JSON.stringify(pwaArcaData),
            sub_client_codice: arcaClientCode,  // same client → same document, skip
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      expect(result.renumbered).toBe(0);
    },
    60000,
  );

  test(
    "FASE 8: renumbers FT export record whose NUMERODOC conflicts with an existing KT (cross-type NUMERO_P conflict)",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      // KT 326/2026 is confirmed to exist in the real Mac Arca snapshot.
      // PWA wants to export FT 326/2026 — same NUMERODOC, different TIPODOC → NUMERO_P conflict.
      const conflictNumerodoc = "326";
      const esercizio = "2026";
      const pwaArcaData = makeArcaData({
        testata: { ESERCIZIO: esercizio, TIPODOC: "FT", NUMERODOC: conflictNumerodoc },
        righe: [{ NUMERODOC: conflictNumerodoc }],
      });

      const pool = createMockPool({
        pwaExportRows: [
          {
            id: "pwa-ft-326-conflict",
            invoice_number: `FT ${conflictNumerodoc}/${esercizio}`,
            arca_data: JSON.stringify(pwaArcaData),
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      // FT 326 must be renumbered: KT 326 already occupies the same NUMERO_P slot
      expect(result.renumbered).toBe(1);
      expect(result.ftExportRecords).toHaveLength(1);
      expect(result.ftExportRecords[0].invoiceNumber).not.toBe(`FT ${conflictNumerodoc}/${esercizio}`);
      expect(result.ftExportRecords[0].invoiceNumber).toMatch(/^FT \d+\/2026$/);
    },
    60000,
  );
});

describe('splitArticlesByWarehouse', () => {
  // ART1: fully non-warehouse (qty=10, wh=0)  -> KT qty=10, no FT
  // ART2: fully warehouse   (qty=5,  wh=5)   -> no KT, FT qty=5
  // ART3: partial           (qty=10, wh=3)   -> KT qty=7, FT qty=3
  const articles = [
    { articleCode: 'ART1', quantity: 10, warehouseQuantity: 0,  unitPrice: 5, discountPercent: 0, vatPercent: 22, lineAmount: 50,  articleDescription: 'A', unit: 'PZ' },
    { articleCode: 'ART2', quantity:  5, warehouseQuantity: 5,  unitPrice: 3, discountPercent: 0, vatPercent: 22, lineAmount: 15,  articleDescription: 'B', unit: 'PZ' },
    { articleCode: 'ART3', quantity: 10, warehouseQuantity: 3,  unitPrice: 2, discountPercent: 0, vatPercent: 22, lineAmount: 14,  articleDescription: 'C', unit: 'PZ' },
  ];

  test('non-warehouse contains ART1 (full qty) and ART3 (reduced qty)', () => {
    const { nonWarehouse } = splitArticlesByWarehouse(articles);
    expect(nonWarehouse).toEqual([
      expect.objectContaining({ articleCode: 'ART1', quantity: 10 }),
      expect.objectContaining({ articleCode: 'ART3', quantity: 7 }),
    ]);
  });

  test('warehouse contains ART2 (full qty) and ART3 (warehouse qty)', () => {
    const { warehouse } = splitArticlesByWarehouse(articles);
    expect(warehouse).toEqual([
      expect.objectContaining({ articleCode: 'ART2', quantity: 5 }),
      expect.objectContaining({ articleCode: 'ART3', quantity: 3 }),
    ]);
  });

  test('null warehouseQuantity treated as 0', () => {
    const { nonWarehouse, warehouse } = splitArticlesByWarehouse([
      { articleCode: 'X', quantity: 4, warehouseQuantity: null },
    ]);
    expect(nonWarehouse).toEqual([expect.objectContaining({ articleCode: 'X', quantity: 4 })]);
    expect(warehouse).toHaveLength(0);
  });
});

(COOP16_EXISTS ? describe : describe.skip)("generateKtExportVbs", () => {
  test(
    "combina ftExportRecords e KT in un VBS unico",
    async () => {
      const ftRecord = makeArcaData({
        testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "99999" },
      });
      const ftExportRecords: VbsExportRecord[] = [
        { invoiceNumber: "FT 99999/2026", arcaData: ftRecord },
      ];

      const pool = createMockPool({
        ktEligibleOrders: [
          {
            id: "kt-order-ready",
            order_number: "ORD-001",
            customer_name: "Cliente KT",
            customer_account_num: "profile-kt",
            creation_date: "2026-03-13T08:00:00Z",
            discount_percent: null,
            order_description: null,
            articles_synced_at: "2026-03-13T09:00:00Z",
          },
        ],
      });

      const result = await generateKtExportVbs(pool, "test-user", ftExportRecords);

      expect(result.vbsScript).not.toBeNull();
      expect(result.vbsScript!.vbs).toContain("FT 99999/2026");
      expect(result.ktExported).toBe(0); // nessun subclient matchato in questo mock
    },
    60000,
  );

  test(
    "genera VBS solo con FT se non ci sono KT idonee",
    async () => {
      const ftRecord = makeArcaData({
        testata: { ESERCIZIO: "2026", TIPODOC: "FT", NUMERODOC: "88888" },
      });
      const ftExportRecords: VbsExportRecord[] = [
        { invoiceNumber: "FT 88888/2026", arcaData: ftRecord },
      ];
      const pool = createMockPool(); // nessun kt eligible

      const result = await generateKtExportVbs(pool, "test-user", ftExportRecords);

      expect(result.vbsScript).not.toBeNull();
      expect(result.vbsScript!.vbs).toContain("FT 88888/2026");
      expect(result.ktExported).toBe(0);
    },
    60000,
  );

  test(
    "restituisce vbsScript null se non ci sono né FT né KT",
    async () => {
      const pool = createMockPool();
      const result = await generateKtExportVbs(pool, "test-user", []);
      expect(result.vbsScript).toBeNull();
      expect(result.ktExported).toBe(0);
    },
    60000,
  );

  // --- Shared fixture for Gap 1-4 tests ---
  const GAP_USER = "test-user";
  const GAP_ORDER_ID = "order-wh-gap-001";
  const GAP_PROFILE_ID = "profile-wh-gap-001";
  const GAP_CODICE = "C00WH";
  const GAP_ESERCIZIO = "2026";

  const gapKtOrder = {
    id: GAP_ORDER_ID,
    order_number: "ORD-WH-GAP-001",
    customer_name: "Cliente WH Gap",
    customer_account_num: GAP_PROFILE_ID,
    creation_date: `${GAP_ESERCIZIO}-03-01T00:00:00Z`,
    discount_percent: null,
    order_description: null,
    articles_synced_at: `${GAP_ESERCIZIO}-03-01T01:00:00Z`,
  };

  const gapSubclientRow = {
    codice: GAP_CODICE,
    ragione_sociale: "Sub WH Gap",
    suppl_ragione_sociale: null,
    indirizzo: null, cap: null, localita: null, prov: null,
    telefono: null, fax: null, email: null,
    partita_iva: null, cod_fiscale: null, zona: null,
    pers_da_contattare: null, email_amministraz: null,
    agente: null, agente2: null, settore: null, classe: null,
    pag: null, listino: null, banca: null, valuta: null,
    cod_nazione: null, aliiva: null, contoscar: null, tipofatt: null,
    telefono2: null, telefono3: null, url: null,
    cb_nazione: null, cb_bic: null, cb_cin_ue: null, cb_cin_it: null,
    abicab: null, contocorr: null,
    matched_customer_profile_id: GAP_PROFILE_ID,
    match_confidence: null,
    arca_synced_at: null,
  };

  // All-warehouse article: quantity=5, warehouse_quantity=5 → no KT line, only FT companion
  const gapWhArticleRow = {
    id: 1,
    order_id: GAP_ORDER_ID,
    user_id: GAP_USER,
    article_code: "WH001",
    article_description: "Articolo magazzino",
    quantity: 5,
    unit_price: 10,
    discount_percent: 0,
    line_amount: 50,
    vat_percent: 22,
    vat_amount: 11,
    line_total_with_vat: 61,
    warehouse_quantity: 5,
    warehouse_sources_json: null,
    created_at: "2026-03-01",
  };

  test(
    "Gap 1: FT companion items contengono gli articoli da magazzino con dati corretti",
    async () => {
      const pool = createMockPool({
        ktEligibleOrders: [gapKtOrder],
        subclientRows: [gapSubclientRow],
        orderArticlesRows: [gapWhArticleRow],
      });

      await generateKtExportVbs(pool, GAP_USER, []);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const ftCompanionInsert = calls.find(
        ([sql]: [string]) =>
          sql.includes("INSERT INTO agents.fresis_history") &&
          sql.includes("ON CONFLICT (id) DO NOTHING"),
      );
      expect(ftCompanionInsert).toBeDefined();

      // $10 = items JSON
      const itemsJson = ftCompanionInsert![1][9] as string; // 0-indexed: param index 9 = $10
      const items = JSON.parse(itemsJson);
      expect(items).toHaveLength(1);
      expect(items[0].articleCode).toBe("WH001");
      expect(items[0].quantity).toBe(5);
      expect(items[0].unitPrice).toBe(10);
    },
    60000,
  );

  test(
    "Gap 2: warehouseOnlyExported conta ordini dove tutti gli articoli sono da magazzino",
    async () => {
      const pool = createMockPool({
        ktEligibleOrders: [gapKtOrder],
        subclientRows: [gapSubclientRow],
        orderArticlesRows: [gapWhArticleRow],
      });

      const result = await generateKtExportVbs(pool, GAP_USER, []);

      expect(result.ktExported).toBe(0);
      expect(result.warehouseOnlyExported).toBe(1);
    },
    60000,
  );

  test(
    "Gap 3: FT companion ID è deterministico basato su order.id (idempotente, non dipende da ftNum)",
    async () => {
      const pool = createMockPool({
        ktEligibleOrders: [gapKtOrder],
        subclientRows: [gapSubclientRow],
        orderArticlesRows: [gapWhArticleRow],
      });

      await generateKtExportVbs(pool, GAP_USER, []);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const ftCompanionInsert = calls.find(
        ([sql]: [string]) =>
          sql.includes("INSERT INTO agents.fresis_history") &&
          sql.includes("ON CONFLICT (id) DO NOTHING"),
      );
      expect(ftCompanionInsert).toBeDefined();

      // $1 = companion ID
      const actualId = ftCompanionInsert![1][0] as string;
      const expectedId = deterministicId(GAP_USER, GAP_ESERCIZIO, "FT_COMPANION", GAP_ORDER_ID, GAP_CODICE);
      expect(actualId).toBe(expectedId);
    },
    60000,
  );

  test(
    "Gap 4: UPDATE arca_kt_synced_at include AND arca_kt_synced_at IS NULL per prevenire race condition",
    async () => {
      const pool = createMockPool({
        ktEligibleOrders: [gapKtOrder],
        subclientRows: [gapSubclientRow],
        orderArticlesRows: [gapWhArticleRow],
      });

      await generateKtExportVbs(pool, GAP_USER, []);

      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = calls.find(
        ([sql]: [string]) =>
          sql.includes("UPDATE agents.order_records") &&
          sql.includes("arca_kt_synced_at = NOW()"),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain("AND arca_kt_synced_at IS NULL");
    },
    60000,
  );
});

function makeMinimalSubclientRow(overrides: { matched_customer_profile_id?: string | null } = {}) {
  return {
    codice: "C00001",
    ragione_sociale: "Test Subclient",
    suppl_ragione_sociale: null,
    indirizzo: null,
    cap: null,
    localita: null,
    prov: null,
    telefono: null,
    fax: null,
    email: null,
    partita_iva: null,
    cod_fiscale: null,
    zona: null,
    pers_da_contattare: null,
    email_amministraz: null,
    agente: null,
    agente2: null,
    settore: null,
    classe: null,
    pag: null,
    listino: null,
    banca: null,
    valuta: null,
    cod_nazione: null,
    aliiva: null,
    contoscar: null,
    tipofatt: null,
    telefono2: null,
    telefono3: null,
    url: null,
    cb_nazione: null,
    cb_bic: null,
    cb_cin_ue: null,
    cb_cin_it: null,
    abicab: null,
    contocorr: null,
    matched_customer_profile_id: null,
    match_confidence: null,
    arca_synced_at: null,
    customer_match_count: 0,
    sub_client_match_count: 0,
    ...overrides,
  };
}

describe("getKtSyncStatus", () => {
  test("unmatched orders do not contribute to articlesPending or articlesReady", async () => {
    const unmatchedProfileId = "C99999";
    const matchedProfileId = "C00001";

    const ktEligibleOrders = [
      // matched, articles ready
      {
        id: "o1",
        order_number: "KT 1/2026",
        customer_name: "Alfa",
        customer_account_num: matchedProfileId,
        creation_date: "2026-01-01",
        discount_percent: null,
        order_description: null,
        articles_synced_at: "2026-01-02T00:00:00Z",
      },
      // matched, articles pending
      {
        id: "o2",
        order_number: "KT 2/2026",
        customer_name: "Alfa",
        customer_account_num: matchedProfileId,
        creation_date: "2026-01-01",
        discount_percent: null,
        order_description: null,
        articles_synced_at: null,
      },
      // unmatched, articles also null — must NOT count in pending
      {
        id: "o3",
        order_number: "KT 3/2026",
        customer_name: "Beta",
        customer_account_num: unmatchedProfileId,
        creation_date: "2026-01-01",
        discount_percent: null,
        order_description: null,
        articles_synced_at: null,
      },
    ];

    const subclientRows = [
      makeMinimalSubclientRow({ matched_customer_profile_id: matchedProfileId }),
    ];

    const pool = createMockPool({ ktEligibleOrders, subclientRows });

    const status = await getKtSyncStatus(pool, "user-1");

    expect(status).toEqual({
      total: 3,
      articlesReady: 1,
      articlesPending: 1,
      matched: 2,
      readyToExport: 1,
      unmatched: [{ orderId: "o3", customerName: "Beta", customerAccountNum: unmatchedProfileId }],
    });
  });
});

describe("suggestNextCodice", () => {
  test("returns C00001 when no C codes exist", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: null }] }),
    } as unknown as DbPool;

    const result = await suggestNextCodice(pool);

    expect(result).toBe("C00001");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM shared.sub_clients WHERE codice ~"),
    );
  });

  test("increments the max code by 1", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: "C00041" }] }),
    } as unknown as DbPool;

    const result = await suggestNextCodice(pool);

    expect(result).toBe("C00042");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM shared.sub_clients WHERE codice ~"),
    );
  });

  test("throws when C99999 is the max (overflow)", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ max_codice: "C99999" }] }),
    } as unknown as DbPool;

    await expect(suggestNextCodice(pool)).rejects.toThrow("Codici C esauriti");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM shared.sub_clients WHERE codice ~"),
    );
  });
});

describe("importCustomerAsSubclient", () => {
  const baseCustomer = {
    erp_id: "C01273",
    user_id: "user-1",
    name: "LAB. ODONTOIATRICO ROSSI SRL",
    vat_number: "12345678901",
    fiscal_code: null,
    phone: "0812345678",
    mobile: null,
    email: "rossi@lab.it",
    pec: null,
    url: null,
    street: "VIA ROMA, 15",
    postal_code: "80100",
    city: "NAPOLI",
    attention_to: null,
  };

  test("inserts subclient with correct field mapping and cod_nazione = 'I'", async () => {
    const insertedParams: unknown[][] = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("erp_id") && sql.includes("agents.customers")) {
          return Promise.resolve({ rows: [baseCustomer] });
        }
        if (sql.includes("INSERT INTO shared.sub_clients")) {
          insertedParams.push(params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await importCustomerAsSubclient(pool, "user-1", "C01273", "C00042");

    expect(insertedParams[0]).toEqual([
      "C00042",                          // codice
      "LAB. ODONTOIATRICO ROSSI SRL",   // ragione_sociale
      "12345678901",                     // partita_iva (vat_number)
      null,                              // cod_fiscale (fiscal_code)
      "0812345678",                      // telefono (phone)
      null,                              // telefono2 (mobile)
      "rossi@lab.it",                    // email
      null,                              // email_amministraz (pec)
      null,                              // url
      "VIA ROMA, 15",                    // indirizzo (street)
      "80100",                           // cap (postal_code)
      "NAPOLI",                          // localita (city)
      null,                              // pers_da_contattare (attention_to)
      "I",                               // cod_nazione
      "I",                               // cb_nazione
      "C01273",                          // matched_customer_profile_id
    ]);
  });

  test("throws 'Codice già in uso' when INSERT hits conflict", async () => {
    const conflict = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const pool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("agents.customers")) return Promise.resolve({ rows: [baseCustomer] });
        if (sql.includes("INSERT")) return Promise.reject(conflict);
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C00042"))
      .rejects.toThrow("Codice già in uso");
  });

  test("throws 'Cliente non trovato' when customer profile does not exist", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }), // empty = not found
    } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C00042"))
      .rejects.toThrow("Cliente non trovato");
  });

  test("throws on invalid codice format", async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;

    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "P00001"))
      .rejects.toThrow("Formato codice non valido");
    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "CTEST1"))
      .rejects.toThrow("Formato codice non valido");
    await expect(importCustomerAsSubclient(pool, "user-1", "C01273", "C1234"))
      .rejects.toThrow("Formato codice non valido");
  });

  test("truncates name to 40 characters for DESCRIZION", async () => {
    const longNameCustomer = { ...baseCustomer, name: "A".repeat(50) };
    const insertedParams: unknown[][] = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("agents.customers")) return Promise.resolve({ rows: [longNameCustomer] });
        if (sql.includes("INSERT")) { insertedParams.push(params); return Promise.resolve({ rows: [] }); }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as DbPool;

    await importCustomerAsSubclient(pool, "user-1", "C01273", "C00042");

    const name = (insertedParams[0] as string[]).find(p => typeof p === "string" && p.length === 40);
    expect(name).toBe("A".repeat(40));
  });
});
