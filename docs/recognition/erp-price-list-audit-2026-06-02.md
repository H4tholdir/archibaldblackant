# ERP Price List Audit

Data run: 2026-06-02T14:11:05.387Z  
Fine run: 2026-06-02T14:12:51.902Z  
Run ID: `2026-06-02-14-11-05-386`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- ERP URL: `https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/`
- Modalita': tutte le pagine disponibili
- Output JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-price-list-audit/2026-06-02-14-11-05-386/audit-report.json`

## Risultati

- Righe lette: 4955
- Campi DevExpress scoperti: 46
- Articoli/listino distinti per `ITEMRELATIONID`: 4950
- Codici/descrizioni distinti per `ITEMRELATIONTXT`: 4229
- Account/listini distinti per `ACCOUNTRELATIONID`: 2
- Righe con importo: 4955
- Righe con intervallo date: 4955
- Valute: EUR
- Page count osservato: 25

## Campi PRICEDISCTABLE_ListView

Grid name osservato: `Vertical_v9_52042839_LE_v9`

| Field | Visible index | Column index |
| --- | ---: | ---: |
| ID | 2 | 18 |
| ACCOUNTCODE | 3 | 0 |
| ACCOUNTRELATIONID | 4 | 2 |
| ACCOUNTRELATIONTXT | 5 | 3 |
| ITEMRELATIONID | 6 | 23 |
| ITEMRELATIONTXT | 7 | 24 |
| FROMDATE | 8 | 16 |
| TODATE | 9 | 44 |
| QUANTITYAMOUNTFROM | 10 | 38 |
| QUANTITYAMOUNTTO | 11 | 39 |
| PRICEUNIT | 12 | 37 |
| AMOUNT | 13 | 7 |
| CURRENCY | 14 | 12 |
| BRASNETPRICE | 15 | 8 |
| DATAAREAID | 16 | 13 |
| MODIFIEDBY | 17 | 30 |
| ACCOUNTRELATION | 18 | 1 |
| AGREEMENT | 19 | 4 |
| AGREEMENTHEADEREXT_RU | 20 | 5 |
| ALLOCATEMARKUP | 21 | 6 |
| CALENDARDAYS | 22 | 9 |
| CREATEDBY | 23 | 10 |
| CREATEDDATETIME | 24 | 11 |
| DELIVERYTIME | 25 | 14 |
| DISREGARDLEADTIME | 26 | 15 |
| GENERICCURRENCY | 27 | 17 |
| INVENTBAILEEFREEDAYS_RU | 28 | 19 |
| INVENTDIMID | 29 | 20 |
| ITEMCODE | 30 | 21 |
| ITEMRELATION | 31 | 22 |
| MARKUP | 32 | 25 |
| MAXIMUMRETAILPRICE_IN | 33 | 26 |
| MCRFIXEDAMOUNTCUR | 34 | 27 |
| MCRMERCHANDISINGEVENTID | 35 | 28 |
| MCRPRICEDISCGROUPTYPE | 36 | 29 |
| MODIFIEDDATETIME | 37 | 31 |
| MODULE1 | 38 | 32 |
| ORIGINALPRICEDISCADMTRANSRECID | 39 | 33 |
| PDSCALCULATIONID | 40 | 34 |
| PERCENT1 | 41 | 35 |
| PERCENT2 | 42 | 36 |
| RECID | 43 | 40 |
| RECVERSION | 44 | 41 |
| RELATION | 45 | 42 |
| SEARCHAGAIN | 46 | 43 |
| UNITID | 47 | 45 |

## Osservazioni campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
| ACCOUNTCODE | 4955 | 4955 | string | Group |
| ACCOUNTRELATION | 4955 | 4955 | number | 2 |
| AGREEMENTHEADEREXT_RU | 4955 | 4955 | number | 0 |
| ALLOCATEMARKUP | 4955 | 4955 | number | 0 |
| AMOUNT | 4955 | 4955 | number | 10.45 |
| BRASNETPRICE | 4955 | 4955 | string | No |
| CALENDARDAYS | 4955 | 4955 | number | 0 |
| CREATEDBY | 4955 | 4955 | string | Admin |
| CREATEDDATETIME | 4955 | 4955 | Date | {"__type":"Date","iso":"2026-02-13T19:37:30.957Z","epochMs":1771011450957,"text":"Fri Feb 13 2026 20:37:30 GMT+0100 (Ora standard dell’Europa centrale)"} |
| CURRENCY | 4955 | 4955 | string | EUR |
| DATAAREAID | 4955 | 4955 | string | kit |
| DELIVERYTIME | 4955 | 4955 | number | 0 |
| DISREGARDLEADTIME | 4955 | 4955 | number | 0 |
| FROMDATE | 4955 | 4955 | Date | {"__type":"Date","iso":"2022-12-08T23:00:00.000Z","epochMs":1670540400000,"text":"Fri Dec 09 2022 00:00:00 GMT+0100 (Ora standard dell’Europa centrale)"} |
| GENERICCURRENCY | 4955 | 4955 | number | 0 |
| ID | 4955 | 4955 | number | 7 |
| INVENTBAILEEFREEDAYS_RU | 4955 | 4955 | number | 0 |
| INVENTDIMID | 4955 | 4955 | string | AllBlank |
| ITEMCODE | 4955 | 4955 | string | Table |
| ITEMRELATION | 4955 | 4955 | number | 2525 |
| ITEMRELATIONID | 4955 | 4955 | string | 021752K1 |
| ITEMRELATIONTXT | 4955 | 4955 | string | 9686.204.040 |
| MARKUP | 4955 | 4955 | number | 0 |
| MAXIMUMRETAILPRICE_IN | 4955 | 4955 | number | 0 |
| MCRFIXEDAMOUNTCUR | 4955 | 4955 | number | 0 |
| MCRPRICEDISCGROUPTYPE | 4955 | 4955 | number | 0 |
| MODIFIEDBY | 4955 | 4955 | string | Admin |
| MODIFIEDDATETIME | 4955 | 4955 | Date | {"__type":"Date","iso":"2026-02-26T21:00:42.823Z","epochMs":1772139642823,"text":"Thu Feb 26 2026 22:00:42 GMT+0100 (Ora standard dell’Europa centrale)"} |
| MODULE1 | 4955 | 4955 | number | 1 |
| ORIGINALPRICEDISCADMTRANSRECID | 4955 | 4955 | number | 0 |
| PERCENT1 | 4955 | 4955 | number | 0 |
| PERCENT2 | 4955 | 4955 | number | 0 |
| PRICEUNIT | 4955 | 4955 | number | 0 |
| QUANTITYAMOUNTFROM | 4955 | 4955 | number | 1 |
| QUANTITYAMOUNTTO | 4955 | 4955 | number | 100000000 |
| RECID | 4955 | 4955 | number | 5638620703 |
| RECVERSION | 4955 | 4955 | number | 1 |
| RELATION | 4955 | 4955 | number | 4 |
| SEARCHAGAIN | 4955 | 4955 | number | 0 |
| TODATE | 4955 | 4955 | Date | {"__type":"Date","iso":"2154-12-30T23:00:00.000Z","epochMs":5837958000000,"text":"Tue Dec 31 2154 00:00:00 GMT+0100 (Ora standard dell’Europa centrale)"} |
| UNITID | 4955 | 4953 | string | 001 |
| ACCOUNTRELATIONID | 4955 | 4952 | string | 002 |
| ACCOUNTRELATIONTXT | 4955 | 4952 | string | DETTAGLIO (consigliato) |
| AGREEMENT | 4955 | 0 | string |  |
| MCRMERCHANDISINGEVENTID | 4955 | 0 | string |  |
| PDSCALCULATIONID | 4955 | 0 | string |  |

## Esempi record

| ID | Item selection | Item description | Account | Account description | Amount | Currency | Qty range |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| 7 | 021752K1 | 9686.204.040 | 002 | DETTAGLIO (consigliato) | 10.45 | EUR | 1-100000000 |
| 31 | 001077K1 | H33LSOS.320.016 | 002 | DETTAGLIO (consigliato) | 15.42 | EUR | 1-100000000 |
| 32 | 001116K2 | H2.104.012 | 002 | DETTAGLIO (consigliato) | 7.45 | EUR | 1-100000000 |
| 33 | 001353K3 | H246.204.009 | 002 | DETTAGLIO (consigliato) | 17.67 | EUR | 1-100000000 |
| 34 | 002139K3 | 38.104.006 | 002 | DETTAGLIO (consigliato) | 2.64 | EUR | 1-100000000 |
| 35 | 002140K3 | 38.104.007 | 002 | DETTAGLIO (consigliato) | 2.64 | EUR | 1-100000000 |
| 36 | 004108K3 | 383.314.012 | 002 | DETTAGLIO (consigliato) | 25.85 | EUR | 1-100000000 |
| 37 | 004109K3 | 383.314.014 | 002 | DETTAGLIO (consigliato) | 25.85 | EUR | 1-100000000 |
| 38 | 004499KK | KK859.314.010 | 002 | DETTAGLIO (consigliato) | 15.78 | EUR | 1-100000000 |
| 39 | 005331K2 | 7801.104.023 | 002 | DETTAGLIO (consigliato) | 86.54 | EUR | 1-100000000 |
| 40 | 005357K0 | 76881.104.029 | 002 | DETTAGLIO (consigliato) | 96.53 | EUR | 1-100000000 |
| 41 | 006534K1 | H79.104.050 | 002 | DETTAGLIO (consigliato) | 56.67 | EUR | 1-100000000 |
| 42 | 007141R1 | 17131.654.040 | 002 | DETTAGLIO (consigliato) | 4.17 | EUR | 1-100000000 |
| 43 | 007251R1 | 17331.654.040 | 002 | DETTAGLIO (consigliato) | 4.17 | EUR | 1-100000000 |
| 44 | 007252R1 | 17331.654.045 | 002 | DETTAGLIO (consigliato) | 5.55 | EUR | 1-100000000 |
| 45 | 007253R1 | 17331.654.050 | 002 | DETTAGLIO (consigliato) | 5.55 | EUR | 1-100000000 |
| 46 | 007328R1 | 17425.654.070 | 002 | DETTAGLIO (consigliato) | 5.55 | EUR | 1-100000000 |
| 47 | 007367R1 | 17431.654. S1 | 002 | DETTAGLIO (consigliato) | 25.01 | EUR | 1-100000000 |
| 48 | 007480K0 | X601.204.420 | 002 | DETTAGLIO (consigliato) | 7.29 | EUR | 1-100000000 |
| 49 | 007481K0 | X601.314.420 | 002 | DETTAGLIO (consigliato) | 7.29 | EUR | 1-100000000 |

## Decisione suggerita

`PRICEDISCTABLE_ListView` va acquisita nello staging raw insieme agli articoli. E' la fonte ERP per prezzo/listino/account/scaglioni, quindi serve a distinguere articolo riconosciuto da articolo realmente proponibile/ordinabile.
