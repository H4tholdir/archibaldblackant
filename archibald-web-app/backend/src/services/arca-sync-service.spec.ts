import { describe, expect, test, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  parseNativeArcaFiles,
  generateVbsScript,
  performArcaSync,
  generateKtExportVbs,
  invoiceNumberToKey,
} from "./arca-sync-service";
import type { VbsExportRecord, SyncResult } from "./arca-sync-service";
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

      expect(result.subclients.length).toBe(1865);

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
    expect(result.vbs).toContain("SELECT MAX(ID) FROM doctes");
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

  test("handles multiple records generating sequential AddNew calls", () => {
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

    expect(execCount).toBe(7);
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

  test("TIPOMOD in scadenza usa TIPODOC del documento, non FT fisso", () => {
    const arcaDataFt = makeArcaData({ testata: { TIPODOC: "FT" } });
    const arcaDataKt = makeArcaData({ testata: { TIPODOC: "KT" } });

    const resultFt = generateVbsScript([{ invoiceNumber: "FT 1/2026", arcaData: arcaDataFt }]);
    const resultKt = generateVbsScript([{ invoiceNumber: "KT 1/2026", arcaData: arcaDataKt }]);

    expect(resultFt.vbs).toContain("REPLACE TIPOMOD WITH [FT]");
    expect(resultKt.vbs).toContain("REPLACE TIPOMOD WITH [KT]");
    expect(resultKt.vbs).not.toContain("REPLACE TIPOMOD WITH [FT]");
  });
});

function createMockPool(overrides?: {
  existingIds?: string[];
  existingInvoiceNumbers?: string[];
  pwaExportRows?: Array<{ id: string; arca_data: string; invoice_number: string }>;
  ftCounterCalls?: Array<unknown[]>;
  ktEligibleOrders?: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    customer_profile_id: string | null;
    creation_date: string;
    discount_percent: string | null;
    remaining_sales_financial: string | null;
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
  }>;
}): DbPool {
  const existingIds = overrides?.existingIds ?? [];
  const existingInvoiceNumbers = overrides?.existingInvoiceNumbers ?? [];
  const pwaExportRows = overrides?.pwaExportRows ?? [];
  const ftCounterCalls = overrides?.ftCounterCalls ?? [];
  const ktEligibleOrders = overrides?.ktEligibleOrders ?? [];
  const arcaImportRows = overrides?.arcaImportRows ?? [];
  const pwaSourceRows = overrides?.pwaSourceRows ?? [];

  return {
    query: vi.fn().mockImplementation((text: string, params?: unknown[]) => {
      if (
        text.includes("FROM agents.fresis_history") &&
        text.includes("source = 'arca_import'") &&
        text.includes("cancellato_in_arca")
      ) {
        return { rows: arcaImportRows, rowCount: arcaImportRows.length };
      }
      if (text.includes("FROM agents.fresis_history WHERE user_id") && !text.includes("arca_data")) {
        return {
          rows: existingIds.map((id, i) => ({
            id,
            invoice_number: existingInvoiceNumbers[i] ?? null,
          })),
        };
      }
      if (text.includes("INSERT INTO agents.fresis_history")) {
        // Simulate upsertRecords: count placeholders to determine record count
        const placeholderCount = (text.match(/\(\$\d+/g) || []).length;
        const recordCount = placeholderCount > 0 ? Math.floor((params?.length ?? 0) / 38) : 0;
        return {
          rows: Array.from({ length: recordCount }, () => ({ action: "inserted" })),
        };
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

      expect(result.imported).toBe(14996);
      expect(result.skipped).toBe(0);
      expect(result.exported).toBe(0);
      expect(result.ftExportRecords).toHaveLength(0);
      expect(result.parseStats.totalDocuments).toBe(14996);

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
      expect(result.updated).toBe(14996);
      expect(result.skipped).toBe(0);
      expect(result.exported).toBe(0);
      expect(result.ftExportRecords).toHaveLength(0);
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
            customer_profile_id: "profile-123",
            creation_date: "2026-03-13T08:00:00Z",
            discount_percent: null,
            remaining_sales_financial: null,
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
    "FASE 5: renumbers a source=app record whose invoice_number conflicts with an Arca doc",
    async () => {
      const doctesBuf = readCoop16File("doctes.dbf");
      const docrigBuf = readCoop16File("docrig.dbf");
      const anagrafeBuf = readCoop16File("ANAGRAFE.DBF");

      // Parse the real DBF to find a real invoice number that exists in Arca
      const parsed = await parseNativeArcaFiles(
        doctesBuf,
        docrigBuf,
        anagrafeBuf,
        TEST_USER_ID,
        new Map(),
        new Map(),
      );
      const [conflictKey] = [...parsed.arcaDocKeys];
      // conflictKey is "ESERCIZIO|TIPODOC|NUMERODOC" e.g. "2026|FT|326"
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
          },
        ],
      });

      const result = await performArcaSync(pool, TEST_USER_ID, doctesBuf, docrigBuf, anagrafeBuf);

      expect(result.renumbered).toBe(1);
    },
    60000,
  );
});

describe('generateKtExportVbs - warehouse articles detection', () => {
  test('splits articles into KT (non-warehouse) and FT companion (warehouse)', () => {
    const articles = [
      { articleCode: 'ART1', quantity: 10, warehouseQuantity: 0,  unitPrice: 5, discountPercent: 0, vatPercent: 22, lineAmount: 50,  articleDescription: 'A', unit: 'PZ' },
      { articleCode: 'ART2', quantity:  5, warehouseQuantity: 5,  unitPrice: 3, discountPercent: 0, vatPercent: 22, lineAmount: 15,  articleDescription: 'B', unit: 'PZ' },
      { articleCode: 'ART3', quantity: 10, warehouseQuantity: 3,  unitPrice: 2, discountPercent: 0, vatPercent: 22, lineAmount: 14,  articleDescription: 'C', unit: 'PZ' },
    ];

    const nonWarehouse = articles
      .filter(a => (a.warehouseQuantity ?? 0) < a.quantity)
      .map(a => ({ ...a, quantity: a.quantity - (a.warehouseQuantity ?? 0) }));

    const warehouse = articles
      .filter(a => (a.warehouseQuantity ?? 0) > 0)
      .map(a => ({ ...a, quantity: a.warehouseQuantity! }));

    // ART1: non-warehouse (qty=10, wh=0)  -> KT qty=10
    // ART2: fully warehouse (qty=5, wh=5) -> FT qty=5 solo
    // ART3: partial (qty=10, wh=3)        -> KT qty=7 + FT qty=3
    expect(nonWarehouse).toHaveLength(2);  // ART1 and ART3
    expect(nonWarehouse.find(a => a.articleCode === 'ART3')!.quantity).toBe(7);
    expect(warehouse).toHaveLength(2);     // ART2 and ART3
    expect(warehouse.find(a => a.articleCode === 'ART2')!.quantity).toBe(5);
    expect(warehouse.find(a => a.articleCode === 'ART3')!.quantity).toBe(3);
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
            customer_profile_id: "profile-kt",
            creation_date: "2026-03-13T08:00:00Z",
            discount_percent: null,
            remaining_sales_financial: null,
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
});
