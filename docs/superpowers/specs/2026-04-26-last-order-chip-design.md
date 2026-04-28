# Spec: Chip "Ultimo ordine" nella lista clienti

**Data:** 2026-04-26  
**Scope:** Solo frontend — `CustomerList.tsx`

---

## Obiettivo

Rendere immediatamente visibile, al colpo d'occhio, da quanto tempo ogni cliente non ordina. L'agente deve poter scansionare la lista e prioritizzare le chiamate senza aprire la scheda cliente.

---

## Design approvato

Ogni `CustomerRow` aggiunge un chip a due righe sul lato destro della riga:

```
┌─────────────┐
│ ULT. ORDINE │  ← micro-label 8px, uppercase, grigia (#9ca3af)
│  9 mesi fa  │  ← valore 12px bold, colorato per urgenza
└─────────────┘
```

Il chip sostituisce il badge generico `attivo`/`inattivo` (rimosso — era ridondante con la sezione).

---

## Logica colori

| Periodo dall'ultimo ordine | Sfondo chip | Colore testo |
|---|---|---|
| < 3 mesi | `#dcfce7` | `#15803d` (verde) |
| 3–6 mesi | `#fef3c7` | `#92400e` (ambra) |
| > 6 mesi | `#fee2e2` | `#b91c1c` (rosso) |
| Nessun ordine | `#f1f5f9` | `#64748b` (grigio), valore `—` |

Le soglie rispecchiano esattamente i gruppi esistenti (attivo/da tenere d'occhio/da contattare), garantendo coerenza visiva.

---

## Formato testo relativo

Funzione pura `formatRelativeTime(lastOrderDate: string): string`:

| Elapsed | Output |
|---|---|
| < 30 giorni | `X gg. fa` |
| 30 giorni – 8 settimane | `X sett. fa` |
| 2–11 mesi | `X mesi fa` |
| ≥ 12 mesi | `1 anno fa` / `X anni fa` |

Input: stringa `DD/MM/YYYY` (formato ERP) o ISO. Output: stringa localizzata.

---

## Visibilità

Il chip appare in **tutti i contesti** in cui compare `CustomerRow`:
- Gruppi "I miei clienti" (Recenti, Da contattare, Da tenere d'occhio, Attivi, Nuovi clienti)
- Risultati di ricerca

---

## Implementazione

### File modificati

- `archibald-web-app/frontend/src/pages/CustomerList.tsx`
  - `CustomerRow`: aggiunge `OrderChip` a destra, rimuove badge `attivo`/`inattivo`
  - Nuova funzione `formatRelativeTime(date: string): string` (pura, testabile)
  - Nuova funzione `orderChipStyle(date: string | null): { bg: string; color: string }` (pura)

- `archibald-web-app/frontend/src/pages/CustomerList.spec.tsx` (esistente o da creare)
  - Unit test per `formatRelativeTime` (vari intervalli + edge case)
  - Unit test per `orderChipStyle`

### Nessun cambiamento backend

`customer.lastOrderDate` è già disponibile nell'API `GET /api/customers`.

---

## Edge case

| Caso | Comportamento |
|---|---|
| `lastOrderDate` null/undefined | Chip grigio con `—` |
| Data malformata / NaN | Chip grigio con `—` |
| Ordine di oggi | `1 gg. fa` (minimo 1) |
| Nomi molto lunghi | `row-name` già ha `text-overflow: ellipsis`; chip ha `flex-shrink: 0` e `min-width: 72px` |

---

## Test

- `formatRelativeTime`: parameterized su almeno 6 intervalli + stringa vuota + NaN
- `orderChipStyle`: verifica colore per ogni soglia + null
- Nessun test di integrazione (logica puramente UI/date-math)
