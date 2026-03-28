# Mappa Colonne ERP Archibald - Column Chooser

**Data**: 2026-03-28
**Metodo**: Estrazione automatica tramite DevExpress ASPxClientGridView client-side API (`GetColumn()`)
**Nota**: Le colonne sono ordinate per `visibleIndex` (ordine di visualizzazione nel grid). Le colonne con `visible: false` sono nascoste nel Column Chooser e non compaiono nel grid di default.

---

## 1. CLIENTI

**URL**: `https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/`
**Titolo pagina**: Clienti - KI di gestione intelligente degli ordini
**Totale colonne**: 26 data columns (+ 2 system: Edit, SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Vista | Clienti | Clienti, Mappa clienti |
| 2 | Filtro dati | Tutti i clienti | (unica opzione disponibile) |

### Colonne

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 2 | ID | ID | ✅ |
| 2 | 3 | ACCOUNTNUM | PROFILO CLIENTE: | ✅ |
| 3 | 4 | NAME | NOME | ✅ |
| 4 | 5 | VATNUM | PARTITA IVA: | ✅ |
| 5 | 6 | LEGALEMAIL | PEC: | ✅ |
| 6 | 7 | LEGALAUTHORITY | SDI: | ✅ |
| 7 | 8 | FISCALCODE | CODICE FISCALE: | ✅ |
| 8 | 9 | DLVMODE.TXT | TERMINI DI CONSEGNA | ✅ |
| 9 | 10 | STREET | VIA: | ✅ |
| 10 | 11 | LOGISTICSADDRESSZIPCODE.ZIPCODE | INDIRIZZO LOGISTICO CAP | ✅ |
| 11 | 12 | CITY | CITTA | ✅ |
| 12 | 13 | PHONE | TELEFONO: | ✅ |
| 13 | 14 | CELLULARPHONE | CELLULARE: | ✅ |
| 14 | 15 | URL | URL: | ✅ |
| 15 | 16 | BRASCRMATTENTIONTO | ALL'ATTENZIONE DI: | ✅ |
| 16 | 17 | LASTORDERDATE | DATA DELL'ULTIMO ORDINE | ✅ |
| 17 | 18 | ORDERCOUNTACT | CONTEGGI DEGLI ORDINI EFFETTIVI | ✅ |
| 18 | 19 | SALESACT | TIPO DI CLIENTE | ✅ |
| 19 | 20 | ORDERCOUNTPREV | CONTEGGIO DEGLI ORDINI PRECEDENTE | ✅ |
| 20 | 21 | SALESPREV | VENDITE PRECEDENTE | ✅ |
| 21 | 22 | ORDERCOUNTPREV2 | CONTEGGIO DEGLI ORDINI PRECEDENTE 2 | ✅ |
| 22 | 23 | SALESPREV2 | VENDITE PRECEDENTE | ✅ |
| 23 | 24 | BUSRELTYPEID.TYPEDESCRIPTION | DESCRIZIONE: | ✅ |
| 24 | 25 | BUSRELTYPEID.TYPEID | TYPE: | ✅ |
| 25 | 26 | EXTERNALACCOUNTNUM | NUMERO DI CONTO ESTERNO | ✅ |
| 26 | 27 | OURACCOUNTNUM | IL NOSTRO NUMERO DI CONTO | ✅ |

**Nota**: Tutte le 26 colonne dati sono visibili. Non ci sono colonne nascoste per questa vista.

---

## 2. ORDINI

**URL**: `https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/`
**Titolo pagina**: Ordini - KI di gestione intelligente degli ordini
**Totale colonne**: 63 data columns (+ 2 system: Edit, SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Filtro dati | Tutti gli ordini | (unica opzione visibile) |

### Colonne VISIBILI (23)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 2 | ID | ID | ✅ |
| 2 | 3 | SALESID | ID DI VENDITA | ✅ |
| 3 | 4 | CUSTACCOUNT | PROFILO CLIENTE: | ✅ |
| 4 | 5 | SALESNAME | NOME VENDITE: | ✅ |
| 5 | 6 | DELIVERYNAME | NOME DI CONSEGNA | ✅ |
| 6 | 7 | DLVADDRESS | INDIRIZZO DI CONSEGNA | ✅ |
| 7 | 8 | CREATEDDATETIME | DATA DI CREAZIONE | ✅ |
| 8 | 9 | DELIVERYDATE | DATA DI CONSEGNA | ✅ |
| 9 | 10 | PURCHORDERFORMNUM | RIMANI VENDITE FINANZIARIE | ✅ |
| 10 | 11 | CUSTOMERREF | RIFERIMENTO CLIENTE | ✅ |
| 11 | 12 | SALESSTATUS | STATO DELLE VENDITE | ✅ |
| 12 | 13 | SALESTYPE | TIPO DI ORDINE | ✅ |
| 13 | 14 | DOCUMENTSTATUS | STATO DEL DOCUMENTO | ✅ |
| 14 | 15 | SALESORIGINID.DESCRIPTION | ORIGINE VENDITE: | ✅ |
| 15 | 16 | TRANSFERSTATUS | STATO DEL TRASFERIMENTO | ✅ |
| 16 | 17 | TRANSFERREDDATE | DATA DI TRASFERIMENTO | ✅ |
| 17 | 18 | COMPLETEDDATE | DATA DI COMPLETAMENTO | ✅ |
| 18 | 19 | QUOTE | PREVENTIVO: | ✅ |
| 19 | 20 | MANUALDISCOUNT | APPLICA SCONTO %: | ✅ |
| 20 | 21 | GROSSAMOUNT | IMPORTO LORDO: | ✅ |
| 21 | 22 | AmountTotal | IMPORTO TOTALE | ✅ |
| 22 | 23 | SAMPLEORDER | ORDINE OMAGGIO: | ✅ |
| 23 | 24 | EMAIL | E-MAIL | ✅ |

### Colonne NASCOSTE (40)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 25 | BRASCRMATTENTIONTO | ALL'ATTENZIONE DI: | ❌ |
| 2 | 26 | BRASCRMOPENSUNDAY | DOMENICA APERTA | ❌ |
| 3 | 27 | CREATEDBY | CREATO DA: | ❌ |
| 4 | 28 | CUSTTABLE.NAME | TABELLA CLIENTI | ❌ |
| 5 | 29 | CUSTTABLE.EXTERNALACCOUNTNUM | NUMERO DI CONTO ESTERNO | ❌ |
| 6 | 30 | DATAAREAID | DATAAREAID | ❌ |
| 7 | 31 | DISCPERCENT | SCONTO TOTALE %: | ❌ |
| 8 | 32 | DISCPERCENTCUS | PERCENTUALE DI SCONTO CLIENTE | ❌ |
| 9 | 33 | DLVCITY | CITTA DI CONSEGNA | ❌ |
| 10 | 34 | DLVCOUNTRYREGIONID | ID REGIONE PAESE DI CONSEGNA | ❌ |
| 11 | 35 | DLVCOUNTY | CONTEA DI DELIVERY | ❌ |
| 12 | 36 | DLVEMAIL | E-MAIL DI CONSEGNA | ❌ |
| 13 | 37 | DLVLOGISTICSADDRESSZIPCODE.ZIPCODE | DLVLOGISTICSINDIRIZZOCODICE POSTALE | ❌ |
| 14 | 38 | DLVMODE.TXT | MODALITA DI CONSEGNA | ❌ |
| 15 | 39 | DLVSTATE | STATO DI CONSEGNA | ❌ |
| 16 | 40 | DLVSTREET | VIA DI CONSEGNA | ❌ |
| 17 | 41 | DLVTERM.TXT | TERMINI DI CONSEGNA | ❌ |
| 18 | 42 | DLVZIPCODE | CODICE POSTALE DI CONSEGNA | ❌ |
| 19 | 43 | ENDDISC.NAME | FINE SCONTO | ❌ |
| 20 | 44 | ENDDISCCUS.NAME | CLIENTE CON SCONTO FINALE | ❌ |
| 21 | 45 | ENDDISCPERCENTCUS | PERCENTUALE DI SCONTO FINALE CLIENTE | ❌ |
| 22 | 46 | LANGUAGEID | ID LINGUA | ❌ |
| 23 | 47 | LINEDISC.NAME | SCONTO LINEA | ❌ |
| 24 | 48 | LINEDISCCUS.NAME | LINEA SCONTO CLIENTE | ❌ |
| 25 | 49 | MODIFIEDBY | MODIFICATO DA: | ❌ |
| 26 | 50 | MODIFIEDDATETIME | CITTA DI FATTURAZIONE | ❌ |
| 27 | 51 | MULTILINEDISC.ID | SCONTO MULTILINEA | ❌ |
| 28 | 52 | MULTILINEDISCCUS.NAME | CLIENTE SCONTO MULTILINEA | ❌ |
| 29 | 53 | PHONE | TELEFONO | ❌ |
| 30 | 54 | PRICEGROUPID.NAME | ID GRUPPO DI PREZZI | ❌ |
| 31 | 55 | PRICEGROUPIDCUS.NAME | ID GRUPPO DI PREZZI CLIENTE | ❌ |
| 32 | 56 | REFID | ID RIFERIMENTO | ❌ |
| 33 | 57 | SALESGROUP.NAME | GRUPPO DI VENDITA | ❌ |
| 34 | 58 | SALESPOOLID.NAME | MODALITA DI CONSEGNA | ❌ |
| 35 | 59 | TAXGROUP.ID | GRUPPO FISCALE | ❌ |
| 36 | 60 | TEXTEXTERNAL | ORARI DI APERTURA MER | ❌ |
| 37 | 61 | TEXTINTERNAL | TESTOINTERNO | ❌ |
| 38 | 62 | URL | URL | ❌ |
| 39 | 63 | VATNUM | PARTITA IVA | ❌ |
| 40 | 64 | WORKERSALESTAKER | OPERAIO COMMESSO | ❌ |

---

## 3. DDT (Documenti di trasporto)

**URL**: `https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/`
**Titolo pagina**: Documenti di trasporto - KI di gestione intelligente degli ordini
**Totale colonne**: 33 data columns (+ 1 system: SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Periodo | Tutti | Oggi, Questa settimana, Questo mese, Ultimi 3 mesi, Tutti |

### Colonne VISIBILI (17)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 1 | InvoicePDF.FileName | PDF DDT | ✅ |
| 2 | 2 | ID | ID | ✅ |
| 3 | 3 | PACKINGSLIPID | DOCUMENTO DI TRASPORTO: | ✅ |
| 4 | 4 | DELIVERYDATE | DATA DI CONSEGNA | ✅ |
| 5 | 5 | SALESID | ID DI VENDITA | ✅ |
| 6 | 6 | ORDERACCOUNT | CONTO DELL'ORDINE | ✅ |
| 7 | 7 | SALESTABLE.SALESNAME | NOME VENDITE: | ✅ |
| 8 | 8 | DELIVERYNAME | NOME DI CONSEGNA | ✅ |
| 9 | 9 | DLVADDRESS | NOME DI CONSEGNA | ✅ |
| 10 | 10 | QTY | TOTALE | ✅ |
| 11 | 11 | CUSTOMERREF | RIFERIMENTO CLIENTE | ✅ |
| 12 | 12 | PURCHASEORDER | DESCRIZIONE: | ✅ |
| 13 | 13 | BRASTRACKINGNUMBER | NUMERO DI TRACCIABILITA | ✅ |
| 14 | 14 | DLVTERM.TXT | TERMINI DI CONSEGNA: | ✅ |
| 15 | 15 | DLVMODE.TXT | MODALITA DI CONSEGNA | ✅ |
| 16 | 16 | BRASCRMATTENTIONTO | ALL'ATTENZIONE DI | ✅ |
| 17 | 17 | DLVEMAIL | CITTA DI CONSEGNA | ✅ |

### Colonne NASCOSTE (16)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 18 | CREATEDBY | CREATO DA: | ❌ |
| 2 | 19 | CREATEDDATETIME | DATA DI CREAZIONE | ❌ |
| 3 | 20 | DATAAREAID | DATAAREAID | ❌ |
| 4 | 21 | DLVCITY | CITTA DI CONSEGNA | ❌ |
| 5 | 22 | DLVCOUNTRYREGIONID | ID REGIONE DI CONSEGNA | ❌ |
| 6 | 23 | DLVCOUNTY | ID REGIONE DI CONSEGNA | ❌ |
| 7 | 24 | DLVLOGISTICSADDRESSZIPCODE.ID | DLVLOGISTICSINDIRIZZOCODICE POSTALE | ❌ |
| 8 | 25 | DLVSTATE | REGIONE DI CONSEGNA | ❌ |
| 9 | 26 | DLVSTREET | INDIRIZZO DI CONSEGNA | ❌ |
| 10 | 27 | DLVZIPCODE | CODICE POSTALE DI CONSEGNA | ❌ |
| 11 | 28 | IMAGEID.ID | QUANTITA STANDARD | ❌ |
| 12 | 29 | LANGUAGEID | ID LINGUA | ❌ |
| 13 | 30 | MODIFIEDBY | MODIFICATO DA: | ❌ |
| 14 | 31 | MODIFIEDDATETIME | CITTA DI FATTURAZIONE | ❌ |
| 15 | 32 | ORDERACCOUNTID.NAME | ID ACCOUNT DELL'ORDINE | ❌ |
| 16 | 33 | SALESTABLE.ID | ID VENDITE | ❌ |

---

## 4. FATTURE

**URL**: `https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/`
**Titolo pagina**: Fatture - KI di gestione intelligente degli ordini
**Totale colonne**: 47 data columns (+ 1 system: SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Periodo/Stato | Tutti | Ultimi 3 mesi, Fatture aperte, Fatture scadute, Tutti |

### Colonne VISIBILI (22)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 1 | InvoicePDF.FileName | FATTURA PDF | ✅ |
| 2 | 2 | INVOICEID | ID FATTURA | ✅ |
| 3 | 3 | INVOICEDATE | DATA FATTURA | ✅ |
| 4 | 4 | INVOICEACCOUNT | CONTO FATTURE | ✅ |
| 5 | 5 | INVOICINGNAME | NOME DI FATTURAZIONE | ✅ |
| 6 | 6 | QTY | QUANTITA | ✅ |
| 7 | 7 | SALESBALANCEMST | SALDO VENDITE MST | ✅ |
| 8 | 8 | SUMLINEDISCMST | SOMMA LINEA SCONTO MST | ✅ |
| 9 | 9 | ENDDISCMST | SCONTO TOTALE: | ✅ |
| 10 | 10 | SUMTAXMST | SOMMA FISCALE MST | ✅ |
| 11 | 11 | INVOICEAMOUNTMST | IMPORTO FATTURA MST | ✅ |
| 12 | 12 | PURCHASEORDER | ORDINE DI ACQUISTO | ✅ |
| 13 | 13 | CUSTOMERREF | RIFERIMENTO CLIENTE | ✅ |
| 14 | 14 | DUEDATE | SCADENZA | ✅ |
| 15 | 15 | PAYMTERMID.DESCRIPTION | ID TERMINE DI PAGAMENTO | ✅ |
| 16 | 16 | OVERDUEDAYS | OLTRE I GIORNI DI SCADENZA | ✅ |
| 17 | 17 | SETTLEAMOUNTMST | LIQUIDA IMPORTO MST | ✅ |
| 18 | 18 | LASTSETTLEVOUCHER | IDENTIFICATIVO ULTIMO PAGAMENTO: | ✅ |
| 19 | 19 | LASTSETTLEDATE | DATA DI ULTIMA LIQUIDAZIONE | ✅ |
| 20 | 20 | CLOSED | CHIUSO | ✅ |
| 21 | 21 | REMAINAMOUNTMST | IMPORTO RIMANENTE MST | ✅ |
| 22 | 22 | SALESID | ID VENDITE | ✅ |

### Colonne NASCOSTE (25)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 23 | BRASCRMATTENTIONTO | ALL'ATTENZIONE DI: | ❌ |
| 2 | 24 | CREATEDBY | CREATO DA: | ❌ |
| 3 | 25 | CREATEDDATETIME | DATA DI CREAZIONE | ❌ |
| 4 | 26 | DATAAREAID | DATAAREAID | ❌ |
| 5 | 27 | DELIVERYNAME | NOME DI CONSEGNA | ❌ |
| 6 | 28 | DLVMODE.TXT | MODALITA DI CONSEGNA | ❌ |
| 7 | 29 | DLVTERM.TXT | TERMINE DI CONSEGNA | ❌ |
| 8 | 30 | ID | ID | ❌ |
| 9 | 31 | IMAGEID.ID | QUANTITA STANDARD | ❌ |
| 10 | 32 | INVADDRESS | INDIRIZZO DI FATTURAZIONE | ❌ |
| 11 | 33 | INVCITY | CITTA DI FATTURAZIONE | ❌ |
| 12 | 34 | INVCOUNTRYREGIONID | MODALITA DI CONSEGNA | ❌ |
| 13 | 35 | INVCOUNTY | CONTEA DI INVOICE | ❌ |
| 14 | 36 | INVLOGISTICSADDRESSZIPCODE | INVLOGISTICSINDIRIZZOCODICE POSTALE | ❌ |
| 15 | 37 | INVOICEACCOUNTID | ID ACCOUNT FATTURA | ❌ |
| 16 | 38 | INVSTATE | RIFERIMENTO CLIENTE | ❌ |
| 17 | 39 | INVSTREET | VIA FATTURA | ❌ |
| 18 | 40 | INVZIPCODE | CODICE POSTALE DELLA FATTURA | ❌ |
| 19 | 41 | MODIFIEDBY | MODIFICATO DA: | ❌ |
| 20 | 42 | MODIFIEDDATETIME | CITTA DI FATTURAZIONE | ❌ |
| 21 | 43 | ORDERACCOUNT | CONTO DELL'ORDINE | ❌ |
| 22 | 44 | ORDERACCOUNTID.NAME | ID ACCOUNT DELL'ORDINE | ❌ |
| 23 | 45 | SALESORIGINID | ID RIFERIMENTO ORIGINE VENDITE | ❌ |
| 24 | 46 | SALESTABLE | TABELLA VENDITE | ❌ |
| 25 | 47 | WORKERSALESTAKER | OPERAIO COMMESSO | ❌ |

---

## 5. PRODOTTI

**URL**: `https://4.231.124.90/Archibald/INVENTTABLE_ListView/`
**Titolo pagina**: Prodotti - KI di gestione intelligente degli ordini
**Totale colonne**: 36 data columns (+ 2 system: Edit, SelectionCommandColumn)

### Filtri dropdown

Nessun filtro dropdown nella toolbar. La pagina non ha un selettore vista/filtro.

### Colonne VISIBILI (35)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 2 | ITEMID | ID ARTICOLO | ✅ |
| 2 | 3 | NAME | NOME ARTICOLO: | ✅ |
| 3 | 4 | DESCRIPTION | DESCRIZIONE | ✅ |
| 4 | 5 | PRODUCTGROUPID.ID | GRUPPO ARTICOLO: | ✅ |
| 5 | 6 | ImageCalc | IMMAGINE: | ✅ |
| 6 | 7 | BRASPACKINGCONTENTS | CONTENUTO DELL'IMBALLAGGIO | ✅ |
| 7 | 8 | SEARCHNAME | NOME DELLA RICERCA | ✅ |
| 8 | 9 | PRICEUNIT | UNITA DI PREZZO: | ✅ |
| 9 | 10 | PRODUCTGROUPID.PRODUCTGROUPID | ID GRUPPO DI PRODOTTI | ✅ |
| 10 | 11 | PRODUCTGROUPID.PRODUCTGROUP1 | DESCRIZIONE GRUPPO ARTICOLO: | ✅ |
| 11 | 12 | LOWESTQTY | QTA MINIMA: | ✅ |
| 12 | 13 | MULTIPLEQTY | QTA MULTIPLI: | ✅ |
| 13 | 14 | HIGHESTQTY | QTA MASSIMA: | ✅ |
| 14 | 15 | BRASFIGURE | FIGURA: | ✅ |
| 15 | 16 | BRASITEMIDBULK | ID IN BLOCCO DELL'ARTICOLO | ✅ |
| 16 | 17 | BRASPACKAGEEXPERTS | PACCO | ✅ |
| 17 | 18 | BRASSHANK | GAMBA | ✅ |
| 18 | 19 | BRASSIZE | GRANDEZZA | ✅ |
| 19 | 20 | CONFIGID | ID DI CONFIGURAZIONE | ✅ |
| 20 | 21 | CREATEDBY | CREATO DA: | ✅ |
| 21 | 22 | CREATEDDATETIME | DATA CREATA | ✅ |
| 22 | 23 | DATAAREAID | DATAAREAID | ✅ |
| 23 | 24 | DEFAULTSALESQTY | QTA PREDEFINITA: | ✅ |
| 24 | 25 | DISPLAYPRODUCTNUMBER | VISUALIZZA IL NUMERO DI PRODOTTO | ✅ |
| 25 | 26 | ENDDISC | SCONTO ASSOLUTO TOTALE: | ✅ |
| 26 | 27 | ID | ID | ✅ |
| 27 | 28 | LINEDISC.ID | SCONTO LINEA | ✅ |
| 28 | 29 | MODIFIEDBY | MODIFICATO DA: | ✅ |
| 29 | 30 | MODIFIEDDATETIME | DATETIME MODIFICATO | ✅ |
| 30 | 31 | ORDERITEM | ARTICOLO ORDINABILE: | ✅ |
| 31 | 32 | PURCHPRICEPCS | PURCH PRICE PCS | ✅ |
| 32 | 33 | STANDARDCONFIGID | ID DI CONFIGURAZIONE STANDARD | ✅ |
| 33 | 34 | STANDARDQTY | QTA STANDARD: | ✅ |
| 34 | 35 | STOPPED | FERMATO | ✅ |
| 35 | 36 | UNITID | ID UNITA | ✅ |

### Colonna NASCOSTA (1)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 37 | TAXITEMGROUPID | ID ELEMENTO IVAID | ❌ |

---

## 6. PREZZI (Tabella prezzi)

**URL**: `https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/`
**Titolo pagina**: Tabella prezzi - KI di gestione intelligente degli ordini
**Totale colonne**: 46 data columns (+ 2 system: Edit, SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Stato | Prezzi attivi | Prezzi attivi, Prezzi bloccati: |

### Colonne VISIBILI (14)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 2 | ID | ID | ✅ |
| 2 | 3 | ACCOUNTCODE | CODICE CONTO | ✅ |
| 3 | 4 | ACCOUNTRELATIONID | ACCOUNT: | ✅ |
| 4 | 5 | ACCOUNTRELATIONTXT | DESCRIZIONE ACCOUNT: | ✅ |
| 5 | 6 | ITEMRELATIONID | ITEM SELECTION: | ✅ |
| 6 | 7 | ITEMRELATIONTXT | ITEM DESCRIPTION: | ✅ |
| 7 | 8 | FROMDATE | DA DATA | ✅ |
| 8 | 9 | TODATE | DATA | ✅ |
| 9 | 10 | QUANTITYAMOUNTFROM | QUANTITAIMPORTODA | ✅ |
| 10 | 11 | QUANTITYAMOUNTTO | QUANTITAIMPORTO | ✅ |
| 11 | 12 | PRICEUNIT | UNITA DI PREZZO | ✅ |
| 12 | 13 | AMOUNT | IMPORTO UNITARIO: | ✅ |
| 13 | 14 | CURRENCY | VALUTA | ✅ |
| 14 | 15 | BRASNETPRICE | PREZZO NETTO BRASSELER | ✅ |

### Colonne NASCOSTE (32)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 16 | ACCOUNTRELATION | RELAZIONE CON L'ACCOUNT | ❌ |
| 2 | 17 | AGREEMENT | ACCORDO | ❌ |
| 3 | 18 | AGREEMENTHEADEREXT_RU | TESTO DELL'INTESTAZIONE DELL'ACCORDO | ❌ |
| 4 | 19 | ALLOCATEMARKUP | MARKUP: | ❌ |
| 5 | 20 | CALENDARDAYS | GIORNI DI CALENDARIO | ❌ |
| 6 | 21 | CREATEDBY | CREATO DA: | ❌ |
| 7 | 22 | CREATEDDATETIME | DATA DI CREAZIONE | ❌ |
| 8 | 23 | DATAAREAID | DATAAREAID | ❌ |
| 9 | 24 | DELIVERYTIME | TEMPI DI CONSEGNA | ❌ |
| 10 | 25 | DISREGARDLEADTIME | IGNORARELEADTIME | ❌ |
| 11 | 26 | GENERICCURRENCY | VALUTA GENERICA | ❌ |
| 12 | 27 | INVENTBAILEEFREEDAYS_RU | INVENTBAILEEFREEDAYS_RU | ❌ |
| 13 | 28 | INVENTDIMID | INVENTARE DIM ID | ❌ |
| 14 | 29 | ITEMCODE | CODICE ARTICOLO | ❌ |
| 15 | 30 | ITEMRELATION | RELAZIONE ARTICOLO | ❌ |
| 16 | 31 | MARKUP | VALORE DI MARKUP | ❌ |
| 17 | 32 | MAXIMUMRETAILPRICE_IN | MAXI PREZZO AL DETTAGLIO IN | ❌ |
| 18 | 33 | MCRFIXEDAMOUNTCUR | MCRFIXEDAMOUNTCUR | ❌ |
| 19 | 34 | MCRMERCHANDISINGEVENTID | MERACHANDISING EVENT | ❌ |
| 20 | 35 | MCRPRICEDISCGROUPTYPE | MCRPRICEDISCGROUPTYPE | ❌ |
| 21 | 36 | MODIFIEDBY | MODIFICATO DA: | ❌ |
| 22 | 37 | MODIFIEDDATETIME | CITTA DI FATTURAZIONE | ❌ |
| 23 | 38 | MODULE1 | MODULO1 | ❌ |
| 24 | 39 | ORIGINALPRICEDISCADMTRANSRECID | ORIGINALPRICEDISCADMTRANSRECID | ❌ |
| 25 | 40 | PDSCALCULATIONID | PDSCALCULATIONID | ❌ |
| 26 | 41 | PERCENT1 | PERCENTUALE1 | ❌ |
| 27 | 42 | PERCENT2 | PERCENTUALE2 | ❌ |
| 28 | 43 | RECID | RECID | ❌ |
| 29 | 44 | RECVERSION | REVERSIONE | ❌ |
| 30 | 45 | RELATION | RELAZIONE | ❌ |
| 31 | 46 | SEARCHAGAIN | CERCA DI NUOVO | ❌ |
| 32 | 47 | UNITID | UNITO | ❌ |

---

## 7. SCONTI LINEA

**URL**: `https://4.231.124.90/Archibald/PRICEDISCTABLE_ListViewLineDisc/`
**Titolo pagina**: Tabella prezzi - KI di gestione intelligente degli ordini
**Totale colonne**: 45 data columns (+ 2 system: Edit, SelectionCommandColumn)

### Filtri dropdown

| # | Filtro | Valore attuale | Opzioni |
|---|--------|---------------|---------|
| 1 | Stato | Active line discounts | Active line discounts, Closed line discounts |

### Colonne VISIBILI (15)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 2 | ID | ID | ✅ |
| 2 | 3 | ACCOUNTCODE | CODICE CONTO | ✅ |
| 3 | 4 | ACCOUNTRELATIONID | ACCOUNT: | ✅ |
| 4 | 5 | ACCOUNTRELATIONTXT | DESCRIZIONE ACCOUNT: | ✅ |
| 5 | 6 | ITEMCODE | CODICE ARTICOLO | ✅ |
| 6 | 7 | ITEMRELATIONID | ITEM SELECTION: | ✅ |
| 7 | 8 | ITEMRELATIONTXT | ITEM DESCRIPTION: | ✅ |
| 8 | 9 | FROMDATE | DA DATA | ✅ |
| 9 | 10 | TODATE | DATA | ✅ |
| 10 | 11 | QUANTITYAMOUNTFROM | QUANTITAIMPORTODA | ✅ |
| 11 | 12 | QUANTITYAMOUNTTO | QUANTITAIMPORTO | ✅ |
| 12 | 13 | PERCENT1 | PERCENTUALE1 | ✅ |
| 13 | 14 | PERCENT2 | PERCENTUALE2 | ✅ |
| 14 | 15 | PRICEUNIT | UNITA DI PREZZO | ✅ |
| 15 | 16 | AMOUNT | IMPORTO UNITARIO: | ✅ |

### Colonne NASCOSTE (30)

| # | visibleIndex | fieldName | Header Label (IT) | Visibile |
|---|-------------|-----------|-------------------|----------|
| 1 | 17 | ACCOUNTRELATION | RELAZIONE CON L'ACCOUNT | ❌ |
| 2 | 18 | AGREEMENT | ACCORDO | ❌ |
| 3 | 19 | AGREEMENTHEADEREXT_RU | TESTO DELL'INTESTAZIONE DELL'ACCORDO | ❌ |
| 4 | 20 | ALLOCATEMARKUP | MARKUP: | ❌ |
| 5 | 21 | BRASNETPRICE | PREZZO NETTO BRASSELER | ❌ |
| 6 | 22 | CALENDARDAYS | GIORNI DI CALENDARIO | ❌ |
| 7 | 23 | CREATEDBY | CREATO DA: | ❌ |
| 8 | 24 | CREATEDDATETIME | DATA DI CREAZIONE | ❌ |
| 9 | 25 | DATAAREAID | DATAAREAID | ❌ |
| 10 | 26 | DELIVERYTIME | TEMPI DI CONSEGNA | ❌ |
| 11 | 27 | DISREGARDLEADTIME | IGNORARELEADTIME | ❌ |
| 12 | 28 | GENERICCURRENCY | VALUTA GENERICA | ❌ |
| 13 | 29 | INVENTBAILEEFREEDAYS_RU | INVENTBAILEEFREEDAYS_RU | ❌ |
| 14 | 30 | INVENTDIMID | INVENTARE DIM ID | ❌ |
| 15 | 31 | ITEMRELATION | RELAZIONE ARTICOLO | ❌ |
| 16 | 32 | MARKUP | VALORE DI MARKUP | ❌ |
| 17 | 33 | MAXIMUMRETAILPRICE_IN | MAXI PREZZO AL DETTAGLIO IN | ❌ |
| 18 | 34 | MCRFIXEDAMOUNTCUR | MCRFIXEDAMOUNTCUR | ❌ |
| 19 | 35 | MCRMERCHANDISINGEVENTID | EVENTO MERACHANDISING | ❌ |
| 20 | 36 | MCRPRICEDISCGROUPTYPE | MCRPRICEDISCGROUPTYPE | ❌ |
| 21 | 37 | MODIFIEDBY | MODIFICATO DA: | ❌ |
| 22 | 38 | MODIFIEDDATETIME | CITTA DI FATTURAZIONE | ❌ |
| 23 | 39 | MODULE1 | MODULO1 | ❌ |
| 24 | 40 | ORIGINALPRICEDISCADMTRANSRECID | ORIGINALPRICEDISCADMTRANSRECID | ❌ |
| 25 | 41 | PDSCALCULATIONID | PDSCALCULATIONID | ❌ |
| 26 | 42 | RECID | RECID | ❌ |
| 27 | 43 | RECVERSION | REVERSIONE | ❌ |
| 28 | 44 | RELATION | RELAZIONE | ❌ |
| 29 | 45 | SEARCHAGAIN | CERCA DI NUOVO | ❌ |
| 30 | 46 | UNITID | UNITO | ❌ |

---

## Riepilogo statistico

| Pagina | Colonne totali | Visibili | Nascoste | Filtri dropdown |
|--------|---------------|----------|----------|-----------------|
| Clienti | 26 | 26 | 0 | 2 (Vista + Filtro) |
| Ordini | 63 | 23 | 40 | 1 (Tutti gli ordini) |
| DDT | 33 | 17 | 16 | 1 (Periodo) |
| Fatture | 47 | 22 | 25 | 1 (Periodo/Stato) |
| Prodotti | 36 | 35 | 1 | 0 |
| Prezzi | 46 | 14 | 32 | 1 (Stato) |
| Sconti Linea | 45 | 15 | 30 | 1 (Stato) |

**Totale colonne uniche mappate: 296** (di cui 152 visibili, 144 nascoste)

---

## Note tecniche

### Metodo di estrazione
I dati sono stati estratti tramite la DevExpress ASPxClientGridView client-side JavaScript API:
- `window[gridId].GetColumn(index)` per ottenere ogni colonna
- Proprieties estratte: `fieldName`, `visible`, `visibleIndex`, `caption`, `name`
- Le header label italiane sono state ottenute dal DOM (`td.dxgvHeader`) matchando l'indice della colonna con il suffisso `_col{N}` dell'ID dell'elemento header

### Header label con traduzione errata
Alcune header label sono chiaramente tradotte male dal sistema ERP (traduzione automatica):
- `MODIFIEDDATETIME` -> "CITTA DI FATTURAZIONE" (dovrebbe essere "Data modifica")
- `PURCHORDERFORMNUM` -> "RIMANI VENDITE FINANZIARIE" (dovrebbe essere "Num. ordine acquisto" / "Descrizione")
- `IMAGEID.ID` -> "QUANTITA STANDARD" (dovrebbe essere "ID immagine")
- `INVSTATE` -> "RIFERIMENTO CLIENTE" (dovrebbe essere "Stato fattura")
- `INVCOUNTRYREGIONID` -> "MODALITA DI CONSEGNA" (dovrebbe essere "ID regione paese fattura")
- `SALESPOOLID.NAME` -> "MODALITA DI CONSEGNA" (dovrebbe essere "Pool vendite")
- `TEXTEXTERNAL` -> "ORARI DI APERTURA MER" (dovrebbe essere "Testo esterno")
- `SALESACT` -> "TIPO DI CLIENTE" (dovrebbe essere "Vendite effettive")
- `DLVADDRESS` (DDT) -> "NOME DI CONSEGNA" (duplicato, dovrebbe essere "Indirizzo di consegna")

### Colonne system (non dati)
Ogni grid contiene 1-2 colonne system non mappabili:
- `Edit` (visibleIndex: 1) - colonna con pulsante di modifica
- `SelectionCommandColumn` (visibleIndex: 0) - checkbox di selezione riga

### Differenza Prezzi vs Sconti Linea
Le due tabelle condividono quasi tutte le colonne (stessa entità `PRICEDISCTABLE`), con queste differenze chiave:
- Sconti Linea ha `ITEMCODE` visibile (col index 6) mentre Prezzi lo nasconde
- Sconti Linea ha `PERCENT1` e `PERCENT2` visibili, Prezzi li nasconde
- Prezzi ha `BRASNETPRICE` visibile, Sconti Linea lo nasconde
- Prezzi ha `CURRENCY` visibile, Sconti Linea non la include
