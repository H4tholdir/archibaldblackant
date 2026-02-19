import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  createTestataFields,
  createRigheFields,
  createClientiFields,
  createDestinazioniFields,
  isoToDate,
  testaToDbfRecord,
  rigaToDbfRecord,
  clientToDbfRecord,
  destToDbfRecord,
  parseArcaDataJson,
} from "./arca-export-service";
import type { ArcaTestata, ArcaRiga, ArcaDestinazione } from "./arca-data-types";

function makeTestata(overrides: Partial<ArcaTestata> = {}): ArcaTestata {
  return {
    ID: 1, ESERCIZIO: "2025", ESANNO: "2025", TIPODOC: "FT",
    NUMERODOC: "42", DATADOC: "2025-03-15T00:00:00.000Z", CODICECF: "C00001",
    CODCNT: "001", MAGPARTENZ: "00001", MAGARRIVO: "00001", NUMRIGHEPR: 2,
    AGENTE: "", AGENTE2: "", VALUTA: "EUR", PAG: "0001",
    SCONTI: "50", SCONTIF: 0.5, SCONTOCASS: "", SCONTOCASF: 1,
    PROVV: "", PROVV2: "", CAMBIO: 1, DATADOCFOR: null,
    NUMERODOCF: "", TIPOMODULO: "", LISTINO: "1", ZONA: "1",
    SETTORE: "", DESTDIV: "", DATACONSEG: null, TRDATA: null,
    TRORA: "", PESOLORDO: 0, PESONETTO: 0, VOLUME: 0,
    VETTORE1: "", V1DATA: null, V1ORA: "", VETTORE2: "",
    V2DATA: null, V2ORA: "", TRCAUSALE: "", COLLI: "",
    SPEDIZIONE: "", PORTO: "", NOTE: "", SPESETR: 10.5,
    SPESETRIVA: "22", SPESETRCP: "19", SPESETRPER: "",
    SPESEIM: 0, SPESEIMIVA: "22", SPESEIMCP: "29",
    SPESEVA: 0, SPESEVAIVA: "22", SPESEVACP: "29",
    ACCONTO: 0, ABBUONO: 0, TOTIMP: 100, TOTDOC: 122,
    SPESE: "", SPESEBOLLI: 0, SPESEINCAS: 0, SPESEINEFF: 0,
    SPESEINDOC: 0, SPESEINIVA: "", SPESEINCP: "",
    SPESEESENZ: 0, CODCAUMAG: "99", CODBANCA: "1",
    PERCPROVV: 0, IMPPROVV: 0, TOTPROVV: 0,
    PERCPROVV2: 0, IMPPROVV2: 0, TOTPROVV2: 0,
    TOTIVA: 22, ASPBENI: "", SCORPORO: false,
    TOTMERCE: 200, TOTSCONTO: 100, TOTNETTO: 100, TOTESEN: 0,
    IMPCOND: 0, RITCOND: 0, TIPOFATT: "", TRIANGOLAZ: false,
    NOMODIFICA: false, NOEVASIONE: false, COMMESSA: "",
    EUROCAMBIO: 1, EXPORT_I: false, CB_BIC: "", CB_NAZIONE: "IT",
    CB_CIN_UE: "", CB_CIN_IT: "", ABICAB: "", CONTOCORR: "",
    CARICATORE: "", COMMITTENT: "", PROPRMERCE: "",
    LUOGOCAR: "", LUOGOSCAR: "", SDTALTRO: "",
    TIMESTAMP: null, USERNAME: "TEST",
    ...overrides,
  };
}

function makeRiga(overrides: Partial<ArcaRiga> = {}): ArcaRiga {
  return {
    ID: 1, ID_TESTA: 1, ESERCIZIO: "2025", TIPODOC: "FT",
    NUMERODOC: "42", DATADOC: "2025-03-15T00:00:00.000Z", CODICECF: "C00001",
    MAGPARTENZ: "00001", MAGARRIVO: "00001", AGENTE: "", AGENTE2: "",
    VALUTA: "EUR", CAMBIO: 1, CODICEARTI: "847.104.033",
    NUMERORIGA: 1, ESPLDISTIN: "", UNMISURA: "PZ",
    QUANTITA: 5, QUANTITARE: 0, SCONTI: "50",
    PREZZOUN: 10, PREZZOTOT: 25, ALIIVA: "22",
    CONTOSCARI: "01", OMIVA: false, OMMERCE: false,
    PROVV: "", PROVV2: "", DATACONSEG: null,
    DESCRIZION: "FRESA CT", TIPORIGAD: "",
    RESTOSCORP: 0, RESTOSCUNI: 0, CODCAUMAG: "99",
    ZONA: "", SETTORE: "", GRUPPO: "00001", CLASSE: "",
    RIFFROMT: 0, RIFFROMR: 0, PREZZOTOTM: 25,
    NOTE: "", COMMESSA: "", TIMESTAMP: null, USERNAME: "TEST",
    FATT: 1, LOTTO: "", MATRICOLA: "", EUROCAMBIO: 1,
    U_PESON: 0, U_PESOL: 0, U_COLLI: 0, U_GIA: 0,
    U_MAGP: "", U_MAGA: "",
    ...overrides,
  };
}

describe("isoToDate", () => {
  test("converts ISO string to Date object", () => {
    const result = isoToDate("2025-03-15T00:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(2);
    expect(result!.getDate()).toBe(15);
  });

  test("returns null for null input", () => {
    expect(isoToDate(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(isoToDate("")).toBeNull();
  });

  test("returns null for invalid date string", () => {
    expect(isoToDate("not-a-date")).toBeNull();
  });

  test("round-trips any valid ISO date", () => {
    fc.assert(
      fc.property(
        fc.date().filter((d) => !isNaN(d.getTime())),
        (date) => {
          const iso = date.toISOString();
          const result = isoToDate(iso);
          expect(result).toBeInstanceOf(Date);
          expect(result!.getTime()).toBe(date.getTime());
        },
      ),
    );
  });
});

describe("createTestataFields", () => {
  const fields = createTestataFields();

  test("returns field descriptors with required properties", () => {
    for (const field of fields) {
      expect(field).toHaveProperty("name");
      expect(field).toHaveProperty("type");
      expect(field).toHaveProperty("size");
      expect(typeof field.name).toBe("string");
      expect(field.name.length).toBeLessThanOrEqual(10);
      expect(typeof field.size).toBe("number");
    }
  });

  test("field names are unique", () => {
    const names = fields.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("includes all critical DT fields", () => {
    const names = new Set(fields.map((f) => f.name));
    const critical = [
      "ID", "ESERCIZIO", "TIPODOC", "NUMERODOC", "DATADOC",
      "CODICECF", "TOTDOC", "TOTMERCE", "TOTIVA", "SCONTIF",
      "SPESETR", "NOTE",
    ];
    for (const name of critical) {
      expect(names.has(name)).toBe(true);
    }
  });

  test("NOTE field uses C type instead of M (memo not writable)", () => {
    const noteField = fields.find((f) => f.name === "NOTE");
    expect(noteField!.type).toBe("C");
    expect(noteField!.size).toBe(254);
  });

  test("date fields use D type with size 8", () => {
    const dateFields = fields.filter((f) => f.type === "D");
    for (const field of dateFields) {
      expect(field.size).toBe(8);
    }
  });

  test("logical fields use L type with size 1", () => {
    const logicalFields = fields.filter((f) => f.type === "L");
    for (const field of logicalFields) {
      expect(field.size).toBe(1);
    }
  });
});

describe("createRigheFields", () => {
  const fields = createRigheFields();

  test("field names are unique and within 10 chars", () => {
    const names = fields.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(10);
    }
  });

  test("includes ID_TESTA for FK relationship", () => {
    const idTestaField = fields.find((f) => f.name === "ID_TESTA");
    expect(idTestaField).toBeDefined();
    expect(idTestaField!.type).toBe("N");
  });

  test("includes core riga fields", () => {
    const names = new Set(fields.map((f) => f.name));
    const core = [
      "CODICEARTI", "DESCRIZION", "QUANTITA", "PREZZOUN",
      "PREZZOTOT", "ALIIVA", "SCONTI", "UNMISURA",
    ];
    for (const name of core) {
      expect(names.has(name)).toBe(true);
    }
  });
});

describe("createClientiFields", () => {
  const fields = createClientiFields();

  test("includes CODICE as first field", () => {
    expect(fields[0].name).toBe("CODICE");
    expect(fields[0].type).toBe("C");
    expect(fields[0].size).toBe(6);
  });
});

describe("createDestinazioniFields", () => {
  const fields = createDestinazioniFields();

  test("includes CODICECF and CODICEDES", () => {
    const names = new Set(fields.map((f) => f.name));
    expect(names.has("CODICECF")).toBe(true);
    expect(names.has("CODICEDES")).toBe(true);
  });
});

describe("testaToDbfRecord", () => {
  test("maps testata fields with assigned ID", () => {
    const testata = makeTestata({ NUMERODOC: "99", TOTDOC: 500.5 });
    const record = testaToDbfRecord(testata, 7);

    expect(record.ID).toBe(7);
    expect(record.NUMERODOC).toBe("99");
    expect(record.TOTDOC).toBe(500.5);
    expect(record.TIPODOC).toBe("FT");
    expect(record.VALUTA).toBe("EUR");
  });

  test("converts ISO date strings to Date objects", () => {
    const testata = makeTestata({ DATADOC: "2025-06-20T12:00:00.000Z" });
    const record = testaToDbfRecord(testata, 1);

    expect(record.DATADOC).toBeInstanceOf(Date);
  });

  test("preserves null dates as null", () => {
    const testata = makeTestata({ DATADOC: null, DATACONSEG: null });
    const record = testaToDbfRecord(testata, 1);

    expect(record.DATADOC).toBeNull();
    expect(record.DATACONSEG).toBeNull();
  });

  test("truncates NOTE to 254 chars", () => {
    const longNote = "A".repeat(300);
    const testata = makeTestata({ NOTE: longNote });
    const record = testaToDbfRecord(testata, 1);

    expect((record.NOTE as string).length).toBe(254);
  });

  test("preserves boolean fields", () => {
    const testata = makeTestata({ SCORPORO: true, TRIANGOLAZ: false });
    const record = testaToDbfRecord(testata, 1);

    expect(record.SCORPORO).toBe(true);
    expect(record.TRIANGOLAZ).toBe(false);
  });
});

describe("rigaToDbfRecord", () => {
  test("maps riga with assigned IDs", () => {
    const riga = makeRiga({ CODICEARTI: "TEST.001", QUANTITA: 10 });
    const record = rigaToDbfRecord(riga, 42, 7);

    expect(record.ID).toBe(42);
    expect(record.ID_TESTA).toBe(7);
    expect(record.CODICEARTI).toBe("TEST.001");
    expect(record.QUANTITA).toBe(10);
  });

  test("converts riga date to Date object", () => {
    const riga = makeRiga({ DATADOC: "2025-01-10T00:00:00.000Z" });
    const record = rigaToDbfRecord(riga, 1, 1);

    expect(record.DATADOC).toBeInstanceOf(Date);
  });
});

describe("clientToDbfRecord", () => {
  test("maps client data correctly", () => {
    const record = clientToDbfRecord({
      codice: "C00966",
      ragioneSociale: "DR. ROSSI MARIO",
      indirizzo: "VIA ROMA 10",
      cap: "84100",
      localita: "SALERNO",
      prov: "SA",
      partitaIva: "12345678901",
      codFiscale: "RSSMRA80A01H703Z",
      telefono: "089123456",
      email: "info@rossi.it",
    });

    expect(record.CODICE).toBe("C00966");
    expect(record.DESCRIZION).toBe("DR. ROSSI MARIO");
    expect(record.INDIRIZZO).toBe("VIA ROMA 10");
    expect(record.CAP).toBe("84100");
    expect(record.LOCALITA).toBe("SALERNO");
    expect(record.PROV).toBe("SA");
    expect(record.LINGUA).toBe("IT");
    expect(record.VALUTA).toBe("EUR");
  });

  test("defaults empty strings for missing optional fields", () => {
    const record = clientToDbfRecord({
      codice: "C00001",
      ragioneSociale: "ACME",
    });

    expect(record.INDIRIZZO).toBe("");
    expect(record.FAX).toBe("");
    expect(record.EMAIL).toBe("");
  });
});

describe("destToDbfRecord", () => {
  test("maps destinazione diversa fields", () => {
    const dest: ArcaDestinazione = {
      CODICECF: "C00966", CODICEDES: "1",
      RAGIONESOC: "STUDIO DR. ROSSI",
      SUPPRAGSOC: "", INDIRIZZO: "VIA NAPOLI 5",
      CAP: "80100", LOCALITA: "NAPOLI",
      PROVINCIA: "NA", CODNAZIONE: "IT",
      AGENTE: "", AGENTE2: "", SETTORE: "",
      ZONA: "", VETTORE: "", TELEFONO: "081987654",
      FAX: "", PERSONARIF: "MARIO ROSSI",
      TIMESTAMP: null, USERNAME: "",
    };
    const record = destToDbfRecord(dest);

    expect(record.CODICECF).toBe("C00966");
    expect(record.RAGIONESOC).toBe("STUDIO DR. ROSSI");
    expect(record.LOCALITA).toBe("NAPOLI");
  });
});

describe("parseArcaDataJson", () => {
  test("parses valid JSON", () => {
    const data = { testata: makeTestata(), righe: [makeRiga()] };
    const result = parseArcaDataJson(JSON.stringify(data));

    expect(result).not.toBeNull();
    expect(result!.testata.TIPODOC).toBe("FT");
    expect(result!.righe).toHaveLength(1);
  });

  test("returns null for null input", () => {
    expect(parseArcaDataJson(null)).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    expect(parseArcaDataJson("{broken")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseArcaDataJson("")).toBeNull();
  });
});
