# ERP Product List Audit

Data run: 2026-06-02T16:49:32.516Z  
Fine run: 2026-06-02T16:51:06.591Z  
Run ID: `2026-06-02-16-49-32-516`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- Fonte: `INVENTTABLE_ListView`
- Modalita': tutte le pagine
- Campo immagini incluso: no
- Report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-list-audit/2026-06-02-16-49-32-516/audit-report.json`

## Risultati

- Righe lette: 4523
- ERP item distinti: 4523
- Codici articolo distinti: 3922
- Gruppi prodotto distinti: 73
- Righe con figura: 4495
- Righe con gambo: 4493
- Righe con misura: 4111
- FieldName DevExpress letti: 35
- Campo `ImageCalc` disponibile in griglia: si

## Campi DevExpress

Grid name osservato: `Vertical_v8_36142942_LE_v8`

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

## Copertura campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
| BRASPACKINGCONTENTS | 4523 | 4523 | number | 1 |
| CREATEDBY | 4523 | 4523 | string | Admin |
| CREATEDDATETIME | 4523 | 4523 | Date | {"__type":"Date","iso":"2026-02-13T19:35:47.390Z","epochMs":1771011347390,"text":"Fri Feb 13 2026 20:35:47 GMT+0100 (Ora standard dell’Europa centrale)"} |
| DATAAREAID | 4523 | 4523 | string | kit |
| DEFAULTSALESQTY | 4523 | 4523 | number | 0 |
| DESCRIPTION | 4523 | 4523 | string | ENGO Handpiece EU + UK |
| DISPLAYPRODUCTNUMBER | 4523 | 4523 | string | 10019197 : v.001 :   :   : |
| ENDDISC | 4523 | 4523 | number | 0 |
| HIGHESTQTY | 4523 | 4523 | number | 100 |
| ID | 4523 | 4523 | number | 4691 |
| ITEMID | 4523 | 4523 | string | 10019197 |
| LINEDISC.ID | 4523 | 4523 | number | 131 |
| LOWESTQTY | 4523 | 4523 | number | 1 |
| MODIFIEDBY | 4523 | 4523 | string | Admin |
| MODIFIEDDATETIME | 4523 | 4523 | Date | {"__type":"Date","iso":"2026-02-25T14:00:54.700Z","epochMs":1772028054700,"text":"Wed Feb 25 2026 15:00:54 GMT+0100 (Ora standard dell’Europa centrale)"} |
| MULTIPLEQTY | 4523 | 4523 | number | 1 |
| NAME | 4523 | 4523 | string | ENGO01.000 |
| ORDERITEM | 4523 | 4523 | boolean | true |
| PRICEUNIT | 4523 | 4523 | number | 0 |
| PRODUCTGROUPID.ID | 4523 | 4523 | number | 69 |
| PRODUCTGROUPID.PRODUCTGROUP1 | 4523 | 4523 | string | STRUMENTI ENDO |
| PRODUCTGROUPID.PRODUCTGROUPID | 4523 | 4523 | string | 11660 |
| PURCHPRICEPCS | 4523 | 4523 | number | 499.8 |
| SEARCHNAME | 4523 | 4523 | string | ENGO01.000 |
| STANDARDQTY | 4523 | 4523 | number | 0 |
| STOPPED | 4523 | 4523 | string | No |
| TAXITEMGROUPID | 4523 | 4523 | number | 5 |
| UNITID | 4523 | 4523 | string | 001 |
| BRASITEMIDBULK | 4523 | 4499 | string | 10019197 |
| BRASFIGURE | 4523 | 4495 | string | 1 |
| BRASSHANK | 4523 | 4493 | string | 104 |
| CONFIGID | 4523 | 4481 | string | v.001 |
| STANDARDCONFIGID | 4523 | 4481 | string | v.001 |
| BRASPACKAGEEXPERTS | 4523 | 4480 | string | K0 |
| BRASSIZE | 4523 | 4111 | string | 005 |

## Copertura per gruppo prodotto

| Gruppo | Righe | Con figura | Con gambo | Con misura |
| --- | ---: | ---: | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 419 | 419 | 419 | 416 |
| RIFINITURA STR. GRANE FINE | 365 | 365 | 365 | 364 |
| FRESONI C.T. | 326 | 326 | 326 | 322 |
| FRESE C.T. | 265 | 265 | 265 | 263 |
| FRESE DIA - GRANA GROSSA | 186 | 186 | 186 | 186 |
| GOMMINI HP/900 | 173 | 173 | 173 | 166 |
| CT - TECNICA DI FRESAGGIO | 169 | 169 | 169 | 169 |
| RIFINITURA C.T. | 161 | 161 | 161 | 160 |
| CHIRURGIA C.T. | 151 | 151 | 151 | 150 |
| MANIPOLO STR. DIA | 131 | 131 | 131 | 130 |
| LABORATORIO FRESE C.T. | 127 | 127 | 127 | 127 |
| ENDO M-Files | 121 | 121 | 121 | 113 |
| RIEMPIMENTO ENDO MATERIALE | 120 | 120 | 120 | 119 |
| FRESE DIA - SERIE S | 115 | 115 | 115 | 112 |
| ENDOCANALARI STRUMENTI | 112 | 112 | 112 | 112 |
| GOMMINI FG/W | 109 | 109 | 109 | 103 |
| STRUMENTI SONICI | 108 | 108 | 108 | 57 |
| DISCHI DIA | 106 | 106 | 106 | 102 |
| DIAO | 92 | 92 | 92 | 92 |
| DIA ZR | 75 | 75 | 75 | 70 |
| KIT STANDARD | 72 | 72 | 72 | 0 |
| FRESE OSSIVORE C.T. | 71 | 71 | 71 | 69 |
| DIA STR. SPEZIALI2 | 68 | 68 | 68 | 66 |
| ALLARGACANALI GATES | 66 | 66 | 66 | 64 |
| FRESE IN ACC. | 63 | 63 | 63 | 63 |
| STRUMENTI IN CERAMICA | 54 | 54 | 54 | 52 |
| STRUMENTI ULTRASONICI | 46 | 46 | 46 | 0 |
| ER/CERAPOST PERNI | 42 | 42 | 42 | 42 |
| FRESE DIA GRANA SERIE 2000 | 40 | 40 | 40 | 40 |
| SPAZZOLINI | 37 | 37 | 37 | 36 |
| STRUMENTI ENDO | 36 | 26 | 26 | 11 |
| FRESE DIA - GRANA SUPERGROSSA | 31 | 31 | 31 | 31 |
| PORTASTRUMENTI IN PLASTICA | 28 | 28 | 28 | 25 |
| PORTASTRUMENTI IN METALLO | 28 | 28 | 28 | 7 |
| TRAEGER ACCIAIO | 24 | 24 | 24 | 6 |
| STRISCHE DIA | 24 | 24 | 24 | 0 |
| CORSI | 23 | 5 | 4 | 3 |
| CAVITA' FRESE ACCIAIO | 23 | 23 | 23 | 23 |
| STRUMENTI SPECIALI IN ACC. | 22 | 22 | 22 | 22 |
| TAGLIACORONE C.T | 21 | 21 | 21 | 20 |
| VLOCK/VARIO PERNI | 18 | 18 | 18 | 18 |
| CHIRURGIA ACCIAIO | 17 | 17 | 17 | 17 |
| DISCHI SEPARATORI | 17 | 17 | 17 | 17 |
| ARTICOLI VARI | 16 | 16 | 16 | 0 |
| ER/CERAPOST KIT | 16 | 16 | 16 | 0 |
| VLOCK/VARIO STRUMENTI | 14 | 14 | 14 | 14 |
| ER/CERAPOST STRUMENTI | 14 | 14 | 14 | 13 |
| ENDO STR. SPEZIALI | 13 | 13 | 13 | 10 |
| CHIRURGIA DIA | 13 | 13 | 13 | 13 |
| PUNTE SONICHE ENDO | 13 | 13 | 13 | 1 |
| OPTIPOST STRUMENTI | 12 | 12 | 12 | 12 |
| RIFINITURA FRESE ACCIAIO | 12 | 12 | 12 | 12 |
| FRESONI CERAMICA | 12 | 12 | 12 | 12 |
| ARKANSAS | 10 | 10 | 10 | 10 |
| OPTIPOST PERNI | 9 | 9 | 9 | 9 |
| STRUMENTI SPEZIALI C.T. | 9 | 9 | 9 | 9 |
| DIA STR. SPEZIALI | 8 | 8 | 8 | 6 |
| BKS PERNI | 7 | 7 | 7 | 7 |
| IMPLANTOLOGIA ACCESSORI | 6 | 6 | 6 | 5 |
| BKS KIT | 5 | 5 | 5 | 0 |
| TAGLIACORONE ROCKY | 5 | 5 | 5 | 4 |
| BKS STRUMENTI | 4 | 4 | 4 | 3 |
| STRUMENTI IN POLIMERI | 4 | 4 | 4 | 3 |
| VLOCK/VARIO KIT | 3 | 3 | 3 | 0 |
| DESINFECTION | 3 | 3 | 3 | 0 |
| STRUMENTI SPEZIALI ACCIAIO | 2 | 2 | 2 | 1 |
| CONFEZIONI VUOTE | 2 | 2 | 1 | 0 |
| ENDO PILOT | 2 | 2 | 2 | 0 |
| MANIPOLI SONICI | 2 | 2 | 2 | 0 |
| KIT UNIVERSITARI | 2 | 2 | 2 | 0 |
| FRESONI IN ACCIAIO | 1 | 1 | 1 | 1 |
| PINS/PERNI STR. SPEZIALI | 1 | 1 | 1 | 0 |
| STRUMENTI SPEZIALI | 1 | 1 | 1 | 1 |

## Esempi

| ERP item | Articolo | Gruppo | Figura | Gambo | Misura | Confezione | Bloccato |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 10019197 | ENGO01.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019199 | ENGO02.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019200 | ENGO03.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019201 | ENGO04.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019202 | ENGO05.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019203 | ENGO06.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019205 | ENGO08.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019206 | ENGO09.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019207 | ENGO10.000 | STRUMENTI ENDO |  |  |  | 1 | No |
| 10019209 | ENGO12.000 | STRUMENTI ENDO |  |  |  | 100 | No |
| CHISET25 | CorsoVR.Borgonovo.set25 | CORSI |  |  |  | 0 | No |
| ENDAPR25 | CorsoVR.Marzari.apr25 | CORSI |  |  |  | 0 | No |
| ENDSET25 | CorsoVR.Marzari.set25 | CORSI |  |  |  | 0 | No |
| KBNAPR25 | CorsoVR.ParducciTonini.apr25 | CORSI |  |  |  | 0 | No |
| KBNFEB25 | CorsoVR.Allegri.feb25 | CORSI |  |  |  | 0 | No |
| KBNFEB25b | CorsoVR.Tacchini.feb25 | CORSI |  |  |  | 0 | No |
| KBNGEN25 | CorsoVR.Tonini.gen25 | CORSI |  |  |  | 0 | No |
| KBNGIU25 | CorsoVR.ToniniBertoni.giu25 | CORSI |  |  |  | 0 | No |
| LABDIC25 | CorsoVR.LombardoDiFelice.dic25 | CORSI |  |  |  | 0 | No |
| LABMAG25 | CorsoVR.Quintavalla.mag25 | CORSI |  |  |  | 0 | No |
| LABNOV25 | CorsoVR.Quintavalla.nov25 | CORSI |  |  |  | 0 | No |
| LABNOV25B | CorsoVR.Quintavalla.nov25 | CORSI |  |  |  | 0 | No |
| ORTMAR25 | CorsoVR.FilomiaPinto.mar25 | CORSI |  |  |  | 0 | No |
| PROGIU25 | CorsoVR.ScutellaFerraris.giu25 | CORSI |  |  |  | 0 | No |
| PROMAG25 | CorsoVR.Sibilla.mag25 | CORSI |  |  |  | 0 | No |

## Lettura operativa

Questo report e' la base ERP articolo completa e veloce. Le immagini non vengono salvate qui per non rallentare o destabilizzare l'acquisizione; vanno associate in un secondo passaggio usando `ITEMID`, `NAME`, `FIGURE`, `SHANK` e `SIZE`.
