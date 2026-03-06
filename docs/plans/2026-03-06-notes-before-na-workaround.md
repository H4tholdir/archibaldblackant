# Notes Before N/A Workaround - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Spostare l'inserimento note prima del workaround N/A per evitare la rigenerazione DOM di DevExpress che distrugge i campi note.

**Architecture:** Riordinare gli step nel metodo `createOrder()` di `archibald-bot.ts`. Le note vengono compilate e salvate con `clickSaveOnly()` prima del workaround N/A, cosicche il doppio save del workaround non le impatti.

**Tech Stack:** TypeScript, Puppeteer, DevExpress ERP

---

### Task 1: Spostare blocco note e aggiungere save intermedio

**Files:**
- Modify: `archibald-web-app/backend/src/bot/archibald-bot.ts:5782-5992`

**Step 1: Spostare il blocco note da STEP 9.8 a STEP 9.4**

Dopo riga 5781 (fine STEP 9), inserire il blocco note con save intermedio. Rimuovere il blocco originale dalle righe ~5985-5992.

Il codice da inserire dopo riga 5781 (subito dopo il commento `"form.submit"`):

```typescript
      // STEP 9.4: Fill order notes (no shipping + notes)
      // Fill notes BEFORE the N/A workaround — after the workaround's double save,
      // DevExpress regenerates the Panoramica tab DOM on click, destroying note fields.
      // We're still on Panoramica after STEP 9, so the form is stable.
      const notesText = buildOrderNotesText(orderData.noShipping, orderData.notes);
      if (notesText) {
        await this.emitProgress('form.notes');
        await this.fillOrderNotes(notesText);

        // STEP 9.45: Save to persist notes before the N/A workaround's double save
        await this.clickSaveOnly();
        await this.waitForDevExpressIdle({ timeout: 15000, label: 'save-after-notes' });
      }
```

Il vecchio blocco da rimuovere (tra STEP 9.6 e STEP 10):

```typescript
      // STEP 9.8: Fill order notes (no shipping + notes)
      // Click Panoramica/Overview tab first (we're on Prezzi e sconti after N/A workaround),
      // then fill the 3 fields and save.
      const notesText = buildOrderNotesText(orderData.noShipping, orderData.notes);
      if (notesText) {
        await this.emitProgress('form.notes');
        await this.fillOrderNotes(notesText);
      }
```

**Step 2: Verificare che TypeScript compili**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: BUILD SUCCESS, zero errori

**Step 3: Commit**

```
fix(bot): move notes insertion before N/A workaround to prevent DOM regeneration

After the N/A workaround's double save, DevExpress regenerates the
Panoramica tab DOM on field click, destroying TEXTEXTERNAL/TEXTINTERNAL
and clearing PURCHORDERFORMNUM. Moving notes before the workaround
and persisting them with a dedicated save avoids this issue entirely.
```
