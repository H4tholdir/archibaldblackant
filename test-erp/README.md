# Test E2E — Ordine Fresis (30 articoli)

## Setup (una sola volta)
```bash
npx playwright install chromium
```

## Esecuzione
```bash
cd /Users/hatholdir/Downloads/Archibald
ERP_USER=tuo_username ERP_PASS=tua_password npx tsx test-erp/fresis-order.ts
```

## Come funziona
1. Apre Chrome con browser **visibile**
2. Fa login all'ERP
3. Crea nuovo ordine per Fresis (55.261)
4. Inserisce articoli 1-15 normalmente
5. **Pausa prima dell'articolo 16** — puoi osservare l'ERP in real-time
6. Inserisce articolo 16 (8959KR.314.018) con monitoring live IsEditing
7. Se si blocca: reload-and-resume automatico con pausa per verifica
8. Continua articoli 17-30
9. **Pausa prima del salvataggio finale**
10. Salva l'ordine

## Cosa vedi in console
```
[10:15:30] ARTICOLO 16/30: 8959KR.314.018 | qty:2 | disc:63%
[10:15:31]   AddNew: 234ms
[10:15:33]   Typed 8959KR.314.018: 1823ms
[10:15:33]   Variante selezionata (row 1, suffix K2): 1901ms
[10:15:34]   Qty 1→2: 412ms
[10:15:36]   Discount 63% [attempt 1]: 2100ms
[10:15:36]   UpdateEdit cliccato: 2244ms
[10:15:37]   IsEditing changed → true at 1000ms
[10:16:52]   ⏳ IsEditing ancora true (76s) — articolo 16
[10:16:52]   ⚠️ IsEditing STUCK dopo 90s — articolo 16
[10:16:52]   🔄 RELOAD & RESUME...
```

## Modifica al volo
Puoi modificare `fresis-order.ts` mentre il test è in pausa e il browser è aperto.
Non serve ripartire da zero — il test riprende dal punto in cui si è fermato.
