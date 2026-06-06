# ERP Visual Feature Index

Data run: 2026-06-03T04:52:35.951Z  
Fine run: 2026-06-03T04:52:40.352Z  
Run ID: `2026-06-03-04-52-35-951`

## Input/Output

- Input visual index: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-visual-index/2026-06-03-04-47-30-729/erp-visual-index.json`
- Output feature JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-visual-feature-index/2026-06-03-04-52-35-951/erp-visual-feature-index.json`

## Sintesi

- Immagini uniche con feature: 517
- Varianti articolo rappresentate: 2318
- Varianti con prezzo/listino: 2316
- Range densita' silhouette: 0.024597 - 0.222351
- Range aspect ratio bounding box: 0.6 - 8.5455

## Gruppi

| Gruppo rappresentativo | Immagini uniche | Varianti |
| --- | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 48 | 416 |
| RIFINITURA STR. GRANE FINE | 76 | 353 |
| FRESONI C.T. | 97 | 319 |
| FRESE C.T. | 23 | 306 |
| FRESE DIA - GRANA GROSSA | 55 | 190 |
| CT - TECNICA DI FRESAGGIO | 45 | 174 |
| RIFINITURA C.T. | 65 | 164 |
| CHIRURGIA C.T. | 12 | 130 |
| LABORATORIO FRESE C.T. | 21 | 104 |
| DIAO | 32 | 92 |
| DIA ZR | 43 | 70 |

## Esempi Feature/Nearest

| Gruppo | Varianti | Primo codice | Bounding box | Densita' | Nearest deterministico |
| --- | ---: | --- | ---: | ---: | --- |
| FRESE C.T. | 88 | H1.314.005 | 56x29 | 0.065369 | RIFINITURA C.T. (5.1568) |
| FRESE DIA - GRANA MEDIA | 66 | 801.204.009 | 61x24 | 0.059937 | RIFINITURA STR. GRANE FINE (0.0215) |
| FRESE C.T. | 58 | H7.313.008 | 51x26 | 0.059509 | LABORATORIO FRESE C.T. (9.2849) |
| CHIRURGIA C.T. | 43 | H141.104.010 | 52x32 | 0.067932 | FRESONI C.T. (5.1532) |
| CHIRURGIA C.T. | 35 | H141A.104.023 | 52x33 | 0.070801 | CHIRURGIA C.T. (5.35) |
| FRESE C.T. | 33 | H1SEM.204.014 | 70x29 | 0.075745 | FRESE DIA - GRANA MEDIA (11.4226) |
| FRESE C.T. | 30 | H1SE.204.010 | 70x28 | 0.083557 | FRESE C.T. (16.5509) |
| FRESE DIA - GRANA MEDIA | 28 | 835.204.010 | 50x14 | 0.036682 | FRESE DIA - GRANA GROSSA (0.0215) |
| RIFINITURA STR. GRANE FINE | 28 | 8801.204.018 | 61x24 | 0.060059 | RIFINITURA STR. GRANE FINE (0.0205) |
| FRESE DIA - GRANA MEDIA | 28 | 830.313.012 | 59x17 | 0.046753 | RIFINITURA STR. GRANE FINE (0.0205) |
| LABORATORIO FRESE C.T. | 27 | H71.104.005 | 54x32 | 0.073425 | CHIRURGIA C.T. (6.811) |
| RIFINITURA STR. GRANE FINE | 22 | 8379.204.023 | 50x21 | 0.046204 | RIFINITURA STR. GRANE FINE (0) |
| CHIRURGIA C.T. | 21 | H141AZ.104.010 | 54x34 | 0.073242 | DIAO (8.2008) |
| FRESE C.T. | 21 | H2.314.006 | 62x28 | 0.072754 | FRESONI C.T. (8.4174) |
| FRESE DIA - GRANA MEDIA | 21 | 379.314.014 | 50x19 | 0.044434 | DIA ZR (0.038) |
| RIFINITURA STR. GRANE FINE | 16 | 8368.204.016 | 44x14 | 0.027893 | RIFINITURA STR. GRANE FINE (0) |
| FRESE C.T. | 16 | H21.314.008 | 70x19 | 0.076721 | LABORATORIO FRESE C.T. (9.9713) |
| FRESE DIA - GRANA MEDIA | 16 | 805.314.009 | 62x24 | 0.065063 | FRESE DIA - GRANA GROSSA (0.0406) |

## Nota

Questo indice usa feature deterministiche: aHash, dHash, proiezioni di forma, densita' e proporzioni. Serve per un primo retrieval locale e per benchmark tecnici. Non sostituisce un modello visivo moderno, ma rende misurabile il problema prima di introdurre embedding/AI.
