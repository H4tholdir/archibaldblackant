# ERP Product Image Audit

Data run: 2026-06-01T09:03:17.271Z  
Fine run: 2026-06-01T09:09:48.873Z  
Run ID: `2026-06-01-09-03-17-271`  
Modalita': read-only, nessuna scrittura su database applicativo.

## Configurazione

- ERP URL: `https://4.231.124.90/Archibald`
- Limit: 40
- Filtri gruppo prodotto: `FRESE DIA - GRANA MEDIA`, `RIFINITURA STR. GRANE FINE`, `FRESONI C.T.`, `FRESE C.T.`, `FRESE DIA - GRANA GROSSA`, `CT - TECNICA DI FRESAGGIO`, `RIFINITURA C.T.`, `CHIRURGIA C.T.`, `LABORATORIO FRESE C.T.`, `DIAO`, `DIA ZR`
- Page size richiesta: 200
- Only with images: no
- Lettura campi: tutti i fieldName DevExpress disponibili (36) + core fields
- Output immagini: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/images`
- Report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json`

## Risultati

- Righe lette: 440
- Immagini salvate: 428
- Immagini vuote/mancanti: 12
- Immagini non valide: 0
- Immagini uniche per hash: 143
- Duplicati immagine: 285
- Copertura immagini: 97%

## Campi ERP confermati

Grid name osservato: `Vertical_v8_64269683_LE_v8`
FieldName DevExpress scoperti: 36

| Field | Visible index | Column index |
| --- | ---: | ---: |
| ITEMID | 2 | 17 |
| NAME | 3 | 23 |
| DESCRIPTION | 4 | 11 |
| PRODUCTGROUPID.ID | 5 | 26 |
| ImageCalc | 6 | 16 |
| PRODUCTGROUPID.PRODUCTGROUPID | 10 | 28 |
| PRODUCTGROUPID.PRODUCTGROUP1 | 11 | 27 |
| BRASFIGURE | 14 | 0 |
| BRASSHANK | 22 | 4 |
| BRASSIZE | 23 | 5 |

## Osservazioni campi raw

| Field | Osservati | Non vuoti | Tipi | Primo esempio |
| --- | ---: | ---: | --- | --- |
| BRASFIGURE | 440 | 440 | string | 10839 |
| BRASITEMIDBULK | 440 | 440 | string | 005157 |
| BRASPACKAGEEXPERTS | 440 | 440 | string | K2 |
| BRASPACKINGCONTENTS | 440 | 440 | number | 5 |
| BRASSHANK | 440 | 440 | string | 314 |
| CONFIGID | 440 | 440 | string | v.001 |
| CREATEDBY | 440 | 440 | string | Admin |
| CREATEDDATETIME | 440 | 440 | Date | {"__type":"Date","iso":"2026-02-13T19:35:47.340Z","epochMs":1771011347340,"text":"Fri Feb 13 2026 20:35:47 GMT+0100 (Ora standard dell’Europa centrale)"} |
| DATAAREAID | 440 | 440 | string | kit |
| DEFAULTSALESQTY | 440 | 440 | number | 0 |
| DESCRIPTION | 440 | 440 | string | DIA gr M, rifinitura margine coronale, spigoli arrotondati |
| DISPLAYPRODUCTNUMBER | 440 | 440 | string | 005157K2 : v.001 :   :   : |
| ENDDISC | 440 | 440 | number | 1 |
| HIGHESTQTY | 440 | 440 | number | 500 |
| ID | 440 | 440 | number | 1114 |
| ITEMID | 440 | 440 | string | 005157K2 |
| LINEDISC.ID | 440 | 440 | number | 44 |
| LOWESTQTY | 440 | 440 | number | 5 |
| MODIFIEDBY | 440 | 440 | string | Admin |
| MODIFIEDDATETIME | 440 | 440 | Date | {"__type":"Date","iso":"2026-02-25T14:00:54.637Z","epochMs":1772028054637,"text":"Wed Feb 25 2026 15:00:54 GMT+0100 (Ora standard dell’Europa centrale)"} |
| MULTIPLEQTY | 440 | 440 | number | 5 |
| NAME | 440 | 440 | string | 10839.314.012 |
| ORDERITEM | 440 | 440 | boolean | true |
| PRICEUNIT | 440 | 440 | number | 1 |
| PRODUCTGROUPID.ID | 440 | 440 | number | 19 |
| PRODUCTGROUPID.PRODUCTGROUP1 | 440 | 440 | string | FRESE DIA - GRANA MEDIA |
| PRODUCTGROUPID.PRODUCTGROUPID | 440 | 440 | string | 11311 |
| PURCHPRICEPCS | 440 | 440 | number | 1.64 |
| SEARCHNAME | 440 | 440 | string | 10839.314.012 |
| STANDARDCONFIGID | 440 | 440 | string | v.001 |
| STANDARDQTY | 440 | 440 | number | 0 |
| STOPPED | 440 | 440 | string | No |
| TAXITEMGROUPID | 440 | 440 | number | 5 |
| UNITID | 440 | 440 | string | 001 |
| BRASSIZE | 440 | 429 | string | 012 |
| ImageCalc | 440 | 428 | image_bytes | {"__type":"image_bytes","byteLength":831,"signature":[137,80,78,71,13,10,26,10,0,0,0,13]} |

## Copertura per gruppo

| Gruppo | Righe | Immagini | Copertura |
| --- | ---: | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 40 | 36 | 90% |
| RIFINITURA STR. GRANE FINE | 40 | 39 | 98% |
| FRESONI C.T. | 40 | 40 | 100% |
| FRESE C.T. | 40 | 40 | 100% |
| FRESE DIA - GRANA GROSSA | 40 | 40 | 100% |
| CT - TECNICA DI FRESAGGIO | 40 | 40 | 100% |
| RIFINITURA C.T. | 40 | 39 | 98% |
| CHIRURGIA C.T. | 40 | 39 | 98% |
| LABORATORIO FRESE C.T. | 40 | 40 | 100% |
| DIAO | 40 | 40 | 100% |
| DIA ZR | 40 | 35 | 88% |

## Copertura per filtro applicato

| Filtro | Righe | Immagini | Copertura |
| --- | ---: | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 40 | 36 | 90% |
| RIFINITURA STR. GRANE FINE | 40 | 39 | 98% |
| FRESONI C.T. | 40 | 40 | 100% |
| FRESE C.T. | 40 | 40 | 100% |
| FRESE DIA - GRANA GROSSA | 40 | 40 | 100% |
| CT - TECNICA DI FRESAGGIO | 40 | 40 | 100% |
| RIFINITURA C.T. | 40 | 39 | 98% |
| CHIRURGIA C.T. | 40 | 39 | 98% |
| LABORATORIO FRESE C.T. | 40 | 40 | 100% |
| DIAO | 40 | 40 | 100% |
| DIA ZR | 40 | 35 | 88% |

## Esempi con immagine

| ERP item | Articolo | Gruppo | Dimensioni | Bytes | File |
| --- | --- | --- | ---: | ---: | --- |
| 005157K2 | 10839.314.012 | FRESE DIA - GRANA MEDIA | 105x13 | 831 | `005157K2__10839.314.012__a02294bf60d4.png` |
| 005158K2 | 10839.314.014 | FRESE DIA - GRANA MEDIA | 105x13 | 831 | `005158K2__10839.314.014__a02294bf60d4.png` |
| 005159K2 | 10839.314.016 | FRESE DIA - GRANA MEDIA | 105x13 | 831 | `005159K2__10839.314.016__a02294bf60d4.png` |
| 005159K3 | 10839.314.016 | FRESE DIA - GRANA MEDIA | 105x13 | 831 | `005159K3__10839.314.016__a02294bf60d4.png` |
| 004081K3 | 368.204.023 | FRESE DIA - GRANA MEDIA | 105x12 | 691 | `004081K3__368.204.023__bdffd3176423.png` |
| 004084K2 | 368.314.016 | FRESE DIA - GRANA MEDIA | 105x12 | 691 | `004084K2__368.314.016__bdffd3176423.png` |
| 018167K2 | 368.314.021 | FRESE DIA - GRANA MEDIA | 105x12 | 691 | `018167K2__368.314.021__bdffd3176423.png` |
| 018167K3 | 368.314.021 | FRESE DIA - GRANA MEDIA | 105x12 | 691 | `018167K3__368.314.021__bdffd3176423.png` |
| 004085K2 | 368.314.023 | FRESE DIA - GRANA MEDIA | 105x12 | 691 | `004085K2__368.314.023__bdffd3176423.png` |
| 005221K2 | 369.314.025 | FRESE DIA - GRANA MEDIA | 105x18 | 1141 | `005221K2__369.314.025__be69981a8a36.png` |
| 015855K2 | 369A.314.023 | FRESE DIA - GRANA MEDIA | 105x18 | 1117 | `015855K2__369A.314.023__65f2be6b71f4.png` |
| 050074K2 | 370.314.030 | FRESE DIA - GRANA MEDIA | 105x24 | 1757 | `050074K2__370.314.030__a5181693a795.png` |
| 050076K2 | 370.314.035 | FRESE DIA - GRANA MEDIA | 105x24 | 1757 | `050076K2__370.314.035__a5181693a795.png` |
| 033541K2 | 379.104.023 | FRESE DIA - GRANA MEDIA | 105x16 | 951 | `033541K2__379.104.023__ee0f8fa47fc7.png` |
| 033541K3 | 379.104.023 | FRESE DIA - GRANA MEDIA | 105x16 | 951 | `033541K3__379.104.023__ee0f8fa47fc7.png` |

## Esempi senza immagine valida

| ERP item | Articolo | Gruppo | Stato | Motivo |
| --- | --- | --- | --- | --- |
| 013147K2 | 30027.314. 3 | FRESE DIA - GRANA MEDIA | empty | empty ImageCalc |
| 033844K0 | 4337.313. | FRESE DIA - GRANA MEDIA | empty | empty ImageCalc |
| 023760K0 | 4337.314. | FRESE DIA - GRANA MEDIA | empty | empty ImageCalc |
| 049614K0 | 4663.314. | FRESE DIA - GRANA MEDIA | empty | empty ImageCalc |
| 023761K0 | 4337F.314. | RIFINITURA STR. GRANE FINE | empty | empty ImageCalc |
| 013750K0 | 4159.314. | RIFINITURA C.T. | empty | empty ImageCalc |
| 048626K0 | 4656.310. | CHIRURGIA C.T. | empty | empty ImageCalc |
| 035000K0 | 4432.314 | DIA ZR | empty | empty ImageCalc |
| 035881K0 | 4439.314. | DIA ZR | empty | empty ImageCalc |
| 035882K0 | 4440.314. | DIA ZR | empty | empty ImageCalc |
| 036354K0 | 4447.000. | DIA ZR | empty | empty ImageCalc |
| 049704K0 | TD3052.000. | DIA ZR | empty | empty ImageCalc |

## Note tecniche

- Il campo immagine ERP e' `ImageCalc`.
- `ImageCalc` viene letto via DevExpress `GetRowValues`.
- Il valore immagine viene ricevuto come lista/CSV di byte e convertito in file locale.
- Gli URL `DXX.axd?handlerName=BinaryDataHttpHandler...` sono session-specific: non vanno usati come identificatore stabile.
- La chiave stabile proposta e' `sha256` del file immagine associato a `ITEMID` e `NAME`.

## Decisione suggerita

Se la copertura e qualita' del campione sono sufficienti, il prossimo passo e' estendere l'audit a tutti gli articoli e poi progettare una tabella staging per importare immagini ERP in modo controllato.
