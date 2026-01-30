# Manual Database Fixes

Questo documento tiene traccia delle correzioni manuali applicate al database che potrebbero dover essere riapplicate in caso di re-sync completo o ripristino del database.

## 2026-01-30: Correzione Ordine ORD/26001461 (Bug Archibald)

### Problema
L'ordine ORD/26001461 di "Fresis Soc Cooperativa" (creato il 2026-01-28) presentava un bug di Archibald in cui il campo `total_amount` non rifletteva gli sconti applicati alle righe d'ordine.

### Sintomi
- `gross_amount`: 933,44 € (corretto - imponibile lordo senza sconti)
- `total_amount`: 933,44 € (errato - doveva essere l'imponibile netto con sconti)
- Dalla scheda articoli il totale imponibile reale era: 415,48 €
- Questo causava conteggi errati nei widget

### Correzione Applicata
```sql
UPDATE orders
SET total_amount = '415,48 €'
WHERE order_number = 'ORD/26001461';
```

### Valori Finali
- `gross_amount`: 933,44 € (imponibile lordo)
- `total_amount`: 415,48 € (imponibile netto con sconti)
- `discount_percent`: 0,00% (non corretto ma non critico)

### Note
- Il bug si è verificato solo su questo ordine specifico
- In caso di re-sync completo del database, verificare che questo ordine abbia i valori corretti
- La discrepanza era dovuta a un malfunzionamento del software Archibald madre della Komet
