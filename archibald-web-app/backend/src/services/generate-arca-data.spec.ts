import { describe, expect, test } from "vitest";
import {
  generateArcaData,
  round2,
  formatArcaDate,
} from "./generate-arca-data";
import type { GenerateInput } from "./generate-arca-data";

function makeInput(overrides?: Partial<GenerateInput>): GenerateInput {
  return {
    subClientCodice: "ABC123",
    subClientName: "Test Client Srl",
    items: [
      {
        articleCode: "ART001",
        description: "Widget A",
        quantity: 10,
        price: 25.5,
        vat: 22,
        discount: 10,
        unit: "PZ",
      },
      {
        articleCode: "ART002",
        productName: "Widget B",
        quantity: 5,
        price: 100,
        vat: 22,
        discount: 0,
      },
    ],
    ...overrides,
  };
}

const FT_NUMBER = 42;
const ESERCIZIO = "2026";
const FIXED_DATE = "2026-03-08";

describe("round2", () => {
  test("rounds to 2 decimal places using banker-style Math.round", () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(1.015)).toBe(1.01);
    expect(round2(123.456)).toBe(123.46);
    expect(round2(0)).toBe(0);
    expect(round2(-3.456)).toBe(-3.46);
    expect(round2(2.345)).toBe(2.35);
  });
});

describe("formatArcaDate", () => {
  test("extracts YYYY-MM-DD from ISO datetime string", () => {
    expect(formatArcaDate("2026-03-08T14:30:00Z")).toBe("2026-03-08");
    expect(formatArcaDate("2016-01-01T00:00:00.000Z")).toBe("2016-01-01");
  });

  test("passes through already-formatted YYYY-MM-DD strings", () => {
    expect(formatArcaDate("2026-03-08")).toBe("2026-03-08");
    expect(formatArcaDate("2026-12-25")).toBe("2026-12-25");
  });

  test("defaults to today if not provided", () => {
    const result = formatArcaDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("generateArcaData", () => {
  test("generates testata with correct document fields", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );
    const t = result.testata;

    expect(t.TIPODOC).toBe("FT");
    expect(t.NUMERODOC).toBe("42");
    expect(t.ESERCIZIO).toBe("2026");
    expect(t.ESANNO).toBe("2026");
    expect(t.CODICECF).toBe("ABC123");
    expect(t.VALUTA).toBe("EUR");
    expect(t.CAMBIO).toBe(1);
  });

  test("generates correct number of righe with right fields", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );

    expect(result.righe).toHaveLength(2);
    expect(result.righe[0].CODICEARTI).toBe("ART001");
    expect(result.righe[0].DESCRIZION).toBe("ART001 Widget A");
    expect(result.righe[0].QUANTITA).toBe(10);
    expect(result.righe[0].PREZZOUN).toBe(25.5);
    expect(result.righe[0].ALIIVA).toBe("22");
    expect(result.righe[0].UNMISURA).toBe("PZ");
    expect(result.righe[0].NUMERORIGA).toBe(1);
    expect(result.righe[1].NUMERORIGA).toBe(2);
  });

  test("calculates PREZZOTOT per riga using Archibald formula: round2(qty * price * (1 - disc/100))", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );

    // ART001: round2(10 * 25.5 * (1 - 10/100)) = round2(229.5) = 229.5
    expect(result.righe[0].PREZZOTOT).toBe(229.5);
    // ART002: round2(5 * 100 * (1 - 0/100)) = round2(500) = 500
    expect(result.righe[1].PREZZOTOT).toBe(500);
  });

  test("calculates testata totals (TOTMERCE, TOTNETTO, TOTIVA, TOTDOC, TOTSCONTO)", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );
    const t = result.testata;

    // TOTMERCE = sum(qty * price) = (10*25.5) + (5*100) = 255 + 500 = 755
    expect(t.TOTMERCE).toBe(755);
    // TOTNETTO = sum(PREZZOTOT) = 229.5 + 500 = 729.5
    expect(t.TOTNETTO).toBe(729.5);
    // TOTSCONTO = TOTMERCE - TOTNETTO = 755 - 729.5 = 25.5
    expect(t.TOTSCONTO).toBe(25.5);
    // TOTIVA: all items are 22% VAT, base = 729.5, IVA = round2(729.5 * 22/100) = round2(160.49) = 160.49
    expect(t.TOTIVA).toBe(160.49);
    // TOTDOC = TOTNETTO + TOTIVA = 729.5 + 160.49 = 889.99
    expect(t.TOTDOC).toBe(889.99);
    // TOTIMP = TOTNETTO
    expect(t.TOTIMP).toBe(729.5);
  });

  test("sets DATADOC from provided ISO date", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      "2026-06-15",
    );

    expect(result.testata.DATADOC).toBe("2026-06-15");
    expect(result.righe[0].DATADOC).toBe("2026-06-15");
  });

  test("defaults DATADOC to today if not provided", () => {
    const result = generateArcaData(makeInput(), FT_NUMBER, ESERCIZIO);
    expect(result.testata.DATADOC).toBe(formatArcaDate());
  });

  test("populates destinazione_diversa from subClientData", () => {
    const input = makeInput({
      subClientData: {
        ragioneSociale: "Dest Srl",
        supplRagioneSociale: "Suppl Dest",
        indirizzo: "Via Roma 1",
        cap: "80100",
        localita: "Napoli",
        prov: "NA",
        zona: "Z01",
        telefono: "081-1234567",
        fax: "081-7654321",
        persDaContattare: "Mario Rossi",
      },
    });

    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);
    const dest = result.destinazione_diversa;

    expect(dest).not.toBeNull();
    expect(dest!.CODICECF).toBe("ABC123");
    expect(dest!.CODICEDES).toBe("001");
    expect(dest!.RAGIONESOC).toBe("Dest Srl");
    expect(dest!.SUPPRAGSOC).toBe("Suppl Dest");
    expect(dest!.INDIRIZZO).toBe("Via Roma 1");
    expect(dest!.CAP).toBe("80100");
    expect(dest!.LOCALITA).toBe("Napoli");
    expect(dest!.PROVINCIA).toBe("NA");
    expect(dest!.TELEFONO).toBe("081-1234567");
    expect(dest!.FAX).toBe("081-7654321");
    expect(dest!.PERSONARIF).toBe("Mario Rossi");
  });

  test("riga inherits testata shared fields", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );
    const riga = result.righe[0];

    expect(riga.ESERCIZIO).toBe("2026");
    expect(riga.TIPODOC).toBe("FT");
    expect(riga.NUMERODOC).toBe("42");
    expect(riga.DATADOC).toBe("2026-03-08");
    expect(riga.CODICECF).toBe("ABC123");
    expect(riga.VALUTA).toBe("EUR");
    expect(riga.CAMBIO).toBe(1);
  });

  test("handles items without discount", () => {
    const input = makeInput({
      items: [
        {
          articleCode: "ART003",
          description: "No Discount Item",
          quantity: 3,
          price: 50,
          vat: 10,
        },
      ],
    });

    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.righe[0].SCONTI).toBe("");
    // round2(3 * 50 * (1 - 0/100)) = 150
    expect(result.righe[0].PREZZOTOT).toBe(150);
    expect(result.testata.TOTMERCE).toBe(150);
    expect(result.testata.TOTNETTO).toBe(150);
    expect(result.testata.TOTSCONTO).toBe(0);
    // IVA: round2(150 * 10/100) = 15
    expect(result.testata.TOTIVA).toBe(15);
    expect(result.testata.TOTDOC).toBe(165);
  });

  test("handles global discount on testata (SCONTI, SCONTIF)", () => {
    const input = makeInput({ discountPercent: 5 });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.testata.SCONTI).toBe("5");
    expect(result.testata.SCONTIF).toBe(0.95);
  });

  test("testata SCONTI and SCONTIF default when no global discount", () => {
    const input = makeInput();
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.testata.SCONTI).toBe("");
    expect(result.testata.SCONTIF).toBe(1);
  });

  test("sets destinazione_diversa to null when subClientData is absent", () => {
    const input = makeInput({ subClientData: null });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.destinazione_diversa).toBeNull();
  });

  test("calculates TOTIVA correctly with mixed VAT rates", () => {
    const input = makeInput({
      items: [
        {
          articleCode: "A1",
          quantity: 2,
          price: 100,
          vat: 22,
          description: "Item 22%",
        },
        {
          articleCode: "A2",
          quantity: 1,
          price: 50,
          vat: 10,
          description: "Item 10%",
        },
      ],
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    // 22% group: base=200, IVA=round2(200*22/100)=44
    // 10% group: base=50, IVA=round2(50*10/100)=5
    // TOTIVA = 44 + 5 = 49
    expect(result.testata.TOTIVA).toBe(49);
    expect(result.testata.TOTDOC).toBe(250 + 49);
  });

  test("uses productName as fallback when description is missing", () => {
    const input = makeInput({
      items: [
        {
          articleCode: "X1",
          productName: "Fallback Name",
          quantity: 1,
          price: 10,
          vat: 22,
        },
      ],
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.righe[0].DESCRIZION).toBe("X1 Fallback Name");
  });

  test("defaults unit to PZ when not specified", () => {
    const input = makeInput({
      items: [
        {
          articleCode: "X1",
          quantity: 1,
          price: 10,
          vat: 22,
        },
      ],
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.righe[0].UNMISURA).toBe("PZ");
  });

  test("sets NOTE on testata when notes provided", () => {
    const input = makeInput({ notes: "Consegna urgente" });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.testata.NOTE).toBe("Consegna urgente");
  });

  test("NUMRIGHEPR matches number of items", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );

    expect(result.testata.NUMRIGHEPR).toBe(2);
  });

  test("DESTDIV is set to 01 when subClientData present, empty otherwise", () => {
    const withDest = generateArcaData(
      makeInput({
        subClientData: { ragioneSociale: "X" },
      }),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );
    expect(withDest.testata.DESTDIV).toBe("01");

    const withoutDest = generateArcaData(
      makeInput({ subClientData: null }),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );
    expect(withoutDest.testata.DESTDIV).toBe("");
  });

  test("SCONTOCASF defaults to 1 (no cash discount multiplier)", () => {
    const result = generateArcaData(
      makeInput(),
      FT_NUMBER,
      ESERCIZIO,
      FIXED_DATE,
    );

    expect(result.testata.SCONTOCASF).toBe(1);
  });

  test("RAGIONESOC falls back to subClientName when ragioneSociale is missing", () => {
    const input = makeInput({
      subClientName: "Fallback Client Name",
      subClientData: {
        indirizzo: "Via Test 1",
      },
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.destinazione_diversa!.RAGIONESOC).toBe(
      "Fallback Client Name",
    );
  });

  test("CODNAZIONE defaults to IT for destinazione_diversa", () => {
    const input = makeInput({
      subClientData: { ragioneSociale: "Test" },
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.destinazione_diversa!.CODNAZIONE).toBe("IT");
  });

  test("ZONA is populated from subClientData on testata and righe", () => {
    const input = makeInput({
      subClientData: { ragioneSociale: "Test", zona: "Z01" },
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.testata.ZONA).toBe("Z01");
    expect(result.righe[0].ZONA).toBe("Z01");
    expect(result.righe[1].ZONA).toBe("Z01");
  });

  test("ZONA defaults to 0 when subClientData has no zona", () => {
    const input = makeInput({ subClientData: null });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.testata.ZONA).toBe("0");
    expect(result.righe[0].ZONA).toBe("0");
  });

  test("DESCRIZION prepends articleCode and truncates to 40 chars", () => {
    const longCode = "BCR1.000.000";
    const longDesc = "KOMET BIOREPAIR SPRITZE EXTRA LONG NAME";
    const input = makeInput({
      items: [
        {
          articleCode: longCode,
          description: longDesc,
          quantity: 1,
          price: 10,
          vat: 22,
        },
      ],
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);
    const expected = `${longCode} ${longDesc}`.slice(0, 40);

    expect(result.righe[0].DESCRIZION).toBe(expected);
    expect(result.righe[0].DESCRIZION.length).toBeLessThanOrEqual(40);
  });

  test("CODICEDES uses 001 (3 chars) in destinazione_diversa", () => {
    const input = makeInput({
      subClientData: { ragioneSociale: "Test" },
    });
    const result = generateArcaData(input, FT_NUMBER, ESERCIZIO, FIXED_DATE);

    expect(result.destinazione_diversa!.CODICEDES).toBe("001");
  });
});
