# Komet Product Data Sources — Mappa Completa per PWA

**Data discovery:** 2026-04-25  
**Scope:** Mappatura certosina di tutte le fonti dati disponibili per prodotti Komet (frese dentali), con focus su dati estraibili per arricchire le schede prodotto della PWA Formicanera e il database `shared.catalog_entries`.

---

## Indice

1. [Mappa fonti e copertura dati](#1-mappa-fonti-e-copertura-dati)
2. [Catalogo campi estraibili — campo per campo](#2-catalogo-campi-estraibili)
3. [kometusa.com — Struttura DOM dettagliata](#3-kometusacom--struttura-dom-dettagliata)
4. [kometuk.com — API Shopify pubblica](#4-kometukcom--api-shopify-pubblica)
5. [clinicalresearchdental.com — Dati tecnici avanzati](#5-clinicalresearchdentalcom--dati-tecnici-avanzati)
6. [henryschein.com.au — Dati tecnici strutturati](#6-henryscheincomau--dati-tecnici-strutturati)
7. [PDF Viking/Komet FG Diamonds — Riferimento tecnico](#7-pdf-vikingkomet-fg-diamonds--riferimento-tecnico)
8. [Catalogo Komet 2025 — 782 pagine](#8-catalogo-komet-2025--782-pagine)
9. [Sistema ring color canonico Komet](#9-sistema-ring-color-canonico-komet)
10. [Sistema ISO 6360 — Decodifica completa](#10-sistema-iso-6360--decodifica-completa)
11. [Schema URL immagini](#11-schema-url-immagini)
12. [Dati disponibili SOLO in PDF ufficiali](#12-dati-disponibili-solo-in-pdf-ufficiali)
13. [Schema TypeScript — ProductEnrichedData](#13-schema-typescript--productenricheddata)
14. [Strategia di estrazione raccomandata per T10–T12](#14-strategia-di-estrazione-raccomandata-per-t10t12)
15. [Piano scheda prodotto PWA — Campi futuri](#15-piano-scheda-prodotto-pwa--campi-futuri)

---

## 1. Mappa Fonti e Copertura Dati

### 1.1 Siti web ufficiali Komet

| Sito | Stato | Note |
|------|-------|------|
| **kometusa.com** | ✅ Attivo | Kentico CMS, dati strutturati nel DOM come `input[data-column]` |
| **kometuk.com** | ✅ Attivo | Shopify, API pubblica `/products/{handle}.json` |
| **kometdental.com** | ✅ Attivo | Sito marketing puro, nessun dato tecnico strutturato |
| **komet.de** | ❌ Inaccessibile | ECONNREFUSED — dominio non risponde |
| **komet.it** | ✅ Attivo | Sito marketing, solo descrizioni generali prodotto |
| **komet.fr** | ✅ Attivo | Sito marketing, icone colore granulometria visibili ma non strutturate |
| **komet.com.br** | ✅ Attivo | E-commerce, nessun dato tecnico |
| **kometdental.de** | ❌ SSL scaduto | Non accessibile |
| **kometdental.at** | ❌ SSL scaduto | Non accessibile |

### 1.2 Fonti di terze parti / distributori

| Fonte | Tipo | Paese |
|-------|------|-------|
| **clinicalresearchdental.com (CRD)** | E-commerce, HTML strutturato | Canada |
| **henryschein.com.au** | E-commerce, attributi strutturati | Australia |
| **fossviking.com** | Distributore, PDF catalogo | Scandinavia |
| **brasselerusa.com** (Brasseler USA) | Distributore ufficiale USA | USA |
| **dentaltix.com** | Marketplace, HTML semi-strutturato | Int'l |
| **stevensondentalsolutions.com** | Rivenditore, attributi prodotto | USA |
| **burdental.com** | Informativo, riferimento ISO | USA |

### 1.3 Documenti ufficiali Komet

| Documento | URL / Percorso | Dimensione | Note |
|-----------|---------------|------------|------|
| **Catalogo Interattivo 2025 (IT/EN)** | `/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf` | 53 MB, 782 pp | Fonte principale. Vettoriale, testo estraibile |
| **Katalog 2026 (DE/EN)** | `contenthub.kometdental.com/infocenter/files/10034685.pdf` | >10 MB | Più aggiornato, non scaricabile direttamente |
| **Ring Color + RPM Guide** | `contenthub.kometdental.com/infocenter/files/410388.pdf` | — | Tabella ufficiale colori + raccomandazioni RPM |
| **IFU Rotary Instruments** | `contenthub.kometdental.com/infocenter/files/10001248.pdf` | 4 MB | Istruzioni d'uso ufficiali |
| **Diamond Ordering Guide** | Via `kometdental.com/doc/bestellhilfe-diamant-ordering-guide-diamond/` | — | Guida ordini diamantate |
| **Carbide Ordering Guide** | `contenthub.kometdental.com/infocenter/files/10000552.pdf` | 3.1 MB | Guida ordini carburi |
| **FG Diamonds PDF (Viking)** | `fossviking.com/wp-content/uploads/2019/06/FG-Diamonds-6-39_lr.pdf` | — | 39 pp, goldmine per ISO code + ring color + working length |
| **Info Center Komet** | `kometdental.com/info-center/` | — | 1.775+ documenti scaricabili |

### 1.4 Matrice di copertura — tutti i campi × tutte le fonti

| Campo | kometusa.com | kometuk.com | CRD | Henry Schein AU | Viking PDF | Catalogo 2025 | dentaltix | Stevenson |
|-------|:-----------:|:-----------:|:---:|:---------------:|:----------:|:-------------:|:---------:|:---------:|
| Descrizione breve | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Shank type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Diametri disponibili | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Working length L (mm) | ⚠️ parziale | ⚠️ solo nuovi | ✅ | ✅ | ✅ | ✅ | ⚠️ alcuni | — |
| Angolo conico α (°) | — | — | ✅ (P-series) | ✅ | — | ✅ | — | — |
| Max RPM | ⚠️ parziale | ✅ | ✅ | ⚠️ parziale | — | ✅ | — | — |
| Grit testuale (Medium/Fine…) | ⚠️ alcuni | ⚠️ alcuni | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Grit in µm | — | — | ✅ alcuni | ✅ alcuni | — | ✅ | — | ✅ alcuni |
| Ring color (strutturato) | ⚠️ solo carbide | — | — | — | ✅ sistematico | ✅ | — | — |
| Ring color (testo) | — | ⚠️ solo nuovi | — | — | ✅ | ✅ | ⚠️ | ✅ alcuni |
| ISO code completo | — | — | ⚠️ parziale | — | ✅ 4 gruppi | ✅ 5 gruppi | — | — |
| ISO shape code (3 cifre) | — | — | — | — | ✅ | ✅ | — | — |
| Indicazione clinica | ✅ (campo) | ⚠️ solo nuovi | ✅ | ⚠️ breve | ⚠️ grafico | ✅ | ✅ | ✅ |
| Matching carbide | ✅ (testo) | ✅ (testo) | ✅ | — | — | ✅ | — | — |
| Packaging (pz) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prezzo | ✅ USD | ✅ GBP | — | — | — | — | ✅ | ✅ |
| US Bur Number | ✅ carbide | — | — | — | — | — | — | — |
| Tip diameter (mm) | — | — | — | — | — | — | — | ✅ |
| Cutting depth (guide pin) | ✅ testo | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Max pressione (N) | ⚠️ solo 856XC | — | — | — | — | — | — | — |
| Cooling (ml/min) | ⚠️ solo 856XC | — | — | — | — | — | — | — |
| Foto prodotto | ✅ | ✅ variante | ✅ | ✅ | ✅ alta qualità | — (disegni) | ✅ | ✅ |
| Schema geometrico vettoriale | — | — | — | — | ✅ | ✅ (lineare) | — | — |
| Foto clinica sequenziale | ⚠️ alcuni | — | ✅ | — | — | — | — | — |
| Diagramma dente/applicazione | — | — | — | — | ✅ | ✅ pittogrammi | — | — |

---

## 2. Catalogo Campi Estraibili

### 2.1 Identificazione prodotto

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `family_code` | Tutti | stringa | `"856"`, `"H21"`, `"8856"` |
| `sku` (Komet REF) | kometusa, kometuk | `{family}.{shank}.{size}` | `"856.314.016"` |
| `sku_pack_suffix` | kometusa | `.K2` (grit indicator?) | `"856.314.016.K2"` |
| `iso_code` | Catalogo 2025, Viking PDF | `806 314 XXXXXX XXX` | `"806 314 198524 016"` |
| `iso_shape_code` | Catalogo 2025, Viking PDF | 3 cifre (pos. 7–9 dell'ISO) | `"198"` (→ round end taper) |
| `komet_internal_id` | kometusa.com | numerico | `8460` (SKUID) |
| `us_bur_number` | kometusa.com | stringa | `"55"`, `"4SE"` (solo carbide) |

### 2.2 Caratteristiche fisiche

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `working_length_mm` | Catalogo 2025 > CRD > Henry Schein > Viking PDF | float | `8.0` |
| `head_diameter_mm` | kometusa, kometuk | float (1/10mm) | `1.6` (da size `016`) |
| `tip_diameter_mm` | Stevenson | float | `1.0` (per 856/016) |
| `taper_angle_deg` | Catalogo 2025 > CRD > Henry Schein | float | `2.0`, `1.7` |
| `shank_total_length_mm` | kometusa (tooltip) | float | `19.0` (FG 314), `44.5` (HP 104) |
| `shank_diameter_mm` | kometusa (tooltip) | float | `1.60` (FG), `2.35` (HP) |

### 2.3 Grana e colore anello

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `ring_color` | Catalogo 2025 > Viking PDF | enum | `'green'`, `'red'`, `'none'`, `'purple'` |
| `grit_label` | Tutti | stringa EN | `"Medium"`, `"Coarse"`, `"Fine"` |
| `grit_label_it` | Catalogo 2025 | stringa IT | `"Media"`, `"Grossa"`, `"Fine"` |
| `grit_size_um` | Catalogo 2025 > CRD > Stevenson | integer | `107`, `46`, `151` |
| `grit_iso_code` | Catalogo 2025, Viking PDF | 3 cifre ISO | `"524"` (medium), `"534"` (coarse) |

### 2.4 Velocità e utilizzo

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `max_rpm` | Catalogo 2025 > kometuk > CRD | integer | `300000`, `160000`, `450000` |
| `max_rpm_by_size` | Catalogo 2025 | `Record<string, number>` | `{"012": 300000, "025": 160000}` |
| `rpm_letter_code` | Catalogo 2025 | lettera → RPM | vedi §8 |
| `max_pressure_n` | kometusa (856XC only) | float | `2.0` |
| `cooling_flow_ml_min` | kometusa (856XC only) | integer | `50` |

### 2.5 Applicazione clinica

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `application_en` | kometusa (GBL_Anwendung) | stringa CSV | `"Crown and Bridge Technique, Crown Preparation"` |
| `application_it` | Catalogo 2025 | stringa | `"Preparazione di corone"` |
| `shape_description_en` | kometusa, kometuk | stringa | `"Tapered chamfer, round"` |
| `shape_description_it` | Catalogo 2025 | stringa | `"Spalla arrotondata, fresa conica"` |
| `clinical_indications` | CRD | `string[]` | `["Crown preparation", "PFM crown"]` |
| `matching_carbide` | kometusa > kometuk > CRD | stringa | `"H375R"` |
| `cutting_depth_by_size` | kometusa, CRD, Henry Schein | `Record<string, number>` | `{"016": 0.30, "021": 0.54}` (guide-pin series) |
| `guide_pin` | Catalogo 2025, kometuk | boolean | `true` (serie P) |

### 2.6 Packaging e vendita

| Campo | Fonte primaria | Formato | Esempio |
|-------|---------------|---------|---------|
| `pack_size` | Tutti | integer | `5`, `1` |
| `price_usd` | kometusa.com | float | `78.85` |
| `price_gbp` | kometuk.com | float | `—` |
| `single_patient_use` | kometusa (SPU line) | boolean | `true` per serie SPU |
| `pack_type` | kometuk body_html | stringa | `"blister pack"` |

### 2.7 Shank

| Campo | Fonte primaria | Formato | Esempi |
|-------|---------------|---------|--------|
| `shank_types` | kometusa, kometuk | `string[]` | `["314", "104"]` |
| `shank_code` | ISO 6360 pos. 4–6 | 3 cifre | vedi §10 |

### 2.8 Immagini

| Campo | Fonte primaria | Formato | Note |
|-------|---------------|---------|------|
| `image_silhouette_url` | kometuk CDN / kometusa getmetafile | URL | Profilo su sfondo bianco, sempre disponibile |
| `image_lateral_url` | kometusa sistema B / kometuk variante | URL template | Foto laterale con shaft, per variante |
| `image_clinical_url` | kometusa getmedia / CRD | URL | Foto uso clinico (non per tutti) |
| `images_variant_map` | kometuk via API | `Record<variant_id, url>` | 1 foto per combinazione shank/size |
| `geometric_diagram_url` | Viking PDF / Catalogo 2025 | — | Solo in PDF, non web |

---

## 3. kometusa.com — Struttura DOM Dettagliata

### 3.1 Campi `data-column` — Lista completa

Tutti i campi presenti negli `input[type="hidden"]` con attributo `data-column`:

**Campi SKU (presenti su tutti i prodotti):**

| data-column | Significato | Formato | Disponibile |
|-------------|------------|---------|------------|
| `SKUID` | ID variante interno | integer | Tutti |
| `SKUName` | Codice + pack (es. "856.HP.033 pack unit 5") | stringa | Tutti |
| `SKUShortDescription` | Frase breve clinica (1-2 righe) | stringa | Tutti |
| `SKUDescription` | HTML lungo: lista grit family + bullet features + img carbide | HTML | Tutti (variabile) |
| `SKUPrice` | Prezzo listino USD | float string | Tutti |
| `SKURetailPrice` | Prezzo retail (quasi sempre 0) | float string | Tutti |
| `SKUNumber` | Codice articolo interno Komet | stringa (es. `004973A2`) | Tutti |
| `SKUParentSKUID` | ID prodotto padre (famiglia) | integer | Tutti |
| `SKUGUID` | UUID univoco | UUID | Tutti |
| `SKUImagePath` | Immagine principale (sistema getmetafile) | path `/getmetafile/UUID/...` | Tutti |
| `SKUImagePath2` | 2ª immagine (sistema Products-images) | path | Alcuni |
| `SKUImagePath3` | 3ª immagine | path | Alcuni |
| `SKUGender` | ID categoria/shape interno | integer | Tutti |
| `SKUEnabled` | Prodotto attivo | boolean | Tutti |
| `SKUIsSale` | In promozione | boolean | Tutti |
| `SKUIsFeatured` | In evidenza | boolean | Tutti |
| `SKULastModified` | Data ultima modifica | stringa data | Tutti |
| `SKUCreated` | Data creazione | stringa data | Tutti |
| `SKUProductType` | Tipo prodotto | `"PRODUCT"` | Tutti |
| `SKUNeedsShipping` | Richiede spedizione | boolean | Tutti |
| `SKUPublicStatusID` | Stato pubblicazione | integer | Alcuni |
| `SKUTrackInventory` | Traccia inventario | stringa | Tutti |
| `SKUSellOnlyAvailable` | Vendi solo se disponibile | boolean | Tutti |

**Campi GBL_* (dati tecnici prodotto):**

| data-column | Significato | Tipo | Presente su |
|-------------|------------|------|------------|
| `GBL_Figur` | Numero famiglia/forma (es. "856", "H21") | stringa | Molti (non tutti) |
| `GBL_Anwendung` | Applicazione clinica (CSV) | stringa | **Tutti** |
| `GBL_Groesse` | Diametro testa (es. "016") | stringa | **Tutti** |
| `GBL_Groesse_D` | Diametro con unità ("016 1/10 mm") | stringa | **Tutti** |
| `GBL_L` | Working length in mm ("8.0 mm") | stringa | ~80% prodotti |
| `GBL_MaxDrehzahl` | Velocità massima RPM | integer stringa | **Tutti** |
| `GBL_Koernung` | Grit label ("Medium", "Coarse") | stringa | Solo alcuni diamond |
| `GBL_Verpackung` | Pezzi per confezione | integer stringa | **Tutti** |
| `GBL_USNo` | US Bur Number | stringa | Solo carbide |
| `GBL_Farbkennzeichen` | Colore anello (in tedesco) | stringa | Carbide + alcuni |
| `GBL_LineDisc_ProductGroupID` | Gruppo sconto linea | stringa | **Tutti** |
| `GBL_MultiLineDisc_ProductGroupID` | Gruppo sconto multi-linea | stringa | **Tutti** |
| `GBL_IsDiscountedProduct` | Ha sconti | boolean | **Tutti** |
| `GBL_Default_VariantOfProduct` | È la variante di default | boolean | **Tutti** |
| `GBL_CustomProduct_Figure` | Prodotto custom | boolean | **Tutti** |
| `GBL_Winkel` | Angolo conico (°) | stringa | Solo alcuni (angulated) |
| `GBL_Koernungstyp` | Tipo legante/bond | stringa | Solo alcuni |

**Decodifica `GBL_Farbkennzeichen` (tedesco → ring color):**

| Valore tedesco | Ring color | Grit |
|---------------|------------|------|
| `schwarz` | Nero (Black) | Super-Coarse |
| `gruen` | Verde (Green) | Coarse |
| (assente) | Blu/Nessuno (Blue/None) | Medium |
| `rot` | Rosso (Red) | Fine |
| `gelb` | Giallo (Yellow) | Extra-Fine |
| `weiss` | Bianco (White) | Ultra-Fine |
| `violett` | Viola (Purple) | Extra-Coarse (Deep Purple) |

### 3.2 Struttura varianti

Le varianti si selezionano via 3 dropdown che triggerano AJAX refresh dei `data-column`:

| Select | Nome | Valori osservati | Significato |
|--------|------|-----------------|-------------|
| Select 1 | Shaft Type | `320`=HP, `321`=RA, `322`=FG, `400`=RASL, `403`=FGSS, `406`=FGSL | Tipo gambo |
| Select 2 | Size | `006`–`050` | Diametro testa in 1/10 mm |
| Select 3 | Pack Size | `5` | Pezzi per conf. (raramente 1) |

Al cambio variante, tutti i `GBL_*` si aggiornano con valori specifici per quella combinazione.

### 3.3 Tooltip shaft tecnici

Per ogni tipo gambo, un tooltip mostra:
- Lunghezza totale (es. HP 104 → 44.5 mm; FG 314 → 19 mm)
- Diametro connessione (es. HP → 2.35 mm; FG → 1.60 mm)
- Immagine disegno del manico: `/Kometusa.com/media/General/Tooltip/{shaftcode}.jpg`

### 3.4 URL navigazione prodotto

```
https://www.kometusa.com/Products/Products-Komet-USA/{FAMILY_CODE}
```
Dove `FAMILY_CODE` è il codice famiglia Komet (es. `856`, `H21`, `6856`, `8856`, `863`).

Categorie URL alternative (stessa struttura dati):
```
/Products/Diamond-Dental-Burs/{FAMILY_CODE}
/Products/General-Dentistry/Application/Crown-Preparation/.../{FAMILY_CODE}
/Products/Tungsten-Carbide-Dental-Burs/{FAMILY_CODE}
```

---

## 4. kometuk.com — API Shopify Pubblica

### 4.1 Endpoint disponibili

```
GET https://kometuk.com/products/{handle}.json          → prodotto singolo
GET https://kometuk.com/products.json?limit=250&page=N  → catalogo paginato (max 250/pagina)
GET https://kometuk.com/collections/{handle}/products.json → per collezione
GET https://kometuk.com/collections.json                → lista collezioni
GET https://kometuk.com/products/{handle}/metafields.json → VUOTO (non pubblici)
```

**Handles validi:** `856`, `863`, `801`, `835`, `879`, `h21`, `6856`, `8856`, `6847krd`, ecc. (handle = family code in minuscolo).

### 4.2 Schema JSON completo

```typescript
// Struttura risposta /products/{handle}.json
{
  product: {
    id: number,
    title: string,              // es. "856" — il family code
    handle: string,             // es. "856" — lowercase
    body_html: string,          // descrizione HTML — vedi §4.3
    vendor: "Komet Dental",
    product_type: "Diamond" | "Tungsten Carbide" | "",
    created_at: string,         // ISO 8601
    updated_at: string,
    published_at: string,
    template_suffix: "nx-product",
    tags: string,               // CSV SEO tags (VUOTO per prodotti classici)

    options: Array<{
      id: number,
      name: "Shank" | "Size" | "Packaging Unit",
      position: 1 | 2 | 3,
      values: string[]          // option1: shank codes; option2: size codes; option3: "5"
    }>,

    variants: Array<{
      id: number,
      title: string,            // es. "314 / 012 / 5"
      option1: string,          // Shank code (es. "314", "104", "204")
      option2: string,          // Size (es. "016" = 1.6mm Ø)
      option3: string,          // Pack unit (quasi sempre "5")
      sku: string,              // Codice ordine (es. "004486K2")
      price: string,            // Prezzo GBP (es. "66.75")
      compare_at_price: string, // Vuoto
      image_id: number | null,  // Link immagine variante (null se mancante)
      fulfillment_service: "manual",
      inventory_management: "shopify",
      taxable: boolean,
      requires_shipping: boolean,
      quantity_rule: { min: 1, max: null, increment: 1 },
      price_currency: "GBP"
    }>,

    images: Array<{
      id: number,
      position: number,         // 1 = siluetta generica; 2+ = foto per variante
      alt: string | null,       // Alt text (null per la maggioranza)
      width: number,            // px
      height: number,           // px
      src: string,              // CDN Shopify URL
      variant_ids: number[]     // [] per generica; [id] per variante specifica
    }>,

    image: { /* shortcut alla prima immagine */ }
  }
}
```

### 4.3 Analisi `body_html` — Due pattern

**Pattern A — Prodotti classici (856, 863, 801, 835, 879, H21):**  
Una sola riga di testo, minima:
```html
<p>The 856 is a medium grit, tapered chamfer diamond bur.</p>
<p>Feather edge long</p>         <!-- 863 -->
<p>Cylinder short</p>            <!-- 835 -->
<p>Fissure</p>                   <!-- H21 -->
```

**Pattern B — Prodotti "arricchiti" (6856, 8856, 6847KRD e varianti nuove):**  
Strutturato in sezioni H3:
```html
<h3>Features</h3>
<ul>
  <li>Coarse grit (green ring)</li>
  <li>Quarter-round chamfer shape</li>
  <li>160,000 rpm</li>
  <li>8.0 mm working length</li>
  <li>Diameter Ø 016 (1/10 mm)</li>
</ul>
<h3>Benefits</h3>
<ul>
  <li>Peripheral crown preparation</li>
  <li>Matches H375R carbide finisher series</li>
</ul>
<h3>Recommendations for use</h3>
<ul>
  <li>blister pack of 5</li>
</ul>
```

**Dati estraibili dal body_html Pattern B (via regex/HTML parser):**
- Grit label: pattern `/(coarse|fine|medium|extra-fine|ultra-fine|super-coarse)\s*grit/i`
- Ring color: pattern `/\((\w+)\s+ring\)/i`
- Max RPM: pattern `/(\d{2,3},?\d{3})\s*rpm/i`
- Working length: pattern `/(\d+\.?\d*)\s*mm\s+working\s+length/i`
- Matching carbide: pattern `/matches?\s+([A-Z]\d+[A-Z]?)\s+carbide/i`

### 4.4 Struttura immagini

**Posizione 1 — Siluetta profilo (sempre disponibile):**
- Dimensioni: ~419×52 px (banner sottile orizzontale)
- `variant_ids: []` — generica per tutti i grits
- Alt text: `"Komet Product {sku} from the category Diamond"`
- URL: CDN Shopify `cdn.shopify.com/s/files/.../{tipo}_{family}_000_000_204_{uuid}.png`

**Posizione 2+ — Foto tecnica per variante:**
- Dimensioni: variabili (898×226 → 2126×535 px)
- `variant_ids: [id]` — specifica per shank/size
- URL: CDN Shopify con UUID univoco (non predicibile senza visita pagina)
- Copertura: non tutte le varianti hanno foto (es. 856: 7 foto su 40+ varianti)

**Alt text prodotti arricchiti:**
```
"Coarse tapered chamfer diamond bur for peripheral crown preparation"  // 6856
"Diamond tapered dental bur with depth markings 2mm and 4mm"           // 6847KRD
"Komet 8856 fine grit tapered chamfer diamond bur for crown prep"       // 8856
```

### 4.5 Opzioni shank — codici

| option1 | Nome shank | Lunghezza | Diametro |
|---------|-----------|-----------|----------|
| `104` | HP (Handpiece dritto) | 44.5 mm | 2.35 mm |
| `204` | RA (Right Angle / Contra-angle) | — | — |
| `313` | FG short shank | — | 1.60 mm |
| `314` | FG (Friction Grip standard) | 19 mm | 1.60 mm |
| `315` | FG long | — | 1.60 mm |
| `316` | FG surgical | — | 1.60 mm |

### 4.6 Catalogo diamond — dimensioni

- Pagina 1–3: ~336+ prodotti Diamond totali
- Famiglie presenti: 801, 835, 856, 863, 879, 6856, 8856, 8879, 8881, 8392, 8379, 6847KRD, ZR-series, S-series (chirurgia), KS-series, DS/WS-series (strips), OS/RS-series
- Iterazione: `GET /products.json?product_type=Diamond+Burs&limit=250&page={N}`

---

## 5. clinicalresearchdental.com — Dati Tecnici Avanzati

### 5.1 Caratteristiche fonte

- Shopify store canadese, distributore ufficiale Komet
- ~240 prodotti Komet catalogo
- HTML stabile e scrapeabile (valutazione 4/5)
- Dati tecnici nei tag e nel body: working length L1, grit µm, RPM, angolo, cutting depth

### 5.2 Campi tecnici disponibili

| Campo | Presenza | Formato | Esempio |
|-------|---------|---------|---------|
| Working length L1 | Molti prodotti | `{N.N} mm` | `8.0 mm` (856), `2.7 mm` (830RM) |
| Grit in µm | Alcuni | `{N} microns` | `107 microns (medium grit)` |
| Max RPM | Molti | `{N,NNN} rpm` | `300,000 rpm` |
| Taper angle | Serie P e conici | `{N}°` | `2°` |
| Cutting depth | Serie guide-pin (P) | per size | `0.30 mm` (016), `0.38 mm` (018) |
| Clinical indication | Testuale | stringa | `"Crown preparation and finishing"` |
| Matching finisher | Molti | codice | `"H375R"` |

### 5.3 Esempi dati estratti

**856 (Tapered Chamfer, medium):**
- Working length: 8.0 mm
- Grit: medium (107 µm)
- Matching: H375R

**T5856 (Turbo Diamond):**
- Working length L1: 8.0 mm (size 014–018), 8.5 mm (size 021–025)
- Max RPM: 300,000 (size 021), 160,000 (size 025)
- Feature: "Spiral cooling canal"

**856XC (Deep Purple / Extra-Coarse):**
- Grit: Extra-coarse (Deep Purple ring, 230 µm)
- Max RPM: 300,000
- Max pressure: 2N
- Cooling: 50 ml/min

### 5.4 URL prodotto pattern

```
https://www.clinicalresearchdental.com/products/komet-{family_code_slug}-{description_slug}
```
Esempio: `/products/komet-830rm-pear-micropreparation-diamond-bur`

---

## 6. henryschein.com.au — Dati Tecnici Strutturati

### 6.1 Caratteristiche fonte

- Distributore globale, presenza italiana/australiana/USA
- Attributi prodotto strutturati nelle schede (HTML)
- Valutazione scrapeabilità: 4/5

### 6.2 Campi tecnici disponibili

| Campo | Presenza | Esempio |
|-------|---------|---------|
| Working length | Molti | `7mm` (5855-025), `8mm` (6856P-021) |
| Grit in µm | Alcuni | `181 µm` (Super Coarse) |
| Max RPM | Alcuni | `160,000 rpm` |
| Taper angle | Alcuni | `4°` (5855), `2°` (6856P) |
| Cutting depth | Guide-pin series | `0.54mm` (021 size) |

### 6.3 URL prodotto pattern

```
https://henryschein.com.au/burs/dental-burs/preparation/diamond-bur-komet-{family}-{size}-{description}-x-{pack}
```
Esempio: `/burs/dental-burs/preparation/diamond-bur-komet-6856p-021-crown-prep-with-guide-pin-x-5`

---

## 7. PDF Viking/Komet FG Diamonds — Riferimento Tecnico

### 7.1 Struttura documento

- **URL:** `https://fossviking.com/wp-content/uploads/2019/06/FG-Diamonds-6-39_lr.pdf`
- **Pagine:** 39
- **Famiglie coperte:** ~70+ forme FG standard + T-series (spiralate) + Z-series (zirconia)
- **Anno:** 2019 (dati tecnici stabili, le forme ISO non cambiano)

### 7.2 Struttura per ogni prodotto

Per ogni forma/famiglia il PDF riporta in una tabella:

| Campo | Formato | Esempio (856) |
|-------|---------|--------------|
| Nome forma | stringa | "Round end taper" |
| Numero prodotto | stringa | `856` |
| Shank | sempre FG | FG |
| Packaging | sempre 5 pz | 5 |
| Working length | float mm | 8.0 mm |
| ISO prefix (4 gruppi) | `806 314 XXX YYY` | `806 314 198 524` |
| Ring color (per grit) | colore | Green (coarse), Blue (medium), Red (fine), Yellow (SF) |
| Diametri disponibili | lista | 010, 012, 014, 016, 018, 021, 025 |
| Codice prodotto Viking | prefisso+numero | `G856` (coarse), `856` (medium), `F856` (fine), `SF856` (super-fine) |

### 7.3 Sistema prefissi ring color nel PDF Viking

| Prefisso | Colore | Grit | ISO grit code |
|----------|--------|------|--------------|
| `SG` | Nero (Black) | Super-Coarse | `544` |
| `G` | Verde (Green) | Coarse | `534` |
| (nessuno) | Blu/Nessuno (Blue/None) | Medium | `524` |
| `F` | Rosso (Red) | Fine | `514` |
| `SF` | Giallo (Yellow) | Super-Fine / Extra-Fine | `504` |
| `UF` | Bianco (White) | Ultra-Fine | `494` |

### 7.4 Campione dati estratti (forme principali)

| Prodotto | Forma | ISO Shape | Working L | Grit disponibili |
|----------|-------|-----------|-----------|-----------------|
| 801 | Round | 001 | — | SG, G, (M), F, SF |
| 802 | Round with collar | 002 | — | G, (M), F |
| 805 | Inverted cone | 010 | 1.0–2.1 mm | G, (M), F |
| 806 | Inverted cone w/collar | 019 | 2.2–3.5 mm | G, (M), F |
| 807 | Inverted cone | 225 | 3.5–5.0 mm | G, (M), F |
| 811 | Barrel | 038 | 4.0–7.0 mm | (M) |
| 822 | Pear | 237 | 2.0–3.0 mm | (M) |
| 830 | Pear | 233 | 2.5–2.7 mm | G, (M), F |
| 830L | Pear long | 234 | 4.0–7.0 mm | G, (M), F |
| 835 | Cylinder flat end | 107 | 3.0–4.0 mm | G, (M), F |
| 836 | Cylinder flat end | 110 | 6.0 mm | SG, G, (M) |
| 837 | Cylinder flat end | 111 | 8.0 mm | SG, (M) |
| 838 | Cylinder round edge | 139 | 4.0 mm | (M) |
| 839 | End cutting | 150 | 0.1 mm | (M) |
| 845 | Flat end taper | 170 | 3.0–4.0 mm | G, (M), F |
| 846 | Flat end taper | 171 | 6.0–7.0 mm | G, (M) |
| 847 | Flat end taper | 172 | 8.0 mm | G, (M) |
| 848 | Flat end taper | 173 | 10.0 mm | (M) |
| 849 | Round end taper | 196 | 4.0 mm | G, (M), F |
| 850 | Round end taper | 199 | 10.0 mm | SG, G, (M), F |
| 855 | Round end taper | 197 | 6.0–7.0 mm | G, (M), F |
| **856** | **Round end taper** | **198** | **8.0 mm** | **SG, G, (M), F, SF** |
| 858 | Needle | 165 | 8.0 mm | (M) |
| 859 | Needle | 166 | 10.0 mm | (M) |
| 860 | Flame | 247 | 5.0 mm | (M) |
| 861 | Flame | 248 | 6.0 mm | (M) |
| 862 | Flame | 249 | 8.0 mm | (M) |
| **863** | **Flame** | **250** | **10.0 mm** | **(M)** |
| 877 | Torpedo beveled | 288 | 6.0 mm | (M) |
| 877K | Torpedo tapered | 297 | 6.0 mm | (M) |
| 878 | Torpedo cylindrical | 289 | 8.0 mm | (M) |
| 878K | Torpedo tapered | 298 | 8.0 mm | (M) |
| **879** | **Torpedo cylindrical** | **290** | **10.0 mm** | **(M)** |
| 879L | Torpedo long | 291 | 12.0 mm | (M) |
| 879K | Torpedo tapered | 299 | 10.0 mm | (M) |
| 880 | Round end cylinder | 140 | 6.0 mm | (M) |
| 881 | Round end cylinder | 141 | 8.0 mm | (M) |
| 882 | Round end cylinder | 142 | 10.0 mm | (M) |
| 905 | Acorn | 031 | 2.7–2.9 mm | (M) |
| 909 | Round wheel | 068 | 1.5–2.0 mm | (M) |
| 368 | Pointed bud | 257 | 3.5–5.0 mm | (M) |
| 379 | Football | 277 | 3.0–5.5 mm | (M) |

*(M) = Medium/Blue/No ring. SG=Super-Coarse/Black. G=Coarse/Green. F=Fine/Red. SF=Extra-Fine/Yellow.*

---

## 8. Catalogo Komet 2025 — 782 Pagine

### 8.1 Struttura documento

- **Percorso locale:** `/Users/hatholdir/Downloads/Catalogo_interattivo_2025 (1).pdf`
- **Pagine:** 782 (A4, bilingue IT/EN)
- **Dimensione:** 53 MB
- **Tipo PDF:** Vettoriale (non scansione) → testo estraibile con `pdftotext`
- **Output `pdftotext -layout`:** ~79.357 righe di testo

### 8.2 Mappa sezioni (pagine indicative)

| Sezione | Pagine | Contenuto |
|---------|--------|-----------|
| Informazioni Generali | 3–11 | Tipi gambo, ISO 6360, pittogrammi, ring color, tabella RPM |
| Studio — Punte Soniche | 12–99 | SonicLine |
| Studio — Punte Ultrasoniche | 102–139 | PiezoLine |
| Studio — CeraBur/PolyBur | 146–155 | Ceramica, polimero |
| **Studio — Carburo di Tungsteno** | **158–191** | Frese (H1SE, H21…), finishers |
| **Studio — Diamantate** | **200–281** | Tutte le frese diamantate |
| Studio — Gommini/Polishers | 284–315 | |
| Studio — Profilassi | 318–327 | |
| Studio — Ortodonzia | 330–347 | |
| Studio — Endodonzia | 350–415 | |
| Studio — Perni radicolari | 418–477 | |
| Studio — Chirurgia | 480–511 | |
| Laboratorio — Carburo | 564–627 | |
| Laboratorio — Diamantate | 640–679 | |
| **IFU (Instructions for Use)** | **754–758** | Incorporate nel catalogo |

### 8.3 Campi tecnici per ogni prodotto

Per ogni famiglia/forma il catalogo riporta:

| Campo | Formato nel PDF | Estraibile con |
|-------|----------------|----------------|
| Codice Komet REF | `856.314.016` (in blu) | Regex `\d+[A-Z]*\.\d{3}\.\d{3}` |
| Codice ISO 6360 completo | `806 314 198524 016` | Regex `\d{3} \d{3} \d{6} \d{3}` |
| Tipo gambo (tutti disponibili) | FG, FGS, FGL, CA, CAL, HP, HPS, HPL, FGXL, CAXL, HPXL, HPST, HPT | parsing blocco |
| Diametri disponibili | lista `012 014 016 018 021` | parsing riga |
| Working length L | `8,0 mm` o `8.0 mm` | Regex `L\s*=?\s*(\d+[,.]?\d*)\s*mm` |
| Angolo conico α | `1,7°` o `2°` | Regex `α\s*=?\s*(\d+[,.]?\d*)\s*°` |
| Max RPM per size | lettera codice | lookup table (vedi §8.4) |
| Grit (indicato nel codice REF) | prefisso/suffisso nel codice | parsing nome famiglia |
| Descrizione forma IT | `"Spalla arrotondata, fresa conica"` | parsing testo |
| Descrizione forma EN | `"Tapered chamfer, round"` | parsing testo |
| Indicazione clinica IT | `"Preparazione di corone"` | parsing testo |
| Indicazione clinica EN | `"Crown preparation"` | parsing testo |
| Matching finisher | cross-ref nel blocco | parsing testo |
| Packaging | `/5` o `/1` | Regex `/(\d+)` |

### 8.4 Tabella codici lettera → RPM massimo

| Lettera | RPM max |
|---------|---------|
| `k` | 20.000 |
| `l` | 25.000 |
| `m` | 30.000 |
| `u` | 100.000 |
| `v` | 120.000 |
| `w` | 140.000 |
| `x` | 150.000 |
| `y` | 160.000 |
| `z` | 300.000 |
| `Z` | 300.000 (uppercase usato in alcune sezioni) |
| `A` | 450.000 (turbina FG ad alta velocità) |

### 8.5 Codifica grit nel codice REF Komet

| Prefisso/Suffisso nel codice | Grit | Ring color |
|------------------------------|------|------------|
| `UF` prefix (es. `UF856`) | Ultra-Fine | Bianco |
| `EF` prefix (es. `EF856`) | Extra-Fine | Giallo |
| nessun prefix, nessun numero | Medium | Blu/Nessuno |
| `5` prefix (es. `5856`) | Fine* | Rosso |
| `6` prefix (es. `6856`) | Coarse* | Verde |
| `8` prefix (es. `8856`) | Super-Coarse | Nero |
| `XC` suffix (es. `856XC`) | Extra-Coarse | Viola |

*Nota: la mappatura prefisso 5→Fine e 6→Coarse è confermata dal blog Komet USA e dal catalogo Viking. Il prefisso numerico è una convenzione commerciale Komet, non una parte del codice ISO.

---

## 9. Sistema Ring Color Canonico Komet

**Fonte ufficiale:** Komet USA Blog (maggio 2022) + contenthub.kometdental.com/infocenter/files/410388.pdf

| Ring color | Nome EN | Nome IT | Grit (µm) | ISO grit code | Prefisso REF |
|-----------|---------|---------|-----------|--------------|-------------|
| Viola / Purple | Extra-Coarse | Extragrossa | 230 µm | — | `XC` suffix |
| Nero / Black | Super-Coarse | Supergrossa | 181 µm | `544` | `8` prefix |
| Verde / Green | Coarse | Grossa | 151 µm | `534` | `6` prefix |
| Nessuno / None-Blue | Medium | Media | 107 µm* | `524` | (nessuno) |
| Rosso / Red | Fine | Fine | 46 µm | `514` | `5` prefix |
| Giallo / Yellow | Extra-Fine | Extrafine | 25 µm | `504` | `EF` prefix |
| Bianco / White | Ultra-Fine | Ultrafine | 8 µm | `494` | `UF` prefix |

*La granulometria media può variare per forma e misura.

**Il ring color è derivabile dal grit ISO code (posizione 10–12 del codice ISO):**
```
ISO code: 806 314 198 [524] 016
                      ^^^
                      grit code → lookup → "none/blue" → "Medium"
```

---

## 10. Sistema ISO 6360 — Decodifica Completa

Il codice ISO 6360 completo ha 15 caratteri divisi in 5 gruppi:

```
806  314  198524  016
 │    │      │     │
 │    │      │     └── Gruppo 5: Diametro (1/10 mm) — es. 016 = 1.6 mm
 │    │      └──────── Gruppo 3+4: Forma (3 cifre) + Esecuzione/Grit (3 cifre)
 │    └─────────────── Gruppo 2: Gambo (3 cifre)
 └──────────────────── Gruppo 1: Materiale (3 cifre)
```

### 10.1 Gruppo 1 — Materiale (3 cifre)

| Codice | Materiale |
|--------|-----------|
| `806` | Diamante con legante galvanico su supporto acciaio |
| `836` | Diamante con legante sinterizzato |
| `500` | Carburo di tungsteno |
| `310` | Acciaio |
| `320` | Acciaio chirurgico |

### 10.2 Gruppo 2 — Gambo (3 cifre)

| Codice | Tipo | Lunghezza | Diametro Ø |
|--------|------|-----------|-----------|
| `314` | FG (Friction Grip standard) | 19 mm | 1.60 mm |
| `313` | FG short | — | 1.60 mm |
| `315` | FG long | — | 1.60 mm |
| `316` | FG surgical | — | 1.60 mm |
| `204` | CA (Contra-Angle / Right Angle) | — | — |
| `104` | HP (Handpiece dritto) | 44.5 mm | 2.35 mm |

### 10.3 Gruppo 3 — Shape code (prime 3 cifre del gruppo 3+4)

Selezione delle forme più comuni nel nostro catalogo:

| Shape code | Forma Komet | Nome IT | Nome EN |
|-----------|------------|---------|---------|
| `001` | 801 | Sferica | Round |
| `002` | 802 | Sferica con collare | Round with collar |
| `010` | 805 | Cono rovescio | Inverted cone |
| `019` | 806 | Cono rovescio con collare | Inverted cone w/collar |
| `031` | 905 | Ghianda | Acorn |
| `038` | 811 | Cilindro | Barrel |
| `040` | 815 | Ruota | Wheel |
| `068` | 909 | Ruota rotonda | Round wheel |
| `107` | 835 | Cilindro piatto | Cylinder flat end |
| `110` | 836 | Cilindro piatto | Cylinder flat end |
| `111` | 837 | Cilindro piatto | Cylinder flat end |
| `139` | 838 | Cilindro arrotondato | Cylinder round edge |
| `140` | 880 | Cilindro eff. arrotondato | Round end cylinder |
| `141` | 881 | Cilindro eff. arrotondato | Round end cylinder |
| `142` | 882 | Cilindro eff. arrotondato | Round end cylinder |
| `165` | 858 | Ago | Needle |
| `166` | 859 | Ago | Needle |
| `170` | 845 | Cono piatto | Flat end taper |
| `171` | 846 | Cono piatto | Flat end taper |
| `172` | 847 | Cono piatto | Flat end taper |
| `173` | 848 | Cono piatto | Flat end taper |
| `196` | 849 | Cono eff. arrotondato | Round end taper |
| `197` | 855 | Cono eff. arrotondato | Round end taper |
| `198` | 856 | Cono eff. arrotondato | Round end taper (tapered chamfer) |
| `199` | 850 | Cono eff. arrotondato | Round end taper |
| `225` | 807 | Cono rovescio | Inverted cone |
| `233` | 830 | Pera | Pear |
| `234` | 830L | Pera lunga | Pear long |
| `247` | 860 | Fiamma | Flame |
| `248` | 861 | Fiamma | Flame |
| `249` | 862 | Fiamma | Flame |
| `250` | 863 | Fiamma | Flame (feather edge long) |
| `257` | 368 | Bud a punta | Pointed bud |
| `277` | 379 | Football | Football |
| `288` | 877 | Siluro | Torpedo beveled |
| `289` | 878 | Siluro | Torpedo cylindrical |
| `290` | 879 | Siluro | Torpedo cylindrical |
| `291` | 879L | Siluro lungo | Torpedo long |
| `297` | 877K | Siluro conico | Torpedo tapered |
| `298` | 878K | Siluro conico | Torpedo tapered |
| `299` | 879K | Siluro conico | Torpedo tapered |

### 10.4 Gruppo 4 — Grit/Esecuzione (ultime 3 cifre del gruppo 3+4)

| Codice | Grit | Ring color |
|--------|------|-----------|
| `494` | Ultra-Fine | Bianco |
| `504` | Extra-Fine / Super-Fine | Giallo |
| `514` | Fine | Rosso |
| `524` | Medium | Nessuno / Blu |
| `534` | Coarse | Verde |
| `544` | Super-Coarse | Nero |

### 10.5 Gruppo 5 — Diametro (3 cifre, 1/10 mm)

| Codice | Diametro |
|--------|---------|
| `006` | 0.6 mm |
| `008` | 0.8 mm |
| `009` | 0.9 mm |
| `010` | 1.0 mm |
| `012` | 1.2 mm |
| `014` | 1.4 mm |
| `016` | 1.6 mm |
| `018` | 1.8 mm |
| `021` | 2.1 mm |
| `023` | 2.3 mm |
| `025` | 2.5 mm |
| `029` | 2.9 mm |
| `031` | 3.1 mm |
| `033` | 3.3 mm |
| `035` | 3.5 mm |

---

## 11. Schema URL Immagini

### 11.1 kometusa.com — Sistema A (getmetafile, immagine profilo principale)

```
https://www.kometusa.com/getmetafile/{UUID}/{tipo}_{family}_000_000_204.aspx
```

Convenzione naming file:
- `03di` = Diamond
- `01tc` = Tungsten Carbide
- `000_000` = variante neutra (no shaft/size specifici)
- `204` = versione/risoluzione

⚠️ **Non predicibile senza UUID** — richiede scraping della pagina per ottenere l'UUID dalla data-column `SKUImagePath`.

### 11.2 kometusa.com — Sistema B (Products-images, foto laterale per variante)

```
https://www.kometusa.com/Kometusa.com/media/Products-images/{tipo}_{family}_{shankCode}_{size}_{rpmCode}.png?ext=.png
```

Esempio: `03di_835_314_010_450.png` = Diamond 835, FG shank (314), size 010, 450k rpm class

**✅ URL predicibile** da: tipo prodotto + family code + shank code + size + RPM class.

RPM class nel filename:
- `450` = max RPM ≤ 450,000
- `303` = altra angolazione (stesso prodotto)

### 11.3 kometusa.com — Sistema C (getmedia, immagini cliniche)

```
https://www.kometusa.com/getmedia/{UUID}/ki_{applicazione}_{family}_{num}.aspx?width=550&height=412&ext=.jpg
```

- `ki_kav` = Klinisches Bild Kavität (cavità)
- `ki_kro` = Klinisches Bild Krone (corona)

⚠️ Non predicibile senza UUID. Solo alcuni prodotti le hanno.

### 11.4 kometuk.com — Shopify CDN (foto per variante)

```
https://cdn.shopify.com/s/files/1/0913/4902/5109/files/{tipo}_{family}_{shank}_{size}_{quality}_{uuid}.png?v={ts}
```

⚠️ **Non predicibile** — UUID univoco per ogni immagine. Reperibile via API (`images[].src`).

**Immagine siluetta** (sempre disponibile, pos. 1 nel JSON):
- Dimensioni: ~419×52 px (banner orizzontale sottile)
- Identificata da `variant_ids: []`

**Foto tecnica per variante** (pos. 2+):
- Dimensioni: da 898×226 px a 2126×535 px
- Identificata da `variant_ids: [id_variante]`
- Copertura: parziale (non tutte le combinazioni shank/size hanno foto)

### 11.5 Schema immagini per tipo

| Tipo immagine | Fonte consigliata | Disponibilità |
|---------------|------------------|---------------|
| Siluetta profilo forma | kometuk.com API (pos. 1) | ~100% famiglie |
| Foto tecnica laterale (variante) | kometuk.com API (pos. 2+) | ~60–70% varianti |
| Foto profilo su bianco (alta risoluzione) | kometusa.com sistema A | ~100% famiglie |
| Foto con scala mm | kometusa.com sistema B | ~70% famiglie×varianti |
| Foto clinica in utilizzo | kometusa.com sistema C | ~20% prodotti |
| Schema geometrico vettoriale | Viking PDF / Catalogo 2025 | Solo PDF |
| Pittogramma indicazione clinica | Catalogo 2025 | Solo PDF |

---

## 12. Dati Disponibili SOLO in PDF Ufficiali

I seguenti dati **non sono reperibili da nessun sito web** — esistono solo nei PDF catalogo ufficiali o nelle IFU:

| Dato | Fonte PDF | Note |
|------|-----------|------|
| Angolo conico α esatto per ogni prodotto | Catalogo 2025 | Varia per forma (es. 1.7° / 2° / 4°) |
| RPM max per diametro specifico | Catalogo 2025 | Varia: size grandi → RPM minori |
| ISO code completo a 5 gruppi | Catalogo 2025, Viking PDF | Il web mostra al massimo 4 gruppi |
| Cross-reference sistematica diamond ↔ carbide | Catalogo 2025 | Ogni diamantata ha il finisher corrispondente |
| Numero di lame per finishers carbide | Catalogo 2025 | 30=UF, 20=F, 12=standard, 8=coarse |
| Set clinici completi (composizione) | Catalogo 2025 | Codice set + lista prodotti |
| Schemi geometrici vettoriali quotati | Catalogo 2025, Viking PDF | Profilo 1:1 con L e α |
| Pittogrammi indicazioni cliniche | Catalogo 2025 | Grafico per cavità/corona/endo/chirurgia |
| Pressione massima raccomandata | Kometusa (solo 856XC) | In N — dato raro |
| Portata refrigerazione raccomandata | Kometusa (solo 856XC) | In ml/min — dato raro |
| Numero utilizzi max / cicli sterilizzazione | IFU (pag. 754-758) | Non online |
| Compatibilità autoclave ciclo B | IFU | Non online |
| CE marking / FDA clearance per prodotto | IFU | Numero specifico per lotto |
| Wear rate / durabilità comparativa | Letteratura clinica | Non in catalogo |
| Tabella RPM per materiale (smalto/dentina/ceramica) | Letteratura clinica | Non in catalogo |
| Grain size distribution (non solo media) | Non pubblico | Solo dati interni Komet |

---

## 13. Schema TypeScript — ProductEnrichedData

```typescript
type RingColor = 'purple' | 'black' | 'green' | 'none' | 'red' | 'yellow' | 'white'

type GritLabel = 'extra-coarse' | 'super-coarse' | 'coarse' | 'medium' | 'fine' | 'extra-fine' | 'ultra-fine'

type ShankType = '104' | '204' | '313' | '314' | '315' | '316'

type ProductEnrichedData = {
  // === Identificazione ===
  family_code: string                     // es. "856" — PK nel nostro DB
  sku_pattern: string                     // es. "856.{shank}.{size}"
  iso_code_template: string              // es. "806 314 198{grit} {size}" — senza size specifica
  iso_shape_code: string                 // es. "198" — il group 3 dell'ISO (3 cifre)
  us_bur_number?: string                 // es. "55" — solo carbide

  // === Caratteristiche fisiche ===
  working_length_mm: number | null       // es. 8.0 — NULL se non applicabile (es. round bur 801)
  taper_angle_deg?: number              // es. 2.0, 1.7 — solo per frese coniche
  shank_options: ShankType[]            // es. ["314", "104"]
  size_options: string[]                // es. ["012","014","016","018","021","025"]
  tip_diameter_mm?: number              // es. 1.0 — non sempre disponibile

  // === Grana e colore ===
  ring_color: RingColor                  // per la variante di default
  grit_label: GritLabel                  // per la variante di default
  grit_label_it: string                  // es. "Media", "Grossa" — per UI italiana
  grit_size_um: number | null            // es. 107, 46 — null se non specificato

  // === Velocità ===
  max_rpm: number                        // es. 300000 — velocità massima assoluta
  max_rpm_by_size?: Record<string, number> // es. {"012": 300000, "025": 160000}

  // === Applicazione ===
  application_categories: string[]       // es. ["Crown Preparation", "Crown and Bridge"]
  application_categories_it: string[]    // es. ["Preparazione corone", "Protesi"]
  shape_description_en: string           // es. "Tapered chamfer, round end"
  shape_description_it: string           // es. "Spalla arrotondata, conica"
  clinical_indications: string[]         // es. ["Crown prep", "PFM crown", "All-ceramic"]
  matching_carbide?: string              // es. "H375R"
  matching_diamond_grit_family?: Record<GritLabel, string> // es. {"coarse":"6856","fine":"8856"}

  // === Dati speciali (non sempre disponibili) ===
  guide_pin: boolean                     // true per serie P (con perno guida)
  cutting_depth_by_size?: Record<string, number> // es. {"016":0.30,"018":0.38} — solo P series
  max_pressure_n?: number               // es. 2.0 — solo serie XC
  cooling_flow_ml_min?: number          // es. 50 — solo serie XC
  has_spiral_cooling?: boolean           // true per T-series (Turbo)
  depth_markings_mm?: number[]          // es. [2, 4] — per serie KRD

  // === Packaging ===
  pack_size: number                      // es. 5
  pack_type?: string                     // es. "blister pack"
  single_patient_use: boolean            // true per serie SPU

  // === Immagini ===
  image_silhouette_url?: string          // siluetta profilo su bianco
  image_lateral_url_template?: string    // es. "/media/Products-images/03di_{family}_{shank}_{size}_{rpm}.png"
  image_clinical_url?: string            // foto uso clinico (se disponibile)

  // === Metadati fonte ===
  data_sources: string[]                 // es. ["kometusa.com", "catalog_2025_pdf"]
  last_enriched_at: string               // ISO 8601
}
```

---

## 14. Strategia di Estrazione Raccomandata per T10–T12

### 14.1 Pipeline multi-fonte (in ordine di priorità per ogni campo)

```
┌─────────────────────────────────────────────────────────────┐
│                    CAMPO: iso_shape_code                    │
│ Fonte 1: Catalogo PDF 2025 → pdftotext + regex              │
│ Fonte 2: Viking PDF → regex ISO code                        │
│ Fonte 3: Derivazione da family_code (lookup table §10.3)    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  CAMPO: working_length_mm                   │
│ Fonte 1: Catalogo PDF 2025 → pdftotext + regex L=           │
│ Fonte 2: Viking PDF → tabella                               │
│ Fonte 3: CRD scraping → HTML parser                         │
│ Fonte 4: Henry Schein AU scraping → HTML parser             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CAMPO: ring_color                        │
│ Fonte 1: Derivazione da grit_code ISO (pos. 10-12) §9       │
│ Fonte 2: kometusa.com GBL_Farbkennzeichen (campo DOM)       │
│ Fonte 3: Viking PDF → prefisso REF                          │
│ Fonte 4: kometuk.com body_html → regex "(green ring)"       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      CAMPO: max_rpm                         │
│ Fonte 1: Catalogo PDF 2025 → lettera RPM + lookup §8.4      │
│ Fonte 2: kometuk.com body_html → regex                      │
│ Fonte 3: CRD → HTML parser                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               CAMPO: application_categories                 │
│ Fonte 1: kometusa.com GBL_Anwendung (campo DOM)             │
│ Fonte 2: Catalogo PDF 2025 → testo indicazione             │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 Approccio pratico (T10)

**Step 1 — PDF Parsing (primario per iso_shape_code, working_length, max_rpm):**
```bash
pdftotext -layout "Catalogo_interattivo_2025 (1).pdf" catalog_raw.txt
```
Poi script Node.js per parsare `catalog_raw.txt`:
- Identifica blocchi prodotto (delimitati da intestazioni sezione)
- Estrae per ogni famiglia: REF codes, ISO codes, L=, α=, RPM letters, forma IT/EN, indicazione

**Step 2 — kometusa.com scraping (per application, grit, ring_color, immagini):**
- GET `/Products/Products-Komet-USA/{family_code}` per ogni family_code nel nostro DB
- Parse DOM: estrai tutti i `data-column` fields
- Per le varianti: opzionale (click AJAX non richiesto per la variante di default)

**Step 3 — kometuk.com API (per immagini variante, shank options, price GBP):**
- GET `/products/{family_code}.json` per ogni family_code
- Estrai: images per variante, shank options, body_html (parse per campi aggiuntivi)

**Step 4 — Merge e validazione:**
- Fonte primaria per ogni campo come da §14.1
- Conflitti: favorire Catalogo 2025 > CRD/Henry Schein > kometusa.com > kometuk.com
- Campi mancanti: `NULL` nel DB, non valore inventato

### 14.3 Script diagnostico consigliato (da creare prima di T10)

```javascript
// diag-catalog-pdf-structure.mjs
// Analizza catalog_raw.txt e stampa:
// 1. Numero di famiglie identificate
// 2. Percentuale famiglie con L= (working length)
// 3. Percentuale famiglie con ISO code completo
// 4. Sample di 10 famiglie parsate per verifica manuale
```

---

## 15. Piano Scheda Prodotto PWA — Campi Futuri

Basandosi sulla ricerca, questi sono i campi aggiuntivi che potrebbero arricchire la scheda prodotto nella PWA (da pianificare come task separato in sessione futura):

### 15.1 Sezione tecnica (già nel DB o da aggiungere)

| Campo | Disponibile da | Priorità |
|-------|---------------|---------|
| `working_length_mm` | Catalogo 2025 | Alta |
| `max_rpm` | Catalogo 2025 | Alta |
| `ring_color` | Derivazione ISO / Catalogo | Alta |
| `grit_label_it` | Catalogo 2025 | Alta |
| `grit_size_um` | Catalogo 2025 | Media |
| `taper_angle_deg` | Catalogo 2025 | Media |
| `iso_code` | Catalogo 2025 | Alta |
| `matching_carbide` | kometusa / Catalogo | Media |
| `application_categories_it` | Catalogo 2025 | Alta |
| `pack_type` | kometuk body_html | Bassa |
| `tip_diameter_mm` | Stevenson / CRD | Bassa |

### 15.2 Sezione immagini (da aggiungere)

| Immagine | Fonte | Priorità |
|----------|-------|---------|
| Siluetta profilo | kometuk.com API | Alta |
| Foto tecnica per variante (shank/size) | kometuk.com API | Alta |
| Foto clinica in utilizzo | kometusa sistema C | Bassa |

### 15.3 Sezione correlati (da aggiungere)

| Elemento | Fonte | Priorità |
|----------|-------|---------|
| Grit family links (es. 856↔6856↔8856) | kometusa SKUDescription + Catalogo | Alta |
| Matching carbide finisher | kometusa / Catalogo | Media |
| Cross-reference guide pin series | Catalogo 2025 | Bassa |

### 15.4 Layout proposto per scheda prodotto PWA

```
┌──────────────────────────────────────────────────┐
│  [SILUETTA FORMA]     856 — Tapered Chamfer      │
│  [FOTO VARIANTE]      Spalla arrotondata, conica │
├──────────────────────────────────────────────────┤
│  GRANA: ████████ Media (107 µm) [●Nessun anello] │
│  FAMIGLIA GRANA:  ← Fine | Medium | Grossa →     │
│                   8856   856    6856              │
├──────────────────────────────────────────────────┤
│  TECNICO                                         │
│  Working Length    8.0 mm                        │
│  Angolo conico     2°                            │
│  RPM max          300.000                        │
│  Gambi disponibili FG · HP                       │
├──────────────────────────────────────────────────┤
│  APPLICAZIONE                                    │
│  🦷 Preparazione corone                          │
│  🦷 Tecnica corona e ponte                       │
│  Finisher carbide abbinato: H375R                │
├──────────────────────────────────────────────────┤
│  [Seleziona Gambo] [Seleziona Diametro]          │
│  Conf. 5 pz  ·  Codice 856.314.016              │
│  ISO: 806 314 198524 016                        │
└──────────────────────────────────────────────────┘
```

---

*Documento generato da sessione discovery 2026-04-25. Aggiornare se nuove fonti vengono identificate o se la struttura dei siti Komet cambia.*
