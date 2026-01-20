# PDF Prezzi - Struttura Verificata

## Ciclo: 3 Pagine per Articolo

### Pagina 1: Identificazione e Account
- **ID** - ID Articolo
- **CODICE CONTO** - Codice conto
- **ACCOUNT: DESCRIZIONE** - Descrizione account
- **ACCOUNT:** - Account code
- **ITEM SELECTION:** - Selezione variante (K2, K3, etc.)

### Pagina 2: Descrizione e Date
- **ITEM DESCRIPTION:** - Descrizione articolo
- **DA DATA** - Data inizio validità prezzo
- **DATA** - Data fine validità prezzo (?)
- **QUANTITÀ** - Quantità minima (?)
- **IMPORTO** - Importo (?)
- **DA** - ?

### Pagina 3: Prezzi e Unità
- **QUANTITÀ** - Quantità (range)
- **IMPORTO** - Importo totale (?)
- **UNITÀ DI PREZZO** - Unità di misura prezzo
- **IMPORTO UNITARIO:** - **PREZZO CHIAVE** (Italian format: "1.234,56 €")
- **VALUTA** - Valuta (EUR)
- **PREZZO NETTO BRASSELER** - Prezzo netto

## Note Implementazione

1. **Ciclo da 3 pagine** (non 8)
2. **Campo chiave:** IMPORTO UNITARIO (pagina 3)
3. **Formato italiano:** "1.234,56 €" → 1234.56
4. **Matching:** ID + ITEM SELECTION → products.db

## Campi da Estrarre (Priorità)

### Essenziali (P0):
- ID (pagina 1)
- ITEM SELECTION (pagina 1)
- ITEM DESCRIPTION (pagina 2)
- IMPORTO UNITARIO (pagina 3) ← **PREZZO PRINCIPALE**
- VALUTA (pagina 3)
- UNITÀ DI PREZZO (pagina 3)

### Secondari (P1):
- CODICE CONTO (pagina 1)
- ACCOUNT: DESCRIZIONE (pagina 1)
- DA DATA (pagina 2)
- DATA (pagina 2)
- PREZZO NETTO BRASSELER (pagina 3)

### Opzionali (P2):
- QUANTITÀ (range prezzi)
- IMPORTO (totale)

## Esempio Parsing

```
Pagina 1:
ID: 001627K2
CODICE CONTO: 12345
ACCOUNT: DESCRIZIONE: Cliente Test SRL
ACCOUNT: 12345
ITEM SELECTION: K2

Pagina 2:
ITEM DESCRIPTION: GUARNIZIONE CANALETTA
DA DATA: 01/01/2026
DATA: 31/12/2026
QUANTITÀ: 1
IMPORTO: 52,50

Pagina 3:
QUANTITÀ: 1
IMPORTO: 52,50
UNITÀ DI PREZZO: PZ
IMPORTO UNITARIO: 10,50 €
VALUTA: EUR
PREZZO NETTO BRASSELER: 10,00 €
```

**Risultato:**
- productId: "001627K2"
- itemSelection: "K2"
- productName: "GUARNIZIONE CANALETTA"
- unitPrice: "10,50 €" (FORMATO ITALIANO PRESERVATO - string, non float)
- currency: "EUR"
- priceUnit: "PZ"

**IMPORTANTE:** I prezzi vengono mantenuti come stringhe nel formato italiano originale "1.234,56 €" senza conversione in float.
