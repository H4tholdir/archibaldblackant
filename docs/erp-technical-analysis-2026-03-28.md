# Archibald ERP - Technical Analysis Report

**Date:** 2026-03-28
**Analyst:** Automated Playwright exploration
**Purpose:** Evaluate data extraction strategies to replace/complement PDF scraping

---

## 1. EXECUTIVE SUMMARY

### Technology Stack
- **Framework:** DevExpress eXpressApp Framework (XAF) on ASP.NET WebForms
- **UI Controls:** DevExpress ASPxGridView, ASPxFormLayout, ASPxMenu, ASPxNavBar
- **Theme:** XafTheme (custom DevExpress theme)
- **Session:** ASP.NET Session (cookie: `ASP.NET_SessionId`), session-based auth
- **Data Transfer:** ASP.NET Callbacks (`WebForm_DoCallback`) - NOT REST/JSON APIs
- **AJAX Pattern:** DevExpress proprietary callback mechanism (POST to same page URL, response wrapped in `/*DX*/({...})`)
- **Export:** PDF only (no XLS/CSV export available)
- **App Name:** "KI di gestione intelligente degli ordini"

### URL Structure Pattern
- **List Views:** `/Archibald/{ENTITY}_ListView{Suffix}/` (e.g., `CUSTTABLE_ListView_Agent`)
- **Detail Views:** `/Archibald/{ENTITY}_DetailView{Suffix}/{ID}/?mode=View`
- **Login:** `/Archibald/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`
- **Binary Handler:** `/Archibald/DXX.axd?handlerName=BinaryDataHttpHandler&processorID=...`

### Authentication Mechanism
- **Method:** ASP.NET Forms Authentication via cookie
- **Cookies:**
  - `ASP.NET_SessionId` (session, httpOnly) - primary session identifier
  - `xafkidemovbUserName` (30 days, httpOnly) - "remember me" cookie
  - `Login` (session, httpOnly) - login state
  - 2 GUID cookies (session) - XAF internal state
- **Login Button:** ID pattern `Logon_PopupActions_Menu_DXI0_T`, text "Accedi"
- **Login Fields:** Dynamic IDs containing `UserName` and `Password` keywords

### Data Approach
**100% Server-Side Rendering (SSR).** All data is rendered as HTML in `<tr>/<td>` cells within DevExpress ASPxGridView controls. There are NO JSON REST endpoints. Pagination, sorting, and filtering are handled via ASP.NET callbacks that return HTML fragments wrapped in a proprietary `/*DX*/({...})` format.

---

## 2. SYNC OPTIMIZATION OPPORTUNITIES

### 2.1 Clienti (Customers) - CRITICAL

| Aspect | Current (PDF) | Possible (HTML Scraping) | Improvement |
|--------|--------------|--------------------------|-------------|
| **Method** | Navigate to list, generate PDF, download, parse PDF | Scrape HTML grid directly from `CUSTTABLE_ListView_Agent` | 5-10x faster |
| **All records** | Paginate through PDF pages | Set page size to 200, iterate 7 pages of HTML | Much more reliable |
| **Detail data** | Navigate to each customer detail page | Scrape `xaf_dvi{FIELD}_View` elements from detail URLs | Same reliability, structured |
| **New approach** | N/A | **Callback interception**: POST to same URL with `__VIEWSTATE`, get response with record keys + HTML fragment | Fastest possible |

**Key finding:** The grid callback response contains `stateObject.keys` array with ALL record IDs on the current page. Combined with `cpFastCallBackObjects` which maps row indices to XAF entity references like `xafkidemovb.Module.CRMKI.CUSTTABLE(55156)`, we can:
1. Set page size to 200
2. Iterate 7 pages
3. Get all ~1,300 customer IDs
4. Scrape each customer's data from the grid HTML (26 columns visible in list view)

### 2.2 Ordini (Orders) - CRITICAL

| Aspect | Current (PDF) | Possible (HTML Scraping) | Improvement |
|--------|--------------|--------------------------|-------------|
| **Method** | PDF saleslines parse | Scrape order detail page grid directly | Eliminates PDF parsing entirely |
| **Sales lines** | Parse PDF table with fragile column detection | Read `tr.dxgvDataRow_XafTheme` cells from order detail grid | 10x more reliable |
| **Order fields** | Navigate + scrape | `xaf_dvi{FIELD}_View` elements | Structured, stable selectors |

**Order lines grid has 8 rows per order with columns:**
LINEA, NOME ARTICOLO, QTA ORDINATA, UNITA DI PREZZO, SCONTO %, APPLICA SCONTO %, IMPORTO DELLA LINEA, PREZZO NETTO, NOME

### 2.3 DDT (Delivery Notes)

| Aspect | Current (PDF) | Possible (HTML Scraping) |
|--------|--------------|--------------------------|
| **Method** | PDF download + parse | Scrape list + detail pages |
| **Line items** | PDF table parsing | Grid rows with LINEA, ID ARTICOLO, NOME, ORDINATO, QUANTITA, RIMANERE, NR. LOTTO |

### 2.4 Fatture (Invoices)

| Aspect | Current (PDF) | Possible (HTML Scraping) |
|--------|--------------|--------------------------|
| **Method** | PDF download + parse | Scrape list + detail pages |
| **Line items** | PDF table parsing | Grid rows with LINEA, ID ARTICOLO, NOME ARTICOLO, QUANTITA, PREZZO DI VENDITA, SCONTO %, IMPORTO LINEA MST, NR. LOTTO |
| **Payment info** | Parse from PDF | Direct fields: DUEDATE, CLOSED, LASTSETTLEDATE, OVERDUEDAYS, SETTLEAMOUNTMST, REMAINAMOUNTMST |

### 2.5 Prodotti (Products)

| Aspect | Current | Possible |
|--------|---------|----------|
| **Record count** | 227 pages x 20 = ~4,540 products | Same, scrape HTML grid |
| **Fields** | PDF catalog parse | Direct from grid: ITEMID, NAME, DESCRIPTION, PRODUCTGROUPID, LOWESTQTY, MULTIPLEQTY, HIGHESTQTY, STANDARDQTY, PRICEUNIT, STOPPED, TAXITEMGROUPID |

### 2.6 Prezzi (Prices)

| Aspect | Current | Possible |
|--------|---------|----------|
| **Record count** | 248 pages x 20 = ~4,960 price records | Same, scrape HTML grid |
| **Fields** | PDF parse | Direct: ITEMRELATIONID, ACCOUNTRELATIONID, AMOUNT, FROMDATE, TODATE, PERCENT1, PERCENT2, PRICEUNIT, QUANTITYAMOUNTFROM/TO |

### 2.7 Sconti Linea (Line Discounts)

| Aspect | Current | Possible |
|--------|---------|----------|
| **Record count** | 89 pages x 20 = ~1,780 discount records | Same |
| **Fields** | Not yet implemented | ITEMRELATIONID, ACCOUNTRELATIONID, PERCENT1 (=63 for Fresis), FROMDATE, TODATE |

---

## 3. COMPLETE FIELD MAP

### 3.1 CUSTTABLE (Clienti)

**List View:** `/Archibald/CUSTTABLE_ListView_Agent/`
**Detail View:** `/Archibald/CUSTTABLE_DetailView/{id}/?mode=View`
**Record Count:** ~1,300 (66 pages x 20 rows)
**Grid ID Pattern:** `Vertical_v2_{sessionNum}_LE_v2`

#### List View Columns (26 data columns)

| # | ERP Field | Display Label | Type | CSS Class |
|---|-----------|---------------|------|-----------|
| 0 | ACCOUNTNUM | PROFILO CLIENTE: | string | dxgv dx-al |
| 1 | BRASCRMATTENTIONTO | ALL'ATTENZIONE DI: | string | dxgv dx-al |
| 2 | BUSRELTYPEID.TYPEDESCRIPTION | DESCRIZIONE: | string | dxgv dx-al |
| 3 | BUSRELTYPEID.TYPEID | TYPE: | string | dxgv dx-al |
| 4 | CELLULARPHONE | CELLULARE: | string | dxgv dx-al |
| 5 | CITY | CITTA | string | dxgv dx-al |
| 6 | DLVMODE.TXT | TERMINI DI CONSEGNA | string | dxgv dx-al |
| 7 | EXTERNALACCOUNTNUM | NUMERO DI CONTO ESTERNO | string | dxgv dx-al |
| 8 | FISCALCODE | CODICE FISCALE: | string | dxgv dx-al |
| 9 | ID | ID | numeric | dxgv dx-ar |
| 10 | LASTORDERDATE | DATA DELL'ULTIMO ORDINE | date | dxgv dx-al |
| 11 | LEGALAUTHORITY | SDI: | string | dxgv dx-al |
| 12 | LEGALEMAIL | PEC: | string | dxgv dx-al |
| 13 | LOGISTICSADDRESSZIPCODE.ZIPCODE | INDIRIZZO LOGISTICO CAP | string | dxgv dx-al |
| 14 | NAME | NOME | string | dxgv dx-al |
| 15 | ORDERCOUNTACT | CONTEGGI DEGLI ORDINI EFFETTIVI | numeric | dxgv dx-ar |
| 16 | ORDERCOUNTPREV | CONTEGGIO DEGLI ORDINI PRECEDENTE | numeric | dxgv dx-ar |
| 17 | ORDERCOUNTPREV2 | CONTEGGIO DEGLI ORDINI PRECEDENTE 2 | numeric | dxgv dx-ar |
| 18 | OURACCOUNTNUM | IL NOSTRO NUMERO DI CONTO | string | dxgv dx-al |
| 19 | PHONE | TELEFONO: | string | dxgv dx-al |
| 20 | SALESACT | TIPO DI CLIENTE (sales) | currency | dxgv dx-ar |
| 21 | SALESPREV | VENDITE PRECEDENTE | currency | dxgv dx-ar |
| 22 | SALESPREV2 | VENDITE PRECEDENTE 2 | currency | dxgv dx-ar |
| 23 | STREET | VIA: | string | dxgv dx-al |
| 24 | URL | URL | string | dxgv dx-al |
| 25 | VATNUM | PARTITA IVA: | string | dxgv dx-al |

#### Detail View Fields (Tab: Principale)

| ERP Field | Example Value | HTML Element |
|-----------|---------------|--------------|
| ID | 55.156 | SPAN `[id*="xaf_dviID_View"]` |
| NAME | Dott Mancusi Giuseppe | SPAN `[id*="xaf_dviNAME_View"]` |
| NAMEALIAS | Dott Mancusi Giusepp | SPAN `[id*="xaf_dviNAMEALIAS_View"]` |
| VATNUM | (empty) | SPAN `[id*="xaf_dviVATNUM_View"]` |
| VATLASTCHECKEDDATE | (empty) | SPAN |
| VATVALIDE | No | TABLE (checkbox) |
| VATADDRESS | (empty) | SPAN |
| ACCOUNTNUM | (empty) | SPAN |
| DLVMODE | UPS Italia | A (hyperlink) `[id*="xaf_dviDLVMODE_View"]` |
| FISCALCODE | (empty) | SPAN |
| CURRENCY | EUR | SPAN |
| BRASCRMATTENTIONTO | (empty) | SPAN |
| FISCALCODEVALIDE | No | TABLE (checkbox) |
| FISCALCODELASTCHECKDATE | (empty) | SPAN |
| CUSTINFO | (empty) | SPAN |
| BUSINESSSECTORID | (empty) | A (hyperlink) |
| PAYMTERMID | 201 BONIF. BANC. 60 GG.DFFM Iban... | A (hyperlink) |
| LEGALEMAIL | (empty) | SPAN |
| LEGALAUTHORITY | (empty) | SPAN |
| BLOCKED | No | TABLE (checkbox) |
| ADDRESS | (empty) | SPAN |
| STREET | Corso Italia, 184 | SPAN |
| LOGISTICSADDRESSZIPCODE | 80062 | A (hyperlink) |
| COUNTRYREGIONID | IT | SPAN |
| CITY | Meta | SPAN |
| COUNTY | NA | SPAN |
| STATE | Campania | SPAN |
| PHONE | (empty) | SPAN |
| CELLULARPHONE | (empty) | SPAN |
| EMAIL | (empty) | SPAN |
| URL | (empty) | SPAN |

#### Detail View Tabs
1. **Principale** - Main customer data (fields above)
2. **Orari di consegna** - Delivery hours
3. **Info CRM** - CRM information
4. **Altre informazioni** - Other info
5. **Prezzi e sconti** - Prices and discounts
6. **Tabelle di vendita** - Sales tables (embedded grid with order history)
7. **Documento di trasporto del cliente** - Customer delivery notes
8. **Fatture dei clienti** - Customer invoices
9. **Indirizzo alt.** - Alternate addresses

### 3.2 SALESTABLE (Ordini)

**List View:** `/Archibald/SALESTABLE_ListView_Agent/`
**Detail View:** `/Archibald/SALESTABLE_DetailViewAgent/{id}/?mode=View`
**Record Count:** ~960 (48 pages x 20 rows)
**Entity Pattern:** `xafkidemovb.Module.CRMKI.SALESTABLE({id})`

#### List View Columns (65 columns, key ones highlighted)

| # | ERP Field | Label |
|---|-----------|-------|
| 0 | IMPORTO TOTALE | Total amount |
| 4 | CREATO DA | Created by |
| 5 | DATA DI CREAZIONE | Creation date |
| 6 | PROFILO CLIENTE | Customer account |
| 7 | RIFERIMENTO CLIENTE | Customer reference |
| 8 | TABELLA CLIENTI | Customer table |
| 11 | DATA DI CONSEGNA | Delivery date |
| 12 | NOME DI CONSEGNA | Delivery name |
| 13 | SCONTO TOTALE %: | Total discount % |
| 21 | MODALITA DI CONSEGNA | Delivery mode |
| 26 | STATO DEL DOCUMENTO | Document status |
| 31 | IMPORTO LORDO | Gross amount |
| 32 | ID | Internal ID |
| 34 | SCONTO LINEA | Line discount |
| 36 | APPLICA SCONTO %: | Apply discount % |
| 42 | ID GRUPPO DI PREZZI | Price group ID |
| 48 | ID DI VENDITA | Sales ID (e.g., ORD/26005662) |
| 50 | ORIGINE VENDITE | Sales origin (Agent) |
| 52 | STATO DELLE VENDITE | Sales status |
| 53 | TIPO DI ORDINE | Order type (Giornale) |
| 54 | ORDINE OMAGGIO | Sample order |
| 57 | TESTOINTERNO | Internal text |
| 59 | STATO DEL TRASFERIMENTO | Transfer status |

#### Detail View Fields

| ERP Field | Example Value |
|-----------|---------------|
| ID | 51.847 |
| CUSTTABLE | 1002328 (hyperlink) |
| SALESID | (empty - pending) |
| SALESNAME | Fresis Soc Cooperativa |
| ORDERDATE | 28/03/2026 06:24:57 |
| SAMPLEORDER | ordine omaggio (checkbox) |
| DELIVERYDATE | 30/03/2026 |
| DELIVERYPOSTALADDRESS | Ufficio (hyperlink) |
| DELIVERYNAME | Fresis Soc Cooperativa |
| DLVADDRESS | Via San Vito, 43 80056 Ercolano NA |
| PURCHORDERFORMNUM | (description field) |
| CUSTOMERREF | (reference) |
| BRASCRMATTENTIONTO | (attention to) |
| DLVEMAIL | fresisas@live.it |
| SALESORIGINID | Agent (hyperlink) |
| DLVMODE | FedEx (hyperlink) |
| VATNUM | 08246131216 |
| QUOTE | No |
| LANGUAGEID | It |
| COMPLETEDDATE | 28/03/2026 |
| TEXTEXTERNAL | (external text) |
| TEXTINTERNAL | (internal text) |
| SALESTYPE | Giornale |
| SALESSTATUS | Ordine aperto |
| DOCUMENTSTATUS | Nessuno |
| TRANSFERSTATUS | In attesa di approvazione |
| TRANSFERREDDATE | (empty) |

#### Sales Lines Grid (Order Articles)

| Column | Example |
|--------|---------|
| LINEA: | 1.00 |
| ID ARTICOLO | 6862D.314.012 |
| NOME ARTICOLO | DIA gr G - Depht Marker |
| QTA ORDINATA | 5.00 |
| UNITA DI PREZZO | 17,64 |
| SCONTO % | 0,00 % |
| APPLICA SCONTO % | 63,00 % |
| IMPORTO DELLA LINEA | 32,63 |
| PREZZO NETTO | (net price) |

#### Detail View Tabs
1. **Panoramica** - Overview (header fields)
2. **Orari di consegna** - Delivery hours
3. **Prezzi e sconti** - Prices and discounts
4. **Linee di vendita** - Sales lines (articles grid)
5. **Cronologia documento di trasporto** - DDT history

### 3.3 CUSTPACKINGSLIPJOUR (DDT)

**List View:** `/Archibald/CUSTPACKINGSLIPJOUR_ListView/`
**Detail View:** `/Archibald/CUSTPACKINGSLIPJOUR_DetailView/{id}/?mode=View`
**Record Count:** ~1,040 (52 pages x 20 rows)

#### Detail View Fields

| ERP Field | Example Value |
|-----------|---------------|
| PACKINGSLIPID | DDT/26005754 |
| DELIVERYDATE | 27/03/2026 |
| SALESID | ORD/26005662 |
| SALESTABLE_SALESNAME | Dr. Elio Verace Centro Medico |
| DELIVERYNAME | Dr. Elio Verace Centro Medico |
| DLVADDRESS | Corso G. Garibaldi, 7 84095 Giffoni Valle Piana Sa |
| QTY | 50 |
| BRASCRMATTENTIONTO | (empty) |
| CUSTOMERREF | (empty) |
| PURCHASEORDER | (empty) |
| DLVEMAIL | veradent@tiscali.it |
| BRASTRACKINGNUMBER | fedex 445291950418 |

#### DDT Lines Grid

LINEA, ID ARTICOLO, NOME, ORDINATO, QUANTITA, RIMANERE, NR. LOTTO, CITTA DI CONSEGNA, VIA, etc.

### 3.4 CUSTINVOICEJOUR (Fatture)

**List View:** `/Archibald/CUSTINVOICEJOUR_ListView/`
**Detail View:** `/Archibald/CUSTINVOICEJOUR_DetailView/{id}/?mode=View`
**Record Count:** ~280 (14 pages x 20 rows)

#### Detail View Fields

| ERP Field | Example Value |
|-----------|---------------|
| INVOICEID | CF1/26002393 |
| INVOICEDATE | 27/03/2026 |
| INVOICEACCOUNT | 1002887 |
| INVOICINGNAME | Trident S.R.L. Di Michele Casella |
| INVADDRESS | Via Pozzodonato, 27 85049 Trecchina Pz |
| QTY | 6 |
| SUMLINEDISCMST | 54,82 |
| SALESBALANCEMST | 204,93 |
| ENDDISCMST | 0 |
| SUMTAXMST | 45,08 |
| INVOICEAMOUNTMST | 250,01 |
| DUEDATE | 31/05/2026 |
| CLOSED | (empty) |
| LASTSETTLEDATE | (empty) |
| LASTSETTLEVOUCHER | (empty) |
| OVERDUEDAYS | 65 |
| SETTLEAMOUNTMST | 0 |
| REMAINAMOUNTMST | 250,01 |

#### Invoice Lines Grid

LINEA, ID ARTICOLO, NOME ARTICOLO, QUANTITA, PREZZO DI VENDITA, SCONTO %, IMPORTO LINEA MST, NR. LOTTO, ID VENDITA ORIGINALE

### 3.5 INVENTTABLE (Prodotti)

**List View:** `/Archibald/INVENTTABLE_ListView/`
**Detail View:** `/Archibald/INVENTTABLE_DetailView/{id}/?mode=View`
**Record Count:** ~4,540 (227 pages x 20 rows)

#### Detail View Fields

| ERP Field | Example Value |
|-----------|---------------|
| ID | 4.691 |
| ITEMID | 10019197 |
| SEARCHNAME | ENGO01.000 |
| NAME | ENGO01.000 |
| DESCRIPTION | ENGO Handpiece EU + UK |
| PRODUCTGROUPID_PRODUCTGROUPID | 11660 |
| PRODUCTGROUPID_PRODUCTGROUP1 | STRUMENTI ENDO |
| BRASFIGURE | (figure code) |
| BRASSIZE | (size) |
| BRASSHANK | (shank type) |
| STOPPED | No |
| ORDERITEM | Order item |
| LOWESTQTY | 1,00 |
| MULTIPLEQTY | 1,00 |
| HIGHESTQTY | 100,00 |
| STANDARDQTY | 0,00 |
| BRASPACKINGCONTENTS | 1 |
| PRICEUNIT | 0,00 |
| CREATEDDATETIME | 13/02/2026 20:35:47 |
| MODIFIEDDATETIME | 25/02/2026 15:00:54 |

### 3.6 PRICEDISCTABLE (Prezzi)

**List View (Prices):** `/Archibald/PRICEDISCTABLE_ListView/`
**List View (Line Discounts):** `/Archibald/PRICEDISCTABLE_ListViewLineDisc/`
**Detail View:** `/Archibald/PRICEDISCTABLE_DetailView/{id}/?mode=View`
**Record Count:** Prices ~4,960 (248 pages), Line Discounts ~1,780 (89 pages)

#### Price Detail Fields

| ERP Field | Example Value |
|-----------|---------------|
| ID | 5 |
| ITEMCODE | Table / Group |
| ACCOUNTCODE | Group |
| ITEMRELATION | 4.425 (internal ID) |
| ITEMRELATIONID | 10004473 (article code) |
| ITEMRELATIONTXT | XTD3324.314. (article name) |
| ACCOUNTRELATION | 2 (internal ID) |
| ACCOUNTRELATIONID | 002 (price group code) |
| ACCOUNTRELATIONTXT | DETTAGLIO (consigliato) |
| QUANTITYAMOUNTFROM | 1 |
| QUANTITYAMOUNTTO | 100.000.000 |
| FROMDATE | 01/07/2022 |
| TODATE | 31/12/2154 |
| AMOUNT | 234,59 |
| CURRENCY | EUR |
| PERCENT1 | 0 |
| PERCENT2 | 0 |
| PRICEUNIT | 0 |
| RELATION | 4 (price type code) |
| UNITID | 001 |
| MODULE1 | 1 |
| BRASNETPRICE | No |

#### Line Discount Detail Fields (same structure, key differences)

| ERP Field | Example Value |
|-----------|---------------|
| ID | 166 |
| ITEMRELATIONID | 11110 (product group) |
| ITEMRELATIONTXT | STAHLBOHRER F. KAVITATEN / FI |
| ACCOUNTRELATIONID | SCLA |
| ACCOUNTRELATIONTXT | Discount to get price 002A |
| PERCENT1 | **63** (the concessionario discount) |
| AMOUNT | 0,00 |
| RELATION | 5 (discount type code) |

### 3.7 ApplicationUser (Utenti)

**Detail View:** `/Archibald/ApplicationUser_DetailView/{guid}/?mode=View`

| ERP Field | Example Value |
|-----------|---------------|
| KIUserType | Agent |
| COMMISSIONSALESGROUP | 930 |
| UserName | ikiA0930 |
| Title | BIAGIO FORMICOLA |
| UserId | A930 |
| UserExportType | PDF |
| IsActive | (checkbox) |
| Street | VIA SAN VITO, 43 |
| LOGISTICSADDRESSZIPCODE | 80056 |
| Longitude | 14,367918 |
| Latitude | 40,8224 |
| City | Ercolano |
| EMAIL | fresisas@live.it |
| UserLanguage | IT |
| Oid | e8081a1a-c760-4daa-a8f0-d72da78bc1b4 |

---

## 4. STABLE CSS SELECTORS

### Grid Data Extraction

```css
/* Data rows */
tr.dxgvDataRow_XafTheme

/* Grid header row (column names) */
tr[class*="HeaderRow"] td

/* Individual cells - use nth-child based on column order */
tr.dxgvDataRow_XafTheme td:nth-child(N)

/* Filter row */
tr[id*="DXFilterRow"]

/* Pager */
[id*="DXPagerBottom"]
```

### Detail View Field Extraction

The most reliable pattern for extracting detail view data:

```css
/* Any field value in View mode */
[id*="xaf_dvi{FIELDNAME}_View"]

/* Examples: */
[id*="xaf_dviNAME_View"]          /* Customer name */
[id*="xaf_dviSTREET_View"]        /* Street */
[id*="xaf_dviCITY_View"]          /* City */
[id*="xaf_dviSALESSTATUS_View"]   /* Order status */
[id*="xaf_dviINVOICEID_View"]     /* Invoice ID */
```

**Important:** The selector `[id*="xaf_dvi{FIELD}_View"]` is extremely stable across sessions. The dynamic numeric part (`v4_57143912` etc.) changes per session but `xaf_dvi{FIELD}_View` suffix is constant.

### Checkbox/Enum Fields

Checkbox and enum fields render as `<TABLE>` elements. The text content starts with the value ("No", "Yes", "Ordine aperto", etc.) followed by DevExpress script tags. Extract the first text node:

```javascript
const value = element.textContent.trim().split('\n')[0].trim();
```

### Hyperlink Fields

Some fields (DLVMODE, PAYMTERMID, LOGISTICSADDRESSZIPCODE, CUSTTABLE, SALESORIGINID) render as `<A>` hyperlinks. The text content is the display value:

```javascript
const value = element.textContent.trim();
const href = element.href; // Links to detail view of referenced entity
```

---

## 5. AJAX/CALLBACK ENDPOINTS

### There are NO JSON REST endpoints.

All data transfer uses the DevExpress/ASP.NET WebForms callback mechanism:

### Callback Mechanism

**Request:**
- **Method:** POST
- **URL:** Same as the current page URL (e.g., `/Archibald/CUSTTABLE_ListView_Agent/`)
- **Content-Type:** `application/x-www-form-urlencoded`
- **Body:** `__EVENTTARGET=&__EVENTARGUMENT=&__VIEWSTATE={base64}&__VIEWSTATEGENERATOR={hash}&__EVENTVALIDATION={base64}&{grid control params}`

**Response:**
- **Content-Type:** `text/plain; charset=utf-8`
- **Format:** `{size}|{viewstate}/*DX*/({'result':{'stateObject':{'keys':[...],'callbackState':'...',...}}})`
- **Size:** ~220KB per page callback

### Callback Targets (registered per page)

```
globalCallbackControl           - XAF global action handler
Vertical$PopupWindowCallback    - Popup window actions
Vertical$v2_{num}$LE_v2        - Grid data (customers)
Vertical$v6_{num}$LE_v6        - Grid data (orders)
Vertical$v7_{num}$LE_v7        - Grid data (DDT)
Vertical$v8_{num}$LE_v8        - Grid data (invoices)
Vertical$mainMenu$Menu          - Main menu actions
```

### Export Trigger

The "Esportare in" button triggers a PDF export via:
```javascript
RaiseXafCallback(globalCallbackControl, 'Vertical$mainMenu', '6', '', true);
```
The `true` parameter indicates a binary download response.

### Key Callback Response Data

The grid callback response contains:
- `stateObject.keys` - Array of record IDs on current page
- `stateObject.callbackState` - Encrypted session state (required for next callback)
- `stateObject.pageIndex` / `pageCount` - Pagination state
- `cpFastCallBackObjects` - Map of row index to XAF entity reference
- `cpObjectKeys` - Map of row index to record ID
- `columnProp` - Column property definitions (field names, types, sort flags)
- `columnCaptions` - Display names for all columns
- `filterRowConditions` - Filter operators per column

---

## 6. PAGINATION STRUCTURE

All list views use identical pagination:

| Setting | Value |
|---------|-------|
| **Page sizes available** | 10, 20, 50, 100, 200 |
| **Default page size** | 20 |
| **Pager element** | `[id*="DXPagerBottom"]` |
| **Page size selector** | `[id*="DXPagerBottom_PSP"]` with menu items |
| **Page buttons** | Numeric links + prev/next arrows |
| **Callback for page change** | Clicking page number triggers POST callback to same URL |

### Record Counts

| Entity | Pages (x20) | Estimated Total |
|--------|-------------|-----------------|
| Customers | 66 | ~1,300 |
| Orders | 48 | ~960 |
| DDT | 52 | ~1,040 |
| Invoices | 14 | ~280 |
| Products | 227 | ~4,540 |
| Prices | 248 | ~4,960 |
| Line Discounts | 89 | ~1,780 |

### Strategy for "Load All"

Set page size to 200 via the pager dropdown, then iterate:
- Customers: 7 pages
- Orders: 5 pages
- DDT: 6 pages
- Invoices: 2 pages
- Products: 23 pages
- Prices: 25 pages
- Line Discounts: 9 pages

---

## 7. EXPORT MECHANISM

### Available Export

**PDF only.** The "Esportare in" button (title: "Esportare in PDF File") generates a PDF of the current list view. There is NO Excel, CSV, or XLS export available.

The export is triggered via the XAF callback mechanism:
1. Menu item `DXI6` in the main menu (`Vertical_mainMenu_Menu`)
2. Click handler: `RaiseXafCallback(globalCallbackControl, 'Vertical$mainMenu', '6', '', true)`
3. Server generates PDF and returns as binary download via the callback response

### Binary Data Handler

The ERP uses a `DXX.axd` handler for binary data:
- URL pattern: `/Archibald/DXX.axd?handlerName=BinaryDataHttpHandler&processorID={processorID}&d=TimeStamp%3d{timestamp}`
- Used for: PDF downloads, notification polling, image data

---

## 8. ANOMALIES AND TECHNICAL NOTES

### 8.1 Dynamic IDs

Grid container IDs contain a session-unique number (e.g., `Vertical_v2_54562676_LE_v2`). This number changes every session. Use partial selectors:
- `[id$="_LE_v2"]` for customer grid
- `[id$="_LE_v6"]` for orders grid
- `[id*="xaf_dvi"]` for detail view items

### 8.2 Column Order Mismatch

The visible column order in the grid HTML does NOT match the `columnProp` array order. The `columnProp` array has an index mapping:
```
[colPropIndex, , , 'FIELDNAME', , , , , displayOrderIndex, , , 'TYPE']
```
where TYPE is 'S' (string) or 'N' (numeric).

### 8.3 Sidebar Navigation (complete list for agent role)

| Menu Item | URL |
|-----------|-----|
| Annunci | /Archibald/Announcements_ListView/ |
| Clienti | /Archibald/CUSTTABLE_ListView_Agent/ |
| Mappa clienti | /Archibald/CUSTTABLE_ListView_RoadMap/ |
| Consenso del cliente | /Archibald/CustomerConsent_ListViewAgent/ |
| Ordini | /Archibald/SALESTABLE_ListView_Agent/ |
| Documenti di trasporto | /Archibald/CUSTPACKINGSLIPJOUR_ListView/ |
| Fatture | /Archibald/CUSTINVOICEJOUR_ListView/ |
| Prodotti | /Archibald/INVENTTABLE_ListView/ |
| Price lists | /Archibald/PRICEDISCTABLE_ListView/ |
| Sconti linea | /Archibald/PRICEDISCTABLE_ListViewLineDisc/ |

### 8.4 XAF Entity Reference Pattern

Every record in the system is identified by a pattern:
```
xafkidemovb.Module.CRMKI.{TABLE}({ID})
```
Examples:
- `xafkidemovb.Module.CRMKI.CUSTTABLE(55156)`
- `xafkidemovb.Module.CRMKI.SALESTABLE(51847)`
- `xafkidemovb.Module.CRMKI.INVENTTABLE(4691)`

### 8.5 InvoicePDF / DDT PDF Field

Both DDT and Invoice detail pages have an `InvoicePDF` field that shows "N/A" with a DevExpress file upload widget. This field appears to be for attaching PDF documents but is consistently empty.

### 8.6 Notification Polling

The ERP polls for notifications every 5 minutes:
```javascript
window.xafFramework.RegisterNotificationCallback(300000, 5000, '/Archibald/DXX.axd?...');
```

### 8.7 Filter Row Conditions

The grid filter row supports these operators (available on every column):
- Begins with, Contains, Doesn't contain, Ends with
- Equals, Doesn't equal
- Is less than, Is less than or equal to
- Is greater than, Is greater than or equal to
- Like ('%', '_')

### 8.8 ViewState Size

The `__VIEWSTATE` is relatively small (~2.3KB base64) because most data is rendered server-side in HTML. The `__EVENTVALIDATION` is ~308 bytes. This means callback requests are not excessively large.

### 8.9 Grid Column Sort/Filter State

The `columnProp` array in the grid JS config contains the complete column metadata including sort direction and filter state. This is transmitted in the callback response after each grid interaction.

### 8.10 "Mappa clienti" (Customer Map)

There's a customer map view at `/Archibald/CUSTTABLE_ListView_RoadMap/` that likely uses the latitude/longitude from user profiles. Not explored in detail but could be interesting for geo-based features.

### 8.11 "Consenso del cliente" (Customer Consent)

A separate GDPR consent management view at `/Archibald/CustomerConsent_ListViewAgent/`. Not explored in detail.

### 8.12 Order Status Values (observed)

- **SALESSTATUS:** "Ordine aperto" (Open order)
- **DOCUMENTSTATUS:** "Nessuno" (None)
- **TRANSFERSTATUS:** "In attesa di approvazione" (Awaiting approval)
- **SALESTYPE:** "Giornale" (Journal)
- **SALESORIGINID:** "Agent"

### 8.13 Date Formats

All dates use `dd/MM/yyyy` format (Italian locale). Datetime fields use `dd/MM/yyyy HH:mm:ss`.

### 8.14 Currency Format

Amounts use Italian formatting: `250,01 EUR` (comma as decimal, period as thousands).

---

## 9. RECOMMENDATIONS

### Approach A: Enhanced HTML Scraping (Recommended - Incremental)

Replace PDF parsing with direct HTML table scraping from list views. This keeps the existing Puppeteer infrastructure but reads data from the DOM instead of generating and parsing PDFs.

**Pros:**
- Minimal architecture change
- 5-10x faster per sync cycle
- Eliminates PDF parsing fragility
- Uses stable CSS selectors (`xaf_dvi{FIELD}_View`, `tr.dxgvDataRow_XafTheme`)

**Cons:**
- Still requires browser sessions (Puppeteer overhead)
- Still session-limited (one page at a time per browser context)

### Approach B: Direct Callback Replay (Advanced)

Replay the DevExpress callbacks programmatically using HTTP requests (no browser needed). After initial login to get session cookies and ViewState, make POST requests with the same parameters the browser would send.

**Pros:**
- No browser needed for data reads
- Extremely fast (raw HTTP)
- Can parallelize requests

**Cons:**
- Must maintain ViewState chain (each response provides the state for the next request)
- `callbackState` is encrypted/signed - must be used sequentially
- Fragile if server-side callback format changes
- Still no JSON - must parse HTML fragments from callback responses

### Approach C: Hybrid (Pragmatic)

Use Approach A for all read operations (HTML scraping from DOM), but keep Puppeteer for write operations (creating customers, submitting orders) where form interaction is required.

**This is the most pragmatic path forward.** The selector patterns discovered (`xaf_dvi{FIELD}_View` for detail pages, `tr.dxgvDataRow_XafTheme td` for list grids) are extremely stable and require no PDF parsing at all.
