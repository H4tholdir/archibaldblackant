import { DBFFile } from "dbffile";
import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import type { Writable } from "stream";
import type {
  ArcaData,
  ArcaTestata,
  ArcaRiga,
  ArcaDestinazione,
  ArcaClientData,
} from "./arca-data-types";
import type { FresisHistoryRow } from "./arca-import-service";
import type { FieldDescriptor } from "dbffile";

export type ExportStats = {
  totalDocuments: number;
  totalRows: number;
  totalClients: number;
  totalDestinations: number;
};

export function createTestataFields(): FieldDescriptor[] {
  return [
    { name: "ID", type: "N", size: 11, decimalPlaces: 0 },
    { name: "ESERCIZIO", type: "C", size: 4 },
    { name: "ESANNO", type: "C", size: 4 },
    { name: "TIPODOC", type: "C", size: 2 },
    { name: "NUMERODOC", type: "C", size: 8 },
    { name: "DATADOC", type: "D", size: 8 },
    { name: "CODICECF", type: "C", size: 6 },
    { name: "CODCNT", type: "C", size: 3 },
    { name: "MAGPARTENZ", type: "C", size: 5 },
    { name: "MAGARRIVO", type: "C", size: 5 },
    { name: "NUMRIGHEPR", type: "N", size: 11, decimalPlaces: 0 },
    { name: "AGENTE", type: "C", size: 3 },
    { name: "AGENTE2", type: "C", size: 3 },
    { name: "VALUTA", type: "C", size: 3 },
    { name: "PAG", type: "C", size: 4 },
    { name: "SCONTI", type: "C", size: 10 },
    { name: "SCONTIF", type: "N", size: 10, decimalPlaces: 8 },
    { name: "SCONTOCASS", type: "C", size: 10 },
    { name: "SCONTOCASF", type: "N", size: 10, decimalPlaces: 8 },
    { name: "PROVV", type: "C", size: 10 },
    { name: "PROVV2", type: "C", size: 10 },
    { name: "CAMBIO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "DATADOCFOR", type: "D", size: 8 },
    { name: "NUMERODOCF", type: "C", size: 15 },
    { name: "TIPOMODULO", type: "C", size: 1 },
    { name: "LISTINO", type: "C", size: 1 },
    { name: "ZONA", type: "C", size: 3 },
    { name: "SETTORE", type: "C", size: 3 },
    { name: "DESTDIV", type: "C", size: 2 },
    { name: "DATACONSEG", type: "D", size: 8 },
    { name: "TRDATA", type: "D", size: 8 },
    { name: "TRORA", type: "C", size: 5 },
    { name: "PESOLORDO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "PESONETTO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "VOLUME", type: "N", size: 20, decimalPlaces: 9 },
    { name: "VETTORE1", type: "C", size: 2 },
    { name: "V1DATA", type: "D", size: 8 },
    { name: "V1ORA", type: "C", size: 5 },
    { name: "VETTORE2", type: "C", size: 2 },
    { name: "V2DATA", type: "D", size: 8 },
    { name: "V2ORA", type: "C", size: 5 },
    { name: "TRCAUSALE", type: "C", size: 3 },
    { name: "COLLI", type: "C", size: 9 },
    { name: "SPEDIZIONE", type: "C", size: 3 },
    { name: "PORTO", type: "C", size: 3 },
    { name: "NOTE", type: "C", size: 254 },
    { name: "SPESETR", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESETRIVA", type: "C", size: 3 },
    { name: "SPESETRCP", type: "C", size: 2 },
    { name: "SPESETRPER", type: "C", size: 12 },
    { name: "SPESEIM", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEIMIVA", type: "C", size: 3 },
    { name: "SPESEIMCP", type: "C", size: 2 },
    { name: "SPESEVA", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEVAIVA", type: "C", size: 3 },
    { name: "SPESEVACP", type: "C", size: 2 },
    { name: "ACCONTO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "ABBUONO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTIMP", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTDOC", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESE", type: "C", size: 1 },
    { name: "SPESEBOLLI", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEINCAS", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEINEFF", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEINDOC", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SPESEINIVA", type: "C", size: 3 },
    { name: "SPESEINCP", type: "C", size: 2 },
    { name: "SPESEESENZ", type: "N", size: 20, decimalPlaces: 9 },
    { name: "CODCAUMAG", type: "C", size: 2 },
    { name: "CODBANCA", type: "C", size: 2 },
    { name: "PERCPROVV", type: "N", size: 6, decimalPlaces: 2 },
    { name: "IMPPROVV", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTPROVV", type: "N", size: 20, decimalPlaces: 9 },
    { name: "PERCPROVV2", type: "N", size: 6, decimalPlaces: 2 },
    { name: "IMPPROVV2", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTPROVV2", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTIVA", type: "N", size: 20, decimalPlaces: 9 },
    { name: "ASPBENI", type: "C", size: 3 },
    { name: "SCORPORO", type: "L", size: 1 },
    { name: "TOTMERCE", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTSCONTO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTNETTO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TOTESEN", type: "N", size: 20, decimalPlaces: 9 },
    { name: "IMPCOND", type: "N", size: 20, decimalPlaces: 9 },
    { name: "RITCOND", type: "N", size: 20, decimalPlaces: 9 },
    { name: "TIPOFATT", type: "C", size: 2 },
    { name: "TRIANGOLAZ", type: "L", size: 1 },
    { name: "NOMODIFICA", type: "L", size: 1 },
    { name: "NOEVASIONE", type: "L", size: 1 },
    { name: "COMMESSA", type: "C", size: 10 },
    { name: "EUROCAMBIO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "EXPORT_I", type: "L", size: 1 },
    { name: "CB_BIC", type: "C", size: 11 },
    { name: "CB_NAZIONE", type: "C", size: 2 },
    { name: "CB_CIN_UE", type: "C", size: 2 },
    { name: "CB_CIN_IT", type: "C", size: 1 },
    { name: "ABICAB", type: "C", size: 10 },
    { name: "CONTOCORR", type: "C", size: 20 },
    { name: "CARICATORE", type: "C", size: 3 },
    { name: "COMMITTENT", type: "C", size: 3 },
    { name: "PROPRMERCE", type: "C", size: 3 },
    { name: "LUOGOCAR", type: "C", size: 3 },
    { name: "LUOGOSCAR", type: "C", size: 3 },
    { name: "SDTALTRO", type: "C", size: 254 },
    { name: "TIMESTAMP", type: "D", size: 8 },
    { name: "USERNAME", type: "C", size: 20 },
  ];
}

export function createRigheFields(): FieldDescriptor[] {
  return [
    { name: "ID", type: "N", size: 11, decimalPlaces: 0 },
    { name: "ID_TESTA", type: "N", size: 11, decimalPlaces: 0 },
    { name: "ESERCIZIO", type: "C", size: 4 },
    { name: "TIPODOC", type: "C", size: 2 },
    { name: "NUMERODOC", type: "C", size: 8 },
    { name: "DATADOC", type: "D", size: 8 },
    { name: "CODICECF", type: "C", size: 6 },
    { name: "MAGPARTENZ", type: "C", size: 5 },
    { name: "MAGARRIVO", type: "C", size: 5 },
    { name: "AGENTE", type: "C", size: 3 },
    { name: "AGENTE2", type: "C", size: 3 },
    { name: "VALUTA", type: "C", size: 3 },
    { name: "CAMBIO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "CODICEARTI", type: "C", size: 20 },
    { name: "NUMERORIGA", type: "N", size: 8, decimalPlaces: 0 },
    { name: "ESPLDISTIN", type: "C", size: 1 },
    { name: "UNMISURA", type: "C", size: 2 },
    { name: "QUANTITA", type: "N", size: 20, decimalPlaces: 9 },
    { name: "QUANTITARE", type: "N", size: 20, decimalPlaces: 9 },
    { name: "SCONTI", type: "C", size: 12 },
    { name: "PREZZOUN", type: "N", size: 20, decimalPlaces: 9 },
    { name: "PREZZOTOT", type: "N", size: 20, decimalPlaces: 9 },
    { name: "ALIIVA", type: "C", size: 3 },
    { name: "CONTOSCARI", type: "C", size: 2 },
    { name: "OMIVA", type: "L", size: 1 },
    { name: "OMMERCE", type: "L", size: 1 },
    { name: "PROVV", type: "C", size: 9 },
    { name: "PROVV2", type: "C", size: 9 },
    { name: "DATACONSEG", type: "D", size: 8 },
    { name: "DESCRIZION", type: "C", size: 40 },
    { name: "TIPORIGAD", type: "C", size: 1 },
    { name: "RESTOSCORP", type: "N", size: 11, decimalPlaces: 9 },
    { name: "RESTOSCUNI", type: "N", size: 11, decimalPlaces: 9 },
    { name: "CODCAUMAG", type: "C", size: 2 },
    { name: "ZONA", type: "C", size: 3 },
    { name: "SETTORE", type: "C", size: 3 },
    { name: "GRUPPO", type: "C", size: 5 },
    { name: "CLASSE", type: "C", size: 5 },
    { name: "RIFFROMT", type: "N", size: 11, decimalPlaces: 0 },
    { name: "RIFFROMR", type: "N", size: 11, decimalPlaces: 0 },
    { name: "PREZZOTOTM", type: "N", size: 20, decimalPlaces: 9 },
    { name: "NOTE", type: "C", size: 254 },
    { name: "COMMESSA", type: "C", size: 10 },
    { name: "TIMESTAMP", type: "D", size: 8 },
    { name: "USERNAME", type: "C", size: 20 },
    { name: "FATT", type: "N", size: 20, decimalPlaces: 9 },
    { name: "LOTTO", type: "C", size: 20 },
    { name: "MATRICOLA", type: "C", size: 20 },
    { name: "EUROCAMBIO", type: "N", size: 20, decimalPlaces: 9 },
    { name: "U_PESON", type: "N", size: 20, decimalPlaces: 9 },
    { name: "U_PESOL", type: "N", size: 20, decimalPlaces: 9 },
    { name: "U_COLLI", type: "N", size: 20, decimalPlaces: 9 },
    { name: "U_GIA", type: "N", size: 20, decimalPlaces: 9 },
    { name: "U_MAGP", type: "C", size: 5 },
    { name: "U_MAGA", type: "C", size: 5 },
  ];
}

export function createClientiFields(): FieldDescriptor[] {
  return [
    { name: "CODICE", type: "C", size: 6 },
    { name: "DESCRIZION", type: "C", size: 40 },
    { name: "SUPRAGSOC", type: "C", size: 31 },
    { name: "PARTIVA", type: "C", size: 17 },
    { name: "CODFISCALE", type: "C", size: 16 },
    { name: "FAX", type: "C", size: 20 },
    { name: "TELEX", type: "C", size: 20 },
    { name: "URL", type: "C", size: 100 },
    { name: "EMAIL", type: "C", size: 50 },
    { name: "EMAILAMM", type: "C", size: 50 },
    { name: "INDIRIZZO", type: "C", size: 60 },
    { name: "CAP", type: "C", size: 10 },
    { name: "LOCALITA", type: "C", size: 30 },
    { name: "PROV", type: "C", size: 2 },
    { name: "TELEFONO", type: "C", size: 20 },
    { name: "TELEFONO2", type: "C", size: 20 },
    { name: "ZONA", type: "C", size: 3 },
    { name: "AGENTE", type: "C", size: 3 },
    { name: "AGENTE2", type: "C", size: 3 },
    { name: "SETTORE", type: "C", size: 3 },
    { name: "PAG", type: "C", size: 4 },
    { name: "LINGUA", type: "C", size: 3 },
    { name: "LISTINO", type: "C", size: 1 },
    { name: "VALUTA", type: "C", size: 3 },
    { name: "TIMESTAMP", type: "D", size: 8 },
    { name: "USERNAME", type: "C", size: 20 },
  ];
}

export function createDestinazioniFields(): FieldDescriptor[] {
  return [
    { name: "CODICECF", type: "C", size: 6 },
    { name: "CODICEDES", type: "C", size: 2 },
    { name: "RAGIONESOC", type: "C", size: 40 },
    { name: "SUPPRAGSOC", type: "C", size: 30 },
    { name: "INDIRIZZO", type: "C", size: 60 },
    { name: "CAP", type: "C", size: 10 },
    { name: "LOCALITA", type: "C", size: 25 },
    { name: "PROVINCIA", type: "C", size: 2 },
    { name: "CODNAZIONE", type: "C", size: 3 },
    { name: "AGENTE", type: "C", size: 3 },
    { name: "AGENTE2", type: "C", size: 3 },
    { name: "SETTORE", type: "C", size: 3 },
    { name: "ZONA", type: "C", size: 3 },
    { name: "VETTORE", type: "C", size: 2 },
    { name: "TELEFONO", type: "C", size: 16 },
    { name: "FAX", type: "C", size: 16 },
    { name: "PERSONARIF", type: "C", size: 30 },
    { name: "TIMESTAMP", type: "D", size: 8 },
    { name: "USERNAME", type: "C", size: 20 },
  ];
}

export function isoToDate(isoStr: string | null): Date | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

function truncStr(val: string, maxLen: number): string {
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

export function testaToDbfRecord(
  testata: ArcaTestata,
  assignedId: number,
): Record<string, unknown> {
  return {
    ID: assignedId,
    ESERCIZIO: testata.ESERCIZIO,
    ESANNO: testata.ESANNO || testata.ESERCIZIO,
    TIPODOC: testata.TIPODOC,
    NUMERODOC: testata.NUMERODOC,
    DATADOC: isoToDate(testata.DATADOC),
    CODICECF: testata.CODICECF,
    CODCNT: testata.CODCNT,
    MAGPARTENZ: testata.MAGPARTENZ,
    MAGARRIVO: testata.MAGARRIVO,
    NUMRIGHEPR: testata.NUMRIGHEPR,
    AGENTE: testata.AGENTE,
    AGENTE2: testata.AGENTE2,
    VALUTA: testata.VALUTA,
    PAG: testata.PAG,
    SCONTI: testata.SCONTI,
    SCONTIF: testata.SCONTIF,
    SCONTOCASS: testata.SCONTOCASS,
    SCONTOCASF: testata.SCONTOCASF,
    PROVV: testata.PROVV,
    PROVV2: testata.PROVV2,
    CAMBIO: testata.CAMBIO,
    DATADOCFOR: isoToDate(testata.DATADOCFOR),
    NUMERODOCF: testata.NUMERODOCF,
    TIPOMODULO: testata.TIPOMODULO,
    LISTINO: testata.LISTINO,
    ZONA: testata.ZONA,
    SETTORE: testata.SETTORE,
    DESTDIV: testata.DESTDIV,
    DATACONSEG: isoToDate(testata.DATACONSEG),
    TRDATA: isoToDate(testata.TRDATA),
    TRORA: testata.TRORA,
    PESOLORDO: testata.PESOLORDO,
    PESONETTO: testata.PESONETTO,
    VOLUME: testata.VOLUME,
    VETTORE1: testata.VETTORE1,
    V1DATA: isoToDate(testata.V1DATA),
    V1ORA: testata.V1ORA,
    VETTORE2: testata.VETTORE2,
    V2DATA: isoToDate(testata.V2DATA),
    V2ORA: testata.V2ORA,
    TRCAUSALE: testata.TRCAUSALE,
    COLLI: testata.COLLI,
    SPEDIZIONE: testata.SPEDIZIONE,
    PORTO: testata.PORTO,
    NOTE: truncStr(testata.NOTE || "", 254),
    SPESETR: testata.SPESETR,
    SPESETRIVA: testata.SPESETRIVA,
    SPESETRCP: testata.SPESETRCP,
    SPESETRPER: testata.SPESETRPER,
    SPESEIM: testata.SPESEIM,
    SPESEIMIVA: testata.SPESEIMIVA,
    SPESEIMCP: testata.SPESEIMCP,
    SPESEVA: testata.SPESEVA,
    SPESEVAIVA: testata.SPESEVAIVA,
    SPESEVACP: testata.SPESEVACP,
    ACCONTO: testata.ACCONTO,
    ABBUONO: testata.ABBUONO,
    TOTIMP: testata.TOTIMP,
    TOTDOC: testata.TOTDOC,
    SPESE: testata.SPESE,
    SPESEBOLLI: testata.SPESEBOLLI,
    SPESEINCAS: testata.SPESEINCAS,
    SPESEINEFF: testata.SPESEINEFF,
    SPESEINDOC: testata.SPESEINDOC,
    SPESEINIVA: testata.SPESEINIVA,
    SPESEINCP: testata.SPESEINCP,
    SPESEESENZ: testata.SPESEESENZ,
    CODCAUMAG: testata.CODCAUMAG,
    CODBANCA: testata.CODBANCA,
    PERCPROVV: testata.PERCPROVV,
    IMPPROVV: testata.IMPPROVV,
    TOTPROVV: testata.TOTPROVV,
    PERCPROVV2: testata.PERCPROVV2,
    IMPPROVV2: testata.IMPPROVV2,
    TOTPROVV2: testata.TOTPROVV2,
    TOTIVA: testata.TOTIVA,
    ASPBENI: testata.ASPBENI,
    SCORPORO: testata.SCORPORO,
    TOTMERCE: testata.TOTMERCE,
    TOTSCONTO: testata.TOTSCONTO,
    TOTNETTO: testata.TOTNETTO,
    TOTESEN: testata.TOTESEN,
    IMPCOND: testata.IMPCOND,
    RITCOND: testata.RITCOND,
    TIPOFATT: testata.TIPOFATT,
    TRIANGOLAZ: testata.TRIANGOLAZ,
    NOMODIFICA: testata.NOMODIFICA,
    NOEVASIONE: testata.NOEVASIONE,
    COMMESSA: testata.COMMESSA,
    EUROCAMBIO: testata.EUROCAMBIO,
    EXPORT_I: testata.EXPORT_I,
    CB_BIC: testata.CB_BIC,
    CB_NAZIONE: testata.CB_NAZIONE,
    CB_CIN_UE: testata.CB_CIN_UE,
    CB_CIN_IT: testata.CB_CIN_IT,
    ABICAB: testata.ABICAB,
    CONTOCORR: testata.CONTOCORR,
    CARICATORE: testata.CARICATORE,
    COMMITTENT: testata.COMMITTENT,
    PROPRMERCE: testata.PROPRMERCE,
    LUOGOCAR: testata.LUOGOCAR,
    LUOGOSCAR: testata.LUOGOSCAR,
    SDTALTRO: truncStr(testata.SDTALTRO || "", 254),
    TIMESTAMP: isoToDate(testata.TIMESTAMP),
    USERNAME: testata.USERNAME,
  };
}

export function rigaToDbfRecord(
  riga: ArcaRiga,
  assignedId: number,
  assignedIdTesta: number,
): Record<string, unknown> {
  return {
    ID: assignedId,
    ID_TESTA: assignedIdTesta,
    ESERCIZIO: riga.ESERCIZIO,
    TIPODOC: riga.TIPODOC,
    NUMERODOC: riga.NUMERODOC,
    DATADOC: isoToDate(riga.DATADOC),
    CODICECF: riga.CODICECF,
    MAGPARTENZ: riga.MAGPARTENZ,
    MAGARRIVO: riga.MAGARRIVO,
    AGENTE: riga.AGENTE,
    AGENTE2: riga.AGENTE2,
    VALUTA: riga.VALUTA,
    CAMBIO: riga.CAMBIO,
    CODICEARTI: riga.CODICEARTI,
    NUMERORIGA: riga.NUMERORIGA,
    ESPLDISTIN: riga.ESPLDISTIN,
    UNMISURA: riga.UNMISURA,
    QUANTITA: riga.QUANTITA,
    QUANTITARE: riga.QUANTITARE,
    SCONTI: riga.SCONTI,
    PREZZOUN: riga.PREZZOUN,
    PREZZOTOT: riga.PREZZOTOT,
    ALIIVA: riga.ALIIVA,
    CONTOSCARI: riga.CONTOSCARI,
    OMIVA: riga.OMIVA,
    OMMERCE: riga.OMMERCE,
    PROVV: riga.PROVV,
    PROVV2: riga.PROVV2,
    DATACONSEG: isoToDate(riga.DATACONSEG),
    DESCRIZION: riga.DESCRIZION,
    TIPORIGAD: riga.TIPORIGAD,
    RESTOSCORP: riga.RESTOSCORP,
    RESTOSCUNI: riga.RESTOSCUNI,
    CODCAUMAG: riga.CODCAUMAG,
    ZONA: riga.ZONA,
    SETTORE: riga.SETTORE,
    GRUPPO: riga.GRUPPO,
    CLASSE: riga.CLASSE,
    RIFFROMT: riga.RIFFROMT,
    RIFFROMR: riga.RIFFROMR,
    PREZZOTOTM: riga.PREZZOTOTM,
    NOTE: truncStr(riga.NOTE || "", 254),
    COMMESSA: riga.COMMESSA,
    TIMESTAMP: isoToDate(riga.TIMESTAMP),
    USERNAME: riga.USERNAME,
    FATT: riga.FATT,
    LOTTO: riga.LOTTO,
    MATRICOLA: riga.MATRICOLA,
    EUROCAMBIO: riga.EUROCAMBIO,
    U_PESON: riga.U_PESON,
    U_PESOL: riga.U_PESOL,
    U_COLLI: riga.U_COLLI,
    U_GIA: riga.U_GIA,
    U_MAGP: riga.U_MAGP,
    U_MAGA: riga.U_MAGA,
  };
}

export function clientToDbfRecord(
  client: ArcaClientData,
): Record<string, unknown> {
  return {
    CODICE: client.codice,
    DESCRIZION: client.ragioneSociale || "",
    SUPRAGSOC: client.supplRagioneSociale || "",
    PARTIVA: client.partitaIva || "",
    CODFISCALE: client.codFiscale || "",
    FAX: client.fax || "",
    TELEX: "",
    URL: "",
    EMAIL: client.email || "",
    EMAILAMM: client.emailAmministraz || "",
    INDIRIZZO: client.indirizzo || "",
    CAP: client.cap || "",
    LOCALITA: client.localita || "",
    PROV: client.prov || "",
    TELEFONO: client.telefono || "",
    TELEFONO2: "",
    ZONA: client.zona || "",
    AGENTE: "",
    AGENTE2: "",
    SETTORE: "",
    PAG: "",
    LINGUA: "IT",
    LISTINO: "1",
    VALUTA: "EUR",
    TIMESTAMP: null,
    USERNAME: "",
  };
}

export function destToDbfRecord(
  dest: ArcaDestinazione,
): Record<string, unknown> {
  return {
    CODICECF: dest.CODICECF,
    CODICEDES: dest.CODICEDES,
    RAGIONESOC: dest.RAGIONESOC,
    SUPPRAGSOC: dest.SUPPRAGSOC,
    INDIRIZZO: dest.INDIRIZZO,
    CAP: dest.CAP,
    LOCALITA: dest.LOCALITA,
    PROVINCIA: dest.PROVINCIA,
    CODNAZIONE: dest.CODNAZIONE,
    AGENTE: dest.AGENTE,
    AGENTE2: dest.AGENTE2,
    SETTORE: dest.SETTORE,
    ZONA: dest.ZONA,
    VETTORE: dest.VETTORE,
    TELEFONO: dest.TELEFONO,
    FAX: dest.FAX,
    PERSONARIF: dest.PERSONARIF,
    TIMESTAMP: isoToDate(dest.TIMESTAMP),
    USERNAME: dest.USERNAME,
  };
}

export function parseArcaDataJson(
  arcaDataStr: string | null,
): ArcaData | null {
  if (!arcaDataStr) return null;
  try {
    return JSON.parse(arcaDataStr) as ArcaData;
  } catch {
    return null;
  }
}

export async function exportToArcaDbf(
  records: FresisHistoryRow[],
  outputDir: string,
): Promise<ExportStats> {
  fs.mkdirSync(outputDir, { recursive: true });

  const dtRecords: Record<string, unknown>[] = [];
  const drRecords: Record<string, unknown>[] = [];
  const clientMap = new Map<string, ArcaClientData>();
  const destMap = new Map<string, ArcaDestinazione>();

  let dtIdCounter = 1;
  let drIdCounter = 1;

  for (const row of records) {
    const arcaData = parseArcaDataJson(row.arca_data);
    if (!arcaData) continue;

    const assignedDtId = dtIdCounter++;
    const testata = arcaData.testata;

    dtRecords.push(testaToDbfRecord(testata, assignedDtId));

    for (const riga of arcaData.righe) {
      const assignedDrId = drIdCounter++;
      drRecords.push(rigaToDbfRecord(riga, assignedDrId, assignedDtId));
    }

    if (row.sub_client_data && !clientMap.has(testata.CODICECF)) {
      try {
        const clientData = JSON.parse(row.sub_client_data) as ArcaClientData;
        clientMap.set(testata.CODICECF, clientData);
      } catch {
        // skip invalid client data
      }
    }

    if (arcaData.destinazione_diversa) {
      const dest = arcaData.destinazione_diversa;
      const key = `${dest.CODICECF}|${dest.CODICEDES}`;
      if (!destMap.has(key)) {
        destMap.set(key, dest);
      }
    }
  }

  const dtPath = path.join(outputDir, "EXPORTDT.DBF");
  const dtFile = await DBFFile.create(dtPath, createTestataFields(), {
    fileVersion: 0x03,
  });
  if (dtRecords.length > 0) {
    await dtFile.appendRecords(dtRecords);
  }

  const drPath = path.join(outputDir, "EXPORTDR.DBF");
  const drFile = await DBFFile.create(drPath, createRigheFields(), {
    fileVersion: 0x03,
  });
  if (drRecords.length > 0) {
    await drFile.appendRecords(drRecords);
  }

  const cfRecords = [...clientMap.values()].map(clientToDbfRecord);
  const cfPath = path.join(outputDir, "EXPORTCF.DBF");
  const cfFile = await DBFFile.create(cfPath, createClientiFields(), {
    fileVersion: 0x03,
  });
  if (cfRecords.length > 0) {
    await cfFile.appendRecords(cfRecords);
  }

  if (destMap.size > 0) {
    const ddRecords = [...destMap.values()].map(destToDbfRecord);
    const ddPath = path.join(outputDir, "EXPORTDD.DBF");
    const ddFile = await DBFFile.create(ddPath, createDestinazioniFields(), {
      fileVersion: 0x03,
    });
    await ddFile.appendRecords(ddRecords);
  }

  return {
    totalDocuments: dtRecords.length,
    totalRows: drRecords.length,
    totalClients: clientMap.size,
    totalDestinations: destMap.size,
  };
}

export function createExportTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archibald-arca-export-"));
}

export function cleanupExportDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export async function streamExportAsZip(
  outputDir: string,
  destination: Writable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    destination.on("close", resolve);
    archive.pipe(destination);
    archive.directory(outputDir, false);
    archive.finalize();
  });
}
