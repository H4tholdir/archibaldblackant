import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import { parseNativeArcaFiles } from "./arca-sync-service";
import { deterministicId } from "../arca-import-service";

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
