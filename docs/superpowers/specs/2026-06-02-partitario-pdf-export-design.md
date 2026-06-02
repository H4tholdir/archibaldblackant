# Design: PDF Export Partitario Cliente

**Data:** 2026-06-02  
**Stato:** Approvato

---

## Obiettivo

Aggiungere un bottone "Stampa PDF" nel tab Partitario del profilo cliente che genera un documento PDF formale ("Estratto Conto") da consegnare al cliente, contenente la situazione economica completa: KPI, fatture aperte, note di credito, storico saldato.

---

## Decisioni di design

| Decisione | Scelta | Motivazione |
|---|---|---|
| Destinatario PDF | Cliente (documento formale) | Intestazione Komet, tono professionale |
| Storico saldato | Sempre incluso | Visione completa per contestazioni |
| Posizione bottone | Nel tab Partitario | Accesso contestuale diretto |
| Libreria PDF | jsPDF + jspdf-autotable | Già usata in `pdf-export.service.ts` e `overdue-pdf.service.ts` — zero dipendenze nuove |

---

## Struttura PDF (layout approvato)

```
┌─────────────────────────────────────────────────┐
│ [KOMET logo]  Komet Italia S.r.l.     ESTRATTO   │
│               Agente: Formicola B.    CONTO      │
│               Via Morgagni, 36        02/06/2026 │
├─────────────────────────────────────────────────┤
│ CLIENTE                                          │
│  Nome: Centro Odontoiatrico Espertino S.r.l.    │
│  Cod: 55.235 | P.IVA: IT07843210638             │
│  Via Roma 14, 80100 Napoli | Tel. 081 5551234   │
├─────────────────────────────────────────────────┤
│ 🚫 CLIENTE BLOCCATO (solo se blockedStatus ≠ null)│
├─────────────────────────────────────────────────┤
│ [Scaduto €318,86] [Da Saldare €1.118,87]        │
│ [Incassato €0,00] [Note di Credito €0,00]       │
├─────────────────────────────────────────────────┤
│ FATTURE APERTE (5)              Totale: 1.118,87 │
│  N° Fattura | Data | Scadenza | Stato | Gg | €  │
│  CF1/26000199 | 16/01 | 31/03 | Scaduta | +63  │
│  ...                                             │
├─────────────────────────────────────────────────┤
│ NOTE DI CREDITO APERTE (solo se ncInvoices > 0) │
├─────────────────────────────────────────────────┤
│ STORICO SALDATO                                  │
│  N° | Data | Scadenza orig. | Saldato il | €    │
├─────────────────────────────────────────────────┤
│ Komet Italia S.r.l. · 02/06/2026 · Pagina 1/1  │
└─────────────────────────────────────────────────┘
```

---

## Modifiche al codice

### 1. Nuovo file: `partitario-pdf.service.ts`

```
archibald-web-app/frontend/src/services/partitario-pdf.service.ts
```

Funzione principale:
```ts
function generatePartitarioPDF(
  customer: { erpId: string; name: string; vatNumber?: string|null; street?: string|null; postalCode?: string|null; city?: string|null; phone?: string|null },
  ledger: LedgerSummary,
  history: LedgerInvoice[]
): void
```

Pattern: identico a `overdue-pdf.service.ts` — `new jsPDF()`, `autoTable()`, `doc.save()`.

Sezioni generate:
1. Header (logo placeholder + company block sx, titolo + meta dx)
2. Customer box (nome, codice, P.IVA, indirizzo, telefono)
3. Alert banner bloccato (condizionale: `ledger.blockedStatus !== null`)
4. KPI grid 2×2 (Scaduto, Da Saldare, Incassato, Note di Credito)
5. Tabella fatture aperte (`ledger.openInvoices`) — colonne: N°, Data emissione, Scadenza, Stato badge, Giorni ritardo, Importo
6. Tabella NC aperte (`ledger.ncInvoices`) — solo se `length > 0`
7. Tabella storico saldato (`history`) — colonne: N°, Data emissione, Scadenza orig., Saldato il, Importo
8. Footer (azienda, data generazione, numerazione pagine)

### 2. Modifica: `PartitarioTab.tsx`

Aggiunta prop `customer`:
```ts
type Props = {
  erpId: string;
  customer?: Pick<Customer, 'name' | 'vatNumber' | 'street' | 'postalCode' | 'city' | 'phone'>;
};
```

Aggiunta bottone PDF in cima al tab:
```tsx
<button onClick={handlePrintPDF}>
  📄 Stampa PDF
</button>
```

Handler `handlePrintPDF`:
- Se `history.length === 0`, chiama `fetchCustomerLedgerHistory(erpId)` prima
- Poi chiama `generatePartitarioPDF(customer, ledger, history)`
- Mostra stato loading sul bottone durante fetch

### 3. Modifica: `CustomerProfilePage.tsx`

Passa `customer` a `PartitarioTab`:
```tsx
<PartitarioTab erpId={erpId} customer={customer} />
```

### 4. Nuovo file: `partitario-pdf.service.spec.ts`

Test unit:
- `generatePartitarioPDF` non lancia con dati minimi (ledger vuoto, history vuota)
- `generatePartitarioPDF` non lancia con dati completi (fatture aperte + storico)
- Alert banner bloccato incluso quando `blockedStatus !== null`
- Alert banner assente quando `blockedStatus === null`

---

## File tocchi

| File | Tipo modifica |
|---|---|
| `src/services/partitario-pdf.service.ts` | Nuovo |
| `src/services/partitario-pdf.service.spec.ts` | Nuovo |
| `src/components/PartitarioTab.tsx` | Modifica (prop + bottone + handler) |
| `src/pages/CustomerProfilePage.tsx` | Modifica (passa `customer` prop) |

---

## Non in scope

- Versione agente vs versione cliente (una sola versione formale)
- Selezione data range per lo storico
- Invio PDF via email/WhatsApp direttamente dal PDF export (già esiste infrastruttura separata)
