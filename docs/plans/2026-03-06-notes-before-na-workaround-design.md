# Design: Spostare note prima del workaround N/A

## Problema

Dopo il doppio `clickSaveOnly()` del workaround N/A (STEP 9.5), il form DevExpress entra in uno stato "post-save" dove il click sui campi note nella tab Panoramica triggera una rigenerazione del DOM:
- PURCHORDERFORMNUM viene sostituito (verified value: `""`)
- TEXTEXTERNAL e TEXTINTERNAL spariscono dal DOM

Log produzione (ordine 50.186, 2026-03-06 20:04):
```
20:04:21 N/A discount workaround applied (double N/A + double save)
20:04:22 Note fields found in DOM (3 campi trovati)
20:04:22 Click su PURCHORDERFORMNUM a (811, 318)
20:04:26 Filled note field "PURCHORDERFORMNUM" — verified value: ""
20:04:26 TEXTEXTERNAL not found in DOM
20:04:26 TEXTINTERNAL not found in DOM
```

Senza workaround (nessun save intermedio), le note si salvano correttamente.

## Soluzione

Riordinare gli step: compilare le note PRIMA del workaround N/A, quando il form e stabile, e persistirle con un `clickSaveOnly()` dedicato.

### Flusso attuale

```
STEP 9:   Extract order ID
STEP 9.5: N/A workaround (tab Prezzi, 2x save)
STEP 9.6: Global discount (tab Prezzi)
STEP 9.8: Fill notes (tab Panoramica)
STEP 10:  Salva e chiudi
```

### Nuovo flusso

```
STEP 9:   Extract order ID
STEP 9.4: Fill notes (tab Panoramica) — form stabile
STEP 9.45: clickSaveOnly() — persiste le note
STEP 9.5: N/A workaround (tab Prezzi, 2x save) — note gia persistite
STEP 9.6: Global discount (tab Prezzi)
STEP 10:  Salva e chiudi
```

## Implementazione

File: `archibald-web-app/backend/src/bot/archibald-bot.ts`

1. Spostare il blocco note (righe ~5985-5992) subito dopo STEP 9 (riga ~5782)
2. Aggiungere `clickSaveOnly()` + `waitForDevExpressIdle()` dopo `fillOrderNotes()`
3. Nessuna modifica a `fillOrderNotes()` o `fillDevExpressFieldById()`

## Rischi

- Il save intermedio dopo le note non impatta il workaround N/A (che gia si aspetta un form salvato)
- Il workaround N/A non sovrascrive le note (il bug Archibald resetta solo LINEDISC)
- La tab Panoramica e attiva dopo STEP 9 (`fillOrderNotes()` ha un click esplicito come safety net)
