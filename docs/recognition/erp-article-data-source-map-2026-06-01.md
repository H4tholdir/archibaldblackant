# ERP Article Data Source Map

Data run: 2026-06-01T10:46:44.109Z  
Fine run: 2026-06-01T10:49:09.719Z  
Run ID: `2026-06-01-10-46-44-109`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Fonti ispezionate

- Articoli ListView: `https://4.231.124.90/Archibald/INVENTTABLE_ListView/`
- Articolo DetailView esempio: `https://4.231.124.90/Archibald/INVENTTABLE_DetailView/1114/?mode=View`
- Price lists ListView: `https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/`
- Price list DetailView esempio: `https://4.231.124.90/Archibald/PRICEDISCTABLE_DetailView/7/?mode=View`
- Report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-article-data-source-audit/2026-06-01-10-46-44-109/audit-report.json`

## Sintesi

| Fonte | Campi/etichette | Righe campione | Note |
| --- | ---: | ---: | --- |
| INVENTTABLE_ListView | 36 | 4 | Articoli, codici, gruppo, figura, gambo, misura, immagine |
| INVENTTABLE_DetailView | 23 | 1 | Dettaglio leggibile con sezioni General, Qty, Systemfields |
| PRICEDISCTABLE_ListView | 46 | 4 | Prezzi/listini/sconti per articolo/account/date/scaglioni |
| PRICEDISCTABLE_DetailView | 41 | 1 | Dettaglio prezzo con relazione articolo/account e valori estesi |

## INVENTTABLE_ListView - campi DevExpress

Grid name: `Vertical_v8_45820815_LE_v8`  
Page count osservato: 3  
Visible rows: 200

| Field | Visible index | Column index |
| --- | ---: | ---: |
| ITEMID | 2 | 17 |
| NAME | 3 | 23 |
| DESCRIPTION | 4 | 11 |
| PRODUCTGROUPID.ID | 5 | 26 |
| ImageCalc | 6 | 16 |
| BRASPACKINGCONTENTS | 7 | 3 |
| SEARCHNAME | 8 | 30 |
| PRICEUNIT | 9 | 25 |
| PRODUCTGROUPID.PRODUCTGROUPID | 10 | 28 |
| PRODUCTGROUPID.PRODUCTGROUP1 | 11 | 27 |
| LOWESTQTY | 12 | 19 |
| MULTIPLEQTY | 13 | 22 |
| BRASFIGURE | 14 | 0 |
| HIGHESTQTY | 15 | 14 |
| DATAAREAID | 16 | 9 |
| ID | 17 | 15 |
| MODIFIEDDATETIME | 18 | 21 |
| STOPPED | 19 | 33 |
| BRASITEMIDBULK | 20 | 1 |
| BRASPACKAGEEXPERTS | 21 | 2 |
| BRASSHANK | 22 | 4 |
| BRASSIZE | 23 | 5 |
| CONFIGID | 24 | 6 |
| CREATEDBY | 25 | 7 |
| CREATEDDATETIME | 26 | 8 |
| DEFAULTSALESQTY | 27 | 10 |
| DISPLAYPRODUCTNUMBER | 28 | 12 |
| ENDDISC | 29 | 13 |
| LINEDISC.ID | 30 | 18 |
| MODIFIEDBY | 31 | 20 |
| ORDERITEM | 32 | 24 |
| PURCHPRICEPCS | 33 | 29 |
| STANDARDCONFIGID | 34 | 31 |
| STANDARDQTY | 35 | 32 |
| UNITID | 36 | 35 |
| TAXITEMGROUPID | 37 | 34 |

## INVENTTABLE_ListView - campi non vuoti nel campione

| Field | Osservati | Non vuoti | Primo esempio |
| --- | ---: | ---: | --- |
| BRASFIGURE | 4 | 3 | 10839 |
| BRASITEMIDBULK | 4 | 4 | 10019199 |
| BRASPACKAGEEXPERTS | 4 | 4 | E1 |
| BRASPACKINGCONTENTS | 4 | 4 | 1 |
| BRASSHANK | 4 | 3 | 314 |
| BRASSIZE | 4 | 3 | 016 |
| CONFIGID | 4 | 4 | v.002 |
| CREATEDBY | 4 | 4 | Admin |
| CREATEDDATETIME | 4 | 4 | {"__type":"Date","iso":"2026-02-13T19:35:47.390Z","epochMs":1771011347390,"text":"Fri Feb 13 2026 20:35:47 GMT+0100 (Ora standard dell’Europa centrale)"} |
| DATAAREAID | 4 | 4 | kit |
| DEFAULTSALESQTY | 4 | 4 | 0 |
| DESCRIPTION | 4 | 4 | ENGO Contra angle CA161 |
| DISPLAYPRODUCTNUMBER | 4 | 4 | 10019199 : v.002 :   :   : |
| ENDDISC | 4 | 4 | 0 |
| HIGHESTQTY | 4 | 4 | 100 |
| ID | 4 | 4 | 4692 |
| ImageCalc | 4 | 3 | {"__type":"image_bytes","byteLength":6387,"signature":[137,80,78,71,13,10,26,10,0,0,0,13]} |
| ITEMID | 4 | 4 | 10019199 |
| LINEDISC.ID | 4 | 4 | 131 |
| LOWESTQTY | 4 | 4 | 1 |
| MODIFIEDBY | 4 | 4 | Admin |
| MODIFIEDDATETIME | 4 | 4 | {"__type":"Date","iso":"2026-02-25T14:00:54.700Z","epochMs":1772028054700,"text":"Wed Feb 25 2026 15:00:54 GMT+0100 (Ora standard dell’Europa centrale)"} |
| MULTIPLEQTY | 4 | 4 | 1 |
| NAME | 4 | 4 | ENGO02.000 |
| ORDERITEM | 4 | 4 | true |
| PRICEUNIT | 4 | 4 | 0 |
| PRODUCTGROUPID.ID | 4 | 4 | 69 |
| PRODUCTGROUPID.PRODUCTGROUP1 | 4 | 4 | STRUMENTI ENDO |
| PRODUCTGROUPID.PRODUCTGROUPID | 4 | 4 | 11660 |
| PURCHPRICEPCS | 4 | 4 | 214.2 |
| SEARCHNAME | 4 | 4 | ENGO02.000 |
| STANDARDCONFIGID | 4 | 4 | v.002 |
| STANDARDQTY | 4 | 4 | 0 |
| STOPPED | 4 | 4 | No |
| TAXITEMGROUPID | 4 | 4 | 5 |
| UNITID | 4 | 4 | 001 |

## INVENTTABLE_DetailView - etichette e valori esempio

| Etichetta | Valore |
| --- | --- |
| ID | 1.114 |
| ITEM-ID | 005157K2 |
| SEARCH NAME | 10839.314.012 |
| ITEM NAME | 10839.314.012 |
| DESCRIPTION | DIA gr M, rifinitura margine coronale, spigoli arrotondati |
| PRODUCT GROUP | 11311 |
| NAME | FRESE DIA - GRANA MEDIA |
| FIGURE | 10839 |
| SIZE | 012 |
| SHANK | 314 |
| BLOCKED | No |
| LOWEST QTY | 5,00 |
| MULITPLE QTY | 5,00 |
| HIGHEST QUANTITY | 500,00 |
| STANDARD QTY | 0,00 |
| PACKING CONTENT | 5 |
| PRICE UNIT | 1,00 |
| IMAGE | Systemfields |
| CREATED DATETIME | 13/02/2026 20:35:47 |
| CREATED BY | Admin |
| MODIFIED DATETIME | 25/02/2026 15:00:54 |
| MODIFIED BY | Admin |
| DESCRIPTION | KI di gestione intelligente degli ordini |

## PRICEDISCTABLE_ListView - campi DevExpress

Grid name: `Vertical_v9_67101062_LE_v9`  
Page count osservato: 25  
Visible rows: 200

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

## PRICEDISCTABLE_ListView - campi non vuoti nel campione

| Field | Osservati | Non vuoti | Primo esempio |
| --- | ---: | ---: | --- |
| ACCOUNTCODE | 4 | 4 | Group |
| ACCOUNTRELATION | 4 | 4 | 2 |
| ACCOUNTRELATIONID | 4 | 4 | 002 |
| ACCOUNTRELATIONTXT | 4 | 4 | DETTAGLIO (consigliato) |
| AGREEMENT | 4 | 0 |  |
| AGREEMENTHEADEREXT_RU | 4 | 4 | 0 |
| ALLOCATEMARKUP | 4 | 4 | 0 |
| AMOUNT | 4 | 4 | 10.45 |
| BRASNETPRICE | 4 | 4 | No |
| CALENDARDAYS | 4 | 4 | 0 |
| CREATEDBY | 4 | 4 | Admin |
| CREATEDDATETIME | 4 | 4 | {"__type":"Date","iso":"2026-02-13T19:37:30.957Z","epochMs":1771011450957,"text":"Fri Feb 13 2026 20:37:30 GMT+0100 (Ora standard dell’Europa centrale)"} |
| CURRENCY | 4 | 4 | EUR |
| DATAAREAID | 4 | 4 | kit |
| DELIVERYTIME | 4 | 4 | 0 |
| DISREGARDLEADTIME | 4 | 4 | 0 |
| FROMDATE | 4 | 4 | {"__type":"Date","iso":"2022-12-08T23:00:00.000Z","epochMs":1670540400000,"text":"Fri Dec 09 2022 00:00:00 GMT+0100 (Ora standard dell’Europa centrale)"} |
| GENERICCURRENCY | 4 | 4 | 0 |
| ID | 4 | 4 | 7 |
| INVENTBAILEEFREEDAYS_RU | 4 | 4 | 0 |
| INVENTDIMID | 4 | 4 | AllBlank |
| ITEMCODE | 4 | 4 | Table |
| ITEMRELATION | 4 | 4 | 2525 |
| ITEMRELATIONID | 4 | 4 | 021752K1 |
| ITEMRELATIONTXT | 4 | 4 | 9686.204.040 |
| MARKUP | 4 | 4 | 0 |
| MAXIMUMRETAILPRICE_IN | 4 | 4 | 0 |
| MCRFIXEDAMOUNTCUR | 4 | 4 | 0 |
| MCRMERCHANDISINGEVENTID | 4 | 0 |  |
| MCRPRICEDISCGROUPTYPE | 4 | 4 | 0 |
| MODIFIEDBY | 4 | 4 | Admin |
| MODIFIEDDATETIME | 4 | 4 | {"__type":"Date","iso":"2026-02-26T21:00:42.823Z","epochMs":1772139642823,"text":"Thu Feb 26 2026 22:00:42 GMT+0100 (Ora standard dell’Europa centrale)"} |
| MODULE1 | 4 | 4 | 1 |
| ORIGINALPRICEDISCADMTRANSRECID | 4 | 4 | 0 |
| PDSCALCULATIONID | 4 | 0 |  |
| PERCENT1 | 4 | 4 | 0 |
| PERCENT2 | 4 | 4 | 0 |
| PRICEUNIT | 4 | 4 | 0 |
| QUANTITYAMOUNTFROM | 4 | 4 | 1 |
| QUANTITYAMOUNTTO | 4 | 4 | 100000000 |
| RECID | 4 | 4 | 5638620703 |
| RECVERSION | 4 | 4 | 1 |
| RELATION | 4 | 4 | 4 |
| SEARCHAGAIN | 4 | 4 | 0 |
| TODATE | 4 | 4 | {"__type":"Date","iso":"2154-12-30T23:00:00.000Z","epochMs":5837958000000,"text":"Tue Dec 31 2154 00:00:00 GMT+0100 (Ora standard dell’Europa centrale)"} |
| UNITID | 4 | 4 | 001 |

## PRICEDISCTABLE_DetailView - etichette e valori esempio

| Etichetta | Valore |
| --- | --- |
| ID | 7 |
| CODICE ARTICOLO | Table |
| CODICE CONTO | Group |
| RELAZIONE ARTICOLO | 2.525 |
| RELAZIONE CON L'ACCOUNT | 2 |
| QUANTITÀIMPORTODA | 1 |
| DA DATA | 09/12/2022 |
| DATA | 31/12/2154 |
| IMPORTO UNITARIO | 10,45 € |
| VALUTA | EUR |
| PERCENTUALE1 | 0 |
| PERCENTUALE2 | 0 |
| TEMPI DI CONSEGNA | 0 |
| CERCA DI NUOVO | 0 |
| UNITÀ DI PREZZO | 0 |
| RELAZIONE | 4 |
| QUANTITÀIMPORTO | 100.000.000 |
| UNITO | 001 |
| VALORE DI MARKUP | 0 |
| MARKUP | 0 |
| MODULO1 | 1 |
| INVENTARE DIM ID | AllBlank |
| GIORNI DI CALENDARIO | 0 |
| VALUTA GENERICA | 0 |
| MCRPRICEDISCGROUPTYPE | 0 |
| MCRFIXEDAMOUNTCUR | 0 |
| TESTO DELL'INTESTAZIONE DELL'ACCORDO | 0 |
| IGNORARELEADTIME | 0 |
| INVENTBAILEEFREEDAYS_RU | 0 |
| MAXI PREZZO AL DETTAGLIO IN | 0 |
| ORIGINALPRICEDISCADMTRANSRECID | 0 |
| PREZZO NETTO BRASSELER | No |
| CITTÀ DI FATTURAZIONE | 26/02/2026 22:00:42 |
| MODIFICATO DA | Admin |
| DATA DI CREAZIONE | 13/02/2026 20:37:30 |
| CREATO DA | Admin |
| DATAAREAID | kit |
| ITEM SELECTION | 021752K1 |
| ACCOUNT | 002 |
| ITEM DESCRIPTION | 9686.204.040 |
| DESCRIZIONE ACCOUNT | DETTAGLIO (consigliato) |

## Decisione operativa

Non consideriamo ancora completa la mappa ERP articolo finche' non avremo fatto un audit sistematico dei DetailView su un campione piu' ampio. La ListView e' efficiente per acquisizione massiva; il DetailView va usato come arricchimento mirato quando mostra campi non presenti o piu' leggibili.

Prossimo passo consigliato: estendere lo staging per salvare anche record raw da `PRICEDISCTABLE_ListView` e snapshot raw dei DetailView articolo/prezzo collegati tramite `ID`, `ITEMID`, `ITEMRELATIONID` e `ITEMRELATIONTXT`.
