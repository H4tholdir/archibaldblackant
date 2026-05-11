# Formicanera — Documenti Commerciali per Komet Germania

**Data:** 2026-05-11  
**Obiettivo:** Produrre 4 documenti professionali (7 PDF totali) per presentare Formicanera al consiglio Komet Germania (Gebr. Brasseler GmbH & Co. KG).  
**Contesto:** Philipp Rovina (Head Global Commercial Regions) è favorevole; serve documentazione ufficiale per il board. Alexander Lange (IT) deve essere tranquillizzato sulla sicurezza dell'ERP.

---

## Decisioni chiave

| Parametro | Valore |
|---|---|
| Lingua | Italiano + Inglese (versione doppia per doc 1, 2, 3) |
| Prezzi | Invariati: setup €30k, €5k/mese, anno 1 €84k, anno 2+ €54k |
| Dimensione rete | "60–80 utenti attivi (rete scalabile)" |
| Funzionalità Fresis | Escluse da tutti i documenti (Storico Fresis, Arca, merge, FT, sotto-clienti) |
| Pipeline PDF | Puppeteer + HTML, stesso approccio di `generate-proposta.mjs` |
| Logo | `archibald-web-app/frontend/dist/formicaneralogo.png` |
| Output directory | `docs/commerciale/komet-germania-2026-05/` |
| P.IVA Francesco | Non ancora aperta (inclusa nel Doc 4 come step post-accettazione) |

---

## Documento 1 — Presentazione Formicanera

**File output:** `doc1-presentazione-IT.pdf` + `doc1-presentation-EN.pdf`  
**Audience:** Philipp Rovina + board Komet Germania  
**Tono:** Executive, visionario, non tecnico  
**Pagine:** 9  
**Base:** `docs/commerciale/formicanera-presentazione-komet.md` (già al 60%)

### Struttura

1. **Cover** — "Una piattaforma costruita dall'interno. Pensata per chi lavora sul campo."
2. **Il gap** — L'ERP Archibald non è fatto per il lavoro in mobilità (8 criticità specifiche)
3. **Cos'è Formicanera** — PWA mobile-first installabile, bridge tra agente e ERP, in produzione
4. **Cosa cambia concretamente** — Tabella Prima/Dopo (15 operazioni quotidiane dell'agente)
5. **Funzionalità chiave** — Ordini (pending + batch), Clienti, Catalogo+Stock, Documenti, Notifiche, Dashboard
6. **Validazione sul campo** — Già in produzione, dati reali, genesi dall'interno della rete
7. **Sicurezza e conformità** — Sintesi: hosting Germania UE, AES-256-GCM, GDPR, audit log (rinvio a Doc 2 per dettaglio)
8. **ROI** — −75% tempo ordini, −7.000h documenti/anno, €700k produttività recuperata su 70 agenti
9. **Roadmap 2026** — AI CRM, preventivi avanzati sincroni, push notifications, sincronizzazione bot sincrona
10. **Prossimi passi** — 4 step (accettazione, DPA, contratto, kick-off)

### Note redazionali
- Nessun riferimento a Fresis, Arca, FT, merge, sotto-clienti
- Sezione 9 è roadmap generica Komet (non "espansione europea")
- Versione EN: traduzione letterale + adattamento titoli per audience tedesca
- Citazione di apertura: `"Un agente che usa Formicanera non compete con un agente che usa l'ERP. È come confrontare uno smartphone con un fax."`

---

## Documento 2 — Whitepaper Tecnico Sicurezza/GDPR/NIS2

**File output:** `doc2-sicurezza-IT.pdf` + `doc2-security-EN.pdf`  
**Audience:** Alexander Lange (IT Germania) + legal/compliance  
**Tono:** Formale, tecnico-legale, rassicurante  
**Pagine:** 11  
**Base:** `Dichiarazione-Conformità-Tecnica.pdf` + `Technical-Due-Diligence-Response-EN-Formicola-2026-05-06.pdf`

### Struttura

1. **Cover** — "Formicanera Security & Compliance Whitepaper" con metadata formali (versione, data, preparato da)
2. **Contesto contrattuale** — Ruoli GDPR: Gebr. Brasseler/Komet Italia = Controller; Formicanera = Processor Art. 28
3. **Il principio di non-interferenza con l'ERP** ← **sezione chiave nuova**
   - L'ERP rimane sempre la fonte di verità
   - Formicanera usa solo le credenziali personali già assegnate all'agente
   - L'accesso è equivalente all'agente che usa l'ERP manualmente (RPA, non API privilegiate)
   - Il sistema non vede più dati di quanti ne veda l'agente stesso
   - Nessuna modifica ai permessi ERP, nessun accesso elevato
   - Il sistema genera meno carico del normale utilizzo manuale
4. **Architettura e flusso dati** — Diagramma testuale: PWA → Backend → Chromium → ERP (credenziali agente)
5. **Sicurezza tecnica implementata** — AES-256-GCM, JWT revocation Redis, MFA TOTP, rate limiting, audit log immutabile, CORS/CSP/HSTS, CI/CD con `npm audit`
6. **Conformità GDPR** — Hosting UE (Hetzner Falkenstein), zero trasferimenti extra-UE, DPA Art. 28, diritti interessati (erase, portabilità, retention), sub-processor list (Hetzner + FedEx)
7. **Conformità NIS2** — D.Lgs. 138/2024, Art. 21 misure: autenticazione MFA, cifratura, backup, incident response, continuità operativa, valutazione rischio
8. **Backup e continuità** — pg_dump + gzip + Hetzner Object Storage, rotazione 30 giorni, RPO < 24h, RTO 30–60 min
9. **Incident response** — Classificazione P1/P2/P3, notifica al Controller entro 24h, Garante 72h
10. **Sub-processor** — Hetzner (ISO 27001, Germania UE, DPA firmato) + FedEx (solo numero tracking, SCC)
11. **FAQ per IT** — Le 5 domande di Phil già risposte + 3 domande tecniche standard IT

### Note redazionali
- Versione EN è quella principale (TDD esistente è già EN)
- Versione IT derivata dalla EN con adattamento terminologia legale italiana
- Il "principio di non-interferenza" deve usare l'analogia dell'accessibilità: "equivalente a un utente che usa scorciatoie da tastiera nell'ERP"
- Citare esplicitamente: Directive 2013/40/EU (accesso non autorizzato), GDPR Art. 28, NIS2 Art. 21

---

## Documento 3 — Proposta Commerciale

**File output:** `doc3-proposta-IT.pdf` + `doc3-proposal-EN.pdf`  
**Audience:** Komet Italia management + board Germania  
**Tono:** Commerciale, strutturato, con dati di mercato  
**Pagine:** 8  
**Base:** `docs/commerciale/generate-proposta.mjs` — **refresh chirurgico**

### Modifiche rispetto alla versione esistente

**Rimuovere:**
- Tutte le referenze a funzionalità Fresis-specific nella lista "Incluso nel canone"
- La frase "Consulente informatico dedicato Komet Italia" → generalizzare a "Consulente tecnico dedicato — figura di riferimento unica per tutta la rete"

**Aggiornare:**
- Data: Marzo 2026 → Maggio 2026
- Validità offerta: 30 Aprile 2026 → 31 Luglio 2026
- Numero agenti: "70 utenti attivi" → "60–80 utenti attivi (rete scalabile)"
- Destinatario: "Komet Italia S.r.l. — Management Team" → "Komet Italia S.r.l. / Gebr. Brasseler GmbH & Co. KG"

**Aggiungere:**
- Breve prefazione (mezza pagina) prima della sezione 1: contesto della richiesta, status prodotto (in produzione), posizionamento Italia-prima
- Footer aggiornato

**Mantenere invariato:**
- Tutta la grafica (palette navy+oro, font Inter+Playfair, layout)
- Prezzi (setup €30k, €5k/mese, anno 1 €84k, anno 2+ €54k)
- Benchmark competitor
- ROI table
- Termini contrattuali
- Timeline 8 settimane

### Versione EN
- Traduzione dell'intero documento
- Tutti i riferimenti legali italiani (D.Lgs. 231/2002) adattati a equivalenti europei

---

## Documento 4 — Checklist Personale Francesco Pre-Firma

**File output:** `doc4-checklist-personale-IT.pdf` (solo italiano, riservato, non per Komet)  
**Audience:** Solo Francesco Formicola  
**Tono:** Pratico, operativo, checklist azionabile  
**Pagine:** 4  
**Base:** Sezione 4 `RIEPILOGO-DEFINITIVO-14-APRILE.pdf` aggiornata

### Struttura

**Fase A — Prima dell'accettazione** (puoi fare già adesso, senza costi)
- [ ] Concordare canone mensile con Marcello (condizione bloccante per firma)
- [ ] Chiarire chi firma il contratto: solo Komet Italia o anche Gebr. Brasseler? → impatta foro competente
- [ ] Ottenere da Komet: P.IVA, ragione sociale completa, email DPO (se nominato)
- [ ] Richiedere autorizzazione scritta Komet Italia per uso sistema Formicanera (Art. 2 lett. m contratto agenzia)
- [ ] Verificare se ERP Archibald è gestito da Komet Italia o da Gebr. Brasseler (impatta un paragrafo del DPA)
- [ ] Decidere foro competente (Napoli vs arbitrato CAM Milano) e proporre a Komet

**Fase B — Entro 48 ore dall'accettazione** (solo dopo il "sì" formale)
- [ ] Aprire Partita IVA individuale: Fisconline.agenziaentrate.gov.it con SPID → modello AA9/12 → ATECO 62.01.09 → Regime forfettario
- [ ] Compilare tutti i placeholder nei contratti (MSA, DPA, SLA) — ca. 2 ore
- [ ] Definire data decorrenza (proposta: 1° giugno 2026)
- [ ] Stampare 2 copie di MSA + DPA in versione finale
- [ ] Inviare bozze MSA + DPA a Komet per revisione legale prima della firma

**Fase C — Pre go-live** (entro 8 settimane dalla firma)
- [ ] DPIA screening (10 domande, 30 min — template già disponibile in `docs/plans/`)
- [ ] Redigere Registro dei Trattamenti come Responsabile (Art. 30 GDPR, 1 pagina — template già disponibile)
- [ ] Distribuire informativa privacy agli agenti (Art. 13 GDPR — già pronta in `docs/contracts/informativa-privacy-utenti.md`)
- [ ] Configurare bucket Hetzner Object Storage per backup dedicato rete Komet
- [ ] Test MFA setup su account amministratore dedicato Komet

**Fase D — Medio termine** (Q3 2026, post go-live)
- [ ] Consultare commercialista per gestione contabile Partita IVA forfettaria
- [ ] Valutare apertura SRLS per liability protection e credibilità corporate
- [ ] Pianificare penetration test (concordato con Komet come da SLA — Q3 2026)
- [ ] Polizza cyber risk (copertura responsabilità contrattuale in caso di breach)
- [ ] Verificare con consulente NIS2 se Francesco rientra come "soggetto importante" (D.Lgs. 138/2024)

---

## Pipeline di produzione

### Tecnologia
- **HTML→PDF:** Puppeteer con Chrome locale — stesso approccio di `generate-proposta.mjs`
- **Font:** Google Fonts (Inter + Playfair Display) — caricati da URL in fase di rendering
- **Logo:** `archibald-web-app/frontend/dist/formicaneralogo.png` → base64 inline
- **Palette:** `--navy:#1a1a2e`, `--gold:#c8a96e`, `--text:#2d2d2d` (invariata)

### File da produrre
```
docs/commerciale/komet-germania-2026-05/
├── generate-doc1-IT.mjs      → doc1-presentazione-IT.pdf
├── generate-doc1-EN.mjs      → doc1-presentation-EN.pdf
├── generate-doc2-IT.mjs      → doc2-sicurezza-IT.pdf
├── generate-doc2-EN.mjs      → doc2-security-EN.pdf
├── generate-doc3-IT.mjs      → doc3-proposta-IT.pdf (refresh da proposta esistente)
├── generate-doc3-EN.mjs      → doc3-proposal-EN.pdf
└── generate-doc4-IT.mjs      → doc4-checklist-personale-IT.pdf
```

### Ordine di produzione consigliato
1. Doc 3 IT (refresh — più veloce, base già esistente)
2. Doc 3 EN (traduzione)
3. Doc 2 EN (partendo dal TDD già esistente)
4. Doc 2 IT (traduzione + adattamento)
5. Doc 1 IT (la più creativa — partendo dalla presentazione .md)
6. Doc 1 EN (traduzione)
7. Doc 4 IT (checklist personale)

---

## Vincoli di contenuto

**Funzionalità da NON includere in nessun documento (Fresis-specific):**
- Storico Fresis / FresisHistoryPage
- Sezione Arca
- Merge ordini
- FT (Fresis-specific)
- Sotto-clienti (sub_clients di Fresis)
- Qualsiasi riferimento a "Fresis" come azienda specifica

**Funzionalità da generalizzare (da specifiche Biagio a generiche agente):**
- "Cluster 83" → non menzionare
- "Biagio Formicola" → "agente Komet" (nei doc per Komet Germania)
- "quarant'anni di esperienza" → ok come elemento di credibilità

---

*Design document preparato il 2026-05-11. Da far approvare prima dell'implementazione.*
