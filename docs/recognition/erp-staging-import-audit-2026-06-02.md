# ERP Staging Import Audit

Data: 2026-06-02  
Modalita': Postgres locale Docker, staging recognition.

## Import eseguiti

| Fonte | Run ID | Record | Campi | Immagini |
| --- | --- | ---: | ---: | ---: |
| `INVENTTABLE_ListView` immagini campione | `2026-06-01-09-03-17-271` | 440 | 36 | 428 |
| `PRICEDISCTABLE_ListView` listino completo | `2026-06-02-14-11-05-386` | 4.955 | 46 | 0 |
| `INVENTTABLE_ListView` articoli completo senza immagini | `2026-06-02-16-49-32-516` | 4.523 | 35 | 0 |

## Stato database locale

- Migration applicata: `107-recognition-acquisition-staging.sql`.
- Tabelle staging create:
  - `shared.recognition_acquisition_runs`;
  - `shared.recognition_source_records`;
  - `shared.recognition_visual_references`;
  - `shared.recognition_field_observations`.
- `shared.products` locale esiste ma contiene 0 record; quindi i link diretti `product_id` verso la tabella applicativa sono per ora 0.
- I collegamenti utili sono quindi stati verificati dentro lo staging tramite `ITEMID` / `ITEMRELATIONID`.

## Risultati principali

### Articoli ERP completi

- Righe `INVENTTABLE`: 4.523.
- ERP item distinti: 4.523.
- Codici articolo distinti: 3.922.
- Gruppi prodotto distinti: 73.
- Righe con figura: 4.495.
- Righe con gambo: 4.493.
- Righe con misura: 4.111.
- `ImageCalc` e' disponibile nella griglia, ma non e' stato letto nella run completa per motivi di performance.

### Listino ERP completo

- Righe `PRICEDISCTABLE`: 4.955.
- ERP item prezzo distinti: 4.950.
- Valuta: EUR.
- Righe prezzo con importo: 4.955/4.955.

### Join articoli-listino

| Metrica | Valore |
| --- | ---: |
| Articoli `INVENTTABLE` | 4.523 |
| ERP item prezzo distinti | 4.950 |
| Righe prezzo che matchano un articolo `INVENTTABLE` | 4.522 |
| ERP item prezzo distinti che matchano un articolo `INVENTTABLE` | 4.520 |
| ERP item prezzo senza articolo nella ListView articoli acquisita | 430 |
| Articoli `INVENTTABLE` senza prezzo osservato | 3 |

Gruppi con articoli senza prezzo osservato:

| Gruppo | Articoli senza prezzo |
| --- | ---: |
| `CT - TECNICA DI FRESAGGIO` | 2 |
| `CORSI` | 1 |

### Copertura immagini

- Immagini campione importate: 428.
- Hash immagine unici: 143.
- Articoli della lista completa coperti da immagine campione: 428.
- Articoli della lista completa senza immagine campione: 4.095.

## Evidenze operative

- Ora abbiamo una base ERP articoli completa molto piu' solida del vecchio campione immagini.
- Il listino contiene piu' codici distinti della ListView articoli acquisita. Questo puo' indicare articoli storici, non attivi, non visibili nella vista corrente, o differenze tra tabelle ERP.
- Le discrepanze tra codice articolo da prodotto e da prezzo sono principalmente spaziature, ad esempio `179.204. 1` vs `179.204.  1`.
- Per il riconoscimento, la chiave tecnica primaria resta `ITEMID` / `ITEMRELATIONID`; il codice commerciale va normalizzato per spazi e formattazione prima del confronto.

## Decisione

La prossima fase deve usare come base:

1. `INVENTTABLE_ListView` completo per anagrafica articolo ordinabile/visibile.
2. `PRICEDISCTABLE_ListView` completo per prezzo/listino e verifica commerciale.
3. Immagini ERP gia' raccolte come arricchimento parziale.
4. DetailView articolo come fallback per immagini mancanti o casi dubbi.

Non conviene usare la run immagini da 440 record come base articolo principale: e' solo un campione visivo.
