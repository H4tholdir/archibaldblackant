# ERP Targeted Product Image Audit

Data run: 2026-06-03T04:29:53.430Z  
Fine run: 2026-06-03T04:44:37.032Z  
Run ID: `2026-06-03-04-29-53-430`  
Modalita': read-only, acquisizione mirata immagini mancanti.

## Configurazione

- Gruppi: `FRESE DIA - GRANA MEDIA`, `RIFINITURA STR. GRANE FINE`, `FRESONI C.T.`, `FRESE C.T.`, `FRESE DIA - GRANA GROSSA`, `CT - TECNICA DI FRESAGGIO`, `RIFINITURA C.T.`, `CHIRURGIA C.T.`, `LABORATORIO FRESE C.T.`, `DIAO`, `DIA ZR`
- Existing reports: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json`, `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-03-04-21-40-917/audit-report.json`, `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-03-04-24-04-272/audit-report.json`, `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-03-04-28-55-929/audit-report.json`
- Limit nuove righe immagine: 2000
- Report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-03-04-29-53-430/audit-report.json`

## Risultati

- Record immagine nuovi osservati: 1811
- Immagini salvate: 1805
- Immagini uniche per hash: 412
- Immagini vuote/non parseabili: 6

## Copertura per gruppo

| Gruppo | Righe scansionate | Gia' coperte | Mancanti lette | Immagini salvate | Vuote | Pagine |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 419 | 70 | 349 | 344 | 5 | 3 |
| RIFINITURA STR. GRANE FINE | 365 | 60 | 305 | 304 | 1 | 2 |
| FRESONI C.T. | 326 | 40 | 286 | 286 | 0 | 2 |
| FRESE C.T. | 265 | 40 | 225 | 225 | 0 | 2 |
| FRESE DIA - GRANA GROSSA | 186 | 40 | 146 | 146 | 0 | 1 |
| CT - TECNICA DI FRESAGGIO | 169 | 40 | 129 | 129 | 0 | 1 |
| RIFINITURA C.T. | 161 | 40 | 121 | 121 | 0 | 1 |
| CHIRURGIA C.T. | 151 | 40 | 111 | 111 | 0 | 1 |
| LABORATORIO FRESE C.T. | 127 | 40 | 87 | 87 | 0 | 1 |
| DIAO | 92 | 40 | 52 | 52 | 0 | 1 |
| DIA ZR | 75 | 75 | 0 | 0 | 0 | 1 |

## Campi raw osservati

| Field | Osservati | Non vuoti | Tipi |
| --- | ---: | ---: | --- |
| __visibleRowIndex | 1811 | 1811 | number |
| BRASFIGURE | 1811 | 1811 | string |
| BRASITEMIDBULK | 1811 | 1811 | string |
| BRASPACKAGEEXPERTS | 1811 | 1811 | string |
| BRASPACKINGCONTENTS | 1811 | 1811 | number |
| BRASSHANK | 1811 | 1811 | string |
| CREATEDDATETIME | 1811 | 1811 | Date |
| DESCRIPTION | 1811 | 1811 | string |
| ID | 1811 | 1811 | number |
| ITEMID | 1811 | 1811 | string |
| MODIFIEDDATETIME | 1811 | 1811 | Date |
| NAME | 1811 | 1811 | string |
| ORDERITEM | 1811 | 1811 | boolean |
| PRODUCTGROUPID.ID | 1811 | 1811 | number |
| PRODUCTGROUPID.PRODUCTGROUP1 | 1811 | 1811 | string |
| PRODUCTGROUPID.PRODUCTGROUPID | 1811 | 1811 | string |
| SEARCHNAME | 1811 | 1811 | string |
| STOPPED | 1811 | 1811 | string |
| BRASSIZE | 1811 | 1805 | string |
| ImageCalc | 1811 | 1805 | image_bytes |

## Esempi immagini salvate

| ERP item | Articolo | Gruppo | Dimensioni | Bytes | File |
| --- | --- | --- | ---: | ---: | --- |
| 004180K2 | 802.314.012 | FRESE DIA - GRANA MEDIA | 105x20 | 1281 | `004180K2__802.314.012__d8c4c098990f.png` |
| 004181K2 | 802.314.014 | FRESE DIA - GRANA MEDIA | 105x20 | 1281 | `004181K2__802.314.014__d8c4c098990f.png` |
| 004182K2 | 802.314.016 | FRESE DIA - GRANA MEDIA | 105x20 | 1281 | `004182K2__802.314.016__d8c4c098990f.png` |
| 004183K2 | 802.314.018 | FRESE DIA - GRANA MEDIA | 105x20 | 1281 | `004183K2__802.314.018__d8c4c098990f.png` |
| 004184K3 | 802.314.023 | FRESE DIA - GRANA MEDIA | 105x20 | 1281 | `004184K3__802.314.023__d8c4c098990f.png` |
| 004205K2 | 805.314.009 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004205K2__805.314.009__bf24b0acf5f3.png` |
| 004205K3 | 805.314.009 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004205K3__805.314.009__bf24b0acf5f3.png` |
| 004206K2 | 805.314.010 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004206K2__805.314.010__bf24b0acf5f3.png` |
| 004207K2 | 805.314.012 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004207K2__805.314.012__bf24b0acf5f3.png` |
| 004208K2 | 805.314.014 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004208K2__805.314.014__bf24b0acf5f3.png` |
| 004209K2 | 805.314.016 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004209K2__805.314.016__bf24b0acf5f3.png` |
| 004210K2 | 805.314.018 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004210K2__805.314.018__bf24b0acf5f3.png` |
| 004211K3 | 805.314.023 | FRESE DIA - GRANA MEDIA | 105x20 | 1243 | `004211K3__805.314.023__bf24b0acf5f3.png` |
| 004222K2 | 806.314.009 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004222K2__806.314.009__a55419cd33e6.png` |
| 004223K2 | 806.314.010 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004223K2__806.314.010__a55419cd33e6.png` |
| 004224K2 | 806.314.012 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004224K2__806.314.012__a55419cd33e6.png` |
| 004225K2 | 806.314.014 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004225K2__806.314.014__a55419cd33e6.png` |
| 004226K2 | 806.314.016 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004226K2__806.314.016__a55419cd33e6.png` |
| 004227K2 | 806.314.018 | FRESE DIA - GRANA MEDIA | 105x12 | 708 | `004227K2__806.314.018__a55419cd33e6.png` |
| 004235K2 | 807.314.012 | FRESE DIA - GRANA MEDIA | 105x18 | 1450 | `004235K2__807.314.012__f0fb4ef87987.png` |
