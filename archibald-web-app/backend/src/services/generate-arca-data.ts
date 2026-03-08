import type {
  ArcaData,
  ArcaTestata,
  ArcaRiga,
  ArcaDestinazione,
} from "../arca-data-types";

export type GenerateInput = {
  subClientCodice: string;
  subClientName: string;
  subClientData?: {
    ragioneSociale?: string;
    supplRagioneSociale?: string;
    indirizzo?: string;
    cap?: string;
    localita?: string;
    prov?: string;
    zona?: string;
    telefono?: string;
    fax?: string;
    persDaContattare?: string;
  } | null;
  items: Array<{
    articleCode: string;
    description?: string;
    productName?: string;
    quantity: number;
    price: number;
    vat: number;
    discount?: number;
    unit?: string;
  }>;
  discountPercent?: number;
  notes?: string;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatArcaDate(isoOrNow?: string): string {
  if (isoOrNow) return isoOrNow.slice(0, 10);
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function generateArcaData(
  record: GenerateInput,
  ftNumber: number,
  esercizio: string,
  dateIso?: string,
): ArcaData {
  const datadoc = formatArcaDate(dateIso);
  const numerodoc = String(ftNumber);
  const codicecf = record.subClientCodice;
  const hasDestDiv = record.subClientData != null;
  const zona = record.subClientData?.zona ?? "0";

  const righe: ArcaRiga[] = record.items.map((item, idx) => {
    const discount = item.discount ?? 0;
    const prezzoTot = round2(
      item.quantity * item.price * (1 - discount / 100),
    );

    return {
      ID: 0,
      ID_TESTA: 0,
      ESERCIZIO: esercizio,
      TIPODOC: "FT",
      NUMERODOC: numerodoc,
      DATADOC: datadoc,
      CODICECF: codicecf,
      MAGPARTENZ: "",
      MAGARRIVO: "",
      AGENTE: "",
      AGENTE2: "",
      VALUTA: "EUR",
      CAMBIO: 1,
      CODICEARTI: item.articleCode,
      NUMERORIGA: idx + 1,
      ESPLDISTIN: "",
      UNMISURA: item.unit ?? "PZ",
      QUANTITA: item.quantity,
      QUANTITARE: 0,
      SCONTI: discount > 0 ? String(discount) : "",
      PREZZOUN: item.price,
      PREZZOTOT: prezzoTot,
      ALIIVA: String(item.vat),
      CONTOSCARI: "",
      OMIVA: false,
      OMMERCE: false,
      PROVV: "",
      PROVV2: "",
      DATACONSEG: null,
      DESCRIZION: item.description ?? item.productName ?? "",
      TIPORIGAD: "",
      RESTOSCORP: 0,
      RESTOSCUNI: 0,
      CODCAUMAG: "",
      ZONA: zona,
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
      EUROCAMBIO: 0,
      U_PESON: 0,
      U_PESOL: 0,
      U_COLLI: 0,
      U_GIA: 0,
      U_MAGP: "",
      U_MAGA: "",
    };
  });

  const totMerce = round2(
    record.items.reduce((sum, item) => sum + item.quantity * item.price, 0),
  );
  const totNetto = round2(righe.reduce((sum, r) => sum + r.PREZZOTOT, 0));
  const totSconto = round2(totMerce - totNetto);

  const vatGroups = new Map<number, number>();
  for (const riga of righe) {
    const vatRate = Number(riga.ALIIVA);
    const current = vatGroups.get(vatRate) ?? 0;
    vatGroups.set(vatRate, current + riga.PREZZOTOT);
  }
  const totIva = round2(
    [...vatGroups.entries()].reduce(
      (sum, [rate, base]) => sum + round2(base * rate / 100),
      0,
    ),
  );

  const totDoc = round2(totNetto + totIva);

  const scontiStr =
    record.discountPercent != null ? String(record.discountPercent) : "";
  const scontiF =
    record.discountPercent != null
      ? (100 - record.discountPercent) / 100
      : 1;

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
    PAG: "",
    SCONTI: scontiStr,
    SCONTIF: scontiF,
    SCONTOCASS: "",
    SCONTOCASF: 1,
    PROVV: "",
    PROVV2: "",
    CAMBIO: 1,
    DATADOCFOR: null,
    NUMERODOCF: "",
    TIPOMODULO: "",
    LISTINO: "",
    ZONA: zona,
    SETTORE: "",
    DESTDIV: hasDestDiv ? "01" : "",
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
    NOTE: record.notes ?? "",
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
    TOTIMP: totNetto,
    TOTDOC: totDoc,
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
    TOTIVA: totIva,
    ASPBENI: "",
    SCORPORO: false,
    TOTMERCE: totMerce,
    TOTSCONTO: totSconto,
    TOTNETTO: totNetto,
    TOTESEN: 0,
    IMPCOND: 0,
    RITCOND: 0,
    TIPOFATT: "",
    TRIANGOLAZ: false,
    NOMODIFICA: false,
    NOEVASIONE: false,
    COMMESSA: "",
    EUROCAMBIO: 0,
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

  let destinazione: ArcaDestinazione | null = null;
  if (record.subClientData) {
    const d = record.subClientData;
    destinazione = {
      CODICECF: codicecf,
      CODICEDES: "001",
      RAGIONESOC: d.ragioneSociale ?? record.subClientName,
      SUPPRAGSOC: d.supplRagioneSociale ?? "",
      INDIRIZZO: d.indirizzo ?? "",
      CAP: d.cap ?? "",
      LOCALITA: d.localita ?? "",
      PROVINCIA: d.prov ?? "",
      CODNAZIONE: "IT",
      AGENTE: "",
      AGENTE2: "",
      SETTORE: "",
      ZONA: d.zona ?? "",
      VETTORE: "",
      TELEFONO: d.telefono ?? "",
      FAX: d.fax ?? "",
      PERSONARIF: d.persDaContattare ?? "",
      TIMESTAMP: null,
      USERNAME: "",
    };
  }

  return {
    testata,
    righe,
    destinazione_diversa: destinazione,
  };
}
