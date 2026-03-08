import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseNativeArcaFiles,
  generateVbsScript,
} from "./arca-sync-service";
import type { VbsExportRecord } from "./arca-sync-service";
import { deterministicId } from "../arca-import-service";
import type { ArcaData } from "../arca-data-types";

const COOP16_DIR = "/Users/hatholdir/Downloads/ArcaPro/Ditte/COOP16";
const TEST_USER_ID = "test-user-native";

function readCoop16File(filename: string): Buffer {
  return fs.readFileSync(path.join(COOP16_DIR, filename));
}

describe("parseNativeArcaFiles", () => {
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

      // 14992 FT + 4 KT = 14996
      expect(result.stats.totalDocuments).toBe(14996);
      // totalRows = rows read from docrig (VFP9 may skip deleted records)
      expect(result.stats.totalRows).toBeGreaterThan(50000);
      // ANAGRAFE has 1899 records but some lack CODICE or DESCRIZION
      expect(result.stats.totalClients).toBe(1865);
      expect(result.records).toHaveLength(14996);
      // dbffile skips VFP9 deleted records; 15019 active - 14996 FT/KT = 23 other types
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

      expect(ktRecords.length).toBe(4);
      expect(ftRecords.length).toBe(14992);

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
    CODCNT: "",
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
    expect(result.vbs).toContain("INSERT INTO doctes");
    expect(result.vbs).toContain("INSERT INTO docrig");
    expect(result.vbs).toContain("WScript.ScriptFullName");
    expect(result.vbs).toContain("ESERCIZIO");
    expect(result.vbs).toContain("ID_TESTA");
    expect(result.vbs).toContain("SELECT MAX(ID) FROM doctes");
  });

  test("escapes single quotes in string values", () => {
    const arcaData = makeArcaData({
      testata: { NOTE: "L'ordine dell'azienda" },
      righe: [{ DESCRIZION: "Tubo d'acciaio" }],
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("L''ordine dell''azienda");
    expect(result.vbs).toContain("Tubo d''acciaio");
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

  test("uses date literal format for DATADOC", () => {
    const arcaData = makeArcaData({
      testata: { DATADOC: "2026-01-15" },
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("{d '2026-01-15'}");
  });

  test("handles multiple records generating sequential inserts", () => {
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

    const doctesInsertCount = (
      result.vbs.match(/INSERT INTO doctes/g) || []
    ).length;
    const docrigInsertCount = (
      result.vbs.match(/INSERT INTO docrig/g) || []
    ).length;

    expect(doctesInsertCount).toBe(2);
    expect(docrigInsertCount).toBe(3);
  });

  test("pads NUMERODOC to 6 chars right-aligned", () => {
    const arcaData = makeArcaData({
      testata: { NUMERODOC: "     1" },
    });
    const records: VbsExportRecord[] = [
      { invoiceNumber: "FT 1/2026", arcaData },
    ];

    const result = generateVbsScript(records);

    expect(result.vbs).toContain("'     1'");
  });
});
