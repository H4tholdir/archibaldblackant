# Sub-processor Register — Archibald PWA

**Data aggiornamento**: 2026-04-02
**Responsabile**: Formicola Francesco (P.IVA [inserire])
**Riferimento normativo**: GDPR Art. 28(3)(d)

---

## Sub-processor attivi

### 1. Hetzner Online GmbH
- **Ruolo**: VPS hosting (infrastruttura primaria) + Object Storage (backup)
- **Dati trattati**: Tutto il database PostgreSQL, log applicativi, backup cifrati
- **Sede**: Gunzenhausen, Germania 🇩🇪
- **Trasferimento dati extra-UE**: No
- **GDPR compliance**: ✅ DPA disponibile su hetzner.com/legal/privacy
- **Data inizio**: [data contratto VPS]

### 2. FedEx Corporation
- **Ruolo**: API di tracking spedizioni
- **Dati trattati**: Tracking numbers esclusivamente (nessun dato personale)
- **Sede**: Memphis, Tennessee, USA 🇺🇸
- **Trasferimento dati extra-UE**: Sì — solo tracking numbers anonimi
- **GDPR compliance**: ✅ DPA disponibile, dati minimizzati
- **Data inizio**: [data integrazione FedEx]

### 3. Provider SMTP — [DA COMPLETARE]
- **Ruolo**: Invio email alert di sicurezza sistema
- **Dati trattati**: Indirizzo email destinatario (admin), contenuto alert tecnici
- **Sede**: [da verificare]
- **GDPR compliance**: [da verificare]
- **Azione richiesta**: Identificare provider SMTP in produzione e completare questa voce

### 4. Dropbox Inc. *(solo modulo Fresis/Arca)*
- **Ruolo**: Storage documenti per integrazione ArcaPro (funzione specifica Fresis)
- **Dati trattati**: File PDF/documenti commerciali Fresis
- **Sede**: San Francisco, California, USA 🇺🇸
- **Trasferimento dati extra-UE**: Sì — documenti commerciali Fresis
- **GDPR compliance**: ✅ DPA disponibile + Standard Contractual Clauses
- **Scope**: LIMITATO al modulo Fresis/Arca — non parte della PWA generale

---

## Procedura di aggiornamento

Questo registro DEVE essere aggiornato:
- Ogni volta che si aggiunge una dipendenza esterna che processa dati
- Ogni volta che un sub-processor cambia sede o termini di servizio
- Almeno ogni 6 mesi (revisione periodica)
