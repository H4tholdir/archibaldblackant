# ERP DetailView Audit

Data run: 2026-06-02T14:22:38.325Z  
Fine run: 2026-06-02T14:23:35.124Z  
Run ID: `2026-06-02-14-22-38-325`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Fonti

- Product report: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json`
- Price report: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-price-list-audit/2026-06-02-14-11-05-386/audit-report.json`
- Report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-detail-view-audit/2026-06-02-14-22-38-325/audit-report.json`

## Sintesi

| Tipo DetailView | Record letti | Record con immagini prodotto | Record con asset immagine UI/prodotto | Etichette distinte |
| --- | ---: | ---: | ---: | ---: |
| INVENTTABLE_DetailView | 20 | 20 | 20 | 22 |
| PRICEDISCTABLE_DetailView | 20 | 0 | 20 | 41 |

## INVENTTABLE_DetailView - campione record

| Detail ID | ERP item | Codice articolo | Coppie label/value | Immagini prodotto | Asset immagine totali | Input |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 1114 | 005157K2 | 10839.314.012 | 23 | 1 | 8 | 1 |
| 1630 | 012596K3 | 390.314.016 | 23 | 1 | 8 | 1 |
| 1911 | 015348K2 | 368UF.314.016 | 23 | 1 | 8 | 1 |
| 1901 | 015281K3 | 830LEF.314.012 | 23 | 1 | 8 | 1 |
| 3112 | 035617K3 | H129NEF.104.023 | 23 | 1 | 8 | 1 |
| 2590 | 023009K3 | H137E.104.023 | 23 | 1 | 8 | 1 |
| 2 | 000085K3 | H1.314.006S | 23 | 1 | 8 | 1 |
| 886 | 004768K3 | 6368.314.023 | 23 | 1 | 8 | 1 |
| 907 | 004797K2 | 6806.314.012 | 23 | 1 | 8 | 1 |
| 1400 | 007455K3 | H206.123.010 | 23 | 1 | 8 | 1 |
| 2432 | 020214K2 | H33XLQ.103.012 | 23 | 1 | 8 | 1 |
| 94 | 000584K3 | H135.314.014 | 23 | 1 | 8 | 1 |
| 1922 | 015456K3 | H247UF.314.007 | 23 | 1 | 8 | 1 |
| 1641 | 012640K0 | H141.104.040 | 23 | 1 | 8 | 1 |
| 175 | 001081K2 | H1.104.008 | 23 | 1 | 8 | 1 |
| 237 | 001169K2 | H21.104.010 | 23 | 1 | 8 | 1 |
| 4647 | 10017539 | KP6801.314.018 | 23 | 1 | 8 | 1 |
| 4496 | 10008615 | KP6847KR.314.014 | 23 | 1 | 8 | 1 |
| 3119 | 035637K2 | ZR373M.314.025 | 23 | 1 | 8 | 1 |
| 3600 | 042187K2 | ZR6850.314.016 | 23 | 1 | 8 | 1 |

## INVENTTABLE_DetailView - etichette osservate

| Etichetta | Presenze | Primo esempio |
| --- | ---: | --- |
| DESCRIPTION | 40 | DIA gr M, rifinitura margine coronale, spigoli arrotondati |
| BLOCKED | 20 | No Order item Qty |
| CREATED BY | 20 | Admin |
| CREATED DATETIME | 20 | 13/02/2026 20:35:47 |
| FIGURE | 20 | 10839 |
| HIGHEST QUANTITY | 20 | 500,00 |
| ID | 20 | 1.114 |
| IMAGE | 20 | Systemfields |
| ITEM NAME | 20 | 10839.314.012 |
| ITEM-ID | 20 | 005157K2 |
| LOWEST QTY | 20 | 5,00 |
| MODIFIED BY | 20 | Admin |
| MODIFIED DATETIME | 20 | 25/02/2026 15:00:54 |
| MULITPLE QTY | 20 | 5,00 |
| NAME | 20 | FRESE DIA - GRANA MEDIA |
| PACKING CONTENT | 20 | 5 |
| PRICE UNIT | 20 | 1,00 |
| PRODUCT GROUP | 20 | 11311 |
| SEARCH NAME | 20 | 10839.314.012 |
| SHANK | 20 | 314 |
| SIZE | 20 | 012 |
| STANDARD QTY | 20 | 0,00 |

## PRICEDISCTABLE_DetailView - campione record

| Detail ID | ERP item | Codice articolo | Coppie label/value | Immagini prodotto | Asset immagine totali | Input |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 7 | 021752K1 | 9686.204.040 | 41 | 0 | 6 | 0 |
| 1492 | 001126K2 | H2.204.010 | 41 | 0 | 6 | 0 |
| 1752 | 002933K0 | 108.104.060 | 41 | 0 | 6 | 0 |
| 2015 | 004495K2 | 858.314.014 | 41 | 0 | 6 | 0 |
| 2276 | 004995K2 | 877K.314.016 | 41 | 0 | 6 | 0 |
| 2537 | 007459K0 | H210.103.007 | 41 | 0 | 6 | 0 |
| 2797 | 013077K1 | H73E.104.040 | 41 | 0 | 6 | 0 |
| 3058 | 015684K0 | H356RS.123.023 | 41 | 0 | 6 | 0 |
| 3319 | 018264K1 | 2811.314.033 | 41 | 0 | 6 | 0 |
| 3580 | 021893K2 | H261GSQ.104.023 | 41 | 0 | 6 | 0 |
| 3844 | 032230K3 | 801M.314.010 | 41 | 0 | 6 | 0 |
| 6873 | 050376K0 | 4676.104. | 41 | 0 | 6 | 0 |
| 8246 | 035438K2 | 8860.104.009 | 41 | 0 | 6 | 0 |
| 8507 | 039222K1 | 94002M.104.170 | 41 | 0 | 6 | 0 |
| 8767 | 044053K1 | H79NEX.104.040 | 41 | 0 | 6 | 0 |
| 9028 | 051898K0 | 94019F.104.200 | 41 | 0 | 6 | 0 |
| 9289 | 10029181 | 95006F.104.055 | 41 | 0 | 6 | 0 |
| 9903 | 047118K0 | 4648.000. | 41 | 0 | 6 | 0 |
| 10384 | 10009979 | EP0148.000.000 | 41 | 0 | 6 | 0 |
| 10797 | 10030741 | SFPA66.000.020 | 41 | 0 | 6 | 0 |

## PRICEDISCTABLE_DetailView - etichette osservate

| Etichetta | Presenze | Primo esempio |
| --- | ---: | --- |
| ACCOUNT | 20 | 002 |
| CERCA DI NUOVO | 20 | 0 |
| CITTÀ DI FATTURAZIONE | 20 | 26/02/2026 22:00:42 |
| CODICE ARTICOLO | 20 | Table |
| CODICE CONTO | 20 | Group |
| CREATO DA | 20 | Admin |
| DA DATA | 20 | 09/12/2022 |
| DATA | 20 | 31/12/2154 |
| DATA DI CREAZIONE | 20 | 13/02/2026 20:37:30 |
| DATAAREAID | 20 | kit |
| DESCRIZIONE ACCOUNT | 20 | DETTAGLIO (consigliato) KI di gestione intelligente degli ordini Version 2.0.48 |
| GIORNI DI CALENDARIO | 20 | 0 |
| ID | 20 | 7 |
| IGNORARELEADTIME | 20 | 0 |
| IMPORTO UNITARIO | 20 | 10,45 € |
| INVENTARE DIM ID | 20 | AllBlank |
| INVENTBAILEEFREEDAYS_RU | 20 | 0 |
| ITEM DESCRIPTION | 20 | 9686.204.040 |
| ITEM SELECTION | 20 | 021752K1 |
| MARKUP | 20 | 0 |
| MAXI PREZZO AL DETTAGLIO IN | 20 | 0 |
| MCRFIXEDAMOUNTCUR | 20 | 0 |
| MCRPRICEDISCGROUPTYPE | 20 | 0 |
| MODIFICATO DA | 20 | Admin |
| MODULO1 | 20 | 1 |
| ORIGINALPRICEDISCADMTRANSRECID | 20 | 0 |
| PERCENTUALE1 | 20 | 0 |
| PERCENTUALE2 | 20 | 0 |
| PREZZO NETTO BRASSELER | 20 | No |
| QUANTITÀIMPORTO | 20 | 100.000.000 |
| QUANTITÀIMPORTODA | 20 | 1 |
| RELAZIONE | 20 | 4 |
| RELAZIONE ARTICOLO | 20 | 2.525 |
| RELAZIONE CON L'ACCOUNT | 20 | 2 |
| TEMPI DI CONSEGNA | 20 | 0 |
| TESTO DELL'INTESTAZIONE DELL'ACCORDO | 20 | 0 |
| UNITÀ DI PREZZO | 20 | 0 |
| UNITO | 20 | 001 |
| VALORE DI MARKUP | 20 | 0 |
| VALUTA | 20 | EUR |
| VALUTA GENERICA | 20 | 0 |

## Lettura operativa

Il report JSON conserva anche testo completo pagina, input non hidden, asset immagine e link Detail/ListView. Questo audit serve a decidere se conviene fare un crawl completo dei DetailView oppure se la ListView e' sufficiente e i DetailView vanno usati solo come verifica/arricchimento.
