import { describe, expect, test } from "vitest";
import { parseIndirizzoIva } from "./parse-indirizzo-iva";
import type { VatAddressInfo } from "./types";

describe("parseIndirizzoIva", () => {
  test("parses a complete VAT address with title case normalization", () => {
    const input = [
      "BLANCO S.R.L. SOCIETA TRA PROFESSIONISTI",
      "VIA GIOVAN BATTISTA AMENDOLA 37",
      "84129 SALERNO",
      "Stato:ATTIVA",
      "Id:62d1e4abd5d6b0296c237ba1",
    ].join("\n");

    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Blanco S.r.l. Societa Tra Professionisti",
      street: "Via Giovan Battista Amendola 37",
      postalCode: "84129",
      city: "Salerno",
      vatStatus: "ATTIVA",
      internalId: "62d1e4abd5d6b0296c237ba1",
    } satisfies VatAddressInfo);
  });

  test("returns empty fields for empty input", () => {
    expect(parseIndirizzoIva("")).toEqual({
      companyName: "",
      street: "",
      postalCode: "",
      city: "",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("returns empty fields for whitespace-only input", () => {
    expect(parseIndirizzoIva("   \n  \n  ")).toEqual({
      companyName: "",
      street: "",
      postalCode: "",
      city: "",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles company name only (single line)", () => {
    expect(parseIndirizzoIva("ACME SRL")).toEqual({
      companyName: "Acme S.r.l.",
      street: "",
      postalCode: "",
      city: "",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles company name + street (two lines, no CAP)", () => {
    const input = "ACME SRL\nVIA ROMA 1";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Acme S.r.l.",
      street: "Via Roma 1",
      postalCode: "",
      city: "",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles city without CAP on third line", () => {
    const input = "ACME SRL\nVIA ROMA 1\nMILANO";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Acme S.r.l.",
      street: "Via Roma 1",
      postalCode: "",
      city: "Milano",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles Stato with different casing", () => {
    const input =
      "ACME SRL\nVIA ROMA 1\n20100 MILANO\nstato: CESSATA\nid: abc123";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Acme S.r.l.",
      street: "Via Roma 1",
      postalCode: "20100",
      city: "Milano",
      vatStatus: "CESSATA",
      internalId: "abc123",
    } satisfies VatAddressInfo);
  });

  test("handles extra blank lines between content", () => {
    const input = [
      "",
      "ROSSI SPA",
      "",
      "PIAZZA DUOMO 5",
      "37100 VERONA",
      "",
      "Stato:ATTIVA",
      "Id:abc",
      "",
    ].join("\n");

    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Rossi S.p.a.",
      street: "Piazza Duomo 5",
      postalCode: "37100",
      city: "Verona",
      vatStatus: "ATTIVA",
      internalId: "abc",
    } satisfies VatAddressInfo);
  });

  test("handles multi-word city after CAP", () => {
    const input = "TECH SRL\nVIA DEI MILLE 10\n00185 ROMA CENTRO";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Tech S.r.l.",
      street: "Via Dei Mille 10",
      postalCode: "00185",
      city: "Roma Centro",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles Stato and Id without other address fields", () => {
    const input = "ACME SRL\nStato:NON ATTIVA\nId:xyz789";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Acme S.r.l.",
      street: "",
      postalCode: "",
      city: "",
      vatStatus: "NON ATTIVA",
      internalId: "xyz789",
    } satisfies VatAddressInfo);
  });

  test("handles Stato with space before colon value", () => {
    const input =
      "TEST SRL\nVIA TEST 1\n10100 TORINO\nStato: SOSPESA\nId: 123abc";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Test S.r.l.",
      street: "Via Test 1",
      postalCode: "10100",
      city: "Torino",
      vatStatus: "SOSPESA",
      internalId: "123abc",
    } satisfies VatAddressInfo);
  });

  test("preserves S.r.l. format when already present", () => {
    const input = "BLANCO S.R.L.\nVIA AMENDOLA 37\n84129 SALERNO";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "Blanco S.r.l.",
      street: "Via Amendola 37",
      postalCode: "84129",
      city: "Salerno",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("normalizes S.n.c. and S.a.s. company types", () => {
    expect(parseIndirizzoIva("FRATELLI ROSSI SNC").companyName).toBe(
      "Fratelli Rossi S.n.c.",
    );
    expect(parseIndirizzoIva("BIANCHI SAS").companyName).toBe(
      "Bianchi S.a.s.",
    );
  });
});
