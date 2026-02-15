import { describe, expect, test } from "vitest";
import { parseIndirizzoIva } from "./parse-indirizzo-iva";
import type { VatAddressInfo } from "./types";

describe("parseIndirizzoIva", () => {
  test("parses a complete VAT address with all fields", () => {
    const input = [
      "BLANCO S.R.L. SOCIETA TRA PROFESSIONISTI",
      "VIA GIOVAN BATTISTA AMENDOLA 37",
      "84129 SALERNO",
      "Stato:ATTIVA",
      "Id:62d1e4abd5d6b0296c237ba1",
    ].join("\n");

    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "BLANCO S.R.L. SOCIETA TRA PROFESSIONISTI",
      street: "VIA GIOVAN BATTISTA AMENDOLA 37",
      postalCode: "84129",
      city: "SALERNO",
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
      companyName: "ACME SRL",
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
      companyName: "ACME SRL",
      street: "VIA ROMA 1",
      postalCode: "",
      city: "",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles city without CAP on third line", () => {
    const input = "ACME SRL\nVIA ROMA 1\nMILANO";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "ACME SRL",
      street: "VIA ROMA 1",
      postalCode: "",
      city: "MILANO",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles Stato with different casing", () => {
    const input =
      "ACME SRL\nVIA ROMA 1\n20100 MILANO\nstato: CESSATA\nid: abc123";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "ACME SRL",
      street: "VIA ROMA 1",
      postalCode: "20100",
      city: "MILANO",
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
      companyName: "ROSSI SPA",
      street: "PIAZZA DUOMO 5",
      postalCode: "37100",
      city: "VERONA",
      vatStatus: "ATTIVA",
      internalId: "abc",
    } satisfies VatAddressInfo);
  });

  test("handles multi-word city after CAP", () => {
    const input = "TECH SRL\nVIA DEI MILLE 10\n00185 ROMA CENTRO";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "TECH SRL",
      street: "VIA DEI MILLE 10",
      postalCode: "00185",
      city: "ROMA CENTRO",
      vatStatus: "",
      internalId: "",
    } satisfies VatAddressInfo);
  });

  test("handles Stato and Id without other address fields", () => {
    const input = "ACME SRL\nStato:NON ATTIVA\nId:xyz789";
    expect(parseIndirizzoIva(input)).toEqual({
      companyName: "ACME SRL",
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
      companyName: "TEST SRL",
      street: "VIA TEST 1",
      postalCode: "10100",
      city: "TORINO",
      vatStatus: "SOSPESA",
      internalId: "123abc",
    } satisfies VatAddressInfo);
  });
});
