import type { PendingOrder, PendingOrderItem } from "../db/schema";
import type { ArcaData, ArcaTestata, ArcaRiga } from "../types/arca-data";
import { calculateArcaTotals, calculateRowTotal } from "./arca-totals";

function formatDiscountForArca(discount: number | undefined): string {
  if (!discount) return "";
  return String(discount);
}

function formatVatForArca(vat: number): string {
  if (!vat) return "22";
  return String(vat).padStart(2, "0");
}

function itemToArcaRiga(
  item: PendingOrderItem,
  index: number,
  testataFields: {
    esercizio: string;
    numerodoc: string;
    datadoc: string;
    codicecf: string;
  },
): ArcaRiga {
  const sconti = formatDiscountForArca(item.discount);
  const prezzotot = calculateRowTotal(item.price, item.quantity, sconti);

  return {
    ID: 0,
    ID_TESTA: 0,
    ESERCIZIO: testataFields.esercizio,
    TIPODOC: "FT",
    NUMERODOC: testataFields.numerodoc,
    DATADOC: testataFields.datadoc,
    CODICECF: testataFields.codicecf,
    MAGPARTENZ: "",
    MAGARRIVO: "",
    AGENTE: "",
    AGENTE2: "",
    VALUTA: "EUR",
    CAMBIO: 1,
    CODICEARTI: item.articleCode,
    NUMERORIGA: index + 1,
    ESPLDISTIN: "",
    UNMISURA: "PZ",
    QUANTITA: item.quantity,
    QUANTITARE: 0,
    SCONTI: sconti,
    PREZZOUN: item.price,
    PREZZOTOT: prezzotot,
    ALIIVA: formatVatForArca(item.vat),
    CONTOSCARI: "",
    OMIVA: false,
    OMMERCE: false,
    PROVV: "",
    PROVV2: "",
    DATACONSEG: null,
    DESCRIZION: item.description ?? item.productName ?? item.articleCode,
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
    FATT: 1,
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
}

export function generateArcaData(
  order: Pick<
    PendingOrder,
    | "items"
    | "discountPercent"
    | "shippingCost"
    | "shippingTax"
    | "subClientCodice"
  >,
  ftNumber: number,
  esercizio: string,
): ArcaData {
  const now = new Date();
  const datadoc = now.toISOString();
  const numerodoc = String(ftNumber);
  const codicecf = order.subClientCodice ?? "";

  const righe: ArcaRiga[] = order.items.map((item, i) =>
    itemToArcaRiga(item, i, { esercizio, numerodoc, datadoc, codicecf }),
  );

  const globalDiscountPct = order.discountPercent ?? 0;
  const scontif = globalDiscountPct > 0 ? 1 - globalDiscountPct / 100 : 1;
  const spesetr = order.shippingCost ?? 0;

  const spese = {
    spesetr,
    speseim: 0,
    speseva: 0,
    spesetriva: "22",
    speseimiva: "22",
    spesevaiva: "22",
  };

  const totals = calculateArcaTotals(righe, scontif, spese, 0, 0);

  const testata: ArcaTestata = {
    ID: 0,
    ESERCIZIO: esercizio,
    ESANNO: esercizio,
    TIPODOC: "FT",
    NUMERODOC: numerodoc,
    DATADOC: datadoc,
    CODICECF: codicecf,
    CODCNT: "",
    MAGPARTENZ: "",
    MAGARRIVO: "",
    NUMRIGHEPR: righe.length,
    AGENTE: "",
    AGENTE2: "",
    VALUTA: "EUR",
    PAG: "0001",
    SCONTI: globalDiscountPct > 0 ? String(globalDiscountPct) : "",
    SCONTIF: scontif,
    SCONTOCASS: "",
    SCONTOCASF: 1,
    PROVV: "",
    PROVV2: "",
    CAMBIO: 1,
    DATADOCFOR: null,
    NUMERODOCF: "",
    TIPOMODULO: "",
    LISTINO: "1",
    ZONA: "",
    SETTORE: "",
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
    SPESETR: spesetr,
    SPESETRIVA: "22",
    SPESETRCP: "",
    SPESETRPER: "",
    SPESEIM: 0,
    SPESEIMIVA: "22",
    SPESEIMCP: "",
    SPESEVA: 0,
    SPESEVAIVA: "22",
    SPESEVACP: "",
    ACCONTO: 0,
    ABBUONO: 0,
    TOTIMP: totals.totimp,
    TOTDOC: totals.totdoc,
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
    TOTIVA: totals.totiva,
    ASPBENI: "",
    SCORPORO: false,
    TOTMERCE: totals.totmerce,
    TOTSCONTO: totals.totsconto,
    TOTNETTO: totals.totnetto,
    TOTESEN: totals.totesen,
    IMPCOND: 0,
    RITCOND: 0,
    TIPOFATT: "",
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
    TIMESTAMP: datadoc,
    USERNAME: "",
  };

  return {
    testata,
    righe,
    destinazione_diversa: null,
  };
}
