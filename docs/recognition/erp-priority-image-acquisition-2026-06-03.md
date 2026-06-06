# ERP Priority Image Acquisition

Data: 2026-06-03  
Obiettivo: completare le immagini ERP per i gruppi piu' utili al riconoscimento fotografico degli strumenti rotanti.

## Strategia

La lettura completa di `INVENTTABLE` con `ImageCalc` su tutte le righe e' troppo lenta come percorso principale. E' stato quindi creato uno script mirato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-product-images-targeted.mjs`

Comportamento:

- legge i metadati articolo del gruppo con `GetPageRowValues`;
- salta gli `ITEMID` gia' coperti o gia' tentati in report precedenti;
- scarica `ImageCalc` solo per righe mancanti;
- produce report compatibili con lo staging recognition;
- registra anche righe senza immagine, cosi' non vengono ritentate subito.

## Report importati

| Run ID | Record | Immagini salvate | Immagini uniche |
| --- | ---: | ---: | ---: |
| `2026-06-01-09-03-17-271` | 440 | 428 | 143 |
| `2026-06-03-04-21-40-917` | 5 | 5 | 4 |
| `2026-06-03-04-24-04-272` | 30 | 30 | 5 |
| `2026-06-03-04-28-55-929` | 50 | 50 | 28 |
| `2026-06-03-04-29-53-430` | 1.811 | 1.805 | 412 |

Totale nello staging:

- riferimenti visuali ERP: 2.318;
- hash immagine unici: 517;
- articoli `ITEMID` con immagine: 2.318;
- copertura su tutti gli articoli ERP `INVENTTABLE`: 2.318 / 4.523 = 51,2%.

## Copertura gruppi prioritari

| Gruppo | Articoli | Con immagine | Senza immagine | Copertura |
| --- | ---: | ---: | ---: | ---: |
| `FRESE DIA - GRANA MEDIA` | 419 | 410 | 9 | 97,9% |
| `RIFINITURA STR. GRANE FINE` | 365 | 363 | 2 | 99,5% |
| `FRESONI C.T.` | 326 | 326 | 0 | 100,0% |
| `FRESE C.T.` | 265 | 265 | 0 | 100,0% |
| `FRESE DIA - GRANA GROSSA` | 186 | 186 | 0 | 100,0% |
| `CT - TECNICA DI FRESAGGIO` | 169 | 169 | 0 | 100,0% |
| `RIFINITURA C.T.` | 161 | 160 | 1 | 99,4% |
| `CHIRURGIA C.T.` | 151 | 150 | 1 | 99,3% |
| `LABORATORIO FRESE C.T.` | 127 | 127 | 0 | 100,0% |
| `DIAO` | 92 | 92 | 0 | 100,0% |
| `DIA ZR` | 75 | 70 | 5 | 93,3% |

## Prossimi gruppi non prioritari con molte immagini mancanti

| Gruppo | Articoli senza immagine |
| --- | ---: |
| `GOMMINI HP/900` | 173 |
| `MANIPOLO STR. DIA` | 131 |
| `ENDO M-Files` | 121 |
| `RIEMPIMENTO ENDO MATERIALE` | 120 |
| `FRESE DIA - SERIE S` | 115 |
| `ENDOCANALARI STRUMENTI` | 112 |
| `GOMMINI FG/W` | 109 |
| `STRUMENTI SONICI` | 108 |
| `DISCHI DIA` | 106 |

## Decisione

Per lo sviluppo del riconoscimento fotografico, i gruppi prioritari sono ora abbastanza coperti per iniziare un primo benchmark visuale. Non e' necessario attendere la copertura immagini di tutti i 4.523 articoli prima di testare il retrieval, perche' i gruppi piu' pertinenti al caso d'uso frese/strumenti rotanti sono quasi completi.

La prossima fase consigliata e':

1. generare un indice visuale deduplicato dalle 517 silhouette ERP uniche;
2. mantenere il mapping molti-a-uno tra silhouette e varianti articolo;
3. affiancare il matching testuale/strutturato su figura, gambo, misura e gruppo;
4. usare foto reali controllate come benchmark iniziale.
