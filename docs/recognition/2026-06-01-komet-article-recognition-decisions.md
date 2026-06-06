# Komet Article Recognition - Decisioni e scoperte

Data: 2026-06-01  
Stato: living document  
Ambito: riconoscimento di articoli Komet sfusi tramite foto, con ERP Archibald come fonte primaria ordinabile.

## Obiettivo prodotto

Il caso d'uso reale non e' riconoscere una confezione o un blister. Se il cliente possiede la confezione, il codice articolo e' gia disponibile.

Il sistema deve aiutare agente e cliente quando hanno in mano uno strumento sfuso e chiedono:

- che articolo e'?
- e' Komet?
- se e' Komet, qual e' l'articolo ordinabile?
- se non e' Komet, Komet ha una versione equivalente?
- se non esiste un equivalente esatto, qual e' l'alternativa Komet piu' vicina?
- se non ci sono alternative Komet, riusciamo almeno a stimare marca/articolo?

Decisione: il primo obiettivo non deve essere "identificazione SKU perfetta da una sola foto", ma una pipeline che produca candidati ordinabili, motivazione tecnica e richieste di foto aggiuntive quando l'evidenza visiva e' insufficiente.

## Gerarchia delle fonti

Decisione: la Knowledge Base deve essere costruita con questa priorita':

1. ERP Archibald / Komet Italia: fonte primaria per articoli ordinabili in Italia.
2. Catalogo Komet PDF 2025: fonte tecnica ufficiale per famiglie, misure, gambi, grane, indicazioni e codifica.
3. Siti Komet nazionali: arricchimento descrittivo e cross-check multi-paese.
4. Campionari Komet: fonte visiva molto utile per immagini reali/crop di strumenti, anche se non copre tutti gli articoli.
5. Feedback umano: correzioni agenti/clienti, da salvare come training/evaluation data.

Conseguenza: non ha senso partire dal vecchio modulo PWA se la base dati articolo/immagine non e' prima affidabile.

## Scoperte ERP

URL ERP articoli: `https://4.231.124.90/Archibald/INVENTTABLE_ListView/`

La pagina e' raggiungibile ma richiede login. Il progetto ha gia una sincronizzazione prodotti basata su questa ListView.

File rilevanti:

- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/sync/scraper/configs/products.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/sync/scraper/list-view-scraper.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/sync/services/product-sync.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/db/migrations/002-shared-tables.sql`

### Copia locale attuale

Database locale interrogato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/products.db`

Contenuto rilevato:

- 4.547 articoli attivi.
- 3.952 `name` distinti, quindi articoli ordinabili distinti al netto delle varianti pack.
- 595 varianti principalmente legate a confezionamento/contenuto.
- descrizione presente su tutti gli articoli.
- prezzo quasi completo: 4.530 / 4.547.
- immagini non presenti nella copia locale: `imageUrl`, `imageLocalPath` e `product_images` vuoti.
- ultimo sync locale osservato: 2026-02-10.

Nota: la copia locale SQLite non rappresenta tutto cio' che l'ERP puo' fornire oggi.

### Scoperta immagini ERP

Verifica live effettuata sulla ListView ERP:

- la griglia contiene una colonna visibile `IMMAGINE:`;
- il field tecnico della colonna e' `ImageCalc`;
- le immagini sono renderizzate tramite DevExpress/XAF:
  - `DXX.axd?handlerName=BinaryDataHttpHandler`
  - `processorID=xafkidemovb.Module.CRMKI.INVENTTABLE(... )ImageCalc`
  - parametri con `ObjectHandle`, `OS`, `TimeStamp`;
- gli URL sono session-specific e non vanno trattati come URL stabili da conservare;
- `GetRowValues` restituisce `ImageCalc` come bytes immagine;
- il payload verificato inizia con `137,80,78,71`, cioe' firma PNG.

Decisione: salvare i bytes immagine come file locali + hash + dimensioni + mime type. Non salvare gli URL `DXX.axd` come riferimento principale.

### Campi ERP importanti non pienamente sfruttati

La griglia espone campi utili per riconoscimento e normalizzazione:

- `ITEMID`: ID articolo ERP / variante ordinabile.
- `NAME`: codice articolo Komet commerciale.
- `DESCRIPTION`: descrizione ERP.
- `ImageCalc`: immagine articolo.
- `BRASFIGURE`: figura.
- `BRASSHANK`: gambo.
- `BRASSIZE`: grandezza.
- `PRODUCTGROUPID.ID`: gruppo articolo.
- `PRODUCTGROUPID.PRODUCTGROUPID`: id gruppo prodotto.
- `PRODUCTGROUPID.PRODUCTGROUP1`: descrizione gruppo.
- `BRASPACKINGCONTENTS`: contenuto imballaggio.
- `ORDERITEM`: articolo ordinabile.
- `STOPPED`: fermato.
- `MODIFIEDDATETIME`: data modifica.

Problema attuale: `products.ts` mappa `BRASFIGURE`, `BRASSIZE`, ecc., ma non `ImageCalc`. Inoltre `BRASSHANK` risulta presente live ma non risulta incluso nella config attuale.

Decisione: creare un nuovo extractor/audit ERP read-only per prodotti e immagini, invece di modificare subito il sync produttivo.

## Catalogo PDF Komet 2025

File fornito:

`/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (2).pdf`

Caratteristiche verificate:

- 53 MB circa.
- 782 pagine.
- PDF 1.7.
- non cifrato.
- A4.
- creato con Acrobat Pro.
- non tagged.

Conseguenza: il PDF e' lavorabile, ma non bisogna assumere che l'estrazione tabellare sia automaticamente perfetta. Serve pipeline con audit e tracciabilita' per pagina/campo.

Decisione: il PDF non deve sovrascrivere l'ERP. Deve arricchire l'articolo ERP con dati tecnici, fonte pagina, immagini/disegni, famiglia, grana, gambo, dimensioni e indicazioni.

## Campionari Komet

URL principale:

`https://www.komet.it/it/panoramica/campionari/`

Scoperta:

- la pagina pubblica elenca campionari come MTB566, MTB541, MTB159, MTB372, MTB450, MTB524, MTB457, MTB325, MTB161, MTB335, MTB137, MTB456;
- le pagine campionario non contengono solo immagini, ma anche descrizioni tecniche e codici;
- il campionario MTB541 e' particolarmente utile per diamantate e frese in carburo di tungsteno;
- le pagine contengono immagini di particolari e descrizioni riga-per-riga.

Decisione: usare i campionari come fonte visiva e descrittiva secondaria. Sono molto utili per retrieval visivo, ma non coprono tutti gli articoli e non sostituiscono ERP/catalogo.

## Stato del vecchio modulo PWA

Il modulo esistente va trattato come prototipo storico, non come base architetturale definitiva.

File rilevanti gia identificati:

- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/src/api/recognition.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/routes/recognition.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/recognition/recognition-engine.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/recognition/instrument-descriptor.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/recognition/catalog-searcher.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/recognition/visual-confirmer.ts`

Problemi gia emersi:

- mapping gambi incompleto/errato;
- `shape_class` esiste ma non viene usata correttamente nella ricerca;
- gestione immagini/crop visuali fragile;
- feedback recognition non pienamente cablato;
- progress UI quasi cosmetica;
- confusione tra famiglia e articolo ordinabile esatto;
- pipeline troppo dipendente da VLM senza prima avere knowledge base robusta.

Decisione: non investire subito nel refactor del vecchio modulo. Prima costruire la Knowledge Base v2 e un extractor/audit affidabile.

## Modello dati canonico proposto

### ERP product

Rappresenta cio' che si puo' ordinare.

- `erp_item_id`
- `komet_article_code`
- `description_erp`
- `search_name`
- `product_group_id`
- `product_group_description`
- `package_content`
- `price`
- `vat`
- `orderable_article`
- `stopped`
- `modified_datetime`
- `figure`
- `shank`
- `size`
- `source = erp`

### ERP image

Rappresenta immagine ufficiale associata all'articolo ERP.

- `erp_item_id`
- `komet_article_code`
- `source_field = ImageCalc`
- `local_path`
- `mime_type`
- `width`
- `height`
- `file_size`
- `sha256`
- `extracted_at`
- `source_object_handle`
- `source_timestamp`

### Catalog technical entry

Rappresenta dati tecnici da catalogo/PDF/siti.

- `komet_article_code`
- `family_code`
- `shank_code`
- `shank_label`
- `diameter`
- `working_length`
- `total_length`
- `grit_code`
- `grit_label`
- `ring_color`
- `material`
- `shape_class`
- `description_it`
- `application_indications`
- `source_pdf_page`
- `source_url`
- `confidence`

### Visual reference

Rappresenta immagini utili al riconoscimento.

- `reference_id`
- `komet_article_code` o `family_code`
- `source_type = erp | catalog_pdf | campionario | website | feedback`
- `local_path`
- `crop_bbox`
- `view_type = product_photo | drawing | campionario_crop | user_photo`
- `quality_score`
- `sha256`

## Pipeline raccomandata

### Fase 1 - ERP visual audit

Costruire uno script read-only che:

- legge `ITEMID`, `NAME`, `DESCRIPTION`, `BRASFIGURE`, `BRASSHANK`, `BRASSIZE`, gruppi e pack;
- estrae `ImageCalc` via `GetRowValues`;
- converte bytes immagine in file PNG/JPEG locali;
- calcola hash, dimensioni, mime type;
- produce un report:
  - articoli con immagine;
  - articoli senza immagine;
  - duplicati immagine;
  - immagini vuote o corrotte;
  - copertura per gruppo articolo;
  - copertura per frese/strumenti rotanti.

Output consigliato:

- cartella locale: `data/erp-product-images/`
- file audit: `docs/recognition/erp-image-audit-YYYY-MM-DD.md`
- tabella temporanea/staging prima di scrivere sul DB produttivo.

### Fase 2 - Knowledge Base v2

Creare una base dati canonica separata dal vecchio modulo recognition:

- ERP come sorgente primaria;
- PDF e siti come arricchimento;
- fonti e confidenza per ogni campo;
- nessun campo tecnico critico senza source/provenance.

### Fase 3 - PDF benchmark

Prima di reimportare 782 pagine:

- scegliere 20-30 pagine difficili;
- confrontare Docling, Marker, Mistral OCR/Document AI, parsing deterministico PyMuPDF/pdfplumber;
- validare codici, tabelle, immagini, gambi, misure;
- decidere pipeline definitiva.

### Fase 4 - Visual library

Unificare:

- immagini ERP;
- crop campionari;
- immagini/disegni PDF;
- immagini siti Komet;
- foto feedback reali.

Questa libreria deve servire retrieval visivo e confronto top-k.

### Fase 5 - MVP riconoscimento

Solo dopo:

- input foto sfusa;
- segmentazione dello strumento;
- stima misure/gambo/grana/forma;
- retrieval su immagini e metadata;
- output top candidati ordinabili;
- motivazione;
- richiesta foto aggiuntiva se serve;
- feedback umano.

## Decisioni aperte

- Dove salvare fisicamente immagini ERP in ambiente dev/prod?
- Vogliamo una tabella staging separata prima di aggiornare `shared.product_images`?
- L'extractor immagini deve essere task di coda o script manuale iniziale?
- Quale subset ERP usare come primo test: tutte le frese o solo gruppi diamantate/CT?
- Le immagini ERP sono abbastanza rappresentative dello strumento sfuso o sono spesso pack/kit/campionario?
- Come gestire articoli multipack: immagine associata al pack o allo strumento?

## Prossimo passo consigliato

Creare un extractor read-only `erp-product-image-audit` che non modifica il database:

1. login ERP con credenziali gia configurate localmente;
2. apre `INVENTTABLE_ListView`;
3. legge 100-200 righe campione, poi tutto il dataset;
4. estrae `ImageCalc`;
5. salva immagini in cartella temporanea;
6. produce report di copertura e qualita';
7. solo dopo decidere se integrare nel sync prodotti ufficiale.

Questo e' il prossimo passo piu' utile per sbloccare il riconoscimento: capire quanta libreria visiva ufficiale abbiamo gia dentro l'ERP.

## Aggiornamento 2026-06-01 - Audit ERP immagini avviato

Script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-product-images.mjs`

Caratteristiche:

- standalone Node/Puppeteer;
- read-only: nessuna scrittura sul database applicativo;
- login ERP usando le credenziali gia configurate localmente in `.env`;
- lettura `INVENTTABLE_ListView` via DevExpress `GetRowValues`;
- campi letti: `ITEMID`, `NAME`, `DESCRIPTION`, gruppi ERP, `BRASFIGURE`, `BRASSHANK`, `BRASSIZE`, `ORDERITEM`, `STOPPED`, `MODIFIEDDATETIME`, `ImageCalc`;
- conversione `ImageCalc` da byte array/CSV a file immagine locale;
- calcolo hash SHA-256, mime type, dimensioni, peso file;
- generazione report JSON e Markdown.

Output creati:

- immagini/report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/`
- report Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-product-image-audit-2026-06-01.md`

Primo campione tecnico:

- 25 righe lette;
- 20 immagini salvate;
- copertura immagini 80%;
- immagini confermate come PNG reali;
- alcune immagini duplicate per varianti dimensionali o articoli simili.

Secondo campione:

- richiesta: 100 righe;
- effettive: 70 righe, perche' la sessione ERP ha esposto una sola pagina;
- 16 immagini salvate;
- copertura immagini 23%;
- forte presenza di `ENDOCANALARI STRUMENTI` senza immagini nel campione;
- campi `ImageCalc`, `BRASSHANK` e `BRASSIZE` confermati.

Nota importante: per l'audit completo bisogna gestire/azzerare in modo affidabile eventuali filtri o viste persistenti della ListView ERP. Il campione da 70 righe mostra che la copertura osservata dipende molto dalla porzione di articoli caricata.

Decisione aggiornata: prima di integrare nel sync ufficiale, fare un audit esteso per gruppi ERP prioritari, partendo da frese diamantate e frese in carburo, per valutare la reale utilita' visiva delle immagini ERP sugli articoli sfusi.

## Aggiornamento 2026-06-01 - Audit ERP per gruppi prioritari

Lo script `audit-erp-product-images.mjs` e' stato esteso per filtrare la ListView ERP per `PRODUCTGROUPID.PRODUCTGROUP1`.

Nuove opzioni:

- `--group "<nome gruppo>"`: filtra un gruppo ERP.
- `--groups "A|B|C"`: filtra piu' gruppi.
- `--priority-groups`: usa il primo set di gruppi frese/strumenti rotanti prioritari.

Nota tecnica: la lettura di `ImageCalc` non va eseguita con 200 callback DevExpress concorrenti. La griglia risponde in modo parziale o lento. Lo script ora limita la lettura alle righe richieste e procede in modo piu' controllato.

Run prioritario:

- comando: `node archibald-web-app/backend/scripts/audit-erp-product-images.mjs --priority-groups --limit 40`
- run ID: `2026-06-01-08-47-54-435`
- righe lette: 440, cioe' 40 per ciascuno degli 11 gruppi prioritari;
- immagini salvate: 428;
- immagini vuote/mancanti: 12;
- immagini non valide: 0;
- immagini uniche per hash: 143;
- duplicati immagine: 285;
- copertura complessiva: 97%.

Copertura per gruppo:

| Gruppo | Righe | Immagini | Copertura | Immagini uniche |
| --- | ---: | ---: | ---: | ---: |
| FRESE DIA - GRANA MEDIA | 40 | 36 | 90% | 11 |
| RIFINITURA STR. GRANE FINE | 40 | 39 | 98% | 17 |
| FRESONI C.T. | 40 | 40 | 100% | 18 |
| FRESE C.T. | 40 | 40 | 100% | 2 |
| FRESE DIA - GRANA GROSSA | 40 | 40 | 100% | 12 |
| CT - TECNICA DI FRESAGGIO | 40 | 40 | 100% | 11 |
| RIFINITURA C.T. | 40 | 39 | 98% | 24 |
| CHIRURGIA C.T. | 40 | 39 | 98% | 2 |
| LABORATORIO FRESE C.T. | 40 | 40 | 100% | 9 |
| DIAO | 40 | 40 | 100% | 15 |
| DIA ZR | 40 | 35 | 88% | 25 |

Report aggiornato:

`/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-product-image-audit-2026-06-01.md`

Output immagini/JSON:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-08-47-54-435`

Interpretazione:

- L'ERP contiene una libreria visuale molto piu' utile di quanto risultasse dalla copia SQLite locale.
- La copertura per i gruppi rotanti prioritari e' alta.
- Le immagini sono spesso piccole silhouette PNG, ad esempio 105px di larghezza. Sono buone come riferimento normalizzato di forma, meno come training set diretto per foto reali da fotocamera.
- La forte duplicazione per hash e' attesa: molte varianti condividono la stessa forma/figura, e differiscono per misura, gambo, grana, pack o articolo ordinabile.
- Conseguenza architetturale: la foto non puo' promettere sempre SKU esatto da sola. Il riconoscimento deve combinare immagine, figura, gambo, misura, gruppo, descrizione catalogo e domande/foto aggiuntive.

Decisione aggiornata:

1. Procedere con estrazione completa ERP immagini e metadata in staging.
2. Non importare ancora nel sync produttivo.
3. Usare `sha256` per deduplicare immagini e costruire una tabella visual reference separata.
4. Collegare piu' articoli ERP alla stessa immagine quando l'hash coincide.
5. Usare PDF/catalogo/campionari per arricchire le differenze che l'immagine ERP non puo' risolvere, soprattutto misura, applicazione, grana e varianti.

## Aggiornamento 2026-06-01 - Principio acquisizione estesa

Decisione di prodotto/dato: durante l'acquisizione non scartiamo informazioni solo perche' oggi non sappiamo ancora usarle. La pipeline deve preservare il massimo possibile in raw/staging; la selezione dei campi realmente utili avviene dopo, con audit e scoring.

Conseguenze pratiche:

- ogni fonte deve avere un record raw con provenance;
- i campi normalizzati sono una vista/derivazione, non l'unica verita';
- immagini e asset visuali vanno salvati come file + hash, non solo come URL;
- duplicati non vanno eliminati fisicamente in acquisizione: vanno collegati tramite hash/duplicate reference;
- ogni campo derivato da PDF/sito/ERP deve mantenere fonte, data estrazione e confidenza.

Migration proposta per questa strategia:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/db/migrations/107-recognition-acquisition-staging.sql`

Tabelle introdotte:

- `shared.recognition_acquisition_runs`: una riga per run di acquisizione, con sorgente, configurazione, stato e statistiche.
- `shared.recognition_source_records`: record raw per ERP/PDF/sito/campionario/feedback, con `raw_payload`, `normalized_payload`, `field_names`, hash payload e riferimenti articolo.
- `shared.recognition_visual_references`: libreria visuale deduplicabile, con file locale, source, view type, hash, dimensioni, crop metadata e link prodotto/articolo/famiglia.
- `shared.recognition_field_observations`: statistiche per campo osservato, utile per decidere dopo quali campi promuovere a canonici.

Lo script ERP e' stato aggiornato coerentemente:

- di default legge tutti i `fieldName` DevExpress scoperti nella griglia, non solo i campi core;
- mantiene `--core-fields-only` come fallback diagnostico;
- salva `rawFields` per ogni record JSON;
- serializza `ImageCalc` come metadati byte nel raw JSON e salva il file immagine separatamente;
- serializza le date DevExpress come ISO, epoch ms e testo originale;
- produce statistiche `fieldStats` nel JSON e nel Markdown.

Run prioritario esteso:

- comando: `node archibald-web-app/backend/scripts/audit-erp-product-images.mjs --priority-groups --limit 40`
- run ID: `2026-06-01-09-03-17-271`
- righe lette: 440;
- fieldName DevExpress scoperti/letti: 36;
- immagini salvate: 428;
- immagini uniche: 143;
- cartella run: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271`
- dimensione run: circa 3.4 MB.

Campi raw letti con copertura 440/440 nel campione:

- `BRASFIGURE`, `BRASITEMIDBULK`, `BRASPACKAGEEXPERTS`, `BRASPACKINGCONTENTS`, `BRASSHANK`, `CONFIGID`, `CREATEDBY`, `CREATEDDATETIME`, `DATAAREAID`, `DEFAULTSALESQTY`, `DESCRIPTION`, `DISPLAYPRODUCTNUMBER`, `ENDDISC`, `HIGHESTQTY`, `ID`, `ITEMID`, `LINEDISC.ID`, `LOWESTQTY`, `MODIFIEDBY`, `MODIFIEDDATETIME`, `MULTIPLEQTY`, `NAME`, `ORDERITEM`, `PRICEUNIT`, `PRODUCTGROUPID.ID`, `PRODUCTGROUPID.PRODUCTGROUP1`, `PRODUCTGROUPID.PRODUCTGROUPID`, `PURCHPRICEPCS`, `SEARCHNAME`, `STANDARDCONFIGID`, `STANDARDQTY`, `STOPPED`, `TAXITEMGROUPID`, `UNITID`.

Campi non completi ma utili:

- `BRASSIZE`: 429/440;
- `ImageCalc`: 428/440.

Decisione aggiornata: il prossimo step non e' scegliere a mano pochi campi da tenere, ma costruire un importer staging che prenda il JSON di audit e popoli le nuove tabelle raw/visual reference. Solo dopo potremo decidere quali campi promuovere nella Knowledge Base canonica.

## Aggiornamento 2026-06-01 - Importer staging JSON -> Postgres

Script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs`

Scopo:

- prende un `audit-report.json` prodotto dallo scraper ERP;
- valida il piano di import in dry-run;
- con `--apply` inserisce in staging:
  - run di acquisizione;
  - record raw ERP;
  - visual reference da `ImageCalc`;
  - statistiche dei campi osservati;
- non riscrape l'ERP;
- collega `product_id` solo se l'articolo esiste gia' in `shared.products`, evitando fallimenti FK su record non ancora presenti;
- usa `sha256` per individuare duplicati visuali.

Dry-run eseguito sul run prioritario esteso:

```bash
node archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs \
  --report archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json \
  --dry-run
```

Risultato dry-run:

- record sorgente: 440;
- visual references: 428;
- immagini uniche: 143;
- field names: 36;
- field observations: 36.

Tentativo di applicazione DB:

- Postgres locale non era raggiungibile su `localhost:5432`;
- errore: `ECONNREFUSED`;
- `docker compose -f archibald-web-app/docker-compose.yml ps postgres` richiede `PG_PASSWORD` per interpolare il compose;
- quindi migration/import non sono stati applicati al DB in questa sessione.

Prossimo comando quando il DB e' disponibile:

```bash
node archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs \
  --report archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json \
  --apply
```

## Aggiornamento 2026-06-01 - Mappa ERP articolo/prezzi/listini/detail

Domanda verificata: la mappatura precedente copriva bene `INVENTTABLE_ListView`, ma non era ancora una mappa completa di tutte le superfici ERP utili agli articoli. Mancavano almeno:

- `PRICEDISCTABLE_ListView`;
- `INVENTTABLE_DetailView/<id>`;
- `PRICEDISCTABLE_DetailView/<id>`.

Script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-article-data-sources.mjs`

Run eseguito sugli esempi:

```bash
node archibald-web-app/backend/scripts/audit-erp-article-data-sources.mjs \
  --product-detail-id 1114 \
  --price-detail-id 7 \
  --sample-rows 5
```

Output:

- report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-article-data-source-audit/2026-06-01-10-46-44-109/audit-report.json`
- report Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-article-data-source-map-2026-06-01.md`

Risultati principali:

| Fonte | Campi/etichette osservate | Utilita' |
| --- | ---: | --- |
| `INVENTTABLE_ListView` | 36 fieldName DevExpress | Fonte massiva articoli, immagini, figura, gambo, misura, gruppo, confezione |
| `INVENTTABLE_DetailView/1114` | 23 etichette leggibili | Conferma dati articolo e mostra immagine/session URL; utile per snapshot e confronto |
| `PRICEDISCTABLE_ListView` | 46 fieldName DevExpress | Fonte massiva prezzi/listini/sconti per articolo, account, date, scaglioni |
| `PRICEDISCTABLE_DetailView/7` | 41 etichette leggibili | Conferma e rende leggibili campi prezzo/account/articolo |

Campi prezzo/listino importanti da `PRICEDISCTABLE_ListView`:

- `ITEMRELATIONID`: selezione articolo/prezzo, esempio `021752K1`;
- `ITEMRELATIONTXT`: descrizione/codice articolo, esempio `9686.204.040`;
- `ACCOUNTRELATIONID`, `ACCOUNTRELATIONTXT`, `ACCOUNTCODE`: gruppo/account prezzo;
- `AMOUNT`, `CURRENCY`, `PRICEUNIT`, `UNITID`: prezzo e unita';
- `FROMDATE`, `TODATE`: validita';
- `QUANTITYAMOUNTFROM`, `QUANTITYAMOUNTTO`: scaglioni;
- `PERCENT1`, `PERCENT2`, `MARKUP`, `MCRFIXEDAMOUNTCUR`: sconti/markup;
- `BRASNETPRICE`: indicazione prezzo netto Brasseler;
- `CREATEDDATETIME`, `MODIFIEDDATETIME`, `CREATEDBY`, `MODIFIEDBY`: audit/freshness;
- `RECID`, `RECVERSION`, `ID`: chiavi tecniche.

Interpretazione:

- Il DetailView articolo dell'esempio non mostra, a prima vista, molte informazioni tecniche nuove rispetto alla ListView, ma e' utile per confermare etichette, formattazioni e immagine.
- Il DetailView prezzo dell'esempio conferma i dati della ListView prezzo con etichette piu' leggibili.
- `PRICEDISCTABLE_ListView` e' indispensabile: collega articoli ordinabili a prezzi, validita', account/listino e scaglioni. Per un sistema che deve proporre articoli ordinabili non possiamo limitarci a `INVENTTABLE`.

Nota tecnica importante:

La ListView articoli puo' mantenere filtri/vista persistenti nella sessione ERP. Per l'acquisizione massiva non conviene dipendere dalla "vista corrente" non filtrata. Meglio:

- acquisire per gruppi ERP espliciti;
- oppure acquisire per ID noti;
- usare i DetailView come arricchimento mirato;
- salvare sempre la configurazione/filtro usato nel record di acquisizione.

Decisione aggiornata:

1. Estendere l'acquisizione raw anche a `PRICEDISCTABLE_ListView`.
2. Collegare prezzi/listini agli articoli tramite `ITEMRELATIONID`, `ITEMRELATIONTXT`, `ITEMID`, `NAME` e varianti pack.
3. Fare un audit DetailView su un campione piu' ampio prima di decidere se scaricare tutti i DetailView.
4. Non assumere che la ListView articolo sia completa al 100%; per ora e' la migliore fonte massiva, ma i DetailView vanno usati per verificare buchi e campi nascosti.

## Aggiornamento 2026-06-02 - Acquisizione completa PRICEDISCTABLE

Script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-price-list.mjs`

Problema tecnico risolto:

- leggere i record prezzo riga-per-riga con molte callback DevExpress e' instabile/lento;
- `GetPageRowValues` restituisce invece una pagina intera da 200 righe in una singola callback;
- lo script ora usa `GetPageRowValues` come percorso principale e mantiene la lettura riga-per-riga solo come fallback;
- il reset pagina e' verificato: se la griglia non torna a pagina 0, lo script deve fallire per evitare acquisizioni parziali.

Run completo:

```bash
node archibald-web-app/backend/scripts/audit-erp-price-list.mjs --all
```

Output:

- run ID: `2026-06-02-14-11-05-386`
- report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-price-list-audit/2026-06-02-14-11-05-386/audit-report.json`
- report Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-price-list-audit-2026-06-02.md`
- dimensione run: circa 24 MB.

Risultati:

- pagine lette: 25/25;
- righe lette: 4.955;
- campi DevExpress: 46;
- `ITEMRELATIONID` distinti: 4.950;
- `ITEMRELATIONTXT` distinti: 4.229;
- account/listini distinti: 2 osservati (`002`, `002C`) piu' 3 righe senza account relation;
- valuta: EUR;
- prezzo minimo osservato: 0,01;
- prezzo massimo osservato: 8.758,06;
- righe con importo: 4.955/4.955;
- righe con intervallo date: 4.955/4.955.

Campi sempre pieni nel run:

- `ACCOUNTCODE`, `ACCOUNTRELATION`, `AGREEMENTHEADEREXT_RU`, `ALLOCATEMARKUP`, `AMOUNT`, `BRASNETPRICE`, `CALENDARDAYS`, `CREATEDBY`, `CREATEDDATETIME`, `CURRENCY`, `DATAAREAID`, `DELIVERYTIME`, `DISREGARDLEADTIME`, `FROMDATE`, `GENERICCURRENCY`, `ID`, `INVENTBAILEEFREEDAYS_RU`, `INVENTDIMID`, `ITEMCODE`, `ITEMRELATION`, `ITEMRELATIONID`, `ITEMRELATIONTXT`, `MARKUP`, `MAXIMUMRETAILPRICE_IN`, `MCRFIXEDAMOUNTCUR`, `MCRPRICEDISCGROUPTYPE`, `MODIFIEDBY`, `MODIFIEDDATETIME`, `MODULE1`, `ORIGINALPRICEDISCADMTRANSRECID`, `PERCENT1`, `PERCENT2`, `PRICEUNIT`, `QUANTITYAMOUNTFROM`, `QUANTITYAMOUNTTO`, `RECID`, `RECVERSION`, `RELATION`, `SEARCHAGAIN`, `TODATE`.

Campi parziali:

- `UNITID`: 4.953/4.955;
- `ACCOUNTRELATIONID`: 4.952/4.955;
- `ACCOUNTRELATIONTXT`: 4.952/4.955.

Campi vuoti nel run:

- `AGREEMENT`;
- `MCRMERCHANDISINGEVENTID`;
- `PDSCALCULATIONID`.

Decisione aggiornata:

- `PRICEDISCTABLE_ListView` entra nella Knowledge Base raw insieme a `INVENTTABLE`.
- Per il sistema di riconoscimento, il prezzo/listino non serve a identificare la forma dello strumento, ma serve a proporre un articolo realmente ordinabile e commercialmente corretto.
- Il collegamento piu' importante da validare e' tra `ITEMRELATIONID` e `shared.products.id` / `INVENTTABLE.ITEMID`; `ITEMRELATIONTXT` sembra invece collegarsi al codice commerciale/descrittivo dell'articolo.

## Aggiornamento 2026-06-02 - Import staging unico per articoli e listino

Script aggiornato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs`

Decisione:

- mantenere un solo staging raw/provenance per le fonti ERP;
- distinguere internamente i report `INVENTTABLE` e `PRICEDISCTABLE`;
- salvare entrambi come `source_type = erp`, per restare compatibili con lo schema;
- preservare tutti i campi grezzi in `raw_payload`;
- creare anche un payload normalizzato minimo per ricerca e join;
- collegare i record prezzo a `shared.products.id` tramite `ITEMRELATIONID`, quando esiste una corrispondenza;
- non creare riferimenti visuali per il listino prezzi, perche' non contiene immagini.

Dry-run eseguiti:

```bash
node archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs \
  --report archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/audit-report.json \
  --dry-run
```

Risultato atteso confermato:

- tipo report: `erp_product_image`;
- record sorgente: 440;
- immagini salvate/importabili: 428;
- immagini uniche: 143;
- campi osservati: 36.

```bash
node archibald-web-app/backend/scripts/import-recognition-audit-to-staging.mjs \
  --report archibald-web-app/backend/data/erp-price-list-audit/2026-06-02-14-11-05-386/audit-report.json \
  --dry-run
```

Risultato atteso confermato:

- tipo report: `erp_price_list`;
- record sorgente: 4.955;
- immagini: 0;
- campi osservati: 46.

Nota operativa:

- l'import effettivo nel database non e' ancora stato eseguito;
- il Postgres locale non era raggiungibile sull'ultimo tentativo;
- appena il database e' disponibile, si applica la migration `107-recognition-acquisition-staging.sql` e poi si importano i due report con `--apply`.

## Aggiornamento 2026-06-02 - Campione DetailView ERP

Script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-detail-views.mjs`

Run eseguito:

```bash
node archibald-web-app/backend/scripts/audit-erp-detail-views.mjs \
  --product-limit 20 \
  --price-limit 20
```

Output aggiornato:

- run ID: `2026-06-02-14-22-38-325`;
- report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-detail-view-audit/2026-06-02-14-22-38-325/audit-report.json`;
- report Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-detail-view-audit-2026-06-02.md`.

Risultati:

| Tipo DetailView | Record letti | Immagini prodotto | Etichette distinte |
| --- | ---: | ---: | ---: |
| `INVENTTABLE_DetailView` | 20 | 20/20 | 22 |
| `PRICEDISCTABLE_DetailView` | 20 | 0/20 | 41 |

Lettura:

- i DetailView articolo confermano i campi principali della ListView: `ITEM-ID`, `SEARCH NAME`, `ITEM NAME`, `DESCRIPTION`, `PRODUCT GROUP`, `NAME`, `FIGURE`, `SIZE`, `SHANK`, quantita', packing content, price unit, audit fields;
- i DetailView articolo espongono una vera immagine prodotto `ImageCalc` per ogni record del campione;
- i DetailView prezzo confermano i campi della ListView prezzo con etichette leggibili: selezione articolo, descrizione articolo, account, importo, valuta, date, quantita', sconti/markup e audit fields;
- i DetailView prezzo non espongono immagini prodotto; le immagini viste li' sono asset dell'interfaccia ERP;
- nel campione non emergono campi tecnici articolo sostanzialmente nuovi rispetto alla ListView, ma i DetailView restano utili per validare, arricchire snapshot e recuperare immagini quando la ListView e' instabile.

Decisione aggiornata:

- non fare ancora un crawl completo di tutti i DetailView come prima fonte massiva;
- usare `INVENTTABLE_ListView` e `PRICEDISCTABLE_ListView` per acquisizione larga;
- usare i DetailView articolo come canale di verifica/arricchimento immagini e come fallback se alcune righe ListView falliscono;
- usare i DetailView prezzo soprattutto per validare etichette e casi anomali, non per immagini.

## Aggiornamento 2026-06-02 - Staging ERP importato e base articoli completa

Nuovo script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-product-list.mjs`

Motivo:

- la lettura completa di `INVENTTABLE` con immagini e' troppo lenta per essere il percorso principale;
- la base articolo completa va acquisita prima come metadati veloci;
- le immagini devono essere trattate come arricchimento successivo.

Run articolo completa:

```bash
node archibald-web-app/backend/scripts/audit-erp-product-list.mjs --all
```

Output:

- run ID: `2026-06-02-16-49-32-516`;
- report JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-list-audit/2026-06-02-16-49-32-516/audit-report.json`;
- report Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-product-list-audit-2026-06-02.md`.

Risultati:

- righe `INVENTTABLE`: 4.523;
- ERP item distinti: 4.523;
- codici articolo distinti: 3.922;
- gruppi prodotto distinti: 73;
- righe con figura: 4.495;
- righe con gambo: 4.493;
- righe con misura: 4.111;
- campi letti: 35;
- `ImageCalc` disponibile ma non letto nella run completa per performance.

Import staging eseguiti:

| Fonte | Run ID | Record | Immagini |
| --- | --- | ---: | ---: |
| `INVENTTABLE` immagini campione | `2026-06-01-09-03-17-271` | 440 | 428 |
| `PRICEDISCTABLE` listino completo | `2026-06-02-14-11-05-386` | 4.955 | 0 |
| `INVENTTABLE` articoli completo | `2026-06-02-16-49-32-516` | 4.523 | 0 |

Audit staging:

`/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-staging-import-audit-2026-06-02.md`

Risultati join articoli-listino:

- articoli `INVENTTABLE`: 4.523;
- ERP item prezzo distinti: 4.950;
- righe prezzo che matchano un articolo `INVENTTABLE`: 4.522;
- ERP item prezzo distinti che matchano un articolo `INVENTTABLE`: 4.520;
- ERP item prezzo senza articolo nella ListView articoli acquisita: 430;
- articoli `INVENTTABLE` senza prezzo osservato: 3.

Decisione aggiornata:

- la base primaria del riconoscimento deve partire dalla run `INVENTTABLE` completa, non dalla run immagini;
- il listino `PRICEDISCTABLE` serve per sapere se il candidato e' commercialmente utilizzabile;
- la chiave tecnica primaria e' `ITEMID` / `ITEMRELATIONID`;
- il codice commerciale va normalizzato per spazi e formattazioni prima dei confronti;
- le immagini ERP vanno completate come arricchimento mirato, partendo dagli articoli piu' importanti o dai gruppi piu' fotografabili.

## Aggiornamento 2026-06-03 - Immagini ERP gruppi prioritari

Nuovo script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/audit-erp-product-images-targeted.mjs`

Motivo:

- completare le immagini dei gruppi piu' utili al riconoscimento fotografico;
- evitare di rileggere articoli gia' coperti o gia' tentati;
- scaricare `ImageCalc` solo quando serve.

Report dettagliato:

`/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-priority-image-acquisition-2026-06-03.md`

Risultati staging dopo import:

- riferimenti visuali ERP: 2.318;
- hash immagine unici: 517;
- articoli `ITEMID` con immagine: 2.318;
- copertura su tutti gli articoli ERP: 51,2%;
- copertura gruppi prioritari: quasi completa.

Copertura gruppi prioritari:

| Gruppo | Articoli | Con immagine | Copertura |
| --- | ---: | ---: | ---: |
| `FRESE DIA - GRANA MEDIA` | 419 | 410 | 97,9% |
| `RIFINITURA STR. GRANE FINE` | 365 | 363 | 99,5% |
| `FRESONI C.T.` | 326 | 326 | 100,0% |
| `FRESE C.T.` | 265 | 265 | 100,0% |
| `FRESE DIA - GRANA GROSSA` | 186 | 186 | 100,0% |
| `CT - TECNICA DI FRESAGGIO` | 169 | 169 | 100,0% |
| `RIFINITURA C.T.` | 161 | 160 | 99,4% |
| `CHIRURGIA C.T.` | 151 | 150 | 99,3% |
| `LABORATORIO FRESE C.T.` | 127 | 127 | 100,0% |
| `DIAO` | 92 | 92 | 100,0% |
| `DIA ZR` | 75 | 70 | 93,3% |

Decisione aggiornata:

- per un primo benchmark visuale non serve aspettare tutte le immagini dei 4.523 articoli;
- i gruppi rotanti principali sono sufficientemente coperti;
- il prossimo passo tecnico e' creare un indice visuale deduplicato sulle 517 silhouette uniche, mantenendo il mapping verso tutti gli articoli/varianti;
- il riconoscimento non deve basarsi solo sull'immagine: va combinato con figura, gambo, misura, gruppo, ordinabilita' e prezzo/listino.

## Aggiornamento 2026-06-03 - Indice visuale deduplicato

Nuovo script creato:

`/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/build-erp-visual-index.mjs`

Output:

- JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-visual-index/2026-06-03-04-47-30-729/erp-visual-index.json`;
- Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-visual-index-2026-06-03.md`.

Risultati:

- immagini ERP uniche indicizzate: 517;
- varianti articolo con riferimento visuale: 2.318;
- varianti visuali con prezzo/listino: 2.316;
- massimo varianti associate alla stessa immagine: 88.

Lettura:

- l'immagine ERP non identifica quasi mai da sola l'articolo esatto;
- una silhouette puo' rappresentare molte varianti per misura, gambo, confezione o codice;
- quindi il retrieval visuale deve produrre candidati, non una risposta finale immediata;
- la risposta finale deve combinare immagine, codice/figura, gambo, misura, gruppo e disponibilita' commerciale.

Decisione aggiornata:

- il primo benchmark non deve misurare solo "foto -> articolo esatto";
- deve misurare almeno tre livelli:
  1. foto -> famiglia/gruppo corretto;
  2. foto -> silhouette/figura corretta;
  3. foto + misura/gambo/contesto -> articolo ordinabile corretto.

## Aggiornamento 2026-06-03 - Feature index e ricerca visuale locale

Nuovi script:

- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/build-erp-visual-feature-index.mjs`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/search-erp-visual-index.mjs`

Output feature index:

- JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-visual-feature-index/2026-06-03-04-52-35-951/erp-visual-feature-index.json`;
- Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-visual-feature-index-2026-06-03.md`.

Feature calcolate:

- `aHash`;
- `dHash`;
- bounding box normalizzato;
- densita' silhouette;
- proiezioni orizzontali e verticali della forma;
- nearest neighbor deterministici fra silhouette ERP.

Test ricerca locale:

```bash
node archibald-web-app/backend/scripts/search-erp-visual-index.mjs \
  --image /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/erp-product-image-audit/2026-06-01-09-03-17-271/images/001092K3__H1.204.005__438f833c002b.png \
  --top-k 5 \
  --variants 6
```

Risultato atteso confermato:

- primo candidato a distanza `0`;
- gruppo: `FRESE C.T.`;
- figura rappresentativa: `H1`;
- 88 varianti articolo collegate alla stessa silhouette;
- varianti mostrate con prezzo/listino.

Decisione aggiornata:

- il retrieval locale deterministico e' pronto come baseline;
- il prossimo benchmark deve usare foto reali controllate, non solo immagini ERP;
- per ogni foto reale va salvato anche il target atteso: gruppo, figura, gambo, misura, articolo ERP quando noto;
- questa baseline diventera' il confronto minimo contro eventuali embedding/modelli multimodali.

## Aggiornamento 2026-06-03 - Benchmark runner

Nuovi file:

- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/scripts/run-erp-visual-benchmark.mjs`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/recognition-benchmark/smoke-manifest.json`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/recognition-benchmark/manifest.template.json`

Smoke test eseguito:

```bash
node archibald-web-app/backend/scripts/run-erp-visual-benchmark.mjs \
  --manifest archibald-web-app/backend/data/recognition-benchmark/smoke-manifest.json
```

Output:

- JSON: `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/data/recognition-benchmark/runs/2026-06-03-04-55-57-395/erp-visual-benchmark.json`;
- Markdown: `/Users/hatholdir/Downloads/Archibald/docs/recognition/erp-visual-benchmark-2026-06-03.md`.

Risultato:

- 1 caso eseguito;
- top 1 corretto su gruppo, figura, gambo, misura, ERP item e codice articolo;
- il test usa una silhouette ERP identica, quindi serve solo a validare la pipeline, non misura ancora performance su foto reali.

Decisione aggiornata:

- ora abbiamo una pipeline baseline completa: indice visuale -> feature -> search -> benchmark;
- il prossimo lavoro ad alto valore e' raccogliere 20-50 foto reali controllate di articoli sfusi;
- quelle foto devono essere annotate nel manifest benchmark per misurare in modo oggettivo cosa funziona e cosa no.
