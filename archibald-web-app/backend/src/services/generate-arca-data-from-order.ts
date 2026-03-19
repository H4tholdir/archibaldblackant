import type { ArcaData, ArcaRiga, ArcaTestata } from '../arca-data-types';
import type { Subclient } from '../db/repositories/subclients';
import { round2, formatArcaDate } from './generate-arca-data';

type OrderForKt = {
  id: string;
  creationDate: string;
  customerName: string;
  discountPercent: number | null;
  notes: string | null;
};

type OrderArticleForKt = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineAmount: number;
  unit: string;
};

function generateArcaDataFromOrder(
  order: OrderForKt,
  articles: OrderArticleForKt[],
  subclient: Subclient,
  docNumber: number,
  esercizio: string,
  tipodoc: 'FT' | 'KT' = 'KT',
): ArcaData {
  const datadoc = formatArcaDate(order.creationDate);
  const numerodoc = String(docNumber);
  const codicecf = subclient.codice;
  const zona = subclient.zona ?? '0';
  const pag = subclient.pag || '0001';
  const listino = subclient.listino || '1';

  const righe: ArcaRiga[] = articles.map((art, idx) => ({
    ID: 0,
    ID_TESTA: 0,
    ESERCIZIO: esercizio,
    TIPODOC: tipodoc,
    NUMERODOC: numerodoc,
    DATADOC: datadoc,
    CODICECF: codicecf,
    MAGPARTENZ: '00001',
    MAGARRIVO: '00001',
    AGENTE: '',
    AGENTE2: '',
    VALUTA: 'EUR',
    CAMBIO: 1,
    CODICEARTI: art.articleCode,
    NUMERORIGA: idx + 1,
    ESPLDISTIN: '',
    UNMISURA: art.unit || 'PZ',
    QUANTITA: art.quantity,
    QUANTITARE: art.quantity,
    SCONTI: art.discountPercent > 0 ? String(art.discountPercent) : '',
    PREZZOUN: art.unitPrice,
    PREZZOTOT: art.lineAmount,
    ALIIVA: String(art.vatPercent),
    CONTOSCARI: '01',
    OMIVA: false,
    OMMERCE: false,
    PROVV: '',
    PROVV2: '',
    DATACONSEG: datadoc,
    DESCRIZION: art.articleDescription,
    TIPORIGAD: '',
    RESTOSCORP: 0,
    RESTOSCUNI: 0,
    CODCAUMAG: '99',
    ZONA: zona,
    SETTORE: '',
    GRUPPO: '00001',
    CLASSE: '',
    RIFFROMT: 0,
    RIFFROMR: 0,
    PREZZOTOTM: art.lineAmount,
    NOTE: '',
    COMMESSA: '',
    TIMESTAMP: null,
    USERNAME: '',
    FATT: 1,
    LOTTO: '',
    MATRICOLA: '',
    EUROCAMBIO: 1,
    U_PESON: 0,
    U_PESOL: 0,
    U_COLLI: 0,
    U_GIA: 0,
    U_MAGP: '',
    U_MAGA: '',
  }));

  const totMerce = round2(
    articles.reduce((sum, a) => sum + a.quantity * a.unitPrice, 0),
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

  const scontiStr = order.discountPercent != null ? String(order.discountPercent) : '';
  const scontiF = order.discountPercent != null
    ? (100 - order.discountPercent) / 100
    : 1;

  const testata: ArcaTestata = {
    ID: 0,
    ESERCIZIO: esercizio,
    ESANNO: esercizio,
    TIPODOC: tipodoc,
    NUMERODOC: numerodoc,
    DATADOC: datadoc,
    CODICECF: codicecf,
    CODCNT: '001',
    MAGPARTENZ: '00001',
    MAGARRIVO: '00001',
    NUMRIGHEPR: righe.length,
    AGENTE: '',
    AGENTE2: '',
    VALUTA: 'EUR',
    PAG: pag,
    SCONTI: scontiStr,
    SCONTIF: scontiF,
    SCONTOCASS: '',
    SCONTOCASF: 1,
    PROVV: '',
    PROVV2: '',
    CAMBIO: 1,
    DATADOCFOR: null,
    NUMERODOCF: '',
    TIPOMODULO: 'F',
    LISTINO: listino,
    ZONA: zona,
    SETTORE: '',
    DESTDIV: '',
    DATACONSEG: datadoc,
    TRDATA: null,
    TRORA: '',
    PESOLORDO: 0,
    PESONETTO: 0,
    VOLUME: 0,
    VETTORE1: '',
    V1DATA: null,
    V1ORA: '',
    VETTORE2: '',
    V2DATA: null,
    V2ORA: '',
    TRCAUSALE: '',
    COLLI: '',
    SPEDIZIONE: '',
    PORTO: '',
    NOTE: order.notes ?? '',
    SPESETR: 0,
    SPESETRIVA: '22',
    SPESETRCP: '19',
    SPESETRPER: '',
    SPESEIM: 0,
    SPESEIMIVA: '22',
    SPESEIMCP: '29',
    SPESEVA: 0,
    SPESEVAIVA: '22',
    SPESEVACP: '29',
    ACCONTO: 0,
    ABBUONO: 0,
    TOTIMP: totNetto,
    TOTDOC: totDoc,
    SPESE: '',
    SPESEBOLLI: 0,
    SPESEINCAS: 0,
    SPESEINEFF: 0,
    SPESEINDOC: 0,
    SPESEINIVA: '',
    SPESEINCP: '',
    SPESEESENZ: 0,
    CODCAUMAG: '99',
    CODBANCA: '1',
    PERCPROVV: 0,
    IMPPROVV: 0,
    TOTPROVV: 0,
    PERCPROVV2: 0,
    IMPPROVV2: 0,
    TOTPROVV2: 0,
    TOTIVA: totIva,
    ASPBENI: '',
    SCORPORO: false,
    TOTMERCE: totMerce,
    TOTSCONTO: totSconto,
    TOTNETTO: totNetto,
    TOTESEN: 0,
    IMPCOND: 0,
    RITCOND: 0,
    TIPOFATT: 'N',
    TRIANGOLAZ: false,
    NOMODIFICA: false,
    NOEVASIONE: false,
    COMMESSA: '',
    EUROCAMBIO: 1,
    EXPORT_I: false,
    CB_BIC: '',
    CB_NAZIONE: 'IT',
    CB_CIN_UE: '',
    CB_CIN_IT: '',
    ABICAB: '',
    CONTOCORR: '',
    CARICATORE: '',
    COMMITTENT: '',
    PROPRMERCE: '',
    LUOGOCAR: '',
    LUOGOSCAR: '',
    SDTALTRO: '',
    TIMESTAMP: null,
    USERNAME: '',
  };

  return { testata, righe };
}

export {
  generateArcaDataFromOrder,
  type OrderForKt,
  type OrderArticleForKt,
};
