# Verifica Mapping Completo 41 Colonne

**Data**: 2026-01-16
**Versione**: 1.0
**Scopo**: Verificare che TUTTI i 41 campi estratti siano visualizzati nella UX

---

## Schema Dati Completo (41 colonne)

### Order List (20 colonne)
1. `id` - ID ordine (interno)
2. `orderNumber` - Numero ordine (es. ORD/26000553)
3. `customerProfileId` - ID profilo cliente
4. `customerName` - Nome cliente
5. `agentPersonName` - Nome agente
6. `orderDate` - Data ordine
7. `orderType` - Tipo ordine
8. `deliveryTerms` - Termini di consegna
9. `deliveryDate` - Data di consegna
10. `total` - Totale
11. `salesOrigin` - Origine vendita
12. `lineDiscount` - Sconto riga
13. `endDiscount` - Sconto finale
14. `shippingAddress` - Indirizzo spedizione
15. `salesResponsible` - Responsabile vendite
16. `status` - Stato ordine
17. `state` - Stato dettagliato
18. `documentState` - Stato documento
19. `transferredToAccountingOffice` - Trasferito a ufficio contabilità
20. `deliveryAddress` - Indirizzo di consegna

### DDT (11 colonne)
21. `ddtId` - ID DDT
22. `ddtNumber` - Numero documento trasporto
23. `ddtDeliveryDate` - Data consegna DDT
24. `orderId` - ID ordine di vendita (match key)
25. `customerAccountId` - Conto dell'ordine
26. `salesName` - Nome vendite
27. `deliveryName` - Nome di consegna
28. `trackingNumber` - Numero tracciabilità
29. `trackingUrl` - URL tracciabilità (link cliccabile)
30. `trackingCourier` - Corriere (UPS, FedEx, etc.)
31. `deliveryTerms` (DDT) - Termini di consegna
32. `deliveryMethod` - Modalità di consegna
33. `deliveryCity` - Città di consegna

### Metadata (10 colonne)
34. `botUserId` - User ID del bot
35. `jobId` - Job ID
36. `createdAt` - Data creazione
37. `lastUpdatedAt` - Ultimo aggiornamento
38. `notes` - Note
39. `items` (JSON) - Articoli ordine
40. `stateTimeline` (JSON) - Timeline stati
41. `documents` (JSON) - Documenti allegati

---

## Mapping UX: Stato Chiuso (Collapsed)

**Altezza**: 240px
**Campi visibili direttamente**: 3 campi + 8 badge

### Campi Diretti (3)
| Campo DB | Visualizzazione | Posizione |
|----------|----------------|-----------|
| `customerName` | Nome cliente | Header sinistra |
| `orderDate` | Data ordine | Header destra |
| `total` | Totale ordine | Footer destra |

### Badge System (8 badge types)

#### Badge 1: Status Badge
**Campi mappati**:
- `status` → Colore e label principale
- `state` → Tooltip dettaglio
- `lastUpdatedAt` → Timestamp

#### Badge 2: Order Type Badge
**Campi mappati**:
- `orderType` → Label e icona

#### Badge 3: Document Badge
**Campi mappati**:
- `documentState` → Colore e label

#### Badge 4: Transfer Badge
**Campi mappati**:
- `transferredToAccountingOffice` → Booleano (mostra solo se true)

#### Badge 5: Tracking Badge (Clickable)
**Campi mappati**:
- `trackingNumber` → Numero visualizzato
- `trackingUrl` → Link cliccabile
- `trackingCourier` → Logo corriere

#### Badge 6: Origin Badge
**Campi mappati**:
- `salesOrigin` → Label

#### Badge 7: Delivery Method Badge
**Campi mappati**:
- `deliveryMethod` → Icona e label

#### Badge 8: Location Badge
**Campi mappati**:
- `deliveryCity` → Prima parte label
- `shippingAddress` → Tooltip con indirizzo completo

**Totale campi in stato chiuso**: 14 campi
**Rimanenti da mostrare in espansione**: 27 campi

---

## Mapping UX: Stato Espanso (Expanded)

**Layout**: 5 tab orizzontali
**Altezza**: Auto (min 600px)

### Tab 1: Panoramica (Overview)

#### Sezione: Informazioni Ordine
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `orderNumber` | Numero Ordine | Testo bold con copy button |
| `id` | ID Interno | Testo small gray |
| `orderDate` | Data Ordine | Formato DD/MM/YYYY |
| `deliveryDate` | Data Consegna | Formato DD/MM/YYYY + icona calendario |
| `orderType` | Tipo Ordine | Badge (già in collapsed) |
| `status` | Stato | Badge (già in collapsed) |
| `state` | Stato Dettagliato | Testo con colore stato |
| `documentState` | Stato Documento | Badge (già in collapsed) |

#### Sezione: Cliente e Agente
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `customerName` | Cliente | Testo bold (già in collapsed) |
| `customerProfileId` | ID Profilo Cliente | Testo small gray |
| `agentPersonName` | Agente | Testo con icona user |
| `salesResponsible` | Responsabile Vendite | Testo con icona user |

#### Sezione: Consegna
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `deliveryAddress` | Indirizzo Consegna | Multiline text |
| `shippingAddress` | Indirizzo Spedizione | Multiline text (già in badge tooltip) |
| `deliveryTerms` | Termini Consegna | Testo |

#### Sezione: Badge Completi
Tutti gli 8 badge già visibili in collapsed, qui con più spazio e dettagli

**Campi in Tab Panoramica**: 15 campi (alcuni già visibili in collapsed)

---

### Tab 2: Articoli (Line Items)

#### JSON Field: `items`
Struttura:
```json
{
  "items": [
    {
      "itemNumber": "PROD-001",
      "description": "Prodotto X",
      "quantity": 10,
      "unitPrice": 25.50,
      "lineTotal": 255.00,
      "discount": 5.00
    }
  ]
}
```

**Visualizzazione**: Tabella con colonne:
- Codice Articolo
- Descrizione
- Quantità
- Prezzo Unitario
- Totale Riga
- Sconto

**Campi mappati**: 1 campo JSON (`items`)

---

### Tab 3: Logistica (Shipping & DDT)

#### Sezione: Documento Trasporto (DDT)
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `ddtNumber` | Numero DDT | Testo bold con copy button |
| `ddtId` | ID DDT | Testo small gray |
| `ddtDeliveryDate` | Data Consegna DDT | Formato DD/MM/YYYY |
| `orderId` | ID Ordine Vendita | Testo (match con orderNumber) |

#### Sezione: Informazioni Cliente (da DDT)
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `customerAccountId` | Conto Cliente | Testo |
| `salesName` | Nome Vendite | Testo con icona user |
| `deliveryName` | Nome Consegna | Testo bold |

#### Sezione: Tracking (Clickable)
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `trackingNumber` | Numero Tracciabilità | Testo bold + copy button |
| `trackingUrl` | Link Tracciabilità | Pulsante "Traccia Spedizione" → apre URL |
| `trackingCourier` | Corriere | Logo + nome (UPS, FedEx, etc.) |

#### Sezione: Dettagli Consegna
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `deliveryTerms` (DDT) | Termini Consegna | Testo |
| `deliveryMethod` | Modalità Consegna | Badge con icona |
| `deliveryCity` | Città Consegna | Testo con icona location |

**Campi in Tab Logistica**: 13 campi (tutti gli 11 campi DDT + 2 duplicati da Order List)

---

### Tab 4: Finanziario (Financial)

#### Sezione: Totali
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `total` | Totale Ordine | Testo bold grande (già in collapsed) |
| `lineDiscount` | Sconto Riga | Formato valuta con % |
| `endDiscount` | Sconto Finale | Formato valuta con % |

#### Sezione: Trasferimenti
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `transferredToAccountingOffice` | Trasferito a Contabilità | Badge SI/NO con data |

**Campi in Tab Finanziario**: 4 campi

---

### Tab 5: Storico (Timeline & Documents)

#### Sezione: Timeline Stati
**Campo JSON**: `stateTimeline`
```json
{
  "stateTimeline": [
    {
      "timestamp": "2026-01-15T10:30:00Z",
      "state": "Confermato",
      "user": "admin@example.com",
      "note": "Ordine confermato dal cliente"
    }
  ]
}
```

**Visualizzazione**: Timeline verticale con:
- Data/Ora
- Stato
- Utente
- Note

#### Sezione: Documenti Allegati
**Campo JSON**: `documents`
```json
{
  "documents": [
    {
      "type": "invoice",
      "url": "https://...",
      "filename": "fattura_123.pdf",
      "uploadedAt": "2026-01-15T12:00:00Z"
    }
  ]
}
```

**Visualizzazione**: Lista documenti con:
- Icona tipo
- Nome file
- Data upload
- Pulsante download

#### Sezione: Note Ordine
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `notes` | Note | Textarea multiline |

#### Sezione: Metadata
| Campo DB | Label | Visualizzazione |
|----------|-------|-----------------|
| `botUserId` | Bot User ID | Testo small gray |
| `jobId` | Job ID | Testo small gray con link |
| `createdAt` | Creato il | Formato DD/MM/YYYY HH:mm |
| `lastUpdatedAt` | Aggiornato il | Formato DD/MM/YYYY HH:mm (già in Status badge) |

**Campi in Tab Storico**: 7 campi (3 JSON + 4 metadata)

---

## Riepilogo Completo Mapping

### Totale Campi per Ubicazione

| Ubicazione | Campi Unici | Campi Duplicati | Totale Presenze |
|------------|-------------|-----------------|-----------------|
| **Collapsed State** | 14 | - | 14 |
| **Tab 1: Panoramica** | 1 (solo id) | 14 | 15 |
| **Tab 2: Articoli** | 1 (items JSON) | - | 1 |
| **Tab 3: Logistica** | 13 | - | 13 |
| **Tab 4: Finanziario** | 3 (lineDiscount, endDiscount, transferredToAccountingOffice) | 1 (total) | 4 |
| **Tab 5: Storico** | 7 | - | 7 |
| **TOTALE UNICO** | **41** | - | **54** |

### Verifica: Tutti i 41 Campi Mappati

#### Order List (20 campi) ✅
- [x] 1. `id` → Tab Panoramica (ID Interno)
- [x] 2. `orderNumber` → Tab Panoramica (Numero Ordine)
- [x] 3. `customerProfileId` → Tab Panoramica (ID Profilo Cliente)
- [x] 4. `customerName` → Collapsed (Header) + Tab Panoramica
- [x] 5. `agentPersonName` → Tab Panoramica (Agente)
- [x] 6. `orderDate` → Collapsed (Header) + Tab Panoramica
- [x] 7. `orderType` → Collapsed (Badge 2) + Tab Panoramica
- [x] 8. `deliveryTerms` → Tab Panoramica (Termini Consegna)
- [x] 9. `deliveryDate` → Tab Panoramica (Data Consegna)
- [x] 10. `total` → Collapsed (Footer) + Tab Finanziario
- [x] 11. `salesOrigin` → Collapsed (Badge 6)
- [x] 12. `lineDiscount` → Tab Finanziario (Sconto Riga)
- [x] 13. `endDiscount` → Tab Finanziario (Sconto Finale)
- [x] 14. `shippingAddress` → Collapsed (Badge 8 tooltip) + Tab Panoramica
- [x] 15. `salesResponsible` → Tab Panoramica (Responsabile Vendite)
- [x] 16. `status` → Collapsed (Badge 1) + Tab Panoramica
- [x] 17. `state` → Collapsed (Badge 1 tooltip) + Tab Panoramica
- [x] 18. `documentState` → Collapsed (Badge 3) + Tab Panoramica
- [x] 19. `transferredToAccountingOffice` → Collapsed (Badge 4) + Tab Finanziario
- [x] 20. `deliveryAddress` → Tab Panoramica (Indirizzo Consegna)

#### DDT (11 campi) ✅
- [x] 21. `ddtId` → Tab Logistica (ID DDT)
- [x] 22. `ddtNumber` → Tab Logistica (Numero DDT)
- [x] 23. `ddtDeliveryDate` → Tab Logistica (Data Consegna DDT)
- [x] 24. `orderId` → Tab Logistica (ID Ordine Vendita)
- [x] 25. `customerAccountId` → Tab Logistica (Conto Cliente)
- [x] 26. `salesName` → Tab Logistica (Nome Vendite)
- [x] 27. `deliveryName` → Tab Logistica (Nome Consegna)
- [x] 28. `trackingNumber` → Collapsed (Badge 5) + Tab Logistica
- [x] 29. `trackingUrl` → Collapsed (Badge 5 link) + Tab Logistica (Pulsante)
- [x] 30. `trackingCourier` → Collapsed (Badge 5 logo) + Tab Logistica
- [x] 31. `deliveryTerms` (DDT) → Tab Logistica (Termini Consegna)
- [x] 32. `deliveryMethod` → Collapsed (Badge 7) + Tab Logistica
- [x] 33. `deliveryCity` → Collapsed (Badge 8) + Tab Logistica

#### Metadata (10 campi) ✅
- [x] 34. `botUserId` → Tab Storico (Bot User ID)
- [x] 35. `jobId` → Tab Storico (Job ID)
- [x] 36. `createdAt` → Tab Storico (Creato il)
- [x] 37. `lastUpdatedAt` → Collapsed (Badge 1 timestamp) + Tab Storico
- [x] 38. `notes` → Tab Storico (Note)
- [x] 39. `items` (JSON) → Tab Articoli (Tabella)
- [x] 40. `stateTimeline` (JSON) → Tab Storico (Timeline)
- [x] 41. `documents` (JSON) → Tab Storico (Lista Documenti)

---

## Conclusione

✅ **VERIFICA COMPLETATA**: Tutti i 41 campi definiti sono mappati nella struttura UX.

### Distribuzione Ottimale

1. **Collapsed State** (14 campi): Informazioni critiche per scanning rapido
2. **Tab Panoramica** (15 presenze, 1 unico): Overview completa con tutti i badge
3. **Tab Articoli** (1 campo JSON): Dettaglio prodotti
4. **Tab Logistica** (13 campi): Tutti gli 11 campi DDT + tracking
5. **Tab Finanziario** (4 campi): Sconti e trasferimenti
6. **Tab Storico** (7 campi): Timeline, documenti, metadata

### Priorità Visiva

**Livello 1 (Collapsed)**:
- Campi più importanti per identificazione rapida
- Badge per stato e tracking
- Totale ordine

**Livello 2 (Expanded - Tab Panoramica)**:
- Informazioni complete ordine e cliente
- Tutti i badge con più spazio

**Livello 3 (Altri Tab)**:
- Dati specializzati per workflow specifici
- Logistica per spedizione
- Finanziario per contabilità
- Storico per audit

**Nessun campo è stato omesso dalla visualizzazione.**
